/**
 * 本地服务
 * ---------------------------------------------------------------
 * 一个进程同时做三件事：
 *   1. 托管 dist/index.html（前端单文件产物）
 *   2. 提供 GET/PUT /api/state 做数据读写，落地到本机 JSON 文件
 *   3. 每日自动备份，保留最近 30 天
 *
 * 默认只监听 127.0.0.1 —— 外部访问必须经过 Cloudflare Tunnel，
 * 这样本机端口不会直接暴露在局域网上。要在局域网内直接访问时，
 * 显式设置 HOST=0.0.0.0。
 *
 * 环境变量：
 *   PORT          监听端口，默认 4173
 *   HOST          监听地址，默认 127.0.0.1
 *   DATA_DIR      数据目录，默认 ~/Library/Application Support/demand-scheduler
 *   REQUIRE_ACCESS 设为 1 时，/api 请求必须带 Cloudflare Access 的 JWT 头
 */

import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT) || 4173
const HOST = process.env.HOST || '127.0.0.1'
const DATA_DIR =
  process.env.DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'demand-scheduler')
const STATE_FILE = path.join(DATA_DIR, 'state.json')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')
const MAX_BODY = 8 * 1024 * 1024
const KEEP_BACKUPS = 30
const REQUIRE_ACCESS = process.env.REQUIRE_ACCESS === '1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt'])

let rev = 0
let savedAt = 0

/* ---------- 数据读写 ---------- */

async function ensureDirs() {
  await fsp.mkdir(DATA_DIR, { recursive: true })
  await fsp.mkdir(BACKUP_DIR, { recursive: true })
}

async function readStateFile() {
  try {
    const raw = await fsp.readFile(STATE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.state) return null
    rev = Number(parsed.rev) || 0
    savedAt = Number(parsed.savedAt) || 0
    return parsed
  } catch (e) {
    return null
  }
}

/** 先写临时文件再 rename，避免断电/中断时留下半个 JSON */
async function writeStateFile(state) {
  await ensureDirs()
  const next = { rev: rev + 1, savedAt: Date.now(), state }
  const tmp = `${STATE_FILE}.${process.pid}.tmp`
  await fsp.writeFile(tmp, JSON.stringify(next), 'utf8')
  await fsp.rename(tmp, STATE_FILE)
  rev = next.rev
  savedAt = next.savedAt
  await backupDaily(next)
  return next
}

async function backupDaily(payload) {
  const day = new Date().toISOString().slice(0, 10)
  const target = path.join(BACKUP_DIR, `${day}.json`)
  try {
    await fsp.access(target)
    return
  } catch (e) {
    /* 当天还没有备份，写一份 */
  }
  await fsp.writeFile(target, JSON.stringify(payload), 'utf8')
  const files = (await fsp.readdir(BACKUP_DIR)).filter((f) => f.endsWith('.json')).sort()
  const stale = files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))
  await Promise.all(stale.map((f) => fsp.unlink(path.join(BACKUP_DIR, f)).catch(() => {})))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('payload too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/* ---------- 响应工具 ---------- */

function sendJSON(res, code, data) {
  const body = Buffer.from(JSON.stringify(data), 'utf8')
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  })
  res.end(body)
}

function accessAllowed(req) {
  if (!REQUIRE_ACCESS) return true
  return Boolean(req.headers['cf-access-jwt-assertion'])
}

/* ---------- 静态文件 ---------- */

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  let file = path.join(DIST, rel)

  // 防目录穿越
  if (!file.startsWith(DIST + path.sep) && file !== path.join(DIST, 'index.html')) {
    res.writeHead(403).end('forbidden')
    return
  }

  let stat = null
  try {
    stat = await fsp.stat(file)
    if (stat.isDirectory()) {
      file = path.join(file, 'index.html')
      stat = await fsp.stat(file)
    }
  } catch (e) {
    // 单页应用：未知路径回落到 index.html
    file = path.join(DIST, 'index.html')
    try {
      stat = await fsp.stat(file)
    } catch (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('还没有构建产物，先执行 npm run build')
      return
    }
  }

  const ext = path.extname(file).toLowerCase()
  const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304).end()
    return
  }

  const headers = {
    'content-type': MIME[ext] || 'application/octet-stream',
    etag,
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  }

  const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '')
  if (acceptsGzip && COMPRESSIBLE.has(ext) && stat.size > 1024) {
    const raw = await fsp.readFile(file)
    const gz = zlib.gzipSync(raw)
    headers['content-encoding'] = 'gzip'
    headers['content-length'] = gz.length
    headers.vary = 'accept-encoding'
    res.writeHead(200, headers)
    res.end(req.method === 'HEAD' ? undefined : gz)
    return
  }

  headers['content-length'] = stat.size
  res.writeHead(200, headers)
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  fs.createReadStream(file).pipe(res)
}

/* ---------- 路由 ---------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = decodeURIComponent(url.pathname)

  try {
    if (pathname.startsWith('/api/')) {
      if (!accessAllowed(req)) {
        sendJSON(res, 401, { error: 'unauthorized', hint: '请通过 Cloudflare Access 登录后再访问' })
        return
      }

      if (pathname === '/api/health') {
        sendJSON(res, 200, { ok: true, rev, savedAt, uptime: Math.round(process.uptime()) })
        return
      }

      if (pathname === '/api/state' && req.method === 'GET') {
        const stored = await readStateFile()
        if (!stored) {
          sendJSON(res, 200, { rev: 0, savedAt: 0, state: null })
          return
        }
        sendJSON(res, 200, { rev: stored.rev, savedAt: stored.savedAt, state: stored.state })
        return
      }

      if (pathname === '/api/state' && req.method === 'PUT') {
        const body = await readBody(req)
        let payload = null
        try {
          payload = JSON.parse(body)
        } catch (e) {
          sendJSON(res, 400, { error: 'bad json' })
          return
        }
        if (!payload || !payload.state || !Array.isArray(payload.state.requirements)) {
          sendJSON(res, 400, { error: 'state 缺少 requirements' })
          return
        }
        const stored = await readStateFile()
        const current = stored ? stored.rev : 0
        if (Number(payload.rev) !== current) {
          sendJSON(res, 409, { error: 'conflict', rev: current })
          return
        }
        const next = await writeStateFile(payload.state)
        sendJSON(res, 200, { rev: next.rev, savedAt: next.savedAt })
        return
      }

      sendJSON(res, 404, { error: 'not found' })
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end('method not allowed')
      return
    }

    await serveStatic(req, res, pathname)
  } catch (err) {
    console.error('[server]', err)
    if (!res.headersSent) sendJSON(res, 500, { error: 'internal error' })
    else res.end()
  }
})

server.listen(PORT, HOST, async () => {
  await ensureDirs()
  await readStateFile()
  const shown = HOST === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1'
  console.log(`需求排期台 已启动  http://${shown}:${PORT}`)
  console.log(`数据目录       ${DATA_DIR}  (rev ${rev})`)
})

process.on('SIGINT', () => {
  console.log('\n已停止')
  server.close(() => process.exit(0))
})

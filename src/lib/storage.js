/**
 * 存储适配层
 * ---------------------------------------------------------------
 * 界面层只依赖 `readStateSync` / `saveState` 两个函数，不关心数据存在哪。
 * 现在默认走浏览器本地存储（localStorage）；等云服务开通后，
 * 只需要新增一个 cloudAdapter 实现同样的读写语义，再把 ACTIVE 指过去即可，
 * 组件代码一行都不用改。
 *
 * 云端实现要点（开通后照此补全）：
 *   1. npm i @tencent-ai/workbuddy-cloud-sdk@dev
 *   2. createWorkBuddyCloud({ endpoint, publishableKey }) 初始化一次
 *   3. load(): 从 requirements / members / settings 三张表读回并组装成同样的 state 形状
 *   4. save(state): 按 id upsert 变更行，删除的走 delete
 *   5. 因为云端是异步的，届时把 StoreProvider 的首屏读取改成 await + loading 态
 */

const KEY = 'demand-scheduler.state.v1'
const BACKUP_KEY = 'demand-scheduler.backup.v1'

function safeParse(raw) {
  try {
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

export function readStateSync() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = safeParse(raw)
    if (!parsed || !Array.isArray(parsed.requirements)) return null
    return parsed
  } catch (e) {
    return null
  }
}

/** 某些内嵌预览环境（iframe）会禁用本地存储，这里探一下，好在界面上提示用户 */
export function storageAvailable() {
  try {
    const probe = '__ds_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return true
  } catch (e) {
    return false
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    return true
  } catch (e) {
    return false
  }
}

export function backupState(state) {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(state))
  } catch (e) {
    /* 忽略配额问题 */
  }
}

export function readBackup() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY)
    return raw ? safeParse(raw) : null
  } catch (e) {
    return null
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY)
  } catch (e) {
    /* noop */
  }
}

/* ------------------------------------------------------------------
 * 远程存储（本地服务 server/index.mjs）
 * ------------------------------------------------------------------
 * 有后端时以服务端数据为准，localStorage 退化为离线缓存；
 * 没有后端（纯静态托管、或直接打开 dist/index.html）时自动回到纯本地模式，
 * 行为和以前完全一致，不会报错。
 */

let remoteRev = 0
let remoteState = null // null = 未知，true = 可用，false = 不可用

/** 是否连上了本地服务 */
export function remoteAvailable() {
  return remoteState === true
}

export function currentRev() {
  return remoteRev
}

/** 读服务端数据；没有后端时返回 null */
export async function loadRemote() {
  try {
    const res = await fetch('api/state', { headers: { accept: 'application/json' } })
    if (!res.ok) {
      remoteState = false
      return null
    }
    const data = await res.json()
    remoteState = true
    remoteRev = Number(data.rev) || 0
    return { state: data.state || null, rev: remoteRev }
  } catch (e) {
    remoteState = false
    return null
  }
}

/** 推服务端数据；返回 { ok } / { conflict } / { offline } */
export async function pushRemote(state) {
  if (remoteState === false) return { offline: true }
  try {
    const res = await fetch('api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rev: remoteRev, state }),
    })
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}))
      remoteRev = Number(data.rev) || remoteRev
      return { conflict: true }
    }
    if (!res.ok) {
      remoteState = false
      return { offline: true }
    }
    const data = await res.json()
    remoteRev = Number(data.rev) || remoteRev
    remoteState = true
    return { ok: true, rev: remoteRev }
  } catch (e) {
    remoteState = false
    return { offline: true }
  }
}

export function exportJSON(state) {
  const payload = {
    app: 'demand-scheduler',
    version: 2,
    exportedAt: new Date().toISOString(),
    workspace: state.workspace,
    members: state.members,
    milestones: state.milestones || [],
    requirements: state.requirements,
    settings: state.settings,
  }
  return JSON.stringify(payload, null, 2)
}

export function validateImport(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: '文件内容不是有效的 JSON 对象' }
  if (!Array.isArray(obj.requirements)) return { ok: false, error: '缺少 requirements 数组' }
  const bad = obj.requirements.find((r) => !r || typeof r.title !== 'string')
  if (bad) return { ok: false, error: '存在缺少标题的需求记录' }
  return { ok: true }
}

export function toCSV(rows) {
  const head = [
    '标题',
    '状态',
    '优先级',
    '负责人',
    '开始日期',
    '结束日期',
    '截止日',
    '预估工时(h)',
    '进度',
    '标签',
    '来源',
    '提出人',
    '里程碑',
    '描述',
  ]
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [head.join(',')]
  rows.forEach((r) => {
    lines.push(
      [
        r.title,
        r.statusName,
        r.priority,
        r.assigneeName,
        r.startDate,
        r.endDate,
        r.dueDate || '',
        r.estimateHours,
        `${r.progress}%`,
        (r.tags || []).join(' / '),
        r.source || '',
        r.requester || '',
        r.milestoneName || '',
        (r.description || '').replace(/\n/g, ' '),
      ]
        .map(esc)
        .join(','),
    )
  })
  return `\ufeff${lines.join('\n')}`
}

export function download(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ------------------------------------------------------------------
   CSV 导入
   ------------------------------------------------------------------ */

/** 逐字符解析，支持引号包裹、字段内逗号与换行 */
export function parseCSV(text) {
  const src = String(text || '').replace(/^\ufeff/, '')
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i += 1
        } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1
      row.push(cell)
      cell = ''
      if (row.some((v) => String(v).trim() !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((v) => String(v).trim() !== '')) rows.push(row)
  return rows
}

const HEADER_ALIASES = {
  title: ['标题', '需求', '需求标题', 'title', 'name'],
  status: ['状态', 'status'],
  priority: ['优先级', 'priority'],
  assignee: ['负责人', 'assignee', 'owner'],
  startDate: ['开始', '开始日期', 'start', 'startdate'],
  dueDate: ['截止', '截止日', '截止日期', 'due', 'duedate'],
  estimateHours: ['工时', '预估工时', '预估工时(h)', 'hours', 'estimate'],
  progress: ['进度', 'progress'],
  tags: ['标签', 'tags'],
  description: ['描述', 'description'],
  acceptance: ['验收标准', '验收', 'acceptance'],
  source: ['来源', 'source'],
  requester: ['提出人', 'requester'],
}

function mapHeader(cell) {
  const key = String(cell || '').trim().toLowerCase().replace(/[()（）\s]/g, '')
  const found = Object.keys(HEADER_ALIASES).find((f) =>
    HEADER_ALIASES[f].some((a) => a.toLowerCase().replace(/[()（）\s]/g, '') === key),
  )
  return found || null
}

/**
 * 把 CSV 文本转成可导入的需求数组。
 * 返回 { rows, errors }：errors 里带行号与原因，界面上直接给回执。
 */
export function csvToRequirements(text, members, statuses, priorities) {
  const table = parseCSV(text)
  if (table.length < 2) return { rows: [], errors: [{ line: 1, reason: '文件为空或只有表头' }] }
  const head = table[0].map(mapHeader)
  if (!head.includes('title')) return { rows: [], errors: [{ line: 1, reason: '表头里找不到「标题」列' }] }

  const statusByName = new Map((statuses || []).map((s) => [s.name, s.id]))
  const prioByName = new Map()
  ;(priorities || []).forEach((p) => {
    prioByName.set(p.name, p.id)
    prioByName.set(p.label, p.id)
  })
  const memberByName = new Map((members || []).map((m) => [m.name, m.id]))

  const rows = []
  const errors = []
  for (let i = 1; i < table.length; i += 1) {
    const raw = table[i]
    const get = (field) => {
      const idx = head.indexOf(field)
      return idx >= 0 ? String(raw[idx] ?? '').trim() : ''
    }
    const title = get('title')
    if (!title) {
      errors.push({ line: i + 1, reason: '标题为空' })
      continue
    }
    const statusText = get('status')
    const prioText = get('priority')
    const ownerText = get('assignee')
    const progressText = get('progress').replace('%', '')

    const startRaw = get('startDate')
    const dueRaw = get('dueDate')
    const iso = (v) => {
      if (!v) return ''
      const m = v.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
      if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`
      return ''
    }

    rows.push({
      title,
      status: statusByName.get(statusText) || (statusText || '').toLowerCase() || 'pool',
      priority: prioByName.get(prioText) || (prioText || '').toUpperCase() || 'P2',
      assigneeId: memberByName.get(ownerText) || '',
      startDate: iso(startRaw),
      dueDate: iso(dueRaw),
      estimateHours: Number(String(get('estimateHours')).replace(/[^\d.]/g, '')) || 0,
      progress: Math.max(0, Math.min(100, Number(progressText) || 0)),
      tags: get('tags')
        .split(/[、,/|]/)
        .map((t) => t.trim())
        .filter(Boolean),
      description: get('description'),
      acceptance: get('acceptance'),
      source: get('source'),
      requester: get('requester'),
    })
  }
  return { rows, errors }
}

export function toCSVTemplate() {
  const head = [
    '标题',
    '状态',
    '优先级',
    '负责人',
    '开始日期',
    '截止日',
    '预估工时',
    '进度',
    '标签',
    '来源',
    '提出人',
    '描述',
    '验收标准',
  ]
  const sample = [
    '示例：支付流程埋点补全',
    '需求池',
    'P2',
    '我',
    '2026-11-03',
    '2026-11-20',
    '12',
    '0',
    '数据、后端',
    '内部规划',
    '我',
    '从下单到支付成功的每一步都要有事件',
    '漏斗可配置；数据延迟小于 1 小时',
  ]
  return `\ufeff${head.join(',')}\n${sample.join(',')}\n`
}

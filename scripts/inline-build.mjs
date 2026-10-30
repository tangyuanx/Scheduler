/**
 * 把构建产物内联成单文件 index.html。
 *
 * 原因：Vite 会给入口 <script type="module"> 和 <link rel="stylesheet"> 加上
 * crossorigin 属性，浏览器因此以「匿名」模式请求这些资源（不带 Cookie）。
 * 而托管网关是按请求校验分享码 Cookie 的，子资源拿不到 Cookie 就返回 403，
 * 结果就是 HTML 能打开、JS 加载失败、页面一片空白。
 * 内联之后页面不再发起任何子资源请求，这个问题从根上消失。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const htmlPath = path.join(dist, 'index.html')

if (!fs.existsSync(htmlPath)) {
  console.error('[inline] 找不到 dist/index.html，请先执行 vite build')
  process.exit(1)
}

let html = fs.readFileSync(htmlPath, 'utf8')
const readAsset = (href) => fs.readFileSync(path.join(dist, href.replace(/^\.?\//, '')), 'utf8')

let cssCount = 0
html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, (tag) => {
  const m = tag.match(/href="([^"]+)"/)
  if (!m) return tag
  const css = readAsset(m[1]).replace(/<\/style/gi, '<\\/style')
  cssCount += 1
  return `<style>\n${css}\n</style>`
})

let jsCount = 0
html = html.replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g, (tag, src) => {
  if (!/\.js(\?|$)/.test(src)) return tag
  const js = readAsset(src).replace(/<\/script/gi, '<\\/script')
  jsCount += 1
  return `<script type="module">\n${js}\n</script>`
})

fs.writeFileSync(htmlPath, html)

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)
console.log(`[inline] 内联 ${jsCount} 个脚本、${cssCount} 个样式 → index.html ${kb} KB（单文件，无子资源请求）`)

if (jsCount === 0) {
  console.error('[inline] 没有匹配到入口脚本，产物可能不符合预期')
  process.exit(1)
}

const DAY_MS = 86400000

export function parseISO(s) {
  if (!s) return null
  const parts = String(s).slice(0, 10).split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null
  return new Date(parts[0], parts[1] - 1, parts[2])
}

export function toISO(d) {
  if (!d) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function today() {
  return startOfDay(new Date())
}

export function todayISO() {
  return toISO(today())
}

export function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function isWeekend(d) {
  const w = d.getDay()
  return w === 0 || w === 6
}

export function isWorkday(d) {
  return !isWeekend(d)
}

export function nextWorkday(d) {
  let x = startOfDay(d)
  let guard = 0
  while (isWeekend(x) && guard < 14) {
    x = addDays(x, 1)
    guard += 1
  }
  return x
}

export function startOfWeek(d) {
  const x = startOfDay(d)
  const offset = (x.getDay() + 6) % 7
  return addDays(x, -offset)
}

export function diffDays(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS)
}

export function workdaysBetween(startISO, endISO) {
  const a = parseISO(startISO)
  const b = parseISO(endISO)
  if (!a || !b || b < a) return 0
  let count = 0
  let cursor = startOfDay(a)
  let guard = 0
  while (cursor <= b && guard < 2000) {
    if (isWorkday(cursor)) count += 1
    cursor = addDays(cursor, 1)
    guard += 1
  }
  return count
}

export function eachDay(startISO, endISO) {
  const a = parseISO(startISO)
  const b = parseISO(endISO)
  if (!a || !b || b < a) return []
  const out = []
  let cursor = startOfDay(a)
  let guard = 0
  while (cursor <= b && guard < 800) {
    out.push(new Date(cursor))
    cursor = addDays(cursor, 1)
    guard += 1
  }
  return out
}

export function fmtMD(d) {
  if (!d) return ''
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function fmtShort(iso) {
  const d = typeof iso === 'string' ? parseISO(iso) : iso
  if (!d) return ''
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function fmtRange(startISO, endISO) {
  if (!startISO && !endISO) return '未排期'
  if (startISO && endISO && startISO === endISO) return fmtShort(startISO)
  return `${fmtShort(startISO) || '?'} – ${fmtShort(endISO) || '?'}`
}

export function weekdayCN(d) {
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
}

export function weekKey(d) {
  const s = startOfWeek(d)
  return toISO(s)
}

export function humanDate(iso) {
  const d = parseISO(iso)
  if (!d) return ''
  const t = today()
  const delta = diffDays(t, d)
  if (delta === 0) return '今天'
  if (delta === 1) return '明天'
  if (delta === -1) return '昨天'
  return fmtMD(d)
}

export function relativeTime(ts) {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  return fmtMD(new Date(ts))
}

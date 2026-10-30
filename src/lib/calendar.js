/**
 * 工作日历
 * ---------------------------------------------------------------
 * 排期只认「工作日」：默认周一到周五，但国内实际还有法定节假日与调休，
 * 所以这里允许在设置里覆盖某一天是上班还是放假。
 *
 * settings.workdays  : number[]  0=周日 … 6=周六，默认 [1,2,3,4,5]
 * settings.holidays  : [{ date: 'YYYY-MM-DD', name: '国庆', work: false }]
 *                      work=false 放假，work=true 调休上班
 */
import { addDays, parseISO, startOfDay, toISO } from './date'

const DEFAULT_WORKDAYS = [1, 2, 3, 4, 5]

export function makeCalendar(settings) {
  const base = settings?.workdays && settings.workdays.length ? settings.workdays : DEFAULT_WORKDAYS
  const workdays = new Set(base.map(Number))
  const overrides = new Map()
  ;(settings?.holidays || []).forEach((h) => {
    if (!h || !h.date) return
    overrides.set(String(h.date).slice(0, 10), Boolean(h.work))
  })

  const isoOf = (d) => (typeof d === 'string' ? d.slice(0, 10) : toISO(d))

  function isWork(d) {
    const iso = isoOf(d)
    if (!iso) return false
    if (overrides.has(iso)) return overrides.get(iso)
    const dt = typeof d === 'string' ? parseISO(d) : d
    if (!dt) return false
    return workdays.has(dt.getDay())
  }

  /** 当天或之后的第一个工作日 */
  function nextWork(d, guardMax = 400) {
    let x = typeof d === 'string' ? parseISO(d) : startOfDay(d)
    if (!x) return null
    let guard = 0
    while (!isWork(x) && guard < guardMax) {
      x = addDays(x, 1)
      guard += 1
    }
    return x
  }

  /** 从某天起往后数 n 个工作日（n=0 返回当天，若不是工作日则顺延） */
  function addWork(d, n) {
    let x = nextWork(d)
    if (!x) return null
    let left = Math.max(0, Math.floor(n))
    let guard = 0
    while (left > 0 && guard < 4000) {
      x = addDays(x, 1)
      if (isWork(x)) left -= 1
      guard += 1
    }
    return x
  }

  /** 闭区间内的工作日数量 */
  function countWork(aISO, bISO) {
    const a = parseISO(aISO)
    const b = parseISO(bISO)
    if (!a || !b || b < a) return 0
    let count = 0
    let cursor = startOfDay(a)
    let guard = 0
    while (cursor <= b && guard < 3000) {
      if (isWork(cursor)) count += 1
      cursor = addDays(cursor, 1)
      guard += 1
    }
    return count
  }

  return { workdays, overrides, isWork, nextWork, addWork, countWork }
}

/** 把连续假期压成可读的区间，例如 10/1–10/7 国庆 */
export function groupHolidays(holidays) {
  const list = [...(holidays || [])]
    .filter((h) => h && h.date)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  const groups = []
  list.forEach((h) => {
    const last = groups[groups.length - 1]
    const prev = last && last.items[last.items.length - 1]
    const contiguous = prev && toISO(addDays(parseISO(prev.date), 1)) === h.date
    if (last && contiguous && Boolean(last.items[0].work) === Boolean(h.work)) {
      last.items.push(h)
      last.end = h.date
    } else {
      groups.push({ start: h.date, end: h.date, work: Boolean(h.work), items: [h], name: h.name || '' })
    }
  })
  return groups
}

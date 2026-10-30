import { STATUS_MAP, STATUSES } from './constants'
import { addDays, startOfWeek, toISO } from './date'

const DONE_NAME = STATUS_MAP.done.name

/** 从历史里找「变成上线」的那一刻；找不到就退回 updatedAt */
export function doneAt(req) {
  const hit = (req.history || []).find((h) =>
    (h.changes || []).some((c) => c.field === 'status' && c.to === DONE_NAME),
  )
  if (hit) return hit.at
  return req.status === 'done' ? req.updatedAt || req.createdAt || 0 : 0
}

/** 单个需求的周期时间（天）：创建 → 上线 */
export function cycleDays(req) {
  const end = doneAt(req)
  if (!end || !req.createdAt) return null
  return Math.max(0, Math.round(((end - req.createdAt) / 86400000) * 10) / 10)
}

/** 把历史还原成 (时间, 状态) 时间线，用于算每个状态停留多久 */
export function statusTimeline(req) {
  const asc = [...(req.history || [])].sort((a, b) => a.at - b.at)
  const statusChanges = []
  asc.forEach((h) => {
    ;(h.changes || []).forEach((c) => {
      if (c.field !== 'status') return
      const to = STATUSES.find((s) => s.name === c.to)
      const from = STATUSES.find((s) => s.name === c.from)
      if (to) statusChanges.push({ at: h.at, from: from?.id, to: to.id })
    })
  })
  // 创建时的初始状态：取第一条状态变更的「从」，拿不到就当需求池
  const initial = statusChanges[0]?.from || 'pool'
  const points = [{ at: req.createdAt || req.updatedAt || Date.now(), status: initial }]
  statusChanges.forEach((c) => points.push({ at: c.at, status: c.to }))
  const last = points[points.length - 1]
  if (last.status !== req.status) points.push({ at: req.updatedAt || Date.now(), status: req.status })
  const endAt = req.status === 'done' ? doneAt(req) || Date.now() : Date.now()
  if (points[points.length - 1].at < endAt) points.push({ at: endAt, status: req.status })
  return points
}

/** 各状态平均停留天数 */
export function avgDwellByStatus(requirements) {
  const acc = {}
  STATUSES.forEach((s) => {
    acc[s.id] = { total: 0, n: 0 }
  })
  requirements.forEach((req) => {
    const points = statusTimeline(req)
    for (let i = 1; i < points.length; i += 1) {
      const days = (points[i].at - points[i - 1].at) / 86400000
      if (days <= 0) continue
      const st = points[i - 1].status
      if (!acc[st]) acc[st] = { total: 0, n: 0 }
      acc[st].total += days
      acc[st].n += 1
    }
  })
  const out = {}
  Object.keys(acc).forEach((k) => {
    out[k] = acc[k].n ? Math.round((acc[k].total / acc[k].n) * 10) / 10 : 0
  })
  return out
}

/** 近 N 周吞吐：每周完成多少条、新增多少条 */
export function weeklyFlow(requirements, weeks = 8) {
  const base = startOfWeek(new Date())
  const buckets = []
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = addDays(base, -i * 7)
    buckets.push({ start: toISO(start), label: `${start.getMonth() + 1}/${start.getDate()}`, done: 0, added: 0 })
  }
  const indexOf = (ts) => {
    if (!ts) return -1
    for (let i = 0; i < buckets.length; i += 1) {
      const s = new Date(`${buckets[i].start}T00:00:00`).getTime()
      if (ts >= s && ts < s + 7 * 86400000) return i
    }
    return -1
  }
  requirements.forEach((r) => {
    const di = indexOf(doneAt(r))
    if (di >= 0) buckets[di].done += 1
    const ai = indexOf(r.createdAt)
    if (ai >= 0) buckets[ai].added += 1
  })
  return buckets
}

export function buildReport(requirements) {
  const done = requirements.filter((r) => r.status === 'done')
  const cycles = done.map(cycleDays).filter((v) => v != null).sort((a, b) => a - b)
  const avg = cycles.length ? Math.round((cycles.reduce((s, v) => s + v, 0) / cycles.length) * 10) / 10 : 0
  const median = cycles.length ? cycles[Math.floor(cycles.length / 2)] : 0
  const wip = requirements.filter((r) => ['scheduled', 'dev', 'accept'].includes(r.status)).length
  const flow = weeklyFlow(requirements, 8)
  const lastWeek = flow[flow.length - 1] || { done: 0, added: 0 }
  return {
    total: requirements.length,
    doneCount: done.length,
    avgCycle: avg,
    medianCycle: median,
    maxCycle: cycles.length ? cycles[cycles.length - 1] : 0,
    wip,
    flow,
    lastWeekDone: lastWeek.done,
    lastWeekAdded: lastWeek.added,
    dwell: avgDwellByStatus(requirements),
    cycles,
  }
}

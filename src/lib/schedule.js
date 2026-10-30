import { makeCalendar } from './calendar'
import { addDays, diffDays, parseISO, startOfWeek, toISO, todayISO } from './date'
import { PRIORITY_MAP } from './constants'

export function memberCapacity(member, settings) {
  const own = Number(member?.dailyHours)
  if (own > 0) return own
  const fallback = Number(settings?.dailyHours)
  return fallback > 0 ? fallback : 8
}

export function formatHours(h) {
  const n = Math.round(Number(h) * 10) / 10
  if (!n) return '0h'
  return `${n}h`
}

export function hoursToDays(hours, dailyCap) {
  const cap = dailyCap > 0 ? dailyCap : 8
  return Math.round((Number(hours) / cap) * 10) / 10
}

function calOf(settings, cal) {
  return cal || makeCalendar(settings)
}

/**
 * 把预估工时按「工作日 × 每日产能」铺开，返回每天的投入小时数。
 * 起始日落在非工作日时自动顺延。
 */
export function distribute(req, dailyCap, cal) {
  const c = calOf(null, cal)
  const cap = dailyCap > 0 ? dailyCap : 8
  const hours = Number(req?.estimateHours) || 0
  // 已经算过依赖的行走 start，没算过的退回手填的 startDate
  const start = parseISO(req?.start || req?.startDate)
  if (!start || hours <= 0) return []
  let cursor = c.nextWork(start)
  let remaining = hours
  const out = []
  let guard = 0
  while (remaining > 0.01 && guard < 500) {
    const put = Math.min(remaining, cap)
    out.push({ date: toISO(cursor), hours: Math.round(put * 100) / 100 })
    remaining -= put
    cursor = c.nextWork(addDays(cursor, 1))
    guard += 1
  }
  return out
}

/** 根据开始日 + 工时 + 产能推算结束日 */
export function computeEnd(startDate, estimateHours, dailyCap, cal) {
  const days = distribute({ startDate, estimateHours }, dailyCap, cal)
  return days.length ? days[days.length - 1].date : ''
}

/** 单个需求的排期结果（不含依赖约束） */
export function scheduleOf(req, members, settings, cal) {
  const c = calOf(settings, cal)
  const member = members.find((m) => m.id === req.assigneeId)
  const cap = memberCapacity(member, settings)
  const days = distribute(req, cap, c)
  const start = days.length ? days[0].date : req.startDate || ''
  const end = days.length ? days[days.length - 1].date : ''
  const spanDays = start && end ? diffDays(parseISO(start), parseISO(end)) + 1 : 0
  return { days, cap, start, end, spanDays, workdays: days.length }
}

/**
 * 全量解析：把前置依赖算进去。
 * 实际开始日 = max(手填开始日, 所有前置需求结束日的下一个工作日)
 * 返回 Map<id, schedule>，schedule 上带 blocked / cycle / autoStart 标记。
 */
export function resolveSchedules(requirements, members, settings, cal) {
  const c = calOf(settings, cal)
  const byId = new Map(requirements.map((r) => [r.id, r]))
  const cache = new Map()
  const visiting = new Set()

  function resolve(id) {
    if (cache.has(id)) return cache.get(id)
    const req = byId.get(id)
    if (!req) return null
    if (visiting.has(id)) {
      // 循环依赖：就地截断，避免死循环
      const s = { ...scheduleOf(req, members, settings, c), cycle: true, blocked: false }
      cache.set(id, s)
      return s
    }
    visiting.add(id)

    let earliest = req.startDate || ''
    const blockers = []
    ;(req.deps || []).forEach((depId) => {
      if (!byId.has(depId)) return
      const dep = resolve(depId)
      if (!dep) return
      if (dep.end) {
        const next = toISO(c.nextWork(addDays(parseISO(dep.end), 1)))
        if (!earliest || next > earliest) earliest = next
        if (dep.end >= (req.startDate || '')) blockers.push(depId)
      }
    })

    visiting.delete(id)
    const s = scheduleOf({ ...req, startDate: earliest }, members, settings, c)
    s.planStart = req.startDate || ''
    s.autoStart = Boolean(req.startDate) && earliest !== req.startDate
    s.depStart = earliest && earliest !== req.startDate ? earliest : ''
    s.blocked = blockers.length > 0
    s.blockerIds = blockers
    s.cycle = false
    cache.set(id, s)
    return s
  }

  const out = new Map()
  requirements.forEach((r) => out.set(r.id, resolve(r.id)))
  return out
}

/** memberId -> { 'YYYY-MM-DD': hours } */
export function buildLoadMap(requirements, members, settings, cal) {
  const c = calOf(settings, cal)
  const map = {}
  const detail = {}
  requirements.forEach((req) => {
    if (!req.assigneeId) return
    const member = members.find((m) => m.id === req.assigneeId)
    const cap = memberCapacity(member, settings)
    const days = distribute(req, cap, c)
    if (!days.length) return
    if (!map[req.assigneeId]) map[req.assigneeId] = {}
    if (!detail[req.assigneeId]) detail[req.assigneeId] = {}
    days.forEach((d) => {
      map[req.assigneeId][d.date] = (map[req.assigneeId][d.date] || 0) + d.hours
      if (!detail[req.assigneeId][d.date]) detail[req.assigneeId][d.date] = []
      detail[req.assigneeId][d.date].push({ id: req.id, hours: d.hours })
    })
  })
  return { map, detail }
}

/** 找出某个成员在某天超出产能的情况 */
export function overloads(requirements, members, settings, cal) {
  const { map, detail } = buildLoadMap(requirements, members, settings, cal)
  const out = []
  members.forEach((member) => {
    const cap = memberCapacity(member, settings)
    const byDate = map[member.id] || {}
    Object.keys(byDate).forEach((date) => {
      const hours = byDate[date]
      if (hours > cap + 0.01) {
        out.push({
          memberId: member.id,
          memberName: member.name,
          date,
          hours: Math.round(hours * 10) / 10,
          cap,
          over: Math.round((hours - cap) * 10) / 10,
          reqIds: (detail[member.id]?.[date] || []).map((d) => d.id),
        })
      }
    })
  })
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** 同一负责人、时间段重叠的需求对 */
export function overlapPairs(requirements, members, settings, cal) {
  const c = calOf(settings, cal)
  const pairs = []
  const byMember = {}
  requirements.forEach((r) => {
    if (!r.assigneeId || !r.startDate) return
    if (!byMember[r.assigneeId]) byMember[r.assigneeId] = []
    byMember[r.assigneeId].push(r)
  })
  Object.keys(byMember).forEach((memberId) => {
    const list = byMember[memberId]
      .map((r) => {
        const sched = scheduleOf(r, members, settings, c)
        return { r, start: sched.start, end: sched.end }
      })
      .filter((x) => x.start && x.end)
      .sort((a, b) => (a.start < b.start ? -1 : 1))
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        if (list[j].start <= list[i].end) {
          pairs.push({
            memberId,
            a: list[i].r.id,
            b: list[j].r.id,
            aTitle: list[i].r.title,
            bTitle: list[j].r.title,
            start: list[j].start,
            end: list[i].end < list[j].end ? list[i].end : list[j].end,
          })
        }
      }
    }
  })
  return pairs
}

export function isOverdue(req, endISO) {
  if (!endISO) return false
  if (req.status === 'done') return false
  return endISO < todayISO()
}

/**
 * 截止日风险：
 *   over   —— 算出来的结束日已经晚于截止日
 *   tight  —— 刚好卡在截止日（没有缓冲）
 *   ok     —— 有余量
 *   none   —— 没设截止日
 */
export function dueRisk(req, endISO) {
  if (!req.dueDate) return { level: 'none', days: null }
  if (!endISO) return { level: 'unplanned', days: null }
  const delta = diffDays(parseISO(endISO), parseISO(req.dueDate))
  if (delta < 0) return { level: 'over', days: -delta }
  if (delta === 0) return { level: 'tight', days: 0 }
  return { level: 'ok', days: delta }
}

export function progressOf(req) {
  if (req.status === 'done') return 100
  const subs = req.subtasks || []
  if (subs.length) {
    const done = subs.filter((s) => s.done).length
    return Math.round((done / subs.length) * 100)
  }
  return Math.max(0, Math.min(100, Number(req.progress) || 0))
}

const PRIO_WEIGHT = (p) => PRIORITY_MAP[p]?.weight ?? 9

/**
 * 一键自动排期
 * ---------------------------------------------------------------
 * 贪心资源均衡：按「截止日 → 优先级 → 依赖顺序」排队，
 * 每个需求从「今天 / 前置结束 / 该成员上一个任务结束」三者取最晚开始，
 * 于是同一成员的任务天然首尾相接，不会自己和自己打架。
 *
 * opts:
 *   ids        只重排这些需求（默认全部）
 *   from       起始基准日，默认今天
 *   keepManual 是否保留已手填开始日（默认 false，即完全重排）
 *   onlyActive 只处理未上线且工时 > 0 的需求（默认 true）
 */
export function autoSchedule(requirements, members, settings, opts = {}) {
  const cal = calOf(settings)
  const from = opts.from || todayISO()
  const onlyActive = opts.onlyActive !== false
  const idSet = opts.ids ? new Set(opts.ids) : null

  const candidates = requirements.filter((r) => {
    if (idSet && !idSet.has(r.id)) return false
    if (onlyActive && (r.status === 'done' || !(Number(r.estimateHours) > 0))) return false
    return Number(r.estimateHours) > 0
  })

  const byId = new Map(candidates.map((r) => [r.id, r]))
  const order = topoOrder(candidates, byId)
  const memberFree = {}
  const patches = {}
  const endById = new Map()

  order.forEach((req) => {
    const member = members.find((m) => m.id === req.assigneeId)
    const cap = memberCapacity(member, settings)

    let earliest = from
    ;(req.deps || []).forEach((depId) => {
      const depEnd = endById.get(depId)
      if (depEnd) {
        const next = toISO(cal.nextWork(addDays(parseISO(depEnd), 1)))
        if (next > earliest) earliest = next
      }
    })
    if (req.assigneeId && memberFree[req.assigneeId] && memberFree[req.assigneeId] > earliest) {
      earliest = memberFree[req.assigneeId]
    }

    const start = toISO(cal.nextWork(earliest))
    const end = computeEnd(start, req.estimateHours, cap, cal)
    if (!start || !end) return
    endById.set(req.id, end)
    if (req.assigneeId) {
      memberFree[req.assigneeId] = toISO(cal.nextWork(addDays(parseISO(end), 1)))
    }
    if (start !== req.startDate) patches[req.id] = { startDate: start }
  })

  return { patches, order: order.map((r) => r.id) }
}

/** 依赖拓扑排序；有环时把环上的节点按优先级追加到末尾，保证不丢需求 */
function topoOrder(list, byId) {
  const indeg = new Map()
  const children = new Map()
  list.forEach((r) => indeg.set(r.id, 0))
  list.forEach((r) => {
    ;(r.deps || []).forEach((d) => {
      if (!byId.has(d)) return
      indeg.set(r.id, (indeg.get(r.id) || 0) + 1)
      if (!children.has(d)) children.set(d, [])
      children.get(d).push(r.id)
    })
  })

  const cmp = (a, b) => {
    const ad = a.dueDate || '9999'
    const bd = b.dueDate || '9999'
    if (ad !== bd) return ad < bd ? -1 : 1
    const ap = PRIO_WEIGHT(a.priority)
    const bp = PRIO_WEIGHT(b.priority)
    if (ap !== bp) return ap - bp
    return (a.createdAt || 0) - (b.createdAt || 0)
  }

  const ready = list.filter((r) => (indeg.get(r.id) || 0) === 0).sort(cmp)
  const out = []
  const seen = new Set()
  while (ready.length) {
    const cur = ready.shift()
    if (seen.has(cur.id)) continue
    seen.add(cur.id)
    out.push(cur)
    ;(children.get(cur.id) || []).forEach((cid) => {
      const left = (indeg.get(cid) || 0) - 1
      indeg.set(cid, left)
      if (left <= 0 && !seen.has(cid)) {
        const node = byId.get(cid)
        if (node) {
          ready.push(node)
          ready.sort(cmp)
        }
      }
    })
  }
  // 环上的需求（永远进不了 ready）按优先级补在最后
  list
    .filter((r) => !seen.has(r.id))
    .sort(cmp)
    .forEach((r) => out.push(r))
  return out
}

/** 汇总看板 / 总览需要的指标 */
export function buildMetrics(requirements, members, settings, cal) {
  const c = calOf(settings, cal)
  const t = todayISO()
  const ws = startOfWeek(parseISO(t))
  const weekStart = toISO(ws)
  const weekEnd = toISO(addDays(ws, 6))
  const { map } = buildLoadMap(requirements, members, settings, c)

  let plannedThisWeek = 0
  let capacityThisWeek = 0
  members.forEach((m) => {
    const cap = memberCapacity(m, settings)
    const byDate = map[m.id] || {}
    capacityThisWeek += cap * c.countWork(weekStart, weekEnd)
    Object.keys(byDate).forEach((d) => {
      if (d >= weekStart && d <= weekEnd) plannedThisWeek += byDate[d]
    })
  })

  const schedules = resolveSchedules(requirements, members, settings, c)
  const overdue = []
  const unplanned = []
  const dueOver = []
  const dueSoon = []

  requirements.forEach((r) => {
    const sched = schedules.get(r.id) || scheduleOf(r, members, settings, c)
    if (isOverdue(r, sched.end)) overdue.push(r)
    if (['scheduled', 'dev', 'accept'].includes(r.status) && (!r.startDate || !r.estimateHours)) {
      unplanned.push(r)
    }
    const risk = dueRisk(r, sched.end)
    if (risk.level === 'over' && r.status !== 'done') dueOver.push({ req: r, risk, end: sched.end })
    if (r.dueDate && r.status !== 'done') {
      const daysLeft = diffDays(parseISO(t), parseISO(r.dueDate))
      if (daysLeft >= 0 && daysLeft <= 7) dueSoon.push({ req: r, daysLeft, end: sched.end, risk })
    }
  })

  const byStatus = {}
  requirements.forEach((r) => {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1
  })

  return {
    total: requirements.length,
    byStatus,
    plannedThisWeek: Math.round(plannedThisWeek),
    capacityThisWeek: Math.round(capacityThisWeek),
    overdue,
    unplanned,
    dueOver,
    dueSoon,
    schedules,
    overloads: overloads(requirements, members, settings, c),
  }
}

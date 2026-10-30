import React, { useEffect, useMemo, useRef, useState } from 'react'
import { PRIORITY_MAP, STATUSES } from '../lib/constants'
import { addDays, diffDays, parseISO, startOfWeek, toISO, today, weekdayCN } from '../lib/date'
import { dueRisk } from '../lib/schedule'
import { Icon } from './Icons'
import { Avatar, EmptyState, Segmented } from './ui'

const ZOOMS = {
  day: { dayW: 38, days: 42, padBefore: 7, step: 7, name: '日' },
  week: { dayW: 15, days: 119, padBefore: 28, step: 28, name: '周' },
  month: { dayW: 5.6, days: 371, padBefore: 35, step: 91, name: '月' },
}

const LEFT_W = 300
const ROW_H = 44
const GROUP_H = 34

export default function Gantt({ rows, members, milestones, onOpen, onUpdate, onNew, onAutoSchedule }) {
  const [zoom, setZoom] = useState('day')
  const [shift, setShift] = useState(0)
  const [groupBy, setGroupBy] = useState('assignee')
  const [drag, setDrag] = useState(null)
  const [hoverDep, setHoverDep] = useState(null)
  const scrollRef = useRef(null)
  const didScroll = useRef(false)

  const cfg = ZOOMS[zoom]
  const dayW = cfg.dayW

  const windowStart = useMemo(
    () => startOfWeek(addDays(today(), -cfg.padBefore + shift)),
    [cfg.padBefore, shift],
  )

  const days = useMemo(
    () => Array.from({ length: cfg.days }, (_, i) => addDays(windowStart, i)),
    [windowStart, cfg.days],
  )

  const totalW = cfg.days * dayW

  const months = useMemo(() => {
    const out = []
    days.forEach((d) => {
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const last = out[out.length - 1]
      if (last && last.key === key) last.count += 1
      else out.push({ key, count: 1, label: `${d.getFullYear()}年${d.getMonth() + 1}月` })
    })
    return out
  }, [days])

  const groups = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const as = a.start || '9999'
      const bs = b.start || '9999'
      if (as !== bs) return as < bs ? -1 : 1
      return (PRIORITY_MAP[a.priority]?.weight ?? 9) - (PRIORITY_MAP[b.priority]?.weight ?? 9)
    })
    if (groupBy === 'none') return [{ key: 'all', name: '全部需求', rows: sorted }]
    if (groupBy === 'status') {
      return STATUSES.map((s) => ({
        key: s.id,
        name: s.name,
        color: s.color,
        rows: sorted.filter((r) => r.status === s.id),
      })).filter((g) => g.rows.length)
    }
    if (groupBy === 'milestone') {
      const out = (milestones || [])
        .map((ms) => ({
          key: ms.id,
          name: ms.name,
          dot: 'var(--text-faint)',
          rows: sorted.filter((r) => r.milestoneId === ms.id),
        }))
        .filter((g) => g.rows.length)
      const loose = sorted.filter((r) => !r.milestoneId || !(milestones || []).some((m) => m.id === r.milestoneId))
      if (loose.length) out.push({ key: 'ms-none', name: '未关联里程碑', rows: loose })
      return out
    }
    const out = []
    members.forEach((m) => {
      const list = sorted.filter((r) => r.assigneeId === m.id)
      if (list.length) out.push({ key: m.id, name: m.name, member: m, rows: list })
    })
    const none = sorted.filter((r) => !r.assigneeId || !members.some((m) => m.id === r.assigneeId))
    if (none.length) out.push({ key: 'none', name: '未分配', rows: none })
    return out
  }, [rows, groupBy, members, milestones])

  /** 拍平成一维布局，算出每行的 y，用于画依赖连线 */
  const layout = useMemo(() => {
    const items = []
    const rowY = new Map()
    let y = 0
    groups.forEach((g) => {
      items.push({ type: 'group', key: `g-${g.key}`, g, y, h: GROUP_H })
      y += GROUP_H
      g.rows.forEach((row) => {
        items.push({ type: 'row', key: row.id, row, y, h: ROW_H })
        rowY.set(row.id, y)
        y += ROW_H
      })
    })
    return { items, height: y, rowY }
  }, [groups])

  const todayX = diffDays(windowStart, today()) * dayW

  const barOf = (row) => {
    if (!row.start || !row.end) return null
    const left = diffDays(windowStart, parseISO(row.start)) * dayW
    const width = Math.max(dayW - 3, (diffDays(parseISO(row.start), parseISO(row.end)) + 1) * dayW - 3)
    return { left, width }
  }

  /** 依赖连线：前置结束 → 后置开始 */
  const arrows = useMemo(() => {
    const out = []
    rows.forEach((row) => {
      if (!row.deps?.length) return
      const toY = layout.rowY.get(row.id)
      const toBar = barOf(row)
      if (toY == null || !toBar) return
      row.deps.forEach((depId) => {
        const depRow = rows.find((r) => r.id === depId)
        if (!depRow) return
        const fromY = layout.rowY.get(depId)
        const fromBar = barOf(depRow)
        if (fromY == null || !fromBar) return
        const x1 = fromBar.left + fromBar.width
        const y1 = fromY + ROW_H / 2
        const x2 = toBar.left
        const y2 = toY + ROW_H / 2
        const gap = 9
        const midX = Math.max(x1 + gap, x2 - gap)
        const d =
          x2 - x1 > gap * 2
            ? `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`
            : `M ${x1} ${y1} h ${gap} V ${y2} H ${x2}`
        out.push({ key: `${depId}-${row.id}`, d, depId, rowId: row.id, x2, y2 })
      })
    })
    return out
  }, [rows, layout, dayW, windowStart])

  useEffect(() => {
    if (didScroll.current) return
    const el = scrollRef.current
    if (!el) return
    el.scrollLeft = Math.max(0, todayX - 160)
    didScroll.current = true
  }, [todayX])

  const beginDrag = (e, row, mode) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id: row.id, mode, startX: e.clientX, delta: 0, moved: false })
  }

  const moveDrag = (e) => {
    setDrag((prev) => {
      if (!prev) return prev
      const delta = Math.round((e.clientX - prev.startX) / dayW)
      return { ...prev, delta, moved: prev.moved || Math.abs(e.clientX - prev.startX) > 3 }
    })
  }

  const endDrag = (e, row) => {
    if (!drag) return
    const { delta, mode, moved } = drag
    setDrag(null)
    if (!moved) {
      onOpen(row.id)
      return
    }
    if (delta === 0) return
    if (mode === 'move') {
      onUpdate(row.id, { startDate: toISO(addDays(parseISO(row.start), delta)) })
    } else {
      const workdays = Math.max(1, row.workdays + delta)
      onUpdate(row.id, { estimateHours: Math.round(workdays * row.cap) })
    }
  }

  /** 拖动中的日期预览 */
  const previewText = (row) => {
    if (!drag || drag.id !== row.id) return ''
    if (drag.mode === 'move') {
      const next = addDays(parseISO(row.start), drag.delta)
      return toISO(next)
    }
    const workdays = Math.max(1, row.workdays + drag.delta)
    const end = toISO(addDays(parseISO(row.end), drag.delta))
    return `${workdays} 个工作日 · 至 ${end}`
  }

  const milestoneMarks = useMemo(
    () =>
      (milestones || [])
        .filter((m) => m.date)
        .map((m) => ({ ...m, x: diffDays(windowStart, parseISO(m.date)) * dayW }))
        .filter((m) => m.x >= 0 && m.x <= totalW),
    [milestones, windowStart, dayW, totalW],
  )

  return (
    <div className="gantt">
      <div className="view-toolbar">
        <div className="toolbar-group">
          <button type="button" className="btn icon-only" onClick={() => setShift((s) => s - cfg.step)} title="往前">
            <Icon name="chevronLeft" size={14} />
          </button>
          <button type="button" className="btn" onClick={() => setShift(0)}>
            今天
          </button>
          <button type="button" className="btn icon-only" onClick={() => setShift((s) => s + cfg.step)} title="往后">
            <Icon name="chevronRight" size={14} />
          </button>
        </div>
        <div className="toolbar-spacer" />
        {onAutoSchedule && (
          <button type="button" className="btn ghost" onClick={onAutoSchedule} title="按优先级与依赖自动铺排">
            <Icon name="refresh" size={13} /> 自动排期
          </button>
        )}
        <label className="select-wrap">
          <span className="select-label">分组</span>
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="select sm">
            <option value="assignee">按负责人</option>
            <option value="status">按状态</option>
            <option value="milestone">按里程碑</option>
            <option value="none">不分组</option>
          </select>
        </label>
        <Segmented
          size="sm"
          value={zoom}
          onChange={setZoom}
          options={[
            { id: 'day', name: '日' },
            { id: 'week', name: '周' },
            { id: 'month', name: '月' },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="gantt"
          title="这里还没有可排的需求"
          action={
            <button type="button" className="btn primary" onClick={onNew}>
              <Icon name="plus" size={14} /> 新建需求
            </button>
          }
        />
      ) : (
        <div className="gantt-scroll" ref={scrollRef} title="拖动时间条改开始日，拖右边缘改时长">
          <div className="gantt-canvas" style={{ '--dayw': `${dayW}px`, width: LEFT_W + totalW }}>
            <div className="gantt-header">
              <div className="gantt-head-left" style={{ width: LEFT_W }}>
                <span>需求</span>
                <span className="head-sub">{rows.length} 条</span>
              </div>
              <div className="gantt-head-right" style={{ width: totalW }}>
                <div className="gantt-months">
                  {months.map((m) => (
                    <div key={m.key} className="gantt-month" style={{ width: m.count * dayW }}>
                      {m.count * dayW > 46 ? m.label : ''}
                    </div>
                  ))}
                </div>
                <div className="gantt-days">
                  {days.map((d) => {
                    const iso = toISO(d)
                    const isToday = iso === toISO(today())
                    const weekend = d.getDay() === 0 || d.getDay() === 6
                    let label = ''
                    if (zoom === 'day') label = d.getDate()
                    else if (zoom === 'week') label = d.getDay() === 1 ? `${d.getMonth() + 1}/${d.getDate()}` : ''
                    else label = d.getDate() === 1 ? `${d.getMonth() + 1}月` : ''
                    return (
                      <div
                        key={iso}
                        className={`gantt-day ${weekend ? 'weekend' : ''} ${isToday ? 'today' : ''}`}
                        style={{ width: dayW }}
                      >
                        {zoom === 'day' && <em>{weekdayCN(d)}</em>}
                        <span>{label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="gantt-body">
              <div className="gantt-weekend-layer" style={{ left: LEFT_W, width: totalW }} />
              {todayX >= 0 && todayX <= totalW && (
                <div className="gantt-today-line" style={{ left: LEFT_W + todayX }} />
              )}

              {milestoneMarks.map((m) => (
                <div key={m.id} className="gantt-ms-line" style={{ left: LEFT_W + m.x }}>
                  <span className="gantt-ms-flag">{m.name}</span>
                </div>
              ))}

              {layout.items.map((item) => {
                if (item.type === 'group') {
                  const g = item.g
                  return (
                    <div className="gantt-group" key={item.key} style={{ height: item.h }}>
                      <div className="gantt-group-left" style={{ width: LEFT_W }}>
                        {g.member ? (
                          <Avatar member={g.member} size={16} />
                        ) : (
                          <span className="dot" style={{ background: g.color || g.dot || 'var(--text-faint)' }} />
                        )}
                        <span>{g.name}</span>
                        <em>{g.rows.length}</em>
                      </div>
                      <div className="gantt-group-right" style={{ width: totalW }} />
                    </div>
                  )
                }
                const row = item.row
                const hasBar = Boolean(row.start && row.end)
                const bar = barOf(row)
                let left = bar ? bar.left : 0
                let width = bar ? bar.width : 0
                const dragging = drag?.id === row.id
                if (dragging && bar) {
                  if (drag.mode === 'move') left += drag.delta * dayW
                  else width = Math.max(dayW - 3, width + drag.delta * dayW)
                }
                const risk = dueRisk(row, row.end)
                const dueX = row.dueDate ? diffDays(windowStart, parseISO(row.dueDate)) * dayW : null
                const showDue = dueX != null && dueX >= 0 && dueX <= totalW

                return (
                  <div className="gantt-row" key={row.id} style={{ height: item.h }}>
                    <div className="gantt-row-left" style={{ width: LEFT_W }} onClick={() => onOpen(row.id)}>
                      <span className="prio-bar" style={{ background: PRIORITY_MAP[row.priority]?.color }} />
                      <span className="gantt-row-main">
                        <span className={`gantt-row-title ${row.overdue ? 'overdue' : ''}`}>{row.title}</span>
                        <span className="gantt-row-meta">
                          {row.deps?.length > 0 && (
                            <em className="meta-dep" title="有前置需求">
                              <Icon name="link" size={9} />
                              {row.deps.length}
                            </em>
                          )}
                          <em>{row.estimateHours ? `${row.estimateHours}h` : '未估'}</em>
                          {row.dueDate && (
                            <em className={`meta-due ${risk.level === 'over' ? 'over' : ''}`}>
                              <Icon name="flag" size={9} />
                              {row.dueDate.slice(5).replace('-', '/')}
                            </em>
                          )}
                        </span>
                      </span>
                      <span className="gantt-row-hours">{row.workdays ? `${row.workdays}d` : '—'}</span>
                    </div>
                    <div className="gantt-row-right" style={{ width: totalW }}>
                      {showDue && (
                        <span
                          className={`gantt-due-line ${risk.level === 'over' ? 'over' : ''}`}
                          style={{ left: dueX }}
                          title={`截止 ${row.dueDate}`}
                        />
                      )}
                      {hasBar && (
                        <div
                          className={`gbar ${dragging ? 'dragging' : ''} ${row.overdue ? 'is-overdue' : ''} ${
                            row.blocked ? 'is-blocked' : ''
                          }`}
                          style={{
                            left,
                            width,
                            background: `${row.statusColor}1f`,
                            borderColor: `${row.statusColor}66`,
                          }}
                          onPointerDown={(e) => beginDrag(e, row, 'move')}
                          onPointerMove={moveDrag}
                          onPointerUp={(e) => endDrag(e, row)}
                          onPointerCancel={() => setDrag(null)}
                          onMouseEnter={() => setHoverDep(row.id)}
                          onMouseLeave={() => setHoverDep(null)}
                          title={`${row.title}｜${row.start} → ${row.end}｜${row.estimateHours}h`}
                        >
                          <span
                            className="gbar-progress"
                            style={{ width: `${row.progress}%`, background: `${row.statusColor}38` }}
                          />
                          <span className="gbar-label" style={{ color: row.statusColor }}>
                            {width > 52 ? row.title : ''}
                          </span>
                          <span
                            className="gbar-handle"
                            onPointerDown={(e) => beginDrag(e, row, 'resize')}
                            onPointerMove={moveDrag}
                            onPointerUp={(e) => endDrag(e, row)}
                          />
                        </div>
                      )}
                      {dragging && previewText(row) && (
                        <span className="gbar-tip" style={{ left: left + width + 8 }}>
                          {previewText(row)}
                        </span>
                      )}
                      {!hasBar && (
                        <span className="gbar-missing" style={{ left: 8 }}>
                          未排期
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}

              {arrows.length > 0 && (
                <svg
                  className="gantt-links"
                  width={totalW}
                  height={layout.height}
                  style={{ left: LEFT_W }}
                  aria-hidden="true"
                >
                  {arrows.map((a) => (
                    <path
                      key={a.key}
                      d={a.d}
                      className={`dep-link ${hoverDep === a.rowId || hoverDep === a.depId ? 'hot' : ''}`}
                      markerEnd="url(#dep-arrow)"
                    />
                  ))}
                  <defs>
                    <marker
                      id="dep-arrow"
                      viewBox="0 0 8 8"
                      refX="7"
                      refY="4"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 8 4 L 0 8 z" className="dep-arrow-head" />
                    </marker>
                  </defs>
                </svg>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

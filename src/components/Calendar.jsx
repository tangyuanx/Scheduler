import React, { useMemo, useState } from 'react'
import { addDays, parseISO, startOfWeek, toISO, today } from '../lib/date'
import { Icon } from './Icons'

const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日']

export default function Calendar({ rows, members, milestones, settings, onOpen }) {
  const [cursor, setCursor] = useState(() => {
    const t = today()
    return new Date(t.getFullYear(), t.getMonth(), 1)
  })

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const gridStart = startOfWeek(first)
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [cursor])

  /** 每天承接的需求：区间覆盖到这一天就算 */
  const byDay = useMemo(() => {
    const map = {}
    rows.forEach((r) => {
      if (!r.start || !r.end) return
      const a = parseISO(r.start)
      const b = parseISO(r.end)
      if (!a || !b) return
      let cur = a
      let guard = 0
      while (cur <= b && guard < 400) {
        const iso = toISO(cur)
        if (!map[iso]) map[iso] = []
        map[iso].push(r)
        cur = addDays(cur, 1)
        guard += 1
      }
    })
    return map
  }, [rows])

  const msByDay = useMemo(() => {
    const map = {}
    ;(milestones || []).forEach((m) => {
      if (!m.date) return
      if (!map[m.date]) map[m.date] = []
      map[m.date].push(m)
    })
    return map
  }, [milestones])

  const monthLabel = `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`
  const todayISO = toISO(today())
  const inMonth = (d) => d.getMonth() === cursor.getMonth()

  return (
    <div className="calendar-view">
      <div className="view-toolbar">
        <div className="toolbar-group">
          <button
            type="button"
            className="btn icon-only"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            title="上个月"
          >
            <Icon name="chevronLeft" size={14} />
          </button>
          <button type="button" className="btn" onClick={() => setCursor(new Date(today().getFullYear(), today().getMonth(), 1))}>
            本月
          </button>
          <button
            type="button"
            className="btn icon-only"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            title="下个月"
          >
            <Icon name="chevronRight" size={14} />
          </button>
        </div>
        <span className="week-label">{monthLabel}</span>
        <div className="toolbar-spacer" />
      </div>

      <div className="cal-grid">
        <div className="cal-head">
          {WEEK_HEAD.map((w, i) => (
            <span key={w} className={i > 4 ? 'weekend' : ''}>
              {`周${w}`}
            </span>
          ))}
        </div>
        <div className="cal-body">
          {cells.map((d) => {
            const iso = toISO(d)
            const list = (byDay[iso] || []).filter((r) => r.status !== 'done' || inMonth(d))
            const ms = msByDay[iso] || []
            const isToday = iso === todayISO
            const weekend = d.getDay() === 0 || d.getDay() === 6
            return (
              <div
                key={iso}
                className={`cal-cell ${inMonth(d) ? '' : 'out'} ${weekend ? 'weekend' : ''} ${isToday ? 'today' : ''}`}
              >
                <div className="cal-cell-head">
                  <span className="cal-date">{d.getDate()}</span>
                  {ms.map((m) => (
                    <span className="cal-ms" key={m.id} title={m.name}>
                      <Icon name="flag" size={9} />
                      {m.name}
                    </span>
                  ))}
                  {list.length > 0 && <span className="cal-count">{list.length}</span>}
                </div>
                <div className="cal-items">
                  {list.slice(0, 3).map((r) => (
                    <button
                      type="button"
                      className={`cal-chip ${r.overdue ? 'over' : ''}`}
                      key={r.id}
                      style={{ borderLeftColor: r.statusColor }}
                      onClick={() => onOpen(r.id)}
                      title={`${r.title}｜${r.assigneeName}`}
                    >
                      {r.title}
                    </button>
                  ))}
                  {list.length > 3 && <span className="cal-more">+{list.length - 3}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

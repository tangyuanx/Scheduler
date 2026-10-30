import React, { useMemo, useState } from 'react'
import { addDays, parseISO, startOfWeek, toISO, today, workdaysBetween } from '../lib/date'
import { makeCalendar } from '../lib/calendar'
import { buildLoadMap, memberCapacity } from '../lib/schedule'
import { Icon } from './Icons'
import { Avatar, EmptyState } from './ui'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

function ratioClass(ratio) {
  if (ratio <= 0.001) return 'empty'
  if (ratio > 1.001) return 'over'
  if (ratio > 0.85) return 'high'
  return 'ok'
}

export default function Capacity({ rows, members, settings, onOpen }) {
  const [weekOffset, setWeekOffset] = useState(0)

  const weekStart = useMemo(
    () => addDays(startOfWeek(today()), weekOffset * 7),
    [weekOffset],
  )
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const { map } = useMemo(() => buildLoadMap(rows, members, settings), [rows, members, settings])
  const cal = useMemo(() => makeCalendar(settings), [settings])

  const weeks = useMemo(() => {
    const base = startOfWeek(today())
    return Array.from({ length: 6 }, (_, i) => addDays(base, i * 7))
  }, [])

  const overloadList = useMemo(() => {
    const out = []
    members.forEach((m) => {
      const cap = memberCapacity(m, settings)
      const byDate = map[m.id] || {}
      Object.keys(byDate).forEach((date) => {
        if (byDate[date] > cap + 0.01) out.push({ member: m, date, hours: byDate[date], cap })
      })
    })
    return out.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 12)
  }, [map, members, settings])

  if (!members.length) {
    return <EmptyState icon="gauge" title="还没有成员" desc="去设置里添加成员" />
  }

  const weekLabel = `${weekStart.getMonth() + 1}月${weekStart.getDate()}日 – ${addDays(weekStart, 6).getMonth() + 1}月${addDays(weekStart, 6).getDate()}日`

  return (
    <div className="capacity">
      <div className="view-toolbar">
        <div className="toolbar-group">
          <button type="button" className="btn icon-only" onClick={() => setWeekOffset((o) => o - 1)}>
            <Icon name="chevronLeft" size={14} />
          </button>
          <button type="button" className="btn" onClick={() => setWeekOffset(0)}>
            本周
          </button>
          <button type="button" className="btn icon-only" onClick={() => setWeekOffset((o) => o + 1)}>
            <Icon name="chevronRight" size={14} />
          </button>
        </div>
        <span className="week-label">{weekLabel}</span>
        <div className="toolbar-spacer" />
        <span className="legend">
          <i className="lg ok" /> 正常
          <i className="lg high" /> 接近满载
          <i className="lg over" /> 超载
        </span>
      </div>

      <div className="cap-grid">
        <div className="cap-head">
          <span className="cap-name">成员</span>
          {weekDays.map((d, i) => (
            <span key={toISO(d)} className={`cap-day-head ${i > 4 ? 'weekend' : ''} ${toISO(d) === toISO(today()) ? 'today' : ''}`}>
              <em>{WEEKDAYS[i]}</em>
              <span>{d.getDate()}</span>
            </span>
          ))}
          <span className="cap-total-head">合计 / 产能</span>
        </div>

        {members.map((m) => {
          const cap = memberCapacity(m, settings)
          const byDate = map[m.id] || {}
          const total = weekDays.reduce((s, d) => s + (byDate[toISO(d)] || 0), 0)
          const capacity = cap * cal.countWork(toISO(weekStart), toISO(addDays(weekStart, 6)))
          const ratio = capacity > 0 ? total / capacity : 0
          return (
            <div className="cap-row" key={m.id}>
              <div className="cap-name">
                <Avatar member={m} size={20} />
                <span>{m.name}</span>
                <em>{cap}h/天</em>
              </div>
              {weekDays.map((d) => {
                const iso = toISO(d)
                const h = byDate[iso] || 0
                const r = cap > 0 ? h / cap : 0
                const isWork = d.getDay() !== 0 && d.getDay() !== 6
                return (
                  <div
                    key={iso}
                    className={`cap-cell ${isWork ? '' : 'weekend'} ${ratioClass(r)}`}
                    title={`${m.name} · ${iso} · ${Math.round(h * 10) / 10}h / ${cap}h`}
                  >
                    {h > 0 ? Math.round(h * 10) / 10 : <span className="cap-zero">·</span>}
                  </div>
                )
              })}
              <div className={`cap-total ${ratioClass(ratio)}`}>
                <span className="cap-total-num">
                  {Math.round(total * 10) / 10}
                  <em>/ {capacity}h</em>
                </span>
                <span className="cap-bar">
                  <i style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="cap-section">
        <h3>
          未来 6 周负荷
        </h3>
        <div className="heatmap">
          <div className="heatmap-head">
            <span />
            {weeks.map((w) => (
              <span key={toISO(w)} className="hm-week">
                {w.getMonth() + 1}/{w.getDate()}
              </span>
            ))}
          </div>
          {members.map((m) => {
            const cap = memberCapacity(m, settings)
            const byDate = map[m.id] || {}
            return (
              <div className="heatmap-row" key={m.id}>
                <span className="hm-name">
                  <Avatar member={m} size={16} /> {m.name}
                </span>
                {weeks.map((w) => {
                  const end = addDays(w, 6)
                  let sum = 0
                  for (let i = 0; i < 7; i += 1) sum += byDate[toISO(addDays(w, i))] || 0
                  const capacity = cap * cal.countWork(toISO(w), toISO(end))
                  const ratio = capacity > 0 ? sum / capacity : 0
                  const alpha = Math.min(0.85, 0.1 + ratio * 0.7)
                  const bg = ratio > 1 ? `rgba(229, 72, 77, ${Math.min(0.9, alpha)})` : `rgba(91, 91, 214, ${alpha})`
                  return (
                    <span
                      key={toISO(w)}
                      className="hm-cell"
                      style={{ background: ratio > 0 ? bg : 'transparent', color: ratio > 0.75 ? '#fff' : 'var(--text-dim)' }}
                      title={`${m.name} · ${toISO(w)} 周 · ${Math.round(sum)}h / ${Math.round(capacity)}h`}
                    >
                      {ratio > 0 ? `${Math.round(ratio * 100)}%` : ''}
                    </span>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {overloadList.length > 0 && (
        <div className="cap-section">
          <h3>
            <Icon name="alert" size={13} /> 超载提醒
          </h3>
          <div className="overload-list">
            {overloadList.map((o) => (
              <div className="overload-item" key={`${o.member.id}-${o.date}`}>
                <Avatar member={o.member} size={18} />
                <span className="ol-name">{o.member.name}</span>
                <span className="ol-date">{o.date}</span>
                <span className="ol-num">
                  {Math.round(o.hours * 10) / 10}h <em>/ {o.cap}h</em>
                </span>
                <span className="ol-over">超 {Math.round((o.hours - o.cap) * 10) / 10}h</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

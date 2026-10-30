import React, { useMemo } from 'react'
import { STATUSES, STATUS_MAP } from '../lib/constants'
import { addDays, startOfWeek, toISO, today, weekdayCN } from '../lib/date'
import { makeCalendar } from '../lib/calendar'
import { buildLoadMap, buildMetrics, memberCapacity } from '../lib/schedule'
import { Icon } from './Icons'
import { Avatar, PriorityBadge, Progress, StatusPill } from './ui'

function Ring({ ratio, size = 56 }) {
  const stroke = 5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, ratio))
  const color = ratio > 1.001 ? 'var(--danger)' : ratio > 0.85 ? 'var(--warn)' : 'var(--accent)'
  return (
    <svg className="kpi-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-2)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

function Kpi({ label, value, unit, tone, visual }) {
  return (
    <div className={`kpi ${tone || ''}`}>
      <div className="kpi-main">
        <span className="kpi-label">{label}</span>
        <div className="kpi-value-row">
          <strong className="kpi-value">{value}</strong>
          {unit && <span className="kpi-unit">{unit}</span>}
        </div>
      </div>
      {visual && <div className="kpi-visual">{visual}</div>}
    </div>
  )
}

export default function Dashboard({ rows, members, settings, milestones, onOpen, onNew, setView, setFilters, onAutoSchedule }) {
  const metrics = useMemo(() => buildMetrics(rows, members, settings), [rows, members, settings])
  const { map } = useMemo(() => buildLoadMap(rows, members, settings), [rows, members, settings])

  const active = (metrics.byStatus.scheduled || 0) + (metrics.byStatus.dev || 0) + (metrics.byStatus.accept || 0)
  const loadRatio = metrics.capacityThisWeek > 0 ? metrics.plannedThisWeek / metrics.capacityThisWeek : 0

  const weekStart = useMemo(() => startOfWeek(today()), [])
  const weekEnd = addDays(weekStart, 6)
  const cal = useMemo(() => makeCalendar(settings), [settings])
  const totalCapPerDay = members.reduce((s, m) => s + memberCapacity(m, settings), 0)

  const daily = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    return days.map((d) => {
      const iso = toISO(d)
      const segs = members.map((m) => ({ m, h: map[m.id]?.[iso] || 0 })).filter((x) => x.h > 0)
      const total = segs.reduce((s, x) => s + x.h, 0)
      const isWork = d.getDay() !== 0 && d.getDay() !== 6
      return { d, iso, segs, total, cap: isWork ? totalCapPerDay : 0, isWork, isToday: iso === toISO(today()) }
    })
  }, [weekStart, members, map, totalCapPerDay])

  const maxVal = Math.max(1, ...daily.map((x) => Math.max(x.total, x.cap)))

  const upcoming = useMemo(
    () =>
      rows
        .filter((r) => r.end && ['scheduled', 'dev', 'accept'].includes(r.status))
        .sort((a, b) => (a.end < b.end ? -1 : 1))
        .slice(0, 5),
    [rows],
  )

  /** 需要处理的事项：按 id 去重，避免同一条既逾期又赶不上截止被数两次 */
  const riskItems = useMemo(() => {
    const seen = new Set()
    const out = []
    metrics.dueOver.forEach(({ req, risk }) => {
      if (seen.has(req.id)) return
      seen.add(req.id)
      out.push({ kind: 'due', req, risk })
    })
    metrics.overdue.forEach((req) => {
      if (seen.has(req.id)) return
      seen.add(req.id)
      out.push({ kind: 'overdue', req })
    })
    metrics.unplanned.forEach((req) => {
      if (seen.has(req.id)) return
      seen.add(req.id)
      out.push({ kind: 'unplanned', req })
    })
    return out
  }, [metrics])

  const goStatus = (id) => {
    setFilters((prev) => ({ ...prev, statuses: [id] }))
    setView('table')
  }

  return (
    <div className="dashboard">
      <div className="kpi-row">
        <Kpi
          label="需求总数"
          value={rows.length}
          visual={
            <div className="kpi-strip">
              {STATUSES.map((s) => {
                const n = metrics.byStatus[s.id] || 0
                return n > 0 ? <i key={s.id} style={{ flex: n, background: s.color }} title={`${s.name} ${n}`} /> : null
              })}
            </div>
          }
        />
        <Kpi label="进行中" value={active} tone="accent" />
        <Kpi
          label="本周负荷"
          value={`${Math.round(loadRatio * 100)}`}
          unit="%"
          tone={loadRatio > 1 ? 'danger' : loadRatio > 0.85 ? 'warn' : ''}
          visual={<Ring ratio={loadRatio} />}
        />
        <Kpi label="逾期" value={metrics.overdue.length} tone={metrics.overdue.length ? 'danger' : ''} />
      </div>

      <div className="dash-actions">
        {onAutoSchedule && (
          <button type="button" className="btn ghost" onClick={onAutoSchedule} title="按截止日、优先级、前置依赖依次铺排">
            <Icon name="refresh" size={13} /> 自动排期
          </button>
        )}
        <button type="button" className="btn ghost" onClick={onNew}>
          <Icon name="plus" size={13} /> 新建需求
        </button>
        <button type="button" className="btn ghost" onClick={() => setView('report')}>
          <Icon name="chart" size={13} /> 看报表
        </button>
      </div>

      <section className="panel pipe-panel">
        <header className="panel-head">
          <h2>需求流转</h2>
        </header>
        <div className="pipeline">
          {STATUSES.map((s) => {
            const count = metrics.byStatus[s.id] || 0
            const pct = rows.length ? Math.round((count / rows.length) * 100) : 0
            return (
              <button
                type="button"
                key={s.id}
                className="pipe-step"
                style={{ background: `${s.color}0e`, borderColor: `${s.color}26` }}
                onClick={() => goStatus(s.id)}
                title={`${s.name}：${count} 条，占 ${pct}%`}
              >
                <span className="pipe-name">
                  <i style={{ background: s.color }} />
                  {s.name}
                </span>
                <span className="pipe-count">{count}</span>
                <span className="pipe-fill" style={{ width: `${pct}%`, background: s.color }} />
              </button>
            )
          })}
        </div>
      </section>

      <div className="dash-grid">
        <section className="panel">
          <header className="panel-head">
            <h2>本周每日投入</h2>
          </header>
          <div className="week-chart" style={{ height: 168 }}>
            {daily.map((day) => (
              <div className={`wc-col ${day.isToday ? 'today' : ''} ${day.isWork ? '' : 'weekend'}`} key={day.iso}>
                <div className="wc-area">
                  {day.cap > 0 && (
                    <span
                      className="wc-cap"
                      style={{ bottom: `${(day.cap / maxVal) * 100}%` }}
                      title="当日总产能"
                    />
                  )}
                  <div className="wc-bar" style={{ height: `${(day.total / maxVal) * 100}%` }}>
                    {day.segs.map((s) => (
                      <i
                        key={s.m.id}
                        style={{ height: `${(s.h / day.total) * 100}%`, background: s.m.color }}
                        title={`${s.m.name} ${Math.round(s.h * 10) / 10}h`}
                      />
                    ))}
                  </div>
                </div>
                <span className="wc-day">
                  {weekdayCN(day.d)}
                  <em>{day.d.getDate()}</em>
                </span>
              </div>
            ))}
          </div>
          <div className="chart-legend">
            {members.map((m) => (
              <span key={m.id}>
                <i style={{ background: m.color }} />
                {m.name}
              </span>
            ))}
          </div>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>需要关注</h2>
          </header>
          <div className="risk-list">
            {riskItems.slice(0, 6).map((item) => (
              <button type="button" className="risk-item" key={item.req.id} onClick={() => onOpen(item.req.id)}>
                <span className={`risk-icon ${item.kind === 'unplanned' ? 'warn' : 'danger'}`}>
                  <Icon name={item.kind === 'due' ? 'flag' : item.kind === 'overdue' ? 'alert' : 'clock'} size={14} />
                </span>
                <span className="risk-body">
                  <strong>{item.req.title}</strong>
                  <em>
                    {item.kind === 'due' && `按当前排期会晚 ${item.risk.days} 天，赶不上截止`}
                    {item.kind === 'overdue' && `已过结束日，仍停在「${STATUS_MAP[item.req.status]?.name}」`}
                    {item.kind === 'unplanned' && '已进入流程，但没填开始日期或工时'}
                  </em>
                </span>
                {item.kind === 'overdue' ? (
                  <StatusPill id={item.req.status} small />
                ) : (
                  <PriorityBadge id={item.req.priority} />
                )}
              </button>
            ))}
            {riskItems.length === 0 && (
              <div className="risk-empty">
                <Icon name="check" size={15} /> 一切正常
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="dash-grid">
        <section className="panel">
          <header className="panel-head">
            <h2>即将交付</h2>
            <button type="button" className="link-btn" onClick={() => setView('gantt')}>
              看甘特图
            </button>
          </header>
          <div className="upcoming">
            {upcoming.length === 0 && <div className="risk-empty">还没有已排期的需求</div>}
            {upcoming.map((r) => (
              <button type="button" className="up-item" key={r.id} onClick={() => onOpen(r.id)}>
                <span className={`up-date ${r.overdue ? 'overdue' : ''}`}>
                  <em>{r.end.slice(5, 7)}月</em>
                  {r.end.slice(8, 10)}
                </span>
                <span className="up-body">
                  <strong>{r.title}</strong>
                  <span className="up-meta">
                    <Avatar member={members.find((m) => m.id === r.assigneeId)} size={16} />
                    {r.dueDate && r.dueRisk?.level === 'over' && <em className="up-due over">赶不上截止</em>}
                    {r.dueDate && r.dueRisk?.level === 'tight' && <em className="up-due">刚好卡在截止日</em>}
                  </span>
                </span>
                <span className="up-progress">
                  <Progress value={r.progress} height={5} />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>团队本周负荷</h2>
          </header>
          <div className="member-loads">
            {members.map((m) => {
              const cap = memberCapacity(m, settings)
              const byDate = map[m.id] || {}
              const mondayISO = toISO(weekStart)
              const sundayISO = toISO(weekEnd)
              const week = Object.keys(byDate).reduce(
                (s, d) => (d >= mondayISO && d <= sundayISO ? s + byDate[d] : s),
                0,
              )
              // 按这周实际有几个工作日折算，遇到节假日才不会把产能算高
              const capacity = cap * Math.max(1, cal.countWork(mondayISO, sundayISO))
              const ratio = capacity > 0 ? week / capacity : 0
              return (
                <div className="member-load" key={m.id}>
                  <Avatar member={m} size={26} />
                  <span className="ml-name">{m.name}</span>
                  <span className="ml-track">
                    <i
                      style={{
                        width: `${Math.min(100, ratio * 100)}%`,
                        background: ratio > 1 ? 'var(--danger)' : ratio > 0.85 ? 'var(--warn)' : 'var(--accent)',
                      }}
                      title={`${m.name}：已排 ${Math.round(week)}h / 产能 ${capacity}h`}
                    />
                  </span>
                  <span className={`ml-flag ${ratio > 1 ? 'over' : ratio > 0.85 ? 'warn' : ''}`}>
                    {ratio > 1 ? '超载' : ratio > 0.85 ? '接近满' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

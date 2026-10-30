import React, { useMemo } from 'react'
import { STATUSES } from '../lib/constants'
import { fmtShort } from '../lib/date'
import { buildReport, cycleDays } from '../lib/report'

function Bar({ value, max, tone }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <span className={`rbar ${tone || ''}`}>
      <i style={{ width: `${pct}%` }} />
    </span>
  )
}

export default function Report({ rows, members, settings, milestones, onOpen }) {
  const report = useMemo(() => buildReport(rows), [rows])
  const overdue = rows.filter((r) => r.overdue).length
  const overdueRate = rows.length ? Math.round((overdue / rows.length) * 100) : 0
  const flowMax = Math.max(1, ...report.flow.map((f) => Math.max(f.done, f.added)))
  const dwellMax = Math.max(1, ...Object.values(report.dwell))

  const milestoneStats = useMemo(
    () =>
      (milestones || [])
        .filter((m) => m.date)
        .map((m) => {
          const list = rows.filter((r) => r.milestoneId === m.id)
          const done = list.filter((r) => r.status === 'done').length
          const hours = list.reduce((s, r) => s + (Number(r.estimateHours) || 0), 0)
          return { ...m, total: list.length, done, hours, pct: list.length ? Math.round((done / list.length) * 100) : 0 }
        })
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    [milestones, rows],
  )

  return (
    <div className="report">
      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-main">
            <span className="kpi-label">平均周期时间</span>
            <div className="kpi-value-row">
              <strong className="kpi-value">{report.avgCycle || '—'}</strong>
              <span className="kpi-unit">天</span>
            </div>
            <span className="kpi-sub">
              中位数 {report.medianCycle} 天 · 最长 {report.maxCycle} 天
            </span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-main">
            <span className="kpi-label">本周完成</span>
            <div className="kpi-value-row">
              <strong className="kpi-value">{report.lastWeekDone}</strong>
              <span className="kpi-unit">条</span>
            </div>
            <span className="kpi-sub">本周新增 {report.lastWeekAdded} 条</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-main">
            <span className="kpi-label">在制需求</span>
            <div className="kpi-value-row">
              <strong className="kpi-value">{report.wip}</strong>
              <span className="kpi-unit">条</span>
            </div>
          </div>
        </div>
        <div className={`kpi ${overdueRate > 20 ? 'danger' : ''}`}>
          <div className="kpi-main">
            <span className="kpi-label">逾期占比</span>
            <div className="kpi-value-row">
              <strong className="kpi-value">{overdueRate}</strong>
              <span className="kpi-unit">%</span>
            </div>
            <span className="kpi-sub">{overdue} 条已过结束日</span>
          </div>
        </div>
      </div>

      <section className="panel">
        <header className="panel-head">
          <h2>每周吞吐与新增</h2>
          <span className="panel-sub">深色完成 · 浅色新增</span>
        </header>
        <div className="flow-chart">
          {report.flow.map((f) => (
            <div className="flow-col" key={f.start}>
              <div className="flow-bars">
                <span className="flow-bar done" style={{ height: `${(f.done / flowMax) * 100}%` }} title={`完成 ${f.done}`} />
                <span className="flow-bar added" style={{ height: `${(f.added / flowMax) * 100}%` }} title={`新增 ${f.added}`} />
              </div>
              <span className="flow-num">{f.done}</span>
              <span className="flow-label">{f.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="dash-grid">
        <section className="panel">
          <header className="panel-head">
            <h2>各阶段平均停留</h2>
          </header>
          <div className="dwell-list">
            {STATUSES.map((s) => (
              <div className="dwell-row" key={s.id}>
                <span className="dwell-name">
                  <i style={{ background: s.color }} />
                  {s.name}
                </span>
                <Bar value={report.dwell[s.id] || 0} max={dwellMax} />
                <span className="dwell-num">{report.dwell[s.id] || 0} 天</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>里程碑进度</h2>
          </header>
          <div className="ms-list">
            {milestoneStats.length === 0 && <div className="risk-empty">还没有设置里程碑</div>}
            {milestoneStats.map((m) => (
              <div className="ms-row" key={m.id}>
                <span className="ms-date">{fmtShort(m.date)}</span>
                <span className="ms-name">{m.name}</span>
                <span className="ms-progress">
                  <Bar value={m.done} max={Math.max(1, m.total)} tone="accent" />
                </span>
                <span className="ms-num">
                  {m.done}/{m.total}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <header className="panel-head">
          <h2>已上线需求周期</h2>
        </header>
        <div className="cycle-list">
          {rows.filter((r) => r.status === 'done').length === 0 && (
            <div className="risk-empty">还没有已上线的需求</div>
          )}
          {rows
            .filter((r) => r.status === 'done')
            .map((r) => {
              const days = cycleDays(r) ?? 0
              return (
                <button type="button" className="cycle-row" key={r.id} onClick={() => onOpen(r.id)}>
                  <span className="cycle-title">{r.title}</span>
                  <span className="cycle-bar">
                    <Bar value={days} max={Math.max(1, report.maxCycle)} />
                  </span>
                  <span className="cycle-num">{days} 天</span>
                </button>
              )
            })}
        </div>
      </section>
    </div>
  )
}

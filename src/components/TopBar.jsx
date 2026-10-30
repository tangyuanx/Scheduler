import React from 'react'
import { PRIORITIES, STATUSES } from '../lib/constants'
import { useStore } from '../store'
import { Icon } from './Icons'
import { Avatar, Popover } from './ui'

function CheckRow({ checked, onClick, children, dot }) {
  return (
    <button type="button" className={`check-row ${checked ? 'on' : ''}`} onClick={onClick}>
      <span className="check-box">{checked && <Icon name="check" size={10} strokeWidth={2.6} />}</span>
      {dot && <span className="dot" style={{ background: dot }} />}
      <span className="check-label">{children}</span>
    </button>
  )
}

export default function TopBar({ title, count, filters, setFilters, onNew, onOpenPalette, showActions = true }) {
  const { members, allTags } = useStore()

  const toggle = (key, value) => {
    setFilters((prev) => {
      const list = prev[key]
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
      return { ...prev, [key]: next }
    })
  }

  const activeCount =
    filters.statuses.length + filters.priorities.length + filters.assignees.length + filters.tags.length + (filters.due ? 1 : 0)

  const clearAll = () => setFilters((prev) => ({ ...prev, statuses: [], priorities: [], assignees: [], tags: [], due: '' }))

  const DUE_OPTIONS = [
    { id: 'over', name: '排期赶不上截止' },
    { id: 'soon', name: '7 天内到期' },
    { id: 'none', name: '没设截止日' },
  ]

  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>{title}</h1>
        <span className="count-pill">{count}</span>
      </div>

      <div className="topbar-actions">
        {showActions && (
          <>
            <div className="search">
              <Icon name="search" size={14} />
              <input
                value={filters.q}
                onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value }))}
                placeholder="搜索需求、标签、提出人…"
                aria-label="搜索需求"
              />
              {filters.q && (
                <button type="button" className="search-clear" onClick={() => setFilters((p) => ({ ...p, q: '' }))}>
                  <Icon name="x" size={11} strokeWidth={2.4} />
                </button>
              )}
            </div>

            <Popover
              width={252}
              trigger={
                <button type="button" className={`btn ghost ${activeCount ? 'has-dot' : ''}`}>
                  <Icon name="filter" size={14} />
                  筛选
                  {activeCount > 0 && <span className="filter-badge">{activeCount}</span>}
                </button>
              }
            >
              {() => (
                <div className="filter-menu">
                  <div className="filter-head">
                    <strong>筛选</strong>
                    <button type="button" className="link-btn" onClick={clearAll}>
                      清除
                    </button>
                  </div>
                  <div className="filter-scroll">
                    <span className="filter-group">状态</span>
                    {STATUSES.map((s) => (
                      <CheckRow
                        key={s.id}
                        dot={s.color}
                        checked={filters.statuses.includes(s.id)}
                        onClick={() => toggle('statuses', s.id)}
                      >
                        {s.name}
                      </CheckRow>
                    ))}
                    <span className="filter-group">优先级</span>
                    {PRIORITIES.map((p) => (
                      <CheckRow
                        key={p.id}
                        dot={p.color}
                        checked={filters.priorities.includes(p.id)}
                        onClick={() => toggle('priorities', p.id)}
                      >
                        {p.name} · {p.label}
                      </CheckRow>
                    ))}
                    <span className="filter-group">截止情况</span>
                    {DUE_OPTIONS.map((d) => (
                      <CheckRow
                        key={d.id}
                        checked={filters.due === d.id}
                        onClick={() => setFilters((prev) => ({ ...prev, due: prev.due === d.id ? '' : d.id }))}
                      >
                        {d.name}
                      </CheckRow>
                    ))}
                    <span className="filter-group">负责人</span>
                    {members.map((m) => (
                      <CheckRow
                        key={m.id}
                        checked={filters.assignees.includes(m.id)}
                        onClick={() => toggle('assignees', m.id)}
                      >
                        <span className="row-inline">
                          <Avatar member={m} size={14} /> {m.name}
                        </span>
                      </CheckRow>
                    ))}
                    <CheckRow
                      checked={filters.assignees.includes('__none')}
                      onClick={() => toggle('assignees', '__none')}
                    >
                      未分配
                    </CheckRow>
                    {allTags.length > 0 && <span className="filter-group">标签</span>}
                    {allTags.map((t) => (
                      <CheckRow key={t} checked={filters.tags.includes(t)} onClick={() => toggle('tags', t)}>
                        {t}
                      </CheckRow>
                    ))}
                  </div>
                </div>
              )}
            </Popover>

            <button type="button" className="btn ghost icon-only" onClick={onOpenPalette} title="命令面板 ⌘K">
              <Icon name="search" size={14} />
            </button>

            <button type="button" className="btn primary" onClick={onNew}>
              <Icon name="plus" size={14} strokeWidth={2.2} />
              新建需求
            </button>
          </>
        )}
      </div>
    </header>
  )
}

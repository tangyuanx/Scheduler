import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icons'
import { PriorityBadge, StatusPill } from './ui'

export default function CommandPalette({ rows, onClose, onOpenReq, onRun }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const commands = useMemo(
    () => [
      { id: 'v-dashboard', label: '总览', hint: '视图', icon: 'dashboard', action: { type: 'view', id: 'dashboard' } },
      { id: 'v-gantt', label: '甘特排期', hint: '视图', icon: 'gantt', action: { type: 'view', id: 'gantt' } },
      { id: 'v-calendar', label: '日历', hint: '视图', icon: 'calendar', action: { type: 'view', id: 'calendar' } },
      { id: 'v-kanban', label: '看板', hint: '视图', icon: 'kanban', action: { type: 'view', id: 'kanban' } },
      { id: 'v-table', label: '需求列表', hint: '视图', icon: 'list', action: { type: 'view', id: 'table' } },
      { id: 'v-capacity', label: '容量负荷', hint: '视图', icon: 'gauge', action: { type: 'view', id: 'capacity' } },
      { id: 'v-report', label: '报表', hint: '视图', icon: 'chart', action: { type: 'view', id: 'report' } },
      { id: 'a-new', label: '新建需求', hint: 'n', icon: 'plus', action: { type: 'new' } },
      { id: 'a-auto', label: '自动排期（按优先级与依赖）', hint: '动作', icon: 'refresh', action: { type: 'auto' } },
      {
        id: 'f-over',
        label: '只看逾期需求',
        hint: '筛选',
        icon: 'alert',
        action: { type: 'filter', patch: () => ({ due: 'over' }) },
      },
      {
        id: 'f-soon',
        label: '只看 7 天内到期',
        hint: '筛选',
        icon: 'flag',
        action: { type: 'filter', patch: () => ({ due: 'soon' }) },
      },
      {
        id: 'f-none',
        label: '只看没设截止日的',
        hint: '筛选',
        icon: 'clock',
        action: { type: 'filter', patch: () => ({ due: 'none' }) },
      },
      { id: 'f-clear', label: '清除所有筛选', hint: '筛选', icon: 'x', action: { type: 'filter', patch: () => ({}) } },
    ],
    [],
  )

  const matchedCommands = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return commands.slice(0, 9)
    return commands.filter((c) => c.label.toLowerCase().includes(kw)).slice(0, 6)
  }, [q, commands])

  const matchedRows = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return rows.slice(0, 6)
    return rows
      .filter((r) => `${r.title} ${(r.tags || []).join(' ')} ${r.requester || ''}`.toLowerCase().includes(kw))
      .slice(0, 8)
  }, [q, rows])

  const items = useMemo(
    () => [
      ...matchedCommands.map((c) => ({ kind: 'cmd', key: c.id, cmd: c })),
      ...matchedRows.map((r) => ({ kind: 'req', key: r.id, row: r })),
    ],
    [matchedCommands, matchedRows],
  )

  useEffect(() => {
    setActive(0)
  }, [q])

  useEffect(() => {
    const el = listRef.current?.querySelector('.cmdk-item.active')
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (item) => {
    if (!item) return
    if (item.kind === 'cmd') onRun(item.cmd.action)
    else onOpenReq(item.row.id)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(items[active])
    }
  }

  let lastKind = ''

  return (
    <>
      <div className="cmdk-backdrop" onClick={onClose} />
      <div className="cmdk" role="dialog" aria-label="命令面板">
        <div className="cmdk-input">
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索需求，或输入命令…"
            aria-label="命令面板输入"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {items.length === 0 && <div className="cmdk-empty">没有匹配结果</div>}
          {items.map((item, i) => {
            const showHead = item.kind !== lastKind
            lastKind = item.kind
            return (
              <React.Fragment key={item.key}>
                {showHead && (
                  <span className="cmdk-group">{item.kind === 'cmd' ? '命令' : '需求'}</span>
                )}
                <button
                  type="button"
                  className={`cmdk-item ${i === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(item)}
                >
                  {item.kind === 'cmd' ? (
                    <>
                      <span className="cmdk-icon">
                        <Icon name={item.cmd.icon} size={14} />
                      </span>
                      <span className="cmdk-label">{item.cmd.label}</span>
                      <span className="cmdk-hint">{item.cmd.hint}</span>
                    </>
                  ) : (
                    <>
                      <span className="cmdk-icon">
                        <Icon name="inbox" size={14} />
                      </span>
                      <span className="cmdk-label">{item.row.title}</span>
                      <span className="cmdk-meta">
                        <StatusPill id={item.row.status} small />
                        <PriorityBadge id={item.row.priority} />
                      </span>
                    </>
                  )}
                </button>
              </React.Fragment>
            )
          })}
        </div>
        <div className="cmdk-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> 选择
          </span>
          <span>
            <kbd>↵</kbd> 打开
          </span>
          <span>
            <kbd>⌘K</kbd> 随时呼出
          </span>
        </div>
      </div>
    </>
  )
}

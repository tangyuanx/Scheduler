import React, { useMemo } from 'react'
import { useStore } from '../store'
import { Icon } from './Icons'
import { Avatar } from './ui'

const NAV = [
  { id: 'dashboard', name: '总览', icon: 'dashboard', key: '1' },
  { id: 'gantt', name: '甘特排期', icon: 'gantt', key: '2' },
  { id: 'calendar', name: '日历', icon: 'calendar', key: '3' },
  { id: 'kanban', name: '看板', icon: 'kanban', key: '4' },
  { id: 'table', name: '列表', icon: 'list', key: '5' },
  { id: 'capacity', name: '容量负荷', icon: 'gauge', key: '6' },
  { id: 'report', name: '报表', icon: 'chart', key: '7' },
]

export default function Sidebar({ view, setView, collapsed, onOpenPalette }) {
  const { state, members, requirements, settings, setSettings, trash } = useStore()

  const counts = useMemo(() => {
    const active = requirements.filter((r) => r.status !== 'done').length
    return { gantt: active, kanban: active, calendar: active, table: requirements.length, report: undefined }
  }, [requirements])

  const isDark = settings.theme === 'dark'

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand">
        <span className="brand-mark">
          <Icon name="gantt" size={15} strokeWidth={2} />
        </span>
        <span className="brand-text">
          <strong>{state.workspace || '需求排期台'}</strong>
          <em>需求推进与排期</em>
        </span>
      </div>

      <button type="button" className="side-search" onClick={onOpenPalette}>
        <Icon name="search" size={13} />
        <span>搜索或跳转</span>
        <kbd>⌘K</kbd>
      </button>

      <nav className="nav">
        <span className="nav-label">视图</span>
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${view === item.id ? 'active' : ''}`}
            onClick={() => setView(item.id)}
          >
            <Icon name={item.icon} size={15} />
            <span>{item.name}</span>
            {counts[item.id] != null && counts[item.id] > 0 && <em className="nav-count">{counts[item.id]}</em>}
          </button>
        ))}
      </nav>

      <div className="nav">
        <span className="nav-label">成员</span>
        {members.map((m) => {
          const load = requirements.filter((r) => r.assigneeId === m.id && r.status !== 'done').length
          return (
            <button
              key={m.id}
              type="button"
              className="nav-item member-item"
              onClick={() => setView('capacity')}
              title={`${m.name} · 每天 ${m.dailyHours || settings.dailyHours} 小时`}
            >
              <Avatar member={m} size={18} />
              <span>{m.name}</span>
              <em className="nav-count subtle">{load}</em>
            </button>
          )
        })}
        <button type="button" className="nav-item ghost" onClick={() => setView('settings')}>
          <Icon name="plus" size={15} />
          <span>管理成员</span>
        </button>
      </div>

      <div className="sidebar-foot">
        <button type="button" className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}>
          <Icon name="sliders" size={15} />
          <span>设置</span>
          {trash?.length > 0 && <em className="nav-count subtle">{trash.length}</em>}
        </button>
        <button
          type="button"
          className="nav-item"
          onClick={() => setSettings({ theme: isDark ? 'light' : 'dark' })}
        >
          <Icon name={isDark ? 'sun' : 'moon'} size={15} />
          <span>{isDark ? '浅色模式' : '深色模式'}</span>
        </button>
        <span className="storage-badge">
          <span className="dot" />
          数据存于本机
        </span>
      </div>
    </aside>
  )
}

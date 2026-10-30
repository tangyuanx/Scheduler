import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Calendar from './components/Calendar'
import Capacity from './components/Capacity'
import CommandPalette from './components/CommandPalette'
import Dashboard from './components/Dashboard'
import DetailDrawer from './components/DetailDrawer'
import Gantt from './components/Gantt'
import Kanban from './components/Kanban'
import Report from './components/Report'
import SettingsView from './components/SettingsView'
import Sidebar from './components/Sidebar'
import TableView from './components/TableView'
import TopBar from './components/TopBar'
import { Icon } from './components/Icons'
import { toISO, today } from './lib/date'
import { STATUS_MAP } from './lib/constants'
import { autoSchedule, dueRisk, isOverdue, progressOf, resolveSchedules, scheduleOf } from './lib/schedule'
import { StoreProvider, useStore } from './store'
import { storageAvailable } from './lib/storage'

const TITLES = {
  dashboard: '总览',
  gantt: '甘特排期',
  calendar: '日历',
  kanban: '看板',
  table: '需求列表',
  capacity: '容量负荷',
  report: '报表',
  settings: '设置',
}

const VIEW_KEYS = {
  '1': 'dashboard',
  '2': 'gantt',
  '3': 'calendar',
  '4': 'kanban',
  '5': 'table',
  '6': 'capacity',
  '7': 'report',
}

const EMPTY_FILTERS = {
  q: '',
  statuses: [],
  priorities: [],
  assignees: [],
  tags: [],
  due: '',
}

function Shell() {
  const {
    requirements,
    members,
    milestones,
    settings,
    addRequirement,
    updateRequirement,
    applySchedule,
    notify,
    toast,
  } = useStore()
  const [view, setView] = useState(settings.defaultView || 'gantt')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [selectedId, setSelectedId] = useState(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const schedules = useMemo(
    () => resolveSchedules(requirements, members, settings),
    [requirements, members, settings],
  )

  const rows = useMemo(
    () =>
      requirements.map((r) => {
        const sched = schedules.get(r.id) || scheduleOf(r, members, settings)
        const member = members.find((m) => m.id === r.assigneeId)
        const risk = dueRisk(r, sched.end)
        return {
          ...r,
          start: sched.start,
          end: sched.end,
          endDate: sched.end,
          cap: sched.cap,
          workdays: sched.workdays,
          progress: progressOf(r),
          overdue: isOverdue(r, sched.end),
          blocked: Boolean(sched.blocked),
          autoStart: Boolean(sched.autoStart),
          depStart: sched.depStart || '',
          cycle: Boolean(sched.cycle),
          dueRisk: risk,
          statusName: STATUS_MAP[r.status]?.name || r.status,
          statusColor: STATUS_MAP[r.status]?.color || '#8a8a95',
          assigneeName: member?.name || '未分配',
          milestoneName: milestones.find((m) => m.id === r.milestoneId)?.name || '',
        }
      }),
    [requirements, members, settings, schedules, milestones],
  )

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (filters.q) {
          const hay = `${r.title} ${r.description || ''} ${(r.tags || []).join(' ')} ${r.requester || ''}`.toLowerCase()
          if (!hay.includes(filters.q.toLowerCase())) return false
        }
        if (filters.statuses.length && !filters.statuses.includes(r.status)) return false
        if (filters.priorities.length && !filters.priorities.includes(r.priority)) return false
        if (filters.assignees.length) {
          const hit =
            (r.assigneeId && filters.assignees.includes(r.assigneeId)) ||
            (!r.assigneeId && filters.assignees.includes('__none'))
          if (!hit) return false
        }
        if (filters.tags.length && !(r.tags || []).some((t) => filters.tags.includes(t))) return false
        if (filters.due === 'over' && r.dueRisk.level !== 'over') return false
        if (filters.due === 'soon') {
          if (!r.dueDate || r.status === 'done') return false
          const left = (new Date(r.dueDate) - new Date(toISO(today()))) / 86400000
          if (!(left >= 0 && left <= 7)) return false
        }
        if (filters.due === 'none' && r.dueDate) return false
        return true
      }),
    [rows, filters],
  )

  const create = useCallback(
    (status = 'pool') => {
      const id = addRequirement({
        title: '未命名需求',
        status,
        startDate: status === 'pool' || status === 'review' ? '' : toISO(today()),
      })
      setSelectedId(id)
    },
    [addRequirement],
  )

  const runAutoSchedule = useCallback(
    (ids) => {
      const { patches } = autoSchedule(requirements, members, settings, { ids })
      const n = applySchedule(patches, '自动排期')
      notify(n ? `已重排 ${n} 条需求` : '当前排期已经是最优，无需调整')
    },
    [requirements, members, settings, applySchedule, notify],
  )

  // 快捷键：⌘K 命令面板、数字切视图、n 新建、/ 搜索
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (typing) return
      if (e.key === '/') {
        e.preventDefault()
        document.querySelector('.search input')?.focus()
        return
      }
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        create('pool')
        return
      }
      if (VIEW_KEYS[e.key] && !e.metaKey && !e.ctrlKey) {
        setView(VIEW_KEYS[e.key])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [create])

  const storageOk = useMemo(() => storageAvailable(), [])

  return (
    <div className="app">
      <Sidebar view={view} setView={setView} onOpenPalette={() => setPaletteOpen(true)} />

      <main className="main">
        {!storageOk && (
          <div className="storage-warn">
            <Icon name="alert" size={13} />
            当前环境不允许本地存储，改动不会被保存。请把链接复制到浏览器标签页中打开。
          </div>
        )}
        <TopBar
          title={TITLES[view]}
          count={view === 'settings' ? rows.length : filtered.length}
          filters={filters}
          setFilters={setFilters}
          onNew={() => create('pool')}
          onOpenPalette={() => setPaletteOpen(true)}
          showActions={view !== 'settings'}
        />

        <div className={`content view-${view}`}>
          {view === 'dashboard' && (
            <Dashboard
              rows={rows}
              members={members}
              settings={settings}
              milestones={milestones}
              onOpen={setSelectedId}
              onNew={() => create('pool')}
              setView={setView}
              setFilters={setFilters}
              onAutoSchedule={() => runAutoSchedule()}
            />
          )}

          {view === 'gantt' && (
            <Gantt
              rows={filtered}
              members={members}
              milestones={milestones}
              onOpen={setSelectedId}
              onUpdate={(id, patch) => {
                updateRequirement(id, patch)
                notify('排期已更新')
              }}
              onNew={() => create('pool')}
              onAutoSchedule={() => runAutoSchedule()}
            />
          )}

          {view === 'calendar' && (
            <Calendar rows={filtered} members={members} milestones={milestones} settings={settings} onOpen={setSelectedId} />
          )}

          {view === 'kanban' && (
            <Kanban
              rows={filtered}
              members={members}
              settings={settings}
              onOpen={setSelectedId}
              onUpdate={(id, patch) => updateRequirement(id, patch)}
              onNew={create}
            />
          )}

          {view === 'table' && (
            <TableView
              rows={filtered}
              members={members}
              milestones={milestones}
              onOpen={setSelectedId}
              onNew={() => create('pool')}
            />
          )}

          {view === 'capacity' && (
            <Capacity rows={filtered} members={members} settings={settings} onOpen={setSelectedId} />
          )}

          {view === 'report' && (
            <Report rows={rows} members={members} settings={settings} milestones={milestones} onOpen={setSelectedId} />
          )}

          {view === 'settings' && <SettingsView rows={rows} />}
        </div>
      </main>

      {selectedId && (
        <DetailDrawer reqId={selectedId} onClose={() => setSelectedId(null)} onSelect={setSelectedId} />
      )}

      {paletteOpen && (
        <CommandPalette
          rows={rows}
          onClose={() => setPaletteOpen(false)}
          onOpenReq={(id) => {
            setPaletteOpen(false)
            setSelectedId(id)
          }}
          onRun={(action) => {
            setPaletteOpen(false)
            if (action.type === 'view') setView(action.id)
            if (action.type === 'new') create('pool')
            if (action.type === 'auto') runAutoSchedule()
            if (action.type === 'filter') setFilters((prev) => ({ ...EMPTY_FILTERS, ...action.patch(prev) }))
          }}
        />
      )}

      {toast && (
        <div className={`toast ${toast.tone || ''}`} key={toast.id}>
          <Icon name={toast.tone === 'danger' ? 'alert' : 'check'} size={13} />
          {toast.message}
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

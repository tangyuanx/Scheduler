import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SETTINGS, FIELD_LABELS, PRIORITY_MAP, STATUS_MAP } from './lib/constants'
import { loadRemote, pushRemote, readStateSync, saveState } from './lib/storage'
import { seedState } from './lib/seed'
import { fmtShort } from './lib/date'

const StoreCtx = createContext(null)

export const uid = (p = 'x') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** 老数据补齐新增字段，保证升级后不会因为缺字段崩掉 */
export function migrate(raw) {
  if (!raw || !Array.isArray(raw.requirements)) return null
  const milestones = Array.isArray(raw.milestones) ? raw.milestones : []
  const requirements = raw.requirements.map((r) => ({
    dueDate: '',
    source: '',
    requester: '',
    links: [],
    deps: [],
    comments: [],
    subtasks: [],
    history: [],
    milestoneId: '',
    ...r,
    estimateHours: Number(r.estimateHours) || 0,
    progress: Number(r.progress) || 0,
  }))
  return {
    ...raw,
    version: 2,
    members: Array.isArray(raw.members) ? raw.members : [],
    milestones,
    requirements,
    trash: Array.isArray(raw.trash) ? raw.trash : [],
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings || {}) },
  }
}

function describeValue(field, value, state) {
  if (field === 'tags' || field === 'deps') {
    if (!Array.isArray(value) || !value.length) return '空'
    if (field === 'tags') return value.join('、')
    return value
      .map((id) => state.requirements.find((r) => r.id === id)?.title || '已删除需求')
      .join('、')
  }
  if (field === 'links') return Array.isArray(value) && value.length ? `${value.length} 个链接` : '空'
  if (value === '' || value == null) return '空'
  if (field === 'status') return STATUS_MAP[value]?.name || value
  if (field === 'priority') return PRIORITY_MAP[value]?.name || value
  if (field === 'assigneeId') {
    if (!value) return '未分配'
    return state.members.find((m) => m.id === value)?.name || '未知成员'
  }
  if (field === 'milestoneId') {
    if (!value) return '未关联'
    return state.milestones?.find((m) => m.id === value)?.name || '已删除里程碑'
  }
  if (field === 'startDate' || field === 'dueDate') return fmtShort(value) || '空'
  if (field === 'estimateHours') return `${value}h`
  if (field === 'description' || field === 'acceptance') return '已修改'
  if (field === 'progress') return `${value}%`
  return String(value)
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(() => {
    const persisted = readStateSync()
    const migrated = persisted ? migrate(persisted) : null
    return migrated || seedState()
  })
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const lastSynced = useRef(null)
  const warnedOffline = useRef(false)
  const [remoteReady, setRemoteReady] = useState(false)

  const notify = useCallback((message, tone = 'default') => {
    setToast({ message, tone, id: Date.now() })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  /** 首屏先渲染本地缓存（快），随后与服务端对齐 */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const remote = await loadRemote()
      if (cancelled) return
      if (!remote) {
        // 没有本地服务：纯浏览器存储模式，行为与以前一致
        setRemoteReady(false)
        return
      }
      if (remote.state) {
        const migrated = migrate(remote.state)
        if (migrated) {
          lastSynced.current = JSON.stringify(migrated)
          setState(migrated)
        }
      } else {
        // 服务端还是空的：把浏览器里已有的数据作为初始值推上去
        setRemoteReady(true)
      }
      setRemoteReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => saveState(state), 220)
    return () => clearTimeout(t)
  }, [state])

  /** 改动同步到本地服务；失败只提示一次，避免每次编辑都弹 */
  useEffect(() => {
    if (!remoteReady) return
    const snapshot = JSON.stringify(state)
    if (snapshot === lastSynced.current) return
    const t = setTimeout(async () => {
      const res = await pushRemote(state)
      if (res.ok) {
        lastSynced.current = snapshot
        warnedOffline.current = false
        return
      }
      if (res.conflict) {
        const retry = await pushRemote(state)
        if (retry.ok) {
          lastSynced.current = snapshot
          notify('另一台设备改过这份数据，已用本机版本覆盖')
        } else {
          notify('同步失败，改动已保存在本机', 'danger')
        }
        return
      }
      if (!warnedOffline.current) {
        warnedOffline.current = true
        notify('连不上本地服务，改动暂存在浏览器里', 'danger')
      }
    }, 400)
    return () => clearTimeout(t)
  }, [state, remoteReady, notify])

  useEffect(() => {
    const theme = state.settings.theme || 'light'
    document.documentElement.setAttribute('data-theme', theme)
  }, [state.settings.theme])

  const logChanges = useCallback((prevReq, patch, nextState, note) => {
    const changes = []
    Object.keys(patch).forEach((field) => {
      if (!FIELD_LABELS[field]) return
      const before = prevReq[field]
      const after = patch[field]
      if (JSON.stringify(before) === JSON.stringify(after)) return
      changes.push({
        field,
        label: FIELD_LABELS[field],
        from: describeValue(field, before, nextState),
        to: describeValue(field, after, nextState),
      })
    })
    if (!changes.length) return prevReq
    const prevHistory = prevReq.history || []
    const last = prevHistory[0]
    // 连续输入同一个字段（例如工时）时合并成一条，避免历史被逐字刷屏
    const canMerge =
      !note &&
      last &&
      Date.now() - last.at < 8000 &&
      last.changes.length === 1 &&
      changes.length === 1 &&
      last.changes[0].field === changes[0].field
    if (canMerge) {
      const merged = {
        ...last,
        at: Date.now(),
        changes: [{ ...changes[0], from: last.changes[0].from }],
      }
      return {
        ...prevReq,
        ...patch,
        updatedAt: Date.now(),
        history: [merged, ...prevHistory.slice(1)],
      }
    }
    const entry = { id: uid('h'), at: Date.now(), changes, note: note || '' }
    return {
      ...prevReq,
      ...patch,
      updatedAt: Date.now(),
      history: [entry, ...prevHistory].slice(0, 120),
    }
  }, [])

  const updateRequirement = useCallback(
    (id, patch, note) => {
      setState((prev) => ({
        ...prev,
        requirements: prev.requirements.map((r) => (r.id === id ? logChanges(r, patch, prev, note) : r)),
      }))
    },
    [logChanges],
  )

  /** 批量改：一次写入，历史里合成一条「批量更新」记录 */
  const updateMany = useCallback(
    (ids, patch, note) => {
      if (!ids?.length) return
      setState((prev) => {
        const idSet = new Set(ids)
        return {
          ...prev,
          requirements: prev.requirements.map((r) =>
            idSet.has(r.id) ? logChanges(r, patch, prev, note || `批量更新 ${ids.length} 条需求`) : r,
          ),
        }
      })
    },
    [logChanges],
  )

  const addRequirement = useCallback((partial = {}) => {
    const id = uid('r')
    setState((prev) => {
      const req = {
        id,
        title: partial.title || '未命名需求',
        status: partial.status || 'pool',
        priority: partial.priority || 'P2',
        assigneeId: partial.assigneeId || '',
        startDate: partial.startDate || '',
        dueDate: partial.dueDate || '',
        estimateHours: Number(partial.estimateHours) || 0,
        tags: partial.tags || [],
        description: partial.description || '',
        acceptance: partial.acceptance || '',
        source: partial.source || '',
        requester: partial.requester || '',
        links: partial.links || [],
        deps: partial.deps || [],
        milestoneId: partial.milestoneId || '',
        subtasks: [],
        comments: [],
        progress: 0,
        history: [{ id: uid('h'), at: Date.now(), changes: [], note: '创建需求' }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      return { ...prev, requirements: [req, ...prev.requirements] }
    })
    return id
  }, [])

  /** 批量导入（CSV / 手工），返回实际写入条数 */
  const importRequirements = useCallback((list) => {
    const now = Date.now()
    const rows = (list || []).map((r, i) => ({
      id: uid('r'),
      title: r.title || '未命名需求',
      status: STATUS_MAP[r.status] ? r.status : 'pool',
      priority: PRIORITY_MAP[r.priority] ? r.priority : 'P2',
      assigneeId: r.assigneeId || '',
      startDate: r.startDate || '',
      dueDate: r.dueDate || '',
      estimateHours: Number(r.estimateHours) || 0,
      tags: r.tags || [],
      description: r.description || '',
      acceptance: r.acceptance || '',
      source: r.source || '',
      requester: r.requester || '',
      links: [],
      deps: [],
      milestoneId: '',
      subtasks: [],
      comments: [],
      progress: 0,
      history: [{ id: uid('h'), at: now, changes: [], note: '通过导入创建' }],
      createdAt: now - i,
      updatedAt: now - i,
    }))
    if (!rows.length) return 0
    setState((prev) => ({ ...prev, requirements: [...rows, ...prev.requirements] }))
    return rows.length
  }, [])

  const duplicateRequirement = useCallback((id) => {
    const newId = uid('r')
    setState((prev) => {
      const src = prev.requirements.find((r) => r.id === id)
      if (!src) return prev
      const copy = {
        ...src,
        id: newId,
        title: `${src.title}（副本）`,
        status: 'pool',
        progress: 0,
        deps: [],
        comments: [],
        subtasks: (src.subtasks || []).map((s) => ({ ...s, id: uid('s'), done: false })),
        history: [{ id: uid('h'), at: Date.now(), changes: [], note: '从副本创建' }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      return { ...prev, requirements: [copy, ...prev.requirements] }
    })
    return newId
  }, [])

  /** 软删除：进回收站，可以反悔 */
  const deleteRequirement = useCallback((id) => {
    setState((prev) => {
      const req = prev.requirements.find((r) => r.id === id)
      if (!req) return prev
      return {
        ...prev,
        requirements: prev.requirements
          .filter((r) => r.id !== id)
          // 顺手摘掉别人对它的依赖，避免留下悬空 id
          .map((r) => ((r.deps || []).includes(id) ? { ...r, deps: r.deps.filter((d) => d !== id) } : r)),
        trash: [{ req, deletedAt: Date.now() }, ...(prev.trash || [])].slice(0, 100),
      }
    })
  }, [])

  const deleteMany = useCallback((ids) => {
    if (!ids?.length) return
    setState((prev) => {
      const idSet = new Set(ids)
      const removed = prev.requirements.filter((r) => idSet.has(r.id))
      return {
        ...prev,
        requirements: prev.requirements
          .filter((r) => !idSet.has(r.id))
          .map((r) => {
            const left = (r.deps || []).filter((d) => !idSet.has(d))
            return left.length === (r.deps || []).length ? r : { ...r, deps: left }
          }),
        trash: [
          ...removed.map((req) => ({ req, deletedAt: Date.now() })),
          ...(prev.trash || []),
        ].slice(0, 100),
      }
    })
  }, [])

  const restoreRequirement = useCallback((id) => {
    setState((prev) => {
      const item = (prev.trash || []).find((t) => t.req.id === id)
      if (!item) return prev
      return {
        ...prev,
        requirements: [item.req, ...prev.requirements],
        trash: prev.trash.filter((t) => t.req.id !== id),
      }
    })
  }, [])

  const purgeTrash = useCallback((id) => {
    setState((prev) => ({
      ...prev,
      trash: id ? (prev.trash || []).filter((t) => t.req.id !== id) : [],
    }))
  }, [])

  const setStatus = useCallback(
    (id, status) => {
      updateRequirement(id, { status })
    },
    [updateRequirement],
  )

  const addSubtask = useCallback((id, title) => {
    setState((prev) => ({
      ...prev,
      requirements: prev.requirements.map((r) =>
        r.id === id
          ? { ...r, subtasks: [...(r.subtasks || []), { id: uid('s'), title, done: false }], updatedAt: Date.now() }
          : r,
      ),
    }))
  }, [])

  const toggleSubtask = useCallback((id, subId) => {
    setState((prev) => ({
      ...prev,
      requirements: prev.requirements.map((r) =>
        r.id === id
          ? {
              ...r,
              subtasks: (r.subtasks || []).map((s) => (s.id === subId ? { ...s, done: !s.done } : s)),
              updatedAt: Date.now(),
            }
          : r,
      ),
    }))
  }, [])

  const renameSubtask = useCallback((id, subId, title) => {
    setState((prev) => ({
      ...prev,
      requirements: prev.requirements.map((r) =>
        r.id === id
          ? { ...r, subtasks: (r.subtasks || []).map((s) => (s.id === subId ? { ...s, title } : s)) }
          : r,
      ),
    }))
  }, [])

  const removeSubtask = useCallback((id, subId) => {
    setState((prev) => ({
      ...prev,
      requirements: prev.requirements.map((r) =>
        r.id === id ? { ...r, subtasks: (r.subtasks || []).filter((s) => s.id !== subId) } : r,
      ),
    }))
  }, [])

  const addComment = useCallback((id, text, author) => {
    const body = String(text || '').trim()
    if (!body) return
    setState((prev) => ({
      ...prev,
      requirements: prev.requirements.map((r) =>
        r.id === id
          ? {
              ...r,
              comments: [...(r.comments || []), { id: uid('c'), at: Date.now(), author: author || '我', text: body }],
              updatedAt: Date.now(),
            }
          : r,
      ),
    }))
  }, [])

  const removeComment = useCallback((id, commentId) => {
    setState((prev) => ({
      ...prev,
      requirements: prev.requirements.map((r) =>
        r.id === id ? { ...r, comments: (r.comments || []).filter((c) => c.id !== commentId) } : r,
      ),
    }))
  }, [])

  const addMilestone = useCallback((name, date) => {
    const id = uid('ms')
    setState((prev) => ({
      ...prev,
      milestones: [...(prev.milestones || []), { id, name: name || '新里程碑', date: date || '' }],
    }))
    return id
  }, [])

  const updateMilestone = useCallback((id, patch) => {
    setState((prev) => ({
      ...prev,
      milestones: (prev.milestones || []).map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }))
  }, [])

  const removeMilestone = useCallback((id) => {
    setState((prev) => ({
      ...prev,
      milestones: (prev.milestones || []).filter((m) => m.id !== id),
      requirements: prev.requirements.map((r) => (r.milestoneId === id ? { ...r, milestoneId: '' } : r)),
    }))
  }, [])

  /** 节假日 / 调休：同一天重复设置则覆盖 */
  const setHoliday = useCallback((date, work, name) => {
    if (!date) return
    setState((prev) => {
      const rest = (prev.settings.holidays || []).filter((h) => h.date !== date)
      return {
        ...prev,
        settings: {
          ...prev.settings,
          holidays: [...rest, { date, work: Boolean(work), name: name || '' }].sort((a, b) =>
            a.date < b.date ? -1 : 1,
          ),
        },
      }
    })
  }, [])

  const removeHoliday = useCallback((date) => {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, holidays: (prev.settings.holidays || []).filter((h) => h.date !== date) },
    }))
  }, [])

  /** 自动排期结果落库：只改开始日，历史里记一条说明 */
  const applySchedule = useCallback((patches, note) => {
    const ids = Object.keys(patches || {})
    if (!ids.length) return 0
    setState((prev) => ({
      ...prev,
      requirements: prev.requirements.map((r) =>
        patches[r.id] ? logChanges(r, patches[r.id], prev, note || '自动排期') : r,
      ),
    }))
    return ids.length
  }, [logChanges])

  const addMember = useCallback((member) => {
    const id = uid('m')
    setState((prev) => ({ ...prev, members: [...prev.members, { id, dailyHours: 8, ...member }] }))
    return id
  }, [])

  const updateMember = useCallback((id, patch) => {
    setState((prev) => ({ ...prev, members: prev.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) }))
  }, [])

  const removeMember = useCallback((id) => {
    setState((prev) => ({
      ...prev,
      members: prev.members.filter((m) => m.id !== id),
      requirements: prev.requirements.map((r) => (r.assigneeId === id ? { ...r, assigneeId: '' } : r)),
    }))
  }, [])

  const setSettings = useCallback((patch) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
  }, [])

  const setWorkspace = useCallback((name) => {
    setState((prev) => ({ ...prev, workspace: name }))
  }, [])

  const importState = useCallback((obj) => {
    setState((prev) => ({
      ...prev,
      workspace: obj.workspace || prev.workspace,
      members: Array.isArray(obj.members) && obj.members.length ? obj.members : prev.members,
      milestones: Array.isArray(obj.milestones) ? obj.milestones : prev.milestones,
      requirements: migrate({ requirements: obj.requirements }).requirements,
      settings: { ...prev.settings, ...(obj.settings || {}) },
    }))
  }, [])

  const resetToSeed = useCallback(() => {
    setState(seedState())
  }, [])

  const clearRequirements = useCallback(() => {
    setState((prev) => ({ ...prev, requirements: [] }))
  }, [])

  const allTags = useMemo(() => {
    const set = new Set()
    state.requirements.forEach((r) => (r.tags || []).forEach((t) => set.add(t)))
    return Array.from(set).sort()
  }, [state.requirements])

  const value = useMemo(
    () => ({
      state,
      members: state.members,
      milestones: state.milestones || [],
      requirements: state.requirements,
      trash: state.trash || [],
      settings: state.settings,
      allTags,
      toast,
      notify,
      updateRequirement,
      updateMany,
      addRequirement,
      importRequirements,
      duplicateRequirement,
      deleteRequirement,
      deleteMany,
      restoreRequirement,
      purgeTrash,
      setStatus,
      addSubtask,
      toggleSubtask,
      renameSubtask,
      removeSubtask,
      addComment,
      removeComment,
      addMilestone,
      updateMilestone,
      removeMilestone,
      setHoliday,
      removeHoliday,
      applySchedule,
      addMember,
      updateMember,
      removeMember,
      setSettings,
      setWorkspace,
      importState,
      resetToSeed,
      clearRequirements,
    }),
    [
      state,
      allTags,
      toast,
      notify,
      updateRequirement,
      updateMany,
      addRequirement,
      importRequirements,
      duplicateRequirement,
      deleteRequirement,
      deleteMany,
      restoreRequirement,
      purgeTrash,
      setStatus,
      addSubtask,
      toggleSubtask,
      renameSubtask,
      removeSubtask,
      addComment,
      removeComment,
      addMilestone,
      updateMilestone,
      removeMilestone,
      setHoliday,
      removeHoliday,
      applySchedule,
      addMember,
      updateMember,
      removeMember,
      setSettings,
      setWorkspace,
      importState,
      resetToSeed,
      clearRequirements,
    ],
  )

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore() {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

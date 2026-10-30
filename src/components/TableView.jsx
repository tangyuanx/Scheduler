import React, { useEffect, useMemo, useRef, useState } from 'react'
import { PRIORITIES, STATUSES } from '../lib/constants'
import { fmtShort } from '../lib/date'
import { useStore } from '../store'
import { Icon } from './Icons'
import { Avatar, EmptyState, PriorityBadge, Progress, StatusPill, TagChip } from './ui'

const PRIO_ORDER = Object.fromEntries(PRIORITIES.map((p, i) => [p.id, i]))
const STATUS_ORDER = Object.fromEntries(STATUSES.map((s, i) => [s.id, i]))

const COLUMNS = [
  { key: 'priority', name: '优先级', width: 86 },
  { key: 'title', name: '需求', width: 0, flex: true },
  { key: 'status', name: '状态', width: 96 },
  { key: 'assignee', name: '负责人', width: 100 },
  { key: 'start', name: '开始', width: 78 },
  { key: 'end', name: '结束', width: 78 },
  { key: 'due', name: '截止', width: 82 },
  { key: 'hours', name: '工时', width: 66, align: 'right' },
  { key: 'progress', name: '进度', width: 96 },
  { key: 'tags', name: '标签', width: 140 },
]

export default function TableView({ rows, members, milestones, onOpen, onNew }) {
  const { updateRequirement, updateMany, deleteMany, notify } = useStore()
  const [sort, setSort] = useState({ key: 'status', dir: 'asc' })
  const [selected, setSelected] = useState([])
  const [editing, setEditing] = useState(null)
  const [editValue, setEditValue] = useState('')
  const lastIndex = useRef(null)
  const selectAllRef = useRef(null)

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const value = (r) => {
      switch (sort.key) {
        case 'priority':
          return PRIO_ORDER[r.priority] ?? 9
        case 'status':
          return STATUS_ORDER[r.status] ?? 9
        case 'assignee':
          return members.find((m) => m.id === r.assigneeId)?.name || 'zzz'
        case 'start':
          return r.start || '9999'
        case 'end':
          return r.end || '9999'
        case 'due':
          return r.dueDate || '9999'
        case 'hours':
          return Number(r.estimateHours) || 0
        case 'progress':
          return r.progress
        case 'title':
          return r.title
        default:
          return ''
      }
    }
    return [...rows].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      if (va === vb) return 0
      return va > vb ? dir : -dir
    })
  }, [rows, sort, members])

  // 行集合变化时清掉失效的选中项
  useEffect(() => {
    setSelected((prev) => prev.filter((id) => rows.some((r) => r.id === id)))
  }, [rows])

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = selected.length > 0 && selected.length < rows.length
    }
  }, [selected, rows.length])

  const totalHours = rows.reduce((s, r) => s + (Number(r.estimateHours) || 0), 0)
  const doneCount = rows.filter((r) => r.status === 'done').length
  const allChecked = rows.length > 0 && selected.length === rows.length

  const toggleOne = (id, index, shiftKey) => {
    if (shiftKey && lastIndex.current != null) {
      const [a, b] = [Math.min(lastIndex.current, index), Math.max(lastIndex.current, index)]
      const range = sorted.slice(a, b + 1).map((r) => r.id)
      setSelected((prev) => Array.from(new Set([...prev, ...range])))
      return
    }
    lastIndex.current = index
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const onSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  const batch = (patch) => {
    updateMany(selected, patch)
    notify(`已更新 ${selected.length} 条需求`)
  }

  const beginEdit = (row) => {
    setEditing(row.id)
    setEditValue(row.title)
  }

  const commitEdit = () => {
    if (!editing) return
    const row = rows.find((r) => r.id === editing)
    const next = editValue.trim()
    if (row && next && next !== row.title) updateRequirement(editing, { title: next })
    setEditing(null)
  }

  if (!rows.length) {
    return (
      <EmptyState
        icon="list"
        title="没有匹配的需求"
        action={
          <button type="button" className="btn primary" onClick={onNew}>
            <Icon name="plus" size={14} /> 新建需求
          </button>
        }
      />
    )
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th className="th-check">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allChecked}
                onChange={(e) => setSelected(e.target.checked ? rows.map((r) => r.id) : [])}
                aria-label="全选"
              />
            </th>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width || undefined, textAlign: c.align || 'left' }}
                onClick={() => onSort(c.key)}
                className={sort.key === c.key ? 'sorted' : ''}
              >
                <span className="th-inner">
                  {c.name}
                  {sort.key === c.key && <Icon name={sort.dir === 'asc' ? 'arrowUp' : 'arrowDown'} size={10} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, index) => {
            const member = members.find((m) => m.id === r.assigneeId)
            const checked = selected.includes(r.id)
            const risk = r.dueRisk || { level: 'none' }
            return (
              <tr
                key={r.id}
                onClick={() => onOpen(r.id)}
                className={`${r.overdue ? 'row-overdue' : ''} ${checked ? 'row-checked' : ''}`}
              >
                <td className="td-check" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {}}
                    onClick={(e) => toggleOne(r.id, index, e.shiftKey)}
                    aria-label={`选择 ${r.title}`}
                  />
                </td>
                <td>
                  <PriorityBadge id={r.priority} />
                </td>
                <td className="cell-title">
                  {editing === r.id ? (
                    <input
                      className="inline-input"
                      value={editValue}
                      autoFocus
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitEdit}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit()
                        if (e.key === 'Escape') setEditing(null)
                      }}
                    />
                  ) : (
                    <span
                      className="title-text"
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        beginEdit(r)
                      }}
                      title="双击改标题"
                    >
                      {r.title}
                    </span>
                  )}
                  {r.subtasks?.length > 0 && (
                    <span className="sub-count">
                      {r.subtasks.filter((s) => s.done).length}/{r.subtasks.length}
                    </span>
                  )}
                  {r.deps?.length > 0 && (
                    <span className="dep-count" title="有前置需求">
                      <Icon name="link" size={9} />
                      {r.deps.length}
                    </span>
                  )}
                  {r.milestoneName && <span className="ms-tag">{r.milestoneName}</span>}
                </td>
                <td>
                  <StatusPill id={r.status} small />
                </td>
                <td>
                  <span className="cell-assignee">
                    <Avatar member={member} size={18} />
                    {member ? member.name : <em className="muted">未分配</em>}
                  </span>
                </td>
                <td className="mono">{r.start ? fmtShort(r.start) : <em className="muted">—</em>}</td>
                <td className="mono">
                  {r.end ? (
                    <span className={r.overdue ? 'text-danger' : ''}>{fmtShort(r.end)}</span>
                  ) : (
                    <em className="muted">—</em>
                  )}
                </td>
                <td className="mono">
                  {r.dueDate ? (
                    <span className={`due-cell ${risk.level}`}>
                      {fmtShort(r.dueDate)}
                      {risk.level === 'over' && <Icon name="alert" size={9} />}
                    </span>
                  ) : (
                    <em className="muted">—</em>
                  )}
                </td>
                <td className="mono right">{r.estimateHours ? `${r.estimateHours}h` : '—'}</td>
                <td>
                  <span className="cell-progress">
                    <Progress value={r.progress} />
                    <em>{r.progress}%</em>
                  </span>
                </td>
                <td>
                  <span className="cell-tags">
                    {(r.tags || []).slice(0, 2).map((t) => (
                      <TagChip key={t} tag={t} small />
                    ))}
                    {(r.tags || []).length > 2 && <span className="tag-more">+{r.tags.length - 2}</span>}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="table-foot">
        <span>共 {rows.length} 条需求</span>
        <span>已完成 {doneCount} 条</span>
        <span>预估合计 {totalHours}h</span>
      </div>

      {selected.length > 0 && (
        <div className="batch-bar">
          <span className="batch-count">已选 {selected.length} 条</span>
          <span className="batch-sep" />
          <label className="batch-field">
            <span>状态</span>
            <select
              className="select sm"
              value=""
              onChange={(e) => e.target.value && batch({ status: e.target.value })}
            >
              <option value="">改为…</option>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="batch-field">
            <span>负责人</span>
            <select
              className="select sm"
              value=""
              onChange={(e) => {
                const v = e.target.value
                if (!v) return
                batch({ assigneeId: v === '__none' ? '' : v })
              }}
            >
              <option value="">指派给…</option>
              <option value="__none">清空负责人</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="batch-field">
            <span>优先级</span>
            <select
              className="select sm"
              value=""
              onChange={(e) => e.target.value && batch({ priority: e.target.value })}
            >
              <option value="">设为…</option>
              {PRIORITIES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="batch-field">
            <span>开始日</span>
            <input
              type="date"
              className="input sm"
              value=""
              onChange={(e) => e.target.value && batch({ startDate: e.target.value })}
            />
          </label>
          {milestones?.length > 0 && (
            <label className="batch-field">
              <span>里程碑</span>
              <select
                className="select sm"
                value=""
                onChange={(e) => e.target.value && batch({ milestoneId: e.target.value === '__none' ? '' : e.target.value })}
              >
                <option value="">归入…</option>
                <option value="__none">取消关联</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="batch-spacer" />
          <button type="button" className="btn ghost sm" onClick={() => setSelected([])}>
            取消选择
          </button>
          <button
            type="button"
            className="btn danger sm"
            onClick={() => {
              deleteMany(selected)
              notify(`已删除 ${selected.length} 条，可在设置里恢复`)
              setSelected([])
            }}
          >
            <Icon name="trash" size={12} /> 删除
          </button>
        </div>
      )}
    </div>
  )
}

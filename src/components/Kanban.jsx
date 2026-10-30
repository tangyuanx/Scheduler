import React, { useState } from 'react'
import { STATUSES } from '../lib/constants'
import { fmtRange, fmtShort } from '../lib/date'
import { Icon } from './Icons'
import { Avatar, EmptyState, PriorityBadge, Progress, TagChip } from './ui'

function Card({ row, members, onOpen, onDragStart, dragging }) {
  const member = members.find((m) => m.id === row.assigneeId)
  const risk = row.dueRisk || { level: 'none' }
  return (
    <article
      className={`kcard ${dragging ? 'dragging' : ''} ${row.overdue ? 'is-overdue' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', row.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(row.id)
      }}
      onDragEnd={() => onDragStart(null)}
      onClick={() => onOpen(row.id)}
    >
      <div className="kcard-top">
        <PriorityBadge id={row.priority} />
        {row.overdue && (
          <span className="overdue-flag" title="已过结束日">
            <Icon name="alert" size={11} /> 逾期
          </span>
        )}
        {!row.overdue && risk.level === 'over' && (
          <span className="due-flag" title={`算出来的结束日晚于截止日 ${row.dueDate}`}>
            赶不上截止
          </span>
        )}
        {row.blocked && (
          <span className="blocked-flag" title="有前置需求还没结束">
            <Icon name="link" size={10} /> 等前置
          </span>
        )}
      </div>
      <h3 className="kcard-title">{row.title}</h3>
      {(row.tags || []).length > 0 && (
        <div className="kcard-tags">
          {row.tags.slice(0, 3).map((t) => (
            <TagChip key={t} tag={t} small />
          ))}
          {row.tags.length > 3 && <span className="tag-more">+{row.tags.length - 3}</span>}
        </div>
      )}
      <div className="kcard-meta">
        <span className="meta-item">
          <Icon name="calendar" size={12} />
          {row.start ? fmtRange(row.start, row.end) : '未排期'}
        </span>
        <span className="meta-item">
          <Icon name="clock" size={12} />
          {row.estimateHours ? `${row.estimateHours}h` : '—'}
        </span>
        {row.dueDate && (
          <span className={`meta-item ${risk.level === 'over' ? 'text-danger' : ''}`}>
            <Icon name="flag" size={12} />
            {fmtShort(row.dueDate)}
          </span>
        )}
      </div>
      <div className="kcard-foot">
        <Avatar member={member} size={20} />
        <span className="kcard-assignee">{member ? member.name : '未分配'}</span>
        <span className="kcard-progress">
          <Progress value={row.progress} />
          <em>{row.progress}%</em>
        </span>
      </div>
    </article>
  )
}

export default function Kanban({ rows, members, settings, onOpen, onUpdate, onNew }) {
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const wipLimit = Number(settings?.wipLimit) || 0

  const drop = (status) => {
    if (dragId) onUpdate(dragId, { status })
    setDragId(null)
    setOverCol(null)
  }

  if (!rows.length) {
    return (
      <EmptyState
        icon="kanban"
        title="看板是空的"
        action={
          <button type="button" className="btn primary" onClick={onNew}>
            <Icon name="plus" size={14} /> 新建需求
          </button>
        }
      />
    )
  }

  return (
    <div className="kanban">
      {STATUSES.map((s) => {
        const list = rows.filter((r) => r.status === s.id)
        const hours = list.reduce((sum, r) => sum + (Number(r.estimateHours) || 0), 0)
        const overWip = wipLimit > 0 && s.id === 'dev' && list.length > wipLimit
        return (
          <section
            key={s.id}
            className={`kcol ${overCol === s.id ? 'over' : ''} ${overWip ? 'wip-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setOverCol(s.id)
            }}
            onDragLeave={() => setOverCol((c) => (c === s.id ? null : c))}
            onDrop={(e) => {
              e.preventDefault()
              drop(s.id)
            }}
          >
            <header className="kcol-head">
              <span className="dot" style={{ background: s.color }} />
              <strong>{s.name}</strong>
              <em>{list.length}</em>
              {hours > 0 && <span className="kcol-hours">{hours}h</span>}
              {s.id === 'dev' && wipLimit > 0 && (
                <span className={`kcol-wip ${overWip ? 'over' : ''}`} title="在制数量上限">
                  WIP {list.length}/{wipLimit}
                </span>
              )}
              <button
                type="button"
                className="icon-btn"
                title={`在「${s.name}」新建`}
                onClick={() => onNew(s.id)}
              >
                <Icon name="plus" size={13} />
              </button>
            </header>
            <div className="kcol-body">
              {list.map((row) => (
                <Card
                  key={row.id}
                  row={row}
                  members={members}
                  onOpen={onOpen}
                  onDragStart={setDragId}
                  dragging={dragId === row.id}
                />
              ))}
              {list.length === 0 && <div className="kcol-empty">拖到这里</div>}
            </div>
          </section>
        )
      })}
    </div>
  )
}

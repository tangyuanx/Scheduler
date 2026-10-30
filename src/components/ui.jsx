import React, { useEffect, useRef, useState } from 'react'
import { PRIORITY_MAP, STATUS_MAP } from '../lib/constants'
import { Icon } from './Icons'

export function Avatar({ member, size = 22, showName = false }) {
  if (!member) {
    return (
      <span className="avatar avatar-empty" style={{ width: size, height: size, fontSize: size * 0.5 }}>
        ?
      </span>
    )
  }
  const initial = (member.name || '?').slice(0, 1)
  return (
    <span className="avatar-wrap">
      <span
        className="avatar"
        style={{
          width: size,
          height: size,
          fontSize: Math.max(9, size * 0.44),
          background: `${member.color}1f`,
          color: member.color,
          borderColor: `${member.color}33`,
        }}
        title={member.name}
      >
        {initial}
      </span>
      {showName && <span className="avatar-name">{member.name}</span>}
    </span>
  )
}

export function PriorityBadge({ id, withLabel = false }) {
  const p = PRIORITY_MAP[id] || PRIORITY_MAP.P2
  return (
    <span className="priority-badge" style={{ color: p.color, borderColor: `${p.color}44`, background: `${p.color}12` }}>
      <span className="dot" style={{ background: p.color }} />
      {p.name}
      {withLabel ? ` ${p.label}` : ''}
    </span>
  )
}

export function StatusPill({ id, small = false }) {
  const s = STATUS_MAP[id] || STATUS_MAP.pool
  return (
    <span className={`status-pill ${small ? 'sm' : ''}`} style={{ color: s.color, background: `${s.color}14` }}>
      <span className="dot" style={{ background: s.color }} />
      {s.name}
    </span>
  )
}

export function TagChip({ tag, onRemove, small = false }) {
  return (
    <span className={`tag-chip ${small ? 'sm' : ''}`}>
      {tag}
      {onRemove && (
        <button type="button" className="tag-remove" onClick={onRemove} aria-label={`移除 ${tag}`}>
          <Icon name="x" size={10} strokeWidth={2.4} />
        </button>
      )}
    </span>
  )
}

export function Progress({ value, color = 'var(--accent)', height = 4, muted = false }) {
  const v = Math.max(0, Math.min(100, value || 0))
  return (
    <span className="progress" style={{ height }}>
      <span
        className="progress-fill"
        style={{ width: `${v}%`, background: muted ? 'var(--text-faint)' : color }}
      />
    </span>
  )
}

export function EmptyState({ icon = 'inbox', title, desc, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      {desc && <p>{desc}</p>}
      {action}
    </div>
  )
}

export function Segmented({ options, value, onChange, size = 'md' }) {
  return (
    <div className={`segmented ${size}`}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`segmented-item ${value === o.id ? 'active' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.icon && <Icon name={o.icon} size={13} />}
          {o.name}
        </button>
      ))}
    </div>
  )
}

export function Popover({ trigger, children, align = 'right', width = 240 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="popover-root" ref={ref}>
      <div onClick={() => setOpen((v) => !v)} className="popover-trigger">
        {trigger}
      </div>
      {open && (
        <div className={`popover ${align}`} style={{ width }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

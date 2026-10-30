import React, { useEffect, useMemo, useState } from 'react'
import { PRIORITIES, SOURCES, STATUSES } from '../lib/constants'
import { fmtMD, parseISO, relativeTime, toISO, today } from '../lib/date'
import { computeEnd, dueRisk, memberCapacity, progressOf, resolveSchedules } from '../lib/schedule'
import { useStore } from '../store'
import { Icon } from './Icons'
import { Avatar, Progress, TagChip } from './ui'

function dueRiskText(risk, dueDate) {
  if (risk.level === 'none') return null
  if (risk.level === 'unplanned') return { tone: 'warn', text: '设了截止日但还没排期' }
  if (risk.level === 'over') return { tone: 'danger', text: `按当前排期会晚 ${risk.days} 天` }
  if (risk.level === 'tight') return { tone: 'warn', text: '刚好卡在截止日，没有缓冲' }
  return { tone: 'ok', text: `比截止日早 ${risk.days} 天` }
}

export default function DetailDrawer({ reqId, onClose, onSelect }) {
  const {
    requirements,
    members,
    milestones,
    allTags,
    settings,
    updateRequirement,
    deleteRequirement,
    duplicateRequirement,
    addSubtask,
    toggleSubtask,
    renameSubtask,
    removeSubtask,
    addComment,
    removeComment,
    notify,
  } = useStore()

  const req = requirements.find((r) => r.id === reqId)

  const [titleDraft, setTitleDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')
  const [accDraft, setAccDraft] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [subInput, setSubInput] = useState('')
  const [commentInput, setCommentInput] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [unit, setUnit] = useState('h')
  const [showAllActivity, setShowAllActivity] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!req) return
    setTitleDraft(req.title)
    setDescDraft(req.description || '')
    setAccDraft(req.acceptance || '')
    setUnit('h')
    setTagInput('')
    setSubInput('')
    setCommentInput('')
    setConfirmDelete(false)
    setShowAllActivity(false)
  }, [reqId])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const member = useMemo(() => members.find((m) => m.id === req?.assigneeId), [members, req])
  const resolved = useMemo(
    () => resolveSchedules(requirements, members, settings).get(reqId),
    [requirements, members, settings, reqId],
  )
  const cap = memberCapacity(member, settings)
  const effStart = resolved?.start || req?.startDate || ''
  const autoEnd = req ? computeEnd(effStart, req.estimateHours, cap) : ''
  const progress = req ? progressOf(req) : 0
  const risk = req ? dueRisk(req, autoEnd) : { level: 'none' }
  const riskInfo = dueRiskText(risk, req?.dueDate)

  const depOptions = useMemo(
    () => requirements.filter((r) => r.id !== reqId && !(req?.deps || []).includes(r.id)),
    [requirements, reqId, req],
  )

  const activity = useMemo(() => {
    if (!req) return []
    const changes = (req.history || []).map((h) => ({ kind: 'change', at: h.at, item: h, id: h.id }))
    const comments = (req.comments || []).map((c) => ({ kind: 'comment', at: c.at, item: c, id: c.id }))
    return [...changes, ...comments].sort((a, b) => b.at - a.at)
  }, [req])

  if (!req) return null

  const commit = (field, value) => {
    if (JSON.stringify(req[field]) === JSON.stringify(value)) return
    updateRequirement(req.id, { [field]: value })
  }

  const hoursValue = unit === 'h' ? req.estimateHours || 0 : Math.round(((req.estimateHours || 0) / cap) * 10) / 10

  const setHours = (raw) => {
    const n = Number(raw) || 0
    const hours = unit === 'h' ? n : Math.round(n * cap * 10) / 10
    updateRequirement(req.id, { estimateHours: hours })
  }

  const addTag = () => {
    const t = tagInput.trim()
    if (!t) return
    if ((req.tags || []).includes(t)) {
      setTagInput('')
      return
    }
    updateRequirement(req.id, { tags: [...(req.tags || []), t] })
    setTagInput('')
  }

  const addLink = () => {
    const url = linkUrl.trim()
    if (!url) return
    const title = linkTitle.trim() || url.replace(/^https?:\/\//, '').slice(0, 40)
    updateRequirement(req.id, { links: [...(req.links || []), { id: `l_${Date.now()}`, title, url }] })
    setLinkTitle('')
    setLinkUrl('')
  }

  const visibleActivity = showAllActivity ? activity : activity.slice(0, 8)

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="需求详情">
        <header className="drawer-head">
          <div className="status-switch">
            {STATUSES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`status-chip ${req.status === s.id ? 'active' : ''}`}
                style={
                  req.status === s.id
                    ? { color: s.color, background: `${s.color}18`, borderColor: `${s.color}55` }
                    : undefined
                }
                onClick={() => updateRequirement(req.id, { status: s.id })}
              >
                {s.name}
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="x" size={15} />
          </button>
        </header>

        <div className="drawer-body">
          <textarea
            className="title-input"
            value={titleDraft}
            rows={Math.max(1, Math.ceil(titleDraft.length / 26))}
            autoFocus={req.title === '未命名需求'}
            onFocus={(e) => {
              if (req.title === '未命名需求') e.currentTarget.select()
            }}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => commit('title', titleDraft.trim() || '未命名需求')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
            placeholder="需求标题"
          />

          <div className="meta-grid">
            <div className="meta-cell">
              <span className="meta-label">负责人</span>
              <select
                className="select"
                value={req.assigneeId || ''}
                onChange={(e) => updateRequirement(req.id, { assigneeId: e.target.value })}
              >
                <option value="">未分配</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="meta-cell">
              <span className="meta-label">优先级</span>
              <div className="prio-switch">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`prio-chip ${req.priority === p.id ? 'active' : ''}`}
                    style={
                      req.priority === p.id
                        ? { color: p.color, background: `${p.color}16`, borderColor: `${p.color}55` }
                        : undefined
                    }
                    onClick={() => updateRequirement(req.id, { priority: p.id })}
                    title={p.label}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="meta-cell">
              <span className="meta-label">开始日期</span>
              <input
                type="date"
                className="input"
                value={req.startDate || ''}
                onChange={(e) => updateRequirement(req.id, { startDate: e.target.value })}
              />
            </div>
            <div className="meta-cell">
              <span className="meta-label">截止日</span>
              <input
                type="date"
                className="input"
                value={req.dueDate || ''}
                onChange={(e) => updateRequirement(req.id, { dueDate: e.target.value })}
              />
            </div>
            <div className="meta-cell">
              <span className="meta-label">
                预估工时
                <span className="unit-switch">
                  <button type="button" className={unit === 'h' ? 'on' : ''} onClick={() => setUnit('h')}>
                    h
                  </button>
                  <button type="button" className={unit === 'd' ? 'on' : ''} onClick={() => setUnit('d')}>
                    d
                  </button>
                </span>
              </span>
              <input
                type="number"
                className="input"
                min="0"
                step={unit === 'h' ? 1 : 0.5}
                value={hoursValue}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
            <div className="meta-cell">
              <span className="meta-label">里程碑</span>
              <select
                className="select"
                value={req.milestoneId || ''}
                onChange={(e) => updateRequirement(req.id, { milestoneId: e.target.value })}
              >
                <option value="">未关联</option>
                {(milestones || []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.date ? ` · ${m.date.slice(5)}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="meta-cell">
              <span className="meta-label">来源</span>
              <select
                className="select"
                value={req.source || ''}
                onChange={(e) => updateRequirement(req.id, { source: e.target.value })}
              >
                <option value="">未填写</option>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="meta-cell">
              <span className="meta-label">提出人</span>
              <input
                className="input"
                value={req.requester || ''}
                placeholder="谁提的"
                onChange={(e) => updateRequirement(req.id, { requester: e.target.value })}
              />
            </div>
          </div>

          <div className="auto-row">
            <span className="auto-item">
              <Icon name="calendar" size={12} />
              自动结束日
              <strong>{autoEnd ? fmtMD(parseISO(autoEnd)) : '—'}</strong>
            </span>
            <span className="auto-item">
              <Icon name="clock" size={12} />
              按 {cap}h/天 折算 · 约 {req.estimateHours ? Math.ceil(req.estimateHours / cap) : 0} 个工作日
            </span>
            {!req.startDate && (
              <button
                type="button"
                className="link-btn"
                onClick={() => updateRequirement(req.id, { startDate: toISO(today()) })}
              >
                从今天开始排
              </button>
            )}
          </div>

          {riskInfo && (
            <div className={`risk-banner ${riskInfo.tone}`}>
              <Icon name="flag" size={12} />
              截止 {req.dueDate} · {riskInfo.text}
            </div>
          )}

          {(req.deps || []).length > 0 && (
            <div className="dep-banner">
              <Icon name="link" size={12} />
              有 {req.deps.length} 个前置需求，实际从 {effStart ? fmtMD(parseISO(effStart)) : '—'} 开始
              {req.startDate && req.startDate !== effStart ? `（手填的是 ${fmtMD(parseISO(req.startDate))}）` : ''}
            </div>
          )}

          <div className="section">
            <div className="section-head">
              <span className="section-label">前置依赖</span>
              <span className="section-count">{(req.deps || []).length}</span>
            </div>
            <div className="dep-list">
              {(req.deps || []).map((id) => {
                const dep = requirements.find((r) => r.id === id)
                return (
                  <span className="dep-chip" key={id}>
                    <button type="button" className="dep-open" onClick={() => onSelect(id)}>
                      {dep ? dep.title : '已删除的需求'}
                    </button>
                    <button
                      type="button"
                      className="dep-remove"
                      onClick={() => updateRequirement(req.id, { deps: req.deps.filter((d) => d !== id) })}
                      aria-label="移除前置"
                    >
                      <Icon name="x" size={9} />
                    </button>
                  </span>
                )
              })}
              <select
                className="select sm dep-add"
                value=""
                onChange={(e) => {
                  if (!e.target.value) return
                  updateRequirement(req.id, { deps: [...(req.deps || []), e.target.value] })
                }}
              >
                <option value="">+ 添加前置需求</option>
                {depOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="section">
            <span className="section-label">标签</span>
            <div className="tag-editor">
              {(req.tags || []).map((t) => (
                <TagChip
                  key={t}
                  tag={t}
                  onRemove={() => updateRequirement(req.id, { tags: req.tags.filter((x) => x !== t) })}
                />
              ))}
              <input
                className="tag-input"
                value={tagInput}
                placeholder="+ 添加标签"
                list="tag-suggestions"
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTag()
                  }
                }}
                onBlur={addTag}
              />
              <datalist id="tag-suggestions">
                {allTags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="section">
            <div className="section-head">
              <span className="section-label">子任务</span>
              <span className="section-count">
                {(req.subtasks || []).filter((s) => s.done).length}/{(req.subtasks || []).length}
              </span>
            </div>
            {req.subtasks?.length > 0 ? (
              <div className="sub-progress">
                <Progress value={progress} height={5} />
                <em>{progress}%</em>
              </div>
            ) : (
              <div className="progress-manual">
                <span>手动进度</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={req.progress || 0}
                  onChange={(e) => updateRequirement(req.id, { progress: Number(e.target.value) })}
                />
                <em>{req.progress || 0}%</em>
              </div>
            )}
            <div className="sub-list">
              {(req.subtasks || []).map((s) => (
                <div className={`sub-item ${s.done ? 'done' : ''}`} key={s.id}>
                  <button
                    type="button"
                    className="sub-check"
                    onClick={() => toggleSubtask(req.id, s.id)}
                    aria-label={s.done ? '取消完成' : '标记完成'}
                  >
                    {s.done && <Icon name="check" size={10} strokeWidth={3} />}
                  </button>
                  <input
                    className="sub-title"
                    value={s.title}
                    onChange={(e) => renameSubtask(req.id, s.id, e.target.value)}
                  />
                  <button type="button" className="icon-btn tiny" onClick={() => removeSubtask(req.id, s.id)}>
                    <Icon name="x" size={11} />
                  </button>
                </div>
              ))}
            </div>
            <div className="sub-add">
              <Icon name="plus" size={12} />
              <input
                value={subInput}
                placeholder="添加子任务，回车确认"
                onChange={(e) => setSubInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && subInput.trim()) {
                    addSubtask(req.id, subInput.trim())
                    setSubInput('')
                  }
                }}
              />
            </div>
          </div>

          <div className="section">
            <span className="section-label">需求描述</span>
            <textarea
              className="textarea"
              rows={4}
              value={descDraft}
              placeholder="背景、要解决什么问题、影响范围…"
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={() => commit('description', descDraft)}
            />
          </div>

          <div className="section">
            <span className="section-label">验收标准</span>
            <textarea
              className="textarea"
              rows={4}
              value={accDraft}
              placeholder="满足哪些条件才算做完，一条一行…"
              onChange={(e) => setAccDraft(e.target.value)}
              onBlur={() => commit('acceptance', accDraft)}
            />
          </div>

          <div className="section">
            <span className="section-label">参考链接</span>
            {(req.links || []).length > 0 && (
              <div className="link-list">
                {req.links.map((l) => (
                  <span className="link-item" key={l.id}>
                    <Icon name="link" size={11} />
                    {l.url ? (
                      <a href={l.url} target="_blank" rel="noreferrer">
                        {l.title}
                      </a>
                    ) : (
                      <em>{l.title}</em>
                    )}
                    <button
                      type="button"
                      className="link-remove"
                      onClick={() => updateRequirement(req.id, { links: req.links.filter((x) => x.id !== l.id) })}
                      aria-label="移除链接"
                    >
                      <Icon name="x" size={9} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="link-add">
              <input
                className="input sm"
                value={linkTitle}
                placeholder="标题"
                onChange={(e) => setLinkTitle(e.target.value)}
              />
              <input
                className="input sm"
                value={linkUrl}
                placeholder="https://"
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addLink()
                }}
              />
              <button type="button" className="btn ghost sm" onClick={addLink}>
                添加
              </button>
            </div>
          </div>

          <div className="section">
            <div className="section-head">
              <span className="section-label">评论与变更</span>
              {activity.length > 8 && (
                <button type="button" className="link-btn" onClick={() => setShowAllActivity((v) => !v)}>
                  {showAllActivity ? '收起' : `全部 ${activity.length} 条`}
                </button>
              )}
            </div>
            <div className="comment-box">
              <textarea
                className="textarea sm"
                rows={2}
                value={commentInput}
                placeholder="写下决策、结论或 @ 相关人，⌘Enter 发送"
                onChange={(e) => setCommentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    addComment(req.id, commentInput)
                    setCommentInput('')
                  }
                }}
              />
              <div className="comment-actions">
                <button
                  type="button"
                  className="btn primary sm"
                  disabled={!commentInput.trim()}
                  onClick={() => {
                    addComment(req.id, commentInput)
                    setCommentInput('')
                  }}
                >
                  发表评论
                </button>
              </div>
            </div>

            <div className="activity">
              {visibleActivity.length === 0 && <div className="history-empty">还没有记录</div>}
              {visibleActivity.map((a) =>
                a.kind === 'comment' ? (
                  <div className="activity-item comment" key={a.id}>
                    <span className="activity-avatar">{a.item.author?.slice(0, 1) || '我'}</span>
                    <div className="activity-body">
                      <div className="activity-head">
                        <strong>{a.item.author || '我'}</strong>
                        <span className="activity-time">{relativeTime(a.at)}</span>
                        <button
                          type="button"
                          className="icon-btn tiny activity-del"
                          onClick={() => removeComment(req.id, a.item.id)}
                          aria-label="删除评论"
                        >
                          <Icon name="x" size={9} />
                        </button>
                      </div>
                      <p>{a.item.text}</p>
                    </div>
                  </div>
                ) : (
                  <div className="activity-item" key={a.id}>
                    <span className="activity-dot" />
                    <div className="activity-body">
                      {a.item.note && <div className="history-note">{a.item.note}</div>}
                      {a.item.changes.map((c, i) => (
                        <div className="history-line" key={i}>
                          <em>{c.label}</em>
                          <span className="from">{c.from}</span>
                          <Icon name="chevronRight" size={9} />
                          <span className="to">{c.to}</span>
                        </div>
                      ))}
                    </div>
                    <span className="history-time">{relativeTime(a.at)}</span>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>

        <footer className="drawer-foot">
          <span className="foot-meta">
            创建于 {req.createdAt ? new Date(req.createdAt).toLocaleDateString('zh-CN') : '—'}
          </span>
          <div className="foot-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                const id = duplicateRequirement(req.id)
                notify('已复制需求')
                onSelect(id)
              }}
            >
              <Icon name="copy" size={13} /> 复制
            </button>
            {confirmDelete ? (
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  deleteRequirement(req.id)
                  notify('已移入回收站，可在设置里恢复')
                  onClose()
                }}
              >
                确认删除
              </button>
            ) : (
              <button type="button" className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size={13} /> 删除
              </button>
            )}
          </div>
        </footer>
      </aside>
    </>
  )
}

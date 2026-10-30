import React, { useMemo, useRef, useState } from 'react'
import { MEMBER_COLORS, PRIORITIES, STATUSES, WEEKDAY_LABELS } from '../lib/constants'
import { groupHolidays } from '../lib/calendar'
import { csvToRequirements, download, exportJSON, remoteAvailable, toCSV, toCSVTemplate, validateImport } from '../lib/storage'
import { fmtShort } from '../lib/date'
import { useStore } from '../store'
import { Icon } from './Icons'
import { Avatar } from './ui'

export default function SettingsView({ rows }) {
  const {
    state,
    members,
    milestones,
    settings,
    trash,
    setSettings,
    setWorkspace,
    addMember,
    updateMember,
    removeMember,
    addMilestone,
    updateMilestone,
    removeMilestone,
    setHoliday,
    removeHoliday,
    importState,
    importRequirements,
    restoreRequirement,
    purgeTrash,
    resetToSeed,
    clearRequirements,
    notify,
  } = useStore()

  const fileRef = useRef(null)
  const csvRef = useRef(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [msName, setMsName] = useState('')
  const [msDate, setMsDate] = useState('')
  const [holDate, setHolDate] = useState('')
  const [holName, setHolName] = useState('')
  const [holWork, setHolWork] = useState(false)
  const [importReport, setImportReport] = useState(null)

  const holidayGroups = useMemo(() => groupHolidays(settings.holidays), [settings.holidays])
  const workdaySet = new Set(settings.workdays || [1, 2, 3, 4, 5])

  const exportJSONFile = () => {
    download(`需求排期-${new Date().toISOString().slice(0, 10)}.json`, exportJSON(state))
    notify('已导出 JSON 备份')
  }

  const exportCSVFile = () => {
    download(`需求排期-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows), 'text/csv')
    notify('已导出 CSV')
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const obj = JSON.parse(text)
      const check = validateImport(obj)
      if (!check.ok) {
        notify(check.error, 'danger')
        return
      }
      importState(obj)
      notify(`已导入 ${obj.requirements.length} 条需求`)
    } catch (err) {
      notify('文件解析失败，请确认是导出的 JSON', 'danger')
    } finally {
      e.target.value = ''
    }
  }

  const onCSV = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const { rows: parsed, errors } = csvToRequirements(text, members, STATUSES, PRIORITIES)
      if (!parsed.length) {
        setImportReport({ added: 0, errors })
        notify('没有可导入的行', 'danger')
        return
      }
      const added = importRequirements(parsed)
      setImportReport({ added, errors })
      notify(`已导入 ${added} 条需求${errors.length ? `，${errors.length} 行跳过` : ''}`, errors.length ? 'danger' : 'default')
    } catch (err) {
      notify('CSV 解析失败，请确认编码为 UTF-8', 'danger')
    } finally {
      e.target.value = ''
    }
  }

  const toggleWorkday = (day) => {
    const cur = new Set(settings.workdays || [1, 2, 3, 4, 5])
    if (cur.has(day)) cur.delete(day)
    else cur.add(day)
    setSettings({ workdays: Array.from(cur).sort() })
  }

  return (
    <div className="settings">
      <section className="panel">
        <header className="panel-head">
          <h2>工作区</h2>
        </header>
        <div className="setting-row">
          <label className="setting-label" htmlFor="ws-name">
            名称
          </label>
          <input
            id="ws-name"
            className="input"
            value={state.workspace || ''}
            onChange={(e) => setWorkspace(e.target.value)}
            placeholder="我的需求排期"
          />
        </div>
        <div className="setting-row">
          <label className="setting-label" htmlFor="cap">
            默认每日产能
          </label>
          <div className="input-suffix">
            <input
              id="cap"
              type="number"
              min="1"
              max="24"
              step="0.5"
              className="input"
              value={settings.dailyHours}
              onChange={(e) => setSettings({ dailyHours: Math.max(1, Number(e.target.value) || 8) })}
            />
            <span>小时 / 天</span>
          </div>
        </div>
        <div className="setting-row">
          <span className="setting-label">每周工作日</span>
          <div className="weekday-picker">
            {WEEKDAY_LABELS.map((label, idx) => (
              <button
                key={label}
                type="button"
                className={`weekday-btn ${workdaySet.has(idx) ? 'on' : ''}`}
                onClick={() => toggleWorkday(idx)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <label className="setting-label" htmlFor="wip">
            开发中 WIP 上限
          </label>
          <input
            id="wip"
            type="number"
            min="0"
            max="50"
            className="input narrow"
            value={settings.wipLimit || 0}
            onChange={(e) => setSettings({ wipLimit: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>
        <div className="setting-row">
          <span className="setting-label">外观</span>
          <div className="theme-switch">
            <button
              type="button"
              className={settings.theme !== 'dark' ? 'on' : ''}
              onClick={() => setSettings({ theme: 'light' })}
            >
              <Icon name="sun" size={13} /> 浅色
            </button>
            <button
              type="button"
              className={settings.theme === 'dark' ? 'on' : ''}
              onClick={() => setSettings({ theme: 'dark' })}
            >
              <Icon name="moon" size={13} /> 深色
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>成员</h2>
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              addMember({
                name: '新成员',
                color: MEMBER_COLORS[members.length % MEMBER_COLORS.length],
                dailyHours: settings.dailyHours,
                role: '',
              })
            }
          >
            <Icon name="plus" size={13} /> 添加成员
          </button>
        </header>
        <div className="member-table">
          <div className="member-head">
            <span>成员</span>
            <span>角色</span>
            <span>每日产能</span>
            <span>颜色</span>
            <span />
          </div>
          {members.map((m) => (
            <div className="member-row" key={m.id}>
              <span className="member-name">
                <Avatar member={m} size={24} />
                <input
                  className="input bare"
                  value={m.name}
                  onChange={(e) => updateMember(m.id, { name: e.target.value })}
                />
              </span>
              <input
                className="input bare"
                value={m.role || ''}
                placeholder="如 前端"
                onChange={(e) => updateMember(m.id, { role: e.target.value })}
              />
              <span className="input-suffix sm">
                <input
                  type="number"
                  min="0.5"
                  max="24"
                  step="0.5"
                  className="input bare"
                  value={m.dailyHours || settings.dailyHours}
                  onChange={(e) => updateMember(m.id, { dailyHours: Number(e.target.value) || settings.dailyHours })}
                />
                <span>h</span>
              </span>
              <span className="color-picker">
                {MEMBER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`color-dot ${m.color === c ? 'on' : ''}`}
                    style={{ background: c }}
                    onClick={() => updateMember(m.id, { color: c })}
                    aria-label={`选择颜色 ${c}`}
                  />
                ))}
              </span>
              <button
                type="button"
                className="icon-btn"
                title="移除成员"
                onClick={() => {
                  removeMember(m.id)
                  notify('已移除成员，其名下需求变为未分配')
                }}
              >
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}
          {members.length === 0 && <div className="risk-empty">还没有成员</div>}
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>里程碑</h2>
        </header>
        <div className="ms-editor">
          {milestones.length === 0 && <div className="risk-empty">还没有里程碑</div>}
          {milestones.map((m) => (
            <div className="ms-edit-row" key={m.id}>
              <input
                className="input bare"
                value={m.name}
                onChange={(e) => updateMilestone(m.id, { name: e.target.value })}
              />
              <input
                type="date"
                className="input sm"
                value={m.date || ''}
                onChange={(e) => updateMilestone(m.id, { date: e.target.value })}
              />
              <button type="button" className="icon-btn" onClick={() => removeMilestone(m.id)} aria-label="删除里程碑">
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}
          <div className="ms-add">
            <input
              className="input"
              value={msName}
              placeholder="里程碑名称，如 v1.0 上线"
              onChange={(e) => setMsName(e.target.value)}
            />
            <input type="date" className="input" value={msDate} onChange={(e) => setMsDate(e.target.value)} />
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                if (!msName.trim() || !msDate) {
                  notify('名称和日期都要填', 'danger')
                  return
                }
                addMilestone(msName.trim(), msDate)
                setMsName('')
                setMsDate('')
              }}
            >
              <Icon name="plus" size={13} /> 添加
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>节假日与调休</h2>
        </header>
        <div className="holiday-list">
          {holidayGroups.length === 0 && <div className="risk-empty">还没有设置节假日</div>}
          {holidayGroups.map((g) => (
            <div className="holiday-row" key={g.start}>
              <span className={`holiday-kind ${g.work ? 'work' : ''}`}>{g.work ? '调休上班' : '放假'}</span>
              <span className="holiday-range">
                {fmtShort(g.start)}
                {g.end !== g.start ? ` – ${fmtShort(g.end)}` : ''}
              </span>
              <span className="holiday-name">{g.name || '未命名'}</span>
              <span className="holiday-days">{g.items.length} 天</span>
              <button
                type="button"
                className="icon-btn"
                onClick={() => g.items.forEach((it) => removeHoliday(it.date))}
                aria-label="删除"
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="holiday-add">
          <input type="date" className="input sm" value={holDate} onChange={(e) => setHolDate(e.target.value)} />
          <input
            className="input sm"
            value={holName}
            placeholder="名称，如 国庆"
            onChange={(e) => setHolName(e.target.value)}
          />
          <select className="select sm" value={holWork ? '1' : '0'} onChange={(e) => setHolWork(e.target.value === '1')}>
            <option value="0">放假</option>
            <option value="1">调休上班</option>
          </select>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              if (!holDate) {
                notify('先选日期', 'danger')
                return
              }
              setHoliday(holDate, holWork, holName.trim())
              setHolDate('')
              setHolName('')
            }}
          >
            添加
          </button>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>数据</h2>
        </header>
        <div className="data-actions">
          <button type="button" className="btn ghost" onClick={exportJSONFile}>
            <Icon name="download" size={13} /> 导出 JSON 备份
          </button>
          <button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={13} /> 导入 JSON
          </button>
          <button type="button" className="btn ghost" onClick={exportCSVFile}>
            <Icon name="download" size={13} /> 导出 CSV
          </button>
          <button type="button" className="btn ghost" onClick={() => csvRef.current?.click()}>
            <Icon name="upload" size={13} /> 导入 CSV
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => download('需求导入模板.csv', toCSVTemplate(), 'text/csv')}
          >
            <Icon name="download" size={13} /> 下载模板
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} hidden />
          <input ref={csvRef} type="file" accept=".csv,text/csv" onChange={onCSV} hidden />
        </div>

        {importReport && (
          <div className={`import-report ${importReport.errors.length ? 'has-error' : ''}`}>
            <div className="import-head">
              <strong>导入完成：{importReport.added} 条</strong>
              {importReport.errors.length > 0 && <span>跳过 {importReport.errors.length} 行</span>}
              <button type="button" className="link-btn" onClick={() => setImportReport(null)}>
                关闭
              </button>
            </div>
            {importReport.errors.slice(0, 6).map((err) => (
              <div className="import-err" key={`${err.line}-${err.reason}`}>
                第 {err.line} 行 · {err.reason}
              </div>
            ))}
          </div>
        )}

        <div className="data-danger">
          {confirmReset ? (
            <span className="danger-inline">
              会覆盖当前全部数据，确定？
              <button
                type="button"
                className="btn danger sm"
                onClick={() => {
                  resetToSeed()
                  setConfirmReset(false)
                  notify('已恢复示例数据')
                }}
              >
                确定恢复
              </button>
              <button type="button" className="btn ghost sm" onClick={() => setConfirmReset(false)}>
                取消
              </button>
            </span>
          ) : (
            <button type="button" className="link-btn" onClick={() => setConfirmReset(true)}>
              恢复示例数据
            </button>
          )}
          <span className="divider-dot" />
          {confirmClear ? (
            <span className="danger-inline">
              清空后无法恢复，确定？
              <button
                type="button"
                className="btn danger sm"
                onClick={() => {
                  clearRequirements()
                  setConfirmClear(false)
                  notify('已清空需求')
                }}
              >
                确定清空
              </button>
              <button type="button" className="btn ghost sm" onClick={() => setConfirmClear(false)}>
                取消
              </button>
            </span>
          ) : (
            <button type="button" className="link-btn danger-text" onClick={() => setConfirmClear(true)}>
              清空所有需求
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>回收站</h2>
          <span className="panel-sub">{trash.length} 条</span>
        </header>
        <div className="trash-list">
          {trash.length === 0 && <div className="risk-empty">回收站是空的</div>}
          {trash.map((t) => (
            <div className="trash-row" key={t.req.id}>
              <span className="trash-title">{t.req.title}</span>
              <span className="trash-time">{new Date(t.deletedAt).toLocaleDateString('zh-CN')}</span>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  restoreRequirement(t.req.id)
                  notify('已恢复')
                }}
              >
                <Icon name="undo" size={12} /> 恢复
              </button>
              <button type="button" className="icon-btn" onClick={() => purgeTrash(t.req.id)} aria-label="彻底删除">
                <Icon name="trash" size={12} />
              </button>
            </div>
          ))}
        </div>
        {trash.length > 0 && (
          <div className="data-danger">
            <button type="button" className="link-btn danger-text" onClick={() => purgeTrash()}>
              清空回收站
            </button>
          </div>
        )}
      </section>

      <section className="panel muted-panel">
        <header className="panel-head">
          <h2>存储方式</h2>
        </header>
        <p className="note-text">
          {remoteAvailable()
            ? '数据存在本机的数据文件里，每天自动备份一份，换设备打开同一个网址即可同步。'
            : '数据保存在浏览器本地，换设备看不到同一份，建议定期导出 JSON 备份。'}
        </p>
      </section>
    </div>
  )
}

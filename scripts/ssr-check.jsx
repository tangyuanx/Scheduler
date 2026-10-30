/* eslint-disable no-console */
import './shim.js'
import React from 'react'
import { renderToString } from 'react-dom/server'
import App from '../src/App.jsx'
import Calendar from '../src/components/Calendar.jsx'
import Capacity from '../src/components/Capacity.jsx'
import CommandPalette from '../src/components/CommandPalette.jsx'
import Dashboard from '../src/components/Dashboard.jsx'
import DetailDrawer from '../src/components/DetailDrawer.jsx'
import Gantt from '../src/components/Gantt.jsx'
import Kanban from '../src/components/Kanban.jsx'
import Report from '../src/components/Report.jsx'
import SettingsView from '../src/components/SettingsView.jsx'
import TableView from '../src/components/TableView.jsx'
import { seedState } from '../src/lib/seed.js'
import {
  autoSchedule,
  computeEnd,
  distribute,
  dueRisk,
  isOverdue,
  progressOf,
  resolveSchedules,
  scheduleOf,
} from '../src/lib/schedule.js'
import { makeCalendar } from '../src/lib/calendar.js'
import { buildReport, cycleDays, doneAt, statusTimeline } from '../src/lib/report.js'
import { csvToRequirements, parseCSV } from '../src/lib/storage.js'
import { STATUSES, PRIORITIES, DEFAULT_SETTINGS } from '../src/lib/constants.js'
import { StoreProvider } from '../src/store.jsx'

const seed = seedState()
const { members, settings, requirements, milestones } = seed
const schedules = resolveSchedules(requirements, members, settings)

const rows = requirements.map((r) => {
  const sched = schedules.get(r.id) || scheduleOf(r, members, settings)
  const risk = dueRisk(r, sched.end)
  return {
    ...r,
    start: sched.start,
    end: sched.end,
    cap: sched.cap,
    workdays: sched.workdays,
    progress: progressOf(r),
    overdue: isOverdue(r, sched.end),
    blocked: Boolean(sched.blocked),
    dueRisk: risk,
  }
})

const noop = () => {}
const setNoop = () => {}

const cases = [
  ['App（默认甘特）', <App />, ['甘特排期', '需求']],
  [
    'Dashboard',
    <Dashboard
      rows={rows}
      members={members}
      settings={settings}
      milestones={milestones}
      onOpen={noop}
      onNew={noop}
      setView={setNoop}
      setFilters={setNoop}
      onAutoSchedule={noop}
    />,
    ['需求总数', '本周负荷', '需求流转', '本周每日投入', '需要关注', '即将交付', '自动排期'],
  ],
  [
    'Gantt',
    <Gantt
      rows={rows}
      members={members}
      milestones={milestones}
      onOpen={noop}
      onUpdate={noop}
      onNew={noop}
      onAutoSchedule={noop}
    />,
    ['登录与权限体系重构', '按负责人', '自动排期'],
  ],
  [
    'Calendar',
    <Calendar rows={rows} members={members} milestones={milestones} settings={settings} onOpen={noop} />,
    ['周一', '本月'],
  ],
  [
    'Kanban',
    <Kanban rows={rows} members={members} settings={settings} onOpen={noop} onUpdate={noop} onNew={noop} />,
    ['需求池', '上线'],
  ],
  [
    'TableView',
    <TableView rows={rows} members={members} milestones={milestones} onOpen={noop} onNew={noop} />,
    ['优先级', '预估合计', '截止'],
  ],
  ['Capacity', <Capacity rows={rows} members={members} settings={settings} onOpen={noop} />, ['超载', '未来 6 周负荷']],
  [
    'Report',
    <Report rows={rows} members={members} settings={settings} milestones={milestones} onOpen={noop} />,
    ['平均周期时间', '每周吞吐与新增', '各阶段平均停留', '里程碑进度'],
  ],
  ['SettingsView', <SettingsView rows={rows} />, ['工作区', '成员', '导出 JSON 备份', '节假日与调休', '回收站']],
  [
    'DetailDrawer',
    <DetailDrawer reqId="r_1" onClose={noop} onSelect={setNoop} />,
    ['自动结束日', '子任务', '前置依赖', '评论与变更', '参考链接'],
  ],
  ['CommandPalette', <CommandPalette rows={rows} onClose={noop} onOpenReq={noop} onRun={noop} />, ['命令', '自动排期']],
]

let failed = 0
const rendered = {}
cases.forEach(([name, el, expects]) => {
  try {
    const html = renderToString(<StoreProvider>{el}</StoreProvider>)
    rendered[name] = html
    const missing = expects.filter((k) => !html.includes(k))
    if (html.length < 200) {
      console.log(`✗ ${name}: 输出过短 (${html.length})`)
      failed += 1
      return
    }
    if (missing.length) {
      console.log(`✗ ${name}: 缺少关键内容 ${missing.join(', ')}`)
      failed += 1
      return
    }
    console.log(`✓ ${name}: ${html.length} 字符`)
  } catch (err) {
    failed += 1
    console.log(`✗ ${name}: ${err.message}`)
    console.log(String(err.stack).split('\n').slice(0, 6).join('\n'))
  }
})

// 首页信息密度：只数「可见文字里的数字」，用来看会不会又堆成数字墙
function countNumbers(html) {
  const text = String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
  return (text.match(/\d+(\.\d+)?/g) || []).length
}
const dashNums = countNumbers(rendered.Dashboard)
console.log(`· 总览可见数字 ${dashNums} 个（建议控制在 30 以内）`)
if (process.env.DUMP) {
  console.log(
    String(rendered[process.env.DUMP] || '')
      .replace(/<[^>]+>/g, '|')
      .replace(/\|+/g, ' | ')
      .replace(/\s+/g, ' '),
  )
}

console.log(failed === 0 ? '\n全部视图渲染通过' : `\n${failed} 个视图存在问题`)

// ---- 排期算法断言 ----
const mathCases = [
  ['周四起 24h / 6h 产能', computeEnd('2026-10-29', 24, 6), '2026-11-03'],
  ['周五起 6h 当天完成', computeEnd('2026-10-30', 6, 6), '2026-10-30'],
  ['周五起 8h 溢出到周一', computeEnd('2026-10-30', 8, 6), '2026-11-02'],
  ['周六起 12h 顺延到周一', computeEnd('2026-10-31', 12, 6), '2026-11-03'],
  ['周日只排 1h 落在周一', computeEnd('2026-11-01', 1, 6), '2026-11-02'],
  ['无开始日返回空', computeEnd('', 10, 6), ''],
  ['0 工时返回空', computeEnd('2026-10-29', 0, 6), ''],
]
let mathFailed = 0
const check = (ok, okMsg, failMsg) => {
  if (ok) console.log(`✓ ${okMsg}`)
  else {
    mathFailed += 1
    console.log(`✗ ${failMsg}`)
  }
}
mathCases.forEach(([name, got, want]) => check(got === want, `排期 ${name} → ${got}`, `排期 ${name}: 期望 ${want} 实际 ${got}`))

const dist = distribute({ startDate: '2026-10-26', estimateHours: 14 }, 6)
check(
  dist.length === 3 && dist[2].hours === 2 && dist[2].date === '2026-10-28',
  `工时铺开 ${JSON.stringify(dist)}`,
  `工时铺开异常 ${JSON.stringify(dist)}`,
)

// 节假日：2026-11-02 放假，24h 的活要多拖一天
const cal = makeCalendar({ ...DEFAULT_SETTINGS, holidays: [{ date: '2026-11-02', work: false, name: '测试假' }] })
check(
  computeEnd('2026-10-29', 24, 6, cal) === '2026-11-04',
  '节假日跳过 → 2026-11-04',
  `节假日未生效: ${computeEnd('2026-10-29', 24, 6, cal)}`,
)
check(cal.isWork('2026-11-02') === false, '节假日判定为休息', '节假日判定错误')
check(
  makeCalendar({ ...DEFAULT_SETTINGS, holidays: [{ date: '2026-11-01', work: true }] }).isWork('2026-11-01') === true,
  '调休日判定为上班',
  '调休日判定错误',
)

// 依赖：后置需求不能早于前置结束
const depReqs = [
  { id: 'a', title: 'A', status: 'dev', priority: 'P1', assigneeId: 'm1', startDate: '2026-10-26', estimateHours: 12, deps: [] },
  { id: 'b', title: 'B', status: 'dev', priority: 'P1', assigneeId: 'm1', startDate: '2026-10-26', estimateHours: 6, deps: ['a'] },
]
const depMap = resolveSchedules(depReqs, [{ id: 'm1', name: 'M', dailyHours: 6 }], DEFAULT_SETTINGS)
check(depMap.get('a').end === '2026-10-27', `前置 A 结束 ${depMap.get('a').end}`, `前置 A 结束异常 ${depMap.get('a').end}`)
check(depMap.get('b').start === '2026-10-28', `后置 B 顺延到 ${depMap.get('b').start}`, `依赖未生效: B 从 ${depMap.get('b').start} 开始`)
check(depMap.get('b').blocked === true, '后置标记为等待前置', '后置未标记 blocked')

// 循环依赖不应死循环
const cycleMap = resolveSchedules(
  [
    { id: 'x', title: 'X', status: 'dev', assigneeId: 'm1', startDate: '2026-10-26', estimateHours: 6, deps: ['y'] },
    { id: 'y', title: 'Y', status: 'dev', assigneeId: 'm1', startDate: '2026-10-26', estimateHours: 6, deps: ['x'] },
  ],
  [{ id: 'm1', name: 'M', dailyHours: 6 }],
  DEFAULT_SETTINGS,
)
check(Boolean(cycleMap.get('x') && cycleMap.get('y')), '循环依赖被截断，未死循环', '循环依赖处理失败')

// 自动排期：同一成员两个任务应首尾相接
const auto = autoSchedule(depReqs, [{ id: 'm1', name: 'M', dailyHours: 6 }], DEFAULT_SETTINGS, { from: '2026-10-26' })
const autoStartB = auto.patches.b?.startDate
check(
  autoStartB === '2026-10-28' && (auto.patches.a?.startDate ?? '2026-10-26') === '2026-10-26',
  `自动排期 A=${auto.patches.a?.startDate ?? '2026-10-26'} B=${autoStartB}`,
  `自动排期异常 A=${auto.patches.a?.startDate} B=${autoStartB}`,
)

// 截止日风险
check(dueRisk({ dueDate: '2026-11-10' }, '2026-11-12').level === 'over', '截止日风险识别为超期', '截止日风险判断错误')
check(dueRisk({ dueDate: '' }, '2026-11-12').level === 'none', '未设截止日返回 none', '未设截止日判断错误')

// CSV 解析
const csv = '标题,状态,优先级,负责人,开始日期,截止日,预估工时\n第一行,评审,P1,小林,2026-11-02,2026-11-10,8\n,需求池,P2,,,,\n第二行,开发,P0,阿岚,2026/11/05,2026/11/20,12'
const parsed = csvToRequirements(csv, members, STATUSES, PRIORITIES)
check(parsed.rows.length === 2, `CSV 解析出 ${parsed.rows.length} 行`, `CSV 解析行数异常 ${parsed.rows.length}`)
check(parsed.errors.length === 1 && parsed.errors[0].line === 3, 'CSV 空标题行被跳过并报行号', `CSV 错误行异常 ${JSON.stringify(parsed.errors)}`)
check(parsed.rows[0]?.assigneeId === 'm_lin', 'CSV 负责人按名字匹配到 id', 'CSV 负责人映射失败')
check(parsed.rows[1]?.startDate === '2026-11-05', 'CSV 斜杠日期被规范化', `CSV 日期规范化失败 ${parsed.rows[1]?.startDate}`)
check(parseCSV('a,"b,c",d').length === 1 && parseCSV('a,"b,c",d')[0][1] === 'b,c', 'CSV 引号内逗号正确', 'CSV 引号解析错误')

// 报表
const rep = buildReport(requirements)
check(rep.flow.length === 8, `报表吞吐 ${rep.flow.length} 周`, `报表周数异常 ${rep.flow.length}`)
check(rep.doneCount === requirements.filter((r) => r.status === 'done').length, `报表完成数 ${rep.doneCount}`, '报表完成数异常')
const doneReq = requirements.find((r) => r.status === 'done')
check(doneAt(doneReq) > 0, '上线时间可从历史识别', 'doneAt 未识别到上线时间')
check(cycleDays(doneReq) > 0, `周期时间 ${cycleDays(doneReq)} 天`, '周期时间计算失败')
check(statusTimeline(doneReq).length >= 2, '状态时间线可还原', '状态时间线异常')

process.exit(failed === 0 && mathFailed === 0 ? 0 : 1)

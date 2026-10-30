export const STATUSES = [
  { id: 'pool', name: '需求池', desc: '刚提出，尚未评估', color: '#8a8a95' },
  { id: 'review', name: '评审', desc: '评估价值与成本', color: '#7b7ba8' },
  { id: 'scheduled', name: '排期', desc: '已定时间，待开工', color: '#6f6dd0' },
  { id: 'dev', name: '开发', desc: '正在推进', color: '#5b5bd6' },
  { id: 'accept', name: '验收', desc: '待确认交付', color: '#43419c' },
  { id: 'done', name: '上线', desc: '已交付完成', color: '#2f8a5c' },
]

export const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.id, s]))

// 只有 P0 / P1 带颜色，其余用中性灰，避免整屏彩点
export const PRIORITIES = [
  { id: 'P0', name: 'P0', label: '紧急', color: '#d0454a', weight: 0 },
  { id: 'P1', name: 'P1', label: '高', color: '#b4771c', weight: 1 },
  { id: 'P2', name: 'P2', label: '中', color: '#6b6b76', weight: 2 },
  { id: 'P3', name: 'P3', label: '低', color: '#9b9ba4', weight: 3 },
]

export const PRIORITY_MAP = Object.fromEntries(PRIORITIES.map((p) => [p.id, p]))

// 成员色收敛到低饱和的一组，只用于头像与图例
export const MEMBER_COLORS = ['#5b5bd6', '#4a7ba6', '#6b8f7a', '#9a7d5e', '#7d6a9e', '#6e6e86']

export const ACTIVE_STATUSES = ['review', 'scheduled', 'dev', 'accept']

export const FIELD_LABELS = {
  title: '标题',
  status: '状态',
  priority: '优先级',
  assigneeId: '负责人',
  startDate: '开始日期',
  dueDate: '截止日',
  estimateHours: '预估工时',
  tags: '标签',
  description: '描述',
  acceptance: '验收标准',
  progress: '进度',
  source: '来源',
  requester: '提出人',
  links: '参考链接',
  deps: '前置需求',
  milestoneId: '里程碑',
}

/** 需求来源，用于回溯「这些活是谁提的」 */
export const SOURCES = ['内部规划', '客户需求', '老板交办', '线上问题', '数据洞察', '技术债']

/** 默认设置；新增字段都从这里兜底，老数据读进来会被补齐 */
export const DEFAULT_SETTINGS = {
  dailyHours: 6,
  theme: 'light',
  showWeekend: true,
  defaultView: 'gantt',
  workdays: [1, 2, 3, 4, 5],
  holidays: [],
  wipLimit: 0,
}

/** 每周工作日的中文简称，0 = 周日 */
export const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

/** 需求状态在流程里的先后顺序，用于累积流图与排序 */
export const STATUS_ORDER = Object.fromEntries(STATUSES.map((s, i) => [s.id, i]))

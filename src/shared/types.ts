// ===== 分类体系 =====
export const CATEGORIES = [
  '文档', '沟通', '开发', '学习', '设计',
  '产品', '会议', '数据分析', '研究', 'AI/工具',
  '配置环境', '其他',
] as const;

export type Category = (typeof CATEGORIES)[number];

// ===== 记录来源 =====
export type RecordSource = 'auto' | 'manual' | 'vision' | 'import';

// ===== 报告类型 =====
export type ReportType = '日报' | '周报' | '月报';

// ===== 活动记录 =====
export interface ActivityRecord {
  id: string;
  title: string;
  category: Category;
  app: string;
  window_title: string;
  start_at: string;
  end_at: string;
  notes: string;
  source: RecordSource;
  created_at: string;
  is_achievement: boolean;
  exclude_from_report: boolean;
}

// ===== 追踪会话快照（前端实时显示用，非持久化） =====
export interface TrackerSnapshot {
  app: string;
  title: string;
  category: Category;
  startTime: string;
  endTime: string;
  durationMs: number;
}

// ===== 报告 =====
export interface Report {
  id: string;
  report_type: ReportType;
  template: string;
  start_date: string;
  end_date: string;
  content: string;
  created_at: string;
}

// ===== AI 识别结果 =====
export interface VisionResult {
  id: string;
  record_id: string;
  title: string;
  category: Category;
  summary: string;
  raw_response: string;
  app: string;
  window_title: string;
  model: string;
  created_at: string;
}

// ===== 空闲时段 =====
export interface IdlePeriod {
  id: string;
  start_at: string;
  end_at: string | null;
  created_at: string;
}

// ===== AI 识别结果增强（含近似时长） =====
export interface VisionResultWithDuration extends VisionResult {
  approx_duration_sec: number; // 近似时长（秒），距下一条 vision_result 的 created_at 差值
}

// ===== Vision 查询参数 =====
export interface VisionQuery {
  start: string;   // "YYYY-MM-DD"
  end: string;     // "YYYY-MM-DD"
  q?: string;
  category?: Category;
  limit?: number;
}

// ===== Vision 今日摘要（TodayPage Hero 用） =====
export interface VisionDailySummary {
  count: number;
  categories: { category: Category; count: number }[];
  mainCategory: Category;
  latest: VisionResult | null;
  activeSpanSec: number;  // 第一条到最后一条的时间跨度（秒）
}

// ===== 应用设置 =====
export interface AppSettings {
  siliconflow_api_key: string;
  vision_model: string;
  report_model: string;
  screenshot_interval: number;
  keep_screenshots: boolean;
  auto_start_tracker: boolean;
  auto_vision_toggle: boolean;
  startup_with_windows: boolean;
}

// ===== DTO =====
export interface RecordUpsertDTO {
  id?: string;
  title: string;
  category: Category;
  app: string;
  window_title: string;
  start_at: string;
  end_at: string;
  notes: string;
}

export interface RecordsQuery {
  start: string;
  end: string;
  q?: string;
  category?: Category;
  limit?: number;
}

export interface ReportsQuery {
  report_type?: ReportType;
  q?: string;
}

// ===== 统计 =====
export interface DailySummary {
  recordCount: number;
  totalDuration: number;
  mainCategory: Category;
  topApps: TopApp[];
  activeHours: number;
}

export interface HeatmapCell {
  hour: number;
  count: number;
  duration: number;
  apps: string[];
}

export interface TopApp {
  app: string;
  duration: number;
}

// ===== 分类颜色映射 =====
export const CATEGORY_COLORS: Record<Category, string> = {
  '文档': 'bg-blue-100 text-blue-800',
  '沟通': 'bg-green-100 text-green-800',
  '开发': 'bg-purple-100 text-purple-800',
  '学习': 'bg-yellow-100 text-yellow-800',
  '设计': 'bg-pink-100 text-pink-800',
  '产品': 'bg-indigo-100 text-indigo-800',
  '会议': 'bg-red-100 text-red-800',
  '数据分析': 'bg-cyan-100 text-cyan-800',
  '研究': 'bg-teal-100 text-teal-800',
  'AI/工具': 'bg-amber-100 text-amber-800',
  '配置环境': 'bg-gray-100 text-gray-800',
  '其他': 'bg-slate-100 text-slate-800',
};

// ===== 报告模板 =====
export const TEMPLATES = [
  '成果导向日报',
  '工作轨迹日报',
  '三句话日报',
  'TOP3日报',
] as const;

export type Template = (typeof TEMPLATES)[number];

// ===== 默认设置 =====
export const DEFAULT_SETTINGS: AppSettings = {
  siliconflow_api_key: '',
  vision_model: 'Qwen/Qwen3-VL-32B-Instruct',
  report_model: 'deepseek-ai/DeepSeek-V3',
  screenshot_interval: 5,
  keep_screenshots: false,
  auto_start_tracker: false,
  auto_vision_toggle: false,
  startup_with_windows: false,
};

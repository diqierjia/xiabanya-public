// ===== 分类体系 =====
export const CATEGORIES = [
  '代码开发', '文稿写作', '视觉设计', '数据处理', '文献与阅读',
  '沟通与协作', '音视频会议', '规划与管理', '检索与AI', '系统与配置',
  '休闲娱乐', '其他',
] as const;

/**
 * 分类名称由设置中的“分类管理”维护；这里的默认列表用于首次启动和旧数据兜底。
 */
export type Category = string;

export function normalizeManagedCategories(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [];
  const names = source
    .map((item) => typeof item === 'string' ? item : (item && typeof item === 'object' && 'name' in item ? (item as { name?: unknown }).name : ''))
    .filter((name): name is string => typeof name === 'string')
    .map((name) => name.trim().slice(0, 30))
    .filter(Boolean);
  const unique = [...new Set(names)];
  const withDefaults = unique.length > 0 ? unique : [...CATEGORIES];
  return [...withDefaults.filter((name) => name !== '其他'), '其他'];
}

// ===== Vision 结构化识别 =====
export const VISION_CONFIDENCES = ['high', 'medium', 'low'] as const;
export type VisionConfidence = (typeof VISION_CONFIDENCES)[number];

export const ACTIVITY_TYPES = ['work', 'personal', 'idle', 'unclear'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const DISTRACTION_TYPES = ['entertainment', 'social', 'video', 'game', 'other', 'none'] as const;
export type DistractionType = (typeof DISTRACTION_TYPES)[number];

export const CONTENT_MOODS = ['humorous', 'neutral', 'negative', 'unclear'] as const;
export type ContentMood = (typeof CONTENT_MOODS)[number];

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
  observed_fact?: string;
  possible_activity?: string;
  confidence?: VisionConfidence;
  activity_type?: ActivityType;
  segment_merge?: VisionSegmentMerge;
  stuck_signal?: VisionStuckSignal;
  distraction_signal?: VisionDistractionSignal;
  content_mood?: VisionContentMood;
  raw_response: string;
  app: string;
  window_title: string;
  model: string;
  created_at: string;
}

export interface VisionSegmentMerge {
  should_merge: boolean;
  confidence: VisionConfidence;
  reason: string;
  current_activity: string;
  updated_segment_summary: string;
}

export interface VisionStuckSignal {
  is_stuck_like: boolean;
  reason: string;
  evidence: string[];
  confidence: VisionConfidence;
}

export interface VisionDistractionSignal {
  is_distraction_like: boolean;
  activity_type: DistractionType;
  reason: string;
  confidence: VisionConfidence;
}

export interface VisionContentMood {
  mood: ContentMood;
  reason: string;
  confidence: VisionConfidence;
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

// ===== 桌宠 =====
export const DESK_PET_STATES = ['idle', 'working', 'thinking', 'done', 'sleep'] as const;
export type DeskPetState = (typeof DESK_PET_STATES)[number];

// ===== 应用设置 =====
export interface AppSettings {
  /** Application UI language. Content created by the user is never translated. */
  language: 'zh-CN' | 'en-US';
  siliconflow_api_key: string;
  custom_api_enabled: boolean;
  custom_api_base_url: string;
  vision_model: string;
  report_model: string;
  chat_model: string;
  screenshot_interval: number;
  keep_screenshots: boolean;
  auto_start_tracker: boolean;
  auto_vision_toggle: boolean;
  startup_with_windows: boolean;
  desk_pet_enabled: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatStreamDeltaEvent {
  streamId: string;
  type: 'content' | 'thinking' | 'status';
  delta: string;
}

export interface ChatStreamDoneEvent {
  streamId: string;
  assistantMessageId?: string;
  /** 从发起本轮模型工作到首段回复到达的耗时；本地回复为 undefined。 */
  firstResponseLatencyMs?: number;
  /** 看图问鸭从确认提问到两路视觉观察完成的耗时。 */
  visionUnderstandingLatencyMs?: number;
  /** 看图问鸭从确认提问到聊天模型首段回复的总等待。 */
  totalWaitLatencyMs?: number;
}

// 主应用中的对话实时镜像到已打开的桌宠聊天窗；不影响请求的实际归属。
export interface DeskPetChatMirrorEvent {
  streamId: string;
  type: 'user' | 'delta' | 'done' | 'error' | 'cancel';
  content?: string;
  messageId?: string;
}

export interface ChatHistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  /** 用户消息与这条助手回复的配对关系；旧消息为 null。 */
  reply_to_message_id: string | null;
  /** 从本轮发往模型到收到首段可见回复的耗时；本地回复和旧消息为 null。 */
  response_latency_ms: number | null;
  /** 看图问鸭从用户确认提问到两路视觉观察都完成的耗时。 */
  vision_understanding_latency_ms: number | null;
  /** 看图问鸭从用户确认提问到首段聊天回复的总等待。 */
  total_wait_latency_ms: number | null;
  /** SQLite rowid exposed only as a stable cursor for loading older chat history. */
  sequence: number;
}

export interface QueuedChatMessage {
  id: string;
  content: string;
  created_at: string;
}

export interface ChatMessagesQuery {
  q?: string;
  limit?: number;
  before?: {
    createdAt: string;
    sequence: number;
  };
}

// ===== 长期记忆 =====
export const MEMORY_SCOPES = ['session', 'project', 'user', 'team'] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const MEMORY_CRITICALITIES = ['safety', 'identity', 'preference', 'routine'] as const;
export type MemoryCriticality = (typeof MEMORY_CRITICALITIES)[number];

export const MEMORY_STATUSES = ['active', 'superseded', 'archived', 'forgotten'] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export interface MemoryWeight {
  value: number;
  mention_count: number;
  last_adopted_turn: number;
  last_retrieved_at: string | null;
  pinned: boolean;
  floor_weight: number;
  forced_cap: number | null;
}

export interface MemoryEvent {
  id: string;
  timestamp: string;
  scope: MemoryScope;
  criticality: MemoryCriticality;
  title: string;
  summary: string;
  narrative: string;
  tags: string[];
  quotes: string[];
  source_refs: string[];
  confidence: number;
  status: MemoryStatus;
  superseded_by: string | null;
  weight: MemoryWeight;
  created_at: string;
  updated_at: string;
}

export interface MemoryElement {
  id: string;
  type: 'person' | 'project' | 'concept' | 'tool' | 'place';
  name: string;
  scope: MemoryScope;
  /** 系统固定锚点；普通元素为 null。 */
  special_role: 'user' | 'assistant' | null;
  current_state: string;
  weight: MemoryWeight;
  event_count: number;
  created_at: string;
  updated_at: string;
}

export interface MemoryRelation {
  type: 'continuation' | 'turning_point' | 'cause' | 'correction' | 'parallel';
  target_event_id: string;
  description: string;
}

export interface MemoryWeightPoint {
  turn: number;
  value: number;
  kind: 'created' | 'adopted' | 'manual';
  created_at: string;
}

export interface MemoryEventDetail extends MemoryEvent {
  elements: Array<MemoryElement & { role: string }>;
  relations: MemoryRelation[];
  weight_history: MemoryWeightPoint[];
}

export interface MemoryElementDetail extends MemoryElement {
  events: MemoryEvent[];
}

export interface MemoryListQuery {
  q?: string;
  scope?: MemoryScope;
  status?: MemoryStatus;
}

export interface MemoryDashboard {
  events: MemoryEvent[];
  elements: MemoryElement[];
  current_turn: number;
}

/** 一次主聊天中的记忆工具调用记录，仅用于本地调试与核验。 */
export interface MemoryToolDebugCall {
  name: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface MemoryToolDebugRun {
  id: string;
  user_message_id: string | null;
  assistant_message_id: string | null;
  turn: number;
  mode: 'tool' | 'fallback';
  calls: MemoryToolDebugCall[];
  used_event_ids: string[];
  used_element_ids: string[];
  proposal_count: number;
  fallback_reason: string | null;
  created_at: string;
}

/** 会话整理器的一次批处理记录，用于在 AI 页面核验原文、工具读取与写入结果。 */
export interface ChatCompactionDebugRun {
  id: string;
  start_turn: number;
  end_turn: number;
  source_refs: string[];
  conversation_summary: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error: string | null;
  attempt_count: number;
  next_retry_at: string | null;
  calls: MemoryToolDebugCall[];
  resident_memory: Array<{ kind: 'event' | 'element'; id: string; label: string }>;
  event_ids: string[];
  element_ids: string[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ChatMemoryRuntimeDebug {
  current_turn: number;
  full_message_count: number;
  short_term_message_ids: string[];
  pending_message_ids: string[];
  working_summary: string;
  compactions: ChatCompactionDebugRun[];
}

export interface MemoryEventUpdate {
  title?: string;
  summary?: string;
  narrative?: string;
  tags?: string[];
  scope?: MemoryScope;
  criticality?: MemoryCriticality;
}

export type ProactiveMessageTrigger = 'wrap_up' | 'return_greeting' | 'humor_echo' | 'focus_recover' | 'stuck_help' | 'open_greeting';

export interface ProactiveMessage {
  id: string;
  trigger: ProactiveMessageTrigger;
  content: string;
  created_at: string;
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

export interface ExportJsonOptions {
  start?: string;
  end?: string;
}

export interface ExportJsonData {
  exported_at: string;
  range: { start: string; end: string } | null;
  records: ActivityRecord[];
  reports: Report[];
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
export const CATEGORY_COLORS: Record<string, string> = {
  '代码开发': 'bg-blue-100 text-blue-800',
  '文稿写作': 'bg-amber-100 text-amber-800',
  '视觉设计': 'bg-pink-100 text-pink-800',
  '数据处理': 'bg-cyan-100 text-cyan-800',
  '文献与阅读': 'bg-green-100 text-green-800',
  '沟通与协作': 'bg-purple-100 text-purple-800',
  '音视频会议': 'bg-indigo-100 text-indigo-800',
  '规划与管理': 'bg-rose-100 text-rose-800',
  '检索与AI': 'bg-violet-100 text-violet-800',
  '系统与配置': 'bg-orange-100 text-orange-800',
  '休闲娱乐': 'bg-gray-100 text-gray-800',
  '其他': 'bg-slate-100 text-slate-800',
};

// ===== 报告模板 =====
export const TEMPLATES = [
  '工作日报',
  '全天回顾',
] as const;

export type Template = (typeof TEMPLATES)[number];

// ===== 默认设置 =====
export const DEFAULT_API_BASE_URL = 'https://api.siliconflow.cn/v1';

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'zh-CN',
  siliconflow_api_key: '',
  custom_api_enabled: false,
  custom_api_base_url: '',
  vision_model: 'Qwen/Qwen3-VL-32B-Instruct',
  report_model: 'deepseek-ai/DeepSeek-V4-Flash',
  chat_model: 'deepseek-ai/DeepSeek-V4-Flash',
  screenshot_interval: 5,
  keep_screenshots: false,
  auto_start_tracker: false,
  auto_vision_toggle: false,
  startup_with_windows: false,
  desk_pet_enabled: true,
};

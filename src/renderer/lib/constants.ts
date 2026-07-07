import { today as todayFn } from './utils';
import { formatLocalDate } from '../../shared/time';

export { CATEGORIES, CATEGORY_COLORS, TEMPLATES, DEFAULT_SETTINGS, DESK_PET_STATES } from '../../shared/types';
export type { Category, ActivityRecord, Report, VisionResult, VisionResultWithDuration, VisionQuery, VisionDailySummary, DeskPetState, RecordUpsertDTO, RecordsQuery, ReportsQuery, HeatmapCell, DailySummary, ChatMessage } from '../../shared/types';

export const API_BASE = 'https://api.siliconflow.cn/v1';
export const DEFAULT_VISION_MODEL = 'Qwen/Qwen3-VL-32B-Instruct';
export const DEFAULT_REPORT_MODEL = 'deepseek-ai/DeepSeek-V3';
export const DEFAULT_CHAT_MODEL = 'deepseek-ai/DeepSeek-V4-Flash';

export const REPORT_TEMPLATES = [
  '工作日报',
  '全天回顾',
] as const;

/**
 * 今天的日期 (YYYY-MM-DD)。作为 useState 初始值时传函数引用，
 * React 会当作 lazy initializer 调用，只执行一次。
 */
export const today = todayFn;

/**
 * N 天前的日期 (YYYY-MM-DD)
 */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatLocalDate(d);
}

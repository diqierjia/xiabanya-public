import { today as todayFn } from './utils';
import { formatLocalDate } from '../../shared/time';

export { CATEGORIES, CATEGORY_COLORS, TEMPLATES, DEFAULT_SETTINGS } from '../../shared/types';
export type { Category, ActivityRecord, Report, VisionResult, VisionResultWithDuration, VisionQuery, VisionDailySummary, RecordUpsertDTO, RecordsQuery, ReportsQuery, HeatmapCell, DailySummary } from '../../shared/types';

export const API_BASE = 'https://api.siliconflow.cn/v1';
export const DEFAULT_VISION_MODEL = 'Qwen/Qwen3-VL-32B-Instruct';
export const DEFAULT_REPORT_MODEL = 'deepseek-ai/DeepSeek-V3';

export const REPORT_TEMPLATES = [
  '成果导向日报',
  '工作轨迹日报',
  '三句话日报',
  'TOP3日报',
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

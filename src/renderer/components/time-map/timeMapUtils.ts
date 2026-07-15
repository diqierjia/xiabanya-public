import { parseUtcStorageDateTime } from '../../../shared/time';
import type { TimeMapItem } from './ActivityBlock';

/** 每分钟对应像素高度（2px/min = 120px/h，5min 块 = 10px 可见） */
export const PX_PER_MINUTE = 2;

/** 活动类型 → 颜色映射（不含 gap —— gap item 不渲染） */
export const ACTIVITY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  work:     { bg: '#DBEAFE', border: '#3B82F6', text: '#1D4ED8' },
  personal: { bg: '#FEF3C7', border: '#F59E0B', text: '#B45309' },
  idle:     { bg: '#F3F4F6', border: '#9CA3AF', text: '#4B5563' },
  unclear:  { bg: '#EDE9FE', border: '#8B5CF6', text: '#5B21B6' },
};

/**
 * 计算活动块在时间轴上的绝对定位信息。
 * 将 UTC 存储时间转为本地时间后，计算相对于可见窗口起始位置的偏移。
 *
 * @param startAt        活动的 UTC 存储时间字符串
 * @param durationSec    活动持续时长（秒）
 * @param visibleStartAt 时间轴可见窗口的起始 UTC 存储时间
 * @returns top（距时间轴顶部的 px）和 height（块高度，最小 8px）
 */
export function computeBlockPosition(
  startAt: string,
  durationSec: number,
  visibleStartAt: string
): { top: number; height: number } {
  const itemDate = parseUtcStorageDateTime(startAt);
  const visibleDate = parseUtcStorageDateTime(visibleStartAt);
  if (!itemDate || !visibleDate) return { top: 0, height: 0 };

  const itemLocalMinutes = itemDate.getHours() * 60 + itemDate.getMinutes();
  const visibleLocalMinutes = visibleDate.getHours() * 60 + visibleDate.getMinutes();
  const top = (itemLocalMinutes - visibleLocalMinutes) * PX_PER_MINUTE;
  const height = Math.max((durationSec / 60) * PX_PER_MINUTE, 8);
  return { top, height };
}

/**
 * 计算时间轴上需要展示的小时标签列表。
 * 从 visibleStartAt 对应的小时开始，到 items 中最后一个活动的结束小时为止。
 *
 * @param visibleStartAt 时间轴可见窗口的起始 UTC 存储时间
 * @param items          当天所有 TimeMapItem（已过滤 gap）
 * @returns 小时数数组，如 [8, 9, 10, 11, 12]
 */
export function computeHours(
  visibleStartAt: string,
  items: TimeMapItem[]
): number[] {
  const visibleDate = parseUtcStorageDateTime(visibleStartAt);
  if (!visibleDate) return [];

  const startHour = visibleDate.getHours();
  let endHour = startHour;

  for (const item of items) {
    const itemDate = parseUtcStorageDateTime(item.startAt);
    if (!itemDate) continue;
    const itemEndDate = new Date(itemDate.getTime() + item.durationSec * 1000);
    const itemEndHour = itemEndDate.getHours() + (itemEndDate.getMinutes() > 0 || itemEndDate.getSeconds() > 0 ? 1 : 0);
    if (itemEndHour > endHour) endHour = itemEndHour;
  }

  // 至少包含起始小时自身
  if (endHour <= startHour) endHour = startHour + 1;

  const hours: number[] = [];
  for (let h = startHour; h <= endHour; h++) {
    hours.push(h);
  }
  return hours;
}

/** 将秒数格式化为人类可读的时长标签（如 "5m"、"2h 30m"） */
export function getDurationLabel(durationSec: number): string {
  if (durationSec <= 0) return '时长未知';
  const minutes = Math.round(durationSec / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

// ===== 工具函数 =====
// 对应 v1 PySide6 中的 dur(), dt(), now(), now_s(), today() 等工具函数
import { formatLocalDate, formatLocalDateTime } from '../../shared/time';

/**
 * 获取当前时间（无微秒）
 */
export function now(): Date {
  const d = new Date();
  d.setMilliseconds(0);
  return d;
}

/**
 * 获取当前时间的 ISO 格式字符串 (YYYY-MM-DD HH:mm:ss)
 */
export function now_s(): string {
  return formatLocalDateTime(now());
}

/**
 * 获取今天的日期 (YYYY-MM-DD)
 */
export function today(): string {
  return formatLocalDate(now());
}

/**
 * 解析日期时间字符串为 Date 对象
 * 兼容多种格式: YYYY-MM-DD, YYYY-MM-DD HH:mm, YYYY-MM-DD HH:mm:ss
 */
export function dt(v: string): Date {
  let s = v.replace('T', ' ').trim();
  if (s.length === 10) s += ' 00:00:00';
  if (s.length === 16) s += ':00';
  return new Date(s);
}

/**
 * 时长格式化（秒 → 人类可读）
 * < 60min 显示 Xm，>= 60min 显示 X.Xh 或 Xh
 */
export function dur(sec: number): string {
  const m = Math.round(Math.max(0, sec) / 60);
  if (m < 60) return `${m}m`;
  if (m % 60 === 0) return `${m / 60}h`;
  return `${(m / 60).toFixed(1)}h`;
}

/**
 * 计算两个日期时间字符串之间的时长（秒）
 */
export function durationBetween(start: string, end: string): number {
  return (dt(end).getTime() - dt(start).getTime()) / 1000;
}

/**
 * 格式化为 YYYY-MM-DD HH:mm:ss (兼容 v1 数据库存储格式)
 */
export function formatDateTime(date: Date): string {
  return formatLocalDateTime(date);
}

/**
 * 格式化为 YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return formatLocalDate(date);
}

/**
 * 截断字符串到指定长度
 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

/**
 * 判断是否为有效的 UUID
 */
export function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

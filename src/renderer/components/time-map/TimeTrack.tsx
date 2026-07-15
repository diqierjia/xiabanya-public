import { ActivityBlock, type TimeMapItem } from './ActivityBlock';
import { computeBlockPosition } from './timeMapUtils';
import { parseUtcStorageDateTime } from '../../../shared/time';
import type { RefObject } from 'react';

interface TimeTrackProps {
  items: TimeMapItem[];
  visibleStartAt: string;
  pxPerMinute: number;
  showCurrentTime?: boolean;
  /** 滚动锚点 ref，在当前时间位置渲染一个 0px 高 div 供 scrollIntoView 定位 */
  nowRef?: RefObject<HTMLDivElement | null>;
  selectedId?: string | null;
  onSelect?: (item: TimeMapItem) => void;
}

/**
 * 计算从 visibleStartAt 到所有 items 中最晚结束时间的小时跨度，
 * 并返回容器总高度（px）。
 */
function computeTrackHeight(
  items: TimeMapItem[],
  visibleStartAt: string,
  pxPerMinute: number
): number {
  const visibleDate = parseUtcStorageDateTime(visibleStartAt);
  if (!visibleDate) return 0;

  const firstHour = visibleDate.getHours();
  let lastEndMinutes = firstHour * 60;

  for (const item of items) {
    if (item.kind === 'gap') continue;
    const itemDate = parseUtcStorageDateTime(item.startAt);
    if (!itemDate) continue;
    const endMinutes = itemDate.getHours() * 60 + itemDate.getMinutes() + item.durationSec / 60;
    if (endMinutes > lastEndMinutes) lastEndMinutes = endMinutes;
  }

  const lastEndHour = Math.ceil(lastEndMinutes / 60);
  return Math.max((lastEndHour - firstHour) * 60 * pxPerMinute, 60 * pxPerMinute);
}

/**
 * 计算当前时间在时间轴上的 Y 偏移。
 * 返回 null 表示当前时间不在可视范围内或不需显示。
 */
function computeCurrentTimeTop(
  visibleStartAt: string,
  pxPerMinute: number
): number | null {
  const visibleDate = parseUtcStorageDateTime(visibleStartAt);
  if (!visibleDate) return null;

  const now = new Date();
  const firstLocalMinutes = visibleDate.getHours() * 60 + visibleDate.getMinutes();
  const nowLocalMinutes = now.getHours() * 60 + now.getMinutes();

  // 检查是否同一天（简化判断：小时差不超过 24）
  const diffMinutes = nowLocalMinutes - firstLocalMinutes;
  if (diffMinutes < 0 || diffMinutes > 24 * 60) return null;

  return diffMinutes * pxPerMinute;
}

/**
 * 时间轴主轨道 —— iPad 日历风格日程视图。
 * 将 TimeMapItem 按时间绝对定位排列，gap 项跳过。
 */
export function TimeTrack({
  items,
  visibleStartAt,
  pxPerMinute,
  showCurrentTime = false,
  nowRef,
  selectedId,
  onSelect,
}: TimeTrackProps) {
  const totalHeight = computeTrackHeight(items, visibleStartAt, pxPerMinute);
  const currentTimeTop = showCurrentTime ? computeCurrentTimeTop(visibleStartAt, pxPerMinute) : null;

  // 过滤掉 gap 项
  const visibleItems = items.filter((item) => item.kind !== 'gap');

  return (
    <div className="relative bg-white" style={{ height: totalHeight }}>
      {/* 虚线小时网格背景线 */}
      {totalHeight > 0 && (
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: Math.ceil(totalHeight / (60 * pxPerMinute)) + 1 }).map((_, i) => {
            const top = i * 60 * pxPerMinute;
            return (
              <div
                key={i}
                className="absolute left-0 right-0 border-t border-dashed border-gray-100"
                style={{ top }}
              />
            );
          })}
        </div>
      )}

      {/* 活动块 */}
      {visibleItems.map((item) => {
        const { top, height } = computeBlockPosition(item.startAt, item.durationSec, visibleStartAt);
        return (
          <ActivityBlock
            key={item.id}
            item={item}
            selected={selectedId === item.id}
            onSelect={onSelect}
            style={{
              position: 'absolute',
              top,
              height,
              left: 8,
              right: 8,
            }}
          />
        );
      })}

      {/* 当前时间红线 */}
      {currentTimeTop !== null && (
        <>
          <div className="absolute left-0 right-0 pointer-events-none z-20" style={{ top: currentTimeTop }}>
            {/* 左侧小红点 */}
            <div className="absolute -left-1.5 -top-1.5 w-3 h-3 rounded-full bg-red-500" />
            {/* 红色横线 */}
            <div className="w-full border-t-2 border-red-500" />
          </div>
          {/* 滚动锚点：scrollIntoView 以此 div 为目标 */}
          {nowRef && <div ref={nowRef} className="absolute left-0 w-0 h-0" style={{ top: currentTimeTop }} />}
        </>
      )}
    </div>
  );
}

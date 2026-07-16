import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Trash2,
  AlertCircle,
  Search,
  Eye,
  Map as MapIcon,
  List,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { toast } from '../components/ui/Toast';
import { dur, truncate } from '../lib/utils';
import { useXiabanyaApi } from '../hooks/useXiabanyaApi';
import { useAppStore, MIN_TIMELINE_SCALE, MAX_TIMELINE_SCALE, TIMELINE_SCALE_STEP } from '../stores/useAppStore';
import type { IdlePeriod, VisionResultWithDuration } from '../../shared/types';
import {
  formatLocalDate,
  formatUtcStorageDateTime,
  formatUtcStorageTime,
  localDateFromUtcStorage,
  parseUtcStorageDateTime,
} from '../../shared/time';
import type { TimeMapItem } from '../components/time-map/ActivityBlock';
import { DetailPanel } from '../components/time-map/DetailPanel';
import { ACTIVITY_COLORS, getDurationLabel } from '../components/time-map/timeMapUtils';
import { areCategoriesCompatibleForMediumMerge, dominantCategoryByDuration } from '../components/time-map/segmentMergeRules';

type WeekDay = {
  dateStr: string;
  label: string;
  dayLabel: string;
  isToday: boolean;
  idleBands: TimeMapItem[];
  items: TimeMapItem[];
};

type TimedWeekItem = TimeMapItem & {
  startMs: number;
  endMs: number;
};

type TimelineAggregationLevel = 'activityType' | 'category' | 'detail';

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const TIMELINE_START_HOUR = 0;
const VISIBLE_END_HOUR = 24;
const DEFAULT_SCROLL_HOUR = 8;
const TIMELINE_TOP_PADDING = 14;
const MERGE_GAP_SEC = 5 * 60;
const IDLE_MERGE_GAP_SEC = 30 * 60;
const VISION_IDLE_ABSORB_GAP_SEC = 5 * 60;
const MAX_ABSORBABLE_VISION_IDLE_SEC = 10 * 60;
const MIN_BLOCK_HEIGHT = 18;
const ACTIVITY_TYPE_AGGREGATION_MAX_SCALE = 0.8;
const CATEGORY_AGGREGATION_MAX_SCALE = 2.5;
const ACTIVITY_TYPE_DISPLAY_MERGE_GAP_SEC = 20 * 60;
const CATEGORY_DISPLAY_MERGE_GAP_SEC = 10 * 60;

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  work: '工作活动',
  personal: '个人活动',
  unclear: '不确定活动',
};

const toTimeMapItem = (r: VisionResultWithDuration): TimeMapItem => ({
  id: r.id,
  title: r.title,
  category: r.category,
  startAt: r.created_at,
  durationSec: r.approx_duration_sec,
  observedFact: r.observed_fact || r.summary,
  possibleActivity: r.possible_activity || r.summary,
  confidence: r.confidence,
  activityType: r.activity_type,
  segmentMerge: r.segment_merge,
  app: r.app,
  windowTitle: r.window_title,
});

function startOfWeek(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + 1);
  return d;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addWeeks(dateStr: string, weeks: number): string {
  const next = new Date(`${dateStr}T00:00:00`);
  next.setDate(next.getDate() + weeks * 7);
  return formatLocalDate(next);
}

function getWeekRange(date = new Date()): { start: string; end: string } {
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  return { start: formatLocalDate(start), end: formatLocalDate(end) };
}

function weekDates(startDate: string): string[] {
  const start = new Date(`${startDate}T00:00:00`);
  return Array.from({ length: 7 }, (_, index) => formatLocalDate(addDays(start, index)));
}

function dayLabelForDate(dateStr: string): string {
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  return WEEKDAY_LABELS[day === 0 ? 6 : day - 1] || '';
}

function localBoundaryMs(dateStr: string, hour: number): number {
  const boundary = hour === 24
    ? new Date(`${dateStr}T00:00:00`)
    : new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00`);
  if (hour === 24) boundary.setDate(boundary.getDate() + 1);
  return boundary.getTime();
}

function fromMs(ms: number): string {
  return formatUtcStorageDateTime(new Date(ms));
}

function durationSec(startMs: number, endMs: number): number {
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

function endMsForItem(item: TimeMapItem): number | null {
  const start = parseUtcStorageDateTime(item.startAt);
  if (!start) return null;
  return start.getTime() + Math.max(0, item.durationSec) * 1000;
}

function getTimelineAggregationLevel(timelineScale: number): TimelineAggregationLevel {
  if (timelineScale <= ACTIVITY_TYPE_AGGREGATION_MAX_SCALE) return 'activityType';
  if (timelineScale <= CATEGORY_AGGREGATION_MAX_SCALE) return 'category';
  return 'detail';
}

function normalizeText(value?: string): string {
  return (value || '').trim().toLowerCase();
}

function textLooksRelated(a?: string, b?: string): boolean {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const leftTokens = new Set(left.split(/[\s,，。/\\|:：\-_*()[\]{}]+/).filter((token) => token.length >= 2));
  return right
    .split(/[\s,，。/\\|:：\-_*()[\]{}]+/)
    .filter((token) => token.length >= 2)
    .some((token) => leftTokens.has(token));
}

function clipRange(startMs: number, endMs: number, windowStartMs: number, windowEndMs: number) {
  const clippedStartMs = Math.max(startMs, windowStartMs);
  const clippedEndMs = Math.min(endMs, windowEndMs);
  if (clippedEndMs <= clippedStartMs) return null;
  return { startMs: clippedStartMs, endMs: clippedEndMs };
}

function idleOverlapsWindow(period: IdlePeriod, nowMs: number, windowStartMs: number, windowEndMs: number): boolean {
  const startMs = parseUtcStorageDateTime(period.start_at)?.getTime();
  if (!startMs) return false;
  const endMs = period.end_at ? parseUtcStorageDateTime(period.end_at)?.getTime() : nowMs;
  if (!endMs) return false;
  return startMs < windowEndMs && endMs > windowStartMs;
}

function toTimedIdle(period: IdlePeriod, nowMs: number, windowStartMs: number, windowEndMs: number): TimedWeekItem | null {
  const start = parseUtcStorageDateTime(period.start_at);
  if (!start) return null;
  const rawEndMs = period.end_at
    ? parseUtcStorageDateTime(period.end_at)?.getTime()
    : nowMs;
  if (!rawEndMs) return null;
  const clipped = clipRange(start.getTime(), rawEndMs, windowStartMs, windowEndMs);
  if (!clipped || durationSec(clipped.startMs, clipped.endMs) < 60) return null;
  return {
    id: `idle:${period.id}`,
    kind: 'idle',
    title: period.end_at ? '离开电脑' : '离开电脑中',
    category: '其他',
    startAt: fromMs(clipped.startMs),
    durationSec: durationSec(clipped.startMs, clipped.endMs),
    observedFact: '系统检测到键鼠长时间无输入。',
    possibleActivity: '这段时间按空闲处理，不推断为工作活动。',
    confidence: 'high',
    activityType: 'idle',
    startMs: clipped.startMs,
    endMs: clipped.endMs,
    evidenceItems: [],
  };
}

function toTimedActivity(item: TimeMapItem, windowStartMs: number, windowEndMs: number): TimedWeekItem | null {
  const start = parseUtcStorageDateTime(item.startAt);
  if (!start) return null;
  const rawStartMs = start.getTime();
  const rawEndMs = rawStartMs + Math.max(0, item.durationSec) * 1000;
  const clipped = clipRange(rawStartMs, rawEndMs, windowStartMs, windowEndMs);
  if (!clipped) return null;
  return {
    ...item,
    kind: 'activity',
    startAt: fromMs(clipped.startMs),
    durationSec: durationSec(clipped.startMs, clipped.endMs),
    startMs: clipped.startMs,
    endMs: clipped.endMs,
    evidenceItems: item.evidenceItems || [item],
  };
}

function canMergeActivity(previous: TimedWeekItem, current: TimedWeekItem): boolean {
  if (previous.kind !== 'activity' || current.kind !== 'activity') return false;
  if (current.startMs - previous.endMs > MERGE_GAP_SEC * 1000) return false;
  if ((previous.activityType || 'unclear') !== (current.activityType || 'unclear')) return false;
  if ((previous.activityType || 'unclear') === 'idle') return false;
  if ((previous.confidence || 'medium') === 'low' || (current.confidence || 'medium') === 'low') return false;

  const modelMerge = current.segmentMerge;
  if (modelMerge) {
    if (!modelMerge.should_merge) return false;
    if (modelMerge.confidence === 'high') return true;
    if (modelMerge.confidence === 'medium') {
      return areCategoriesCompatibleForMediumMerge(previous.category, current.category);
    }
    return false;
  }

  if (previous.category !== current.category) return false;
  if (normalizeText(previous.app) && normalizeText(previous.app) === normalizeText(current.app)) return true;
  return (
    textLooksRelated(previous.windowTitle, current.windowTitle) ||
    textLooksRelated(previous.possibleActivity || previous.title, current.possibleActivity || current.title)
  );
}

function mergeActivity(previous: TimedWeekItem, current: TimedWeekItem): TimedWeekItem {
  const evidenceItems = [...(previous.evidenceItems || [previous]), ...(current.evidenceItems || [current])];
  const summary = current.segmentMerge?.updated_segment_summary || current.possibleActivity || previous.possibleActivity || current.title;
  const sameTitle = previous.title === current.title;
  return {
    ...previous,
    id: `segment:${evidenceItems[0].id}:${evidenceItems[evidenceItems.length - 1].id}`,
    title: sameTitle ? previous.title : summary.slice(0, 34),
    category: dominantCategoryByDuration(evidenceItems),
    durationSec: durationSec(previous.startMs, current.endMs),
    observedFact: `${evidenceItems.length} 条截图证据合并为连续时间段。最近证据：${current.observedFact || current.title}`,
    possibleActivity: summary,
    confidence: previous.confidence === 'high' && current.confidence === 'high' ? 'high' : 'medium',
    app: previous.app === current.app ? previous.app : previous.app || current.app,
    windowTitle: current.windowTitle || previous.windowTitle,
    endMs: current.endMs,
    evidenceItems,
  };
}

function mergeDayItems(items: TimedWeekItem[]): TimedWeekItem[] {
  const merged: TimedWeekItem[] = [];
  for (const item of items) {
    const previous = merged[merged.length - 1];
    if (previous && canMergeActivity(previous, item)) {
      merged[merged.length - 1] = mergeActivity(previous, item);
    } else {
      merged.push(item);
    }
  }
  return merged;
}

function mergeIdleBands(items: TimedWeekItem[]): TimedWeekItem[] {
  const merged: TimedWeekItem[] = [];
  for (const item of items) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.kind === 'idle' &&
      item.kind === 'idle' &&
      item.startMs - previous.endMs <= IDLE_MERGE_GAP_SEC * 1000
    ) {
      const endMs = Math.max(previous.endMs, item.endMs);
      merged[merged.length - 1] = {
        ...previous,
        id: `idle-band:${previous.id}:${item.id}`,
        durationSec: durationSec(previous.startMs, endMs),
        endMs,
      };
    } else {
      merged.push(item);
    }
  }
  return merged;
}

function isAbsorbableVisionIdle(item: TimedWeekItem): boolean {
  return (
    item.kind === 'activity' &&
    (item.activityType || 'unclear') === 'idle' &&
    (item.confidence || 'medium') === 'low' &&
    item.durationSec <= MAX_ABSORBABLE_VISION_IDLE_SEC
  );
}

function idleBandDistanceSec(idle: TimedWeekItem, item: TimedWeekItem): number {
  if (item.endMs < idle.startMs) return Math.round((idle.startMs - item.endMs) / 1000);
  if (item.startMs > idle.endMs) return Math.round((item.startMs - idle.endMs) / 1000);
  return 0;
}

function nearestAbsorbableIdleIndex(idleItems: TimedWeekItem[], item: TimedWeekItem): number {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < idleItems.length; index += 1) {
    const distance = idleBandDistanceSec(idleItems[index], item);
    if (distance <= VISION_IDLE_ABSORB_GAP_SEC && distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

function absorbVisionIdleIntoIdleBands(
  idleItems: TimedWeekItem[],
  activityItems: TimedWeekItem[],
): { idleItems: TimedWeekItem[]; activityItems: TimedWeekItem[] } {
  if (idleItems.length === 0) return { idleItems, activityItems };

  const expandedIdleItems = idleItems.map((item) => ({ ...item }));
  const visibleActivityItems: TimedWeekItem[] = [];

  for (const item of activityItems) {
    const idleIndex = isAbsorbableVisionIdle(item)
      ? nearestAbsorbableIdleIndex(expandedIdleItems, item)
      : -1;
    if (idleIndex === -1) {
      visibleActivityItems.push(item);
      continue;
    }

    const idle = expandedIdleItems[idleIndex];
    const startMs = Math.min(idle.startMs, item.startMs);
    const endMs = Math.max(idle.endMs, item.endMs);
    expandedIdleItems[idleIndex] = {
      ...idle,
      id: `idle-band:${idle.id}:vision:${item.id}`,
      startAt: fromMs(startMs),
      durationSec: durationSec(startMs, endMs),
      observedFact: '系统检测到键鼠长时间无输入；相邻低置信桌面空闲截图已合并显示。',
      startMs,
      endMs,
      evidenceItems: [...(idle.evidenceItems || []), item],
    };
  }

  return {
    idleItems: mergeIdleBands(expandedIdleItems.sort((a, b) => a.startMs - b.startMs)),
    activityItems: visibleActivityItems,
  };
}

function flattenEvidence(item: TimeMapItem): TimeMapItem[] {
  return item.evidenceItems && item.evidenceItems.length > 0 ? item.evidenceItems : [item];
}

function toTimedDisplayItem(item: TimeMapItem): TimedWeekItem | null {
  const start = parseUtcStorageDateTime(item.startAt);
  const endMs = endMsForItem(item);
  if (!start || endMs === null || endMs <= start.getTime()) return null;
  return {
    ...item,
    startMs: start.getTime(),
    endMs,
    evidenceItems: flattenEvidence(item),
  };
}

function displayAggregationKey(item: TimedWeekItem, level: TimelineAggregationLevel): string {
  const activityType = item.activityType || 'unclear';
  if (level === 'activityType') return activityType;
  if (level === 'category') return `${activityType}:${item.category}`;
  return item.id;
}

function displayMergeGapSec(level: TimelineAggregationLevel): number {
  return level === 'activityType'
    ? ACTIVITY_TYPE_DISPLAY_MERGE_GAP_SEC
    : CATEGORY_DISPLAY_MERGE_GAP_SEC;
}

function canDisplayMerge(previous: TimedWeekItem, current: TimedWeekItem, level: TimelineAggregationLevel): boolean {
  if (level === 'detail') return false;
  if (previous.kind !== 'activity' || current.kind !== 'activity') return false;
  if (current.startMs - previous.endMs > displayMergeGapSec(level) * 1000) return false;
  return displayAggregationKey(previous, level) === displayAggregationKey(current, level);
}

function dominantCategory(items: TimeMapItem[]): TimeMapItem['category'] {
  const durations = new Map<TimeMapItem['category'], number>();
  for (const item of items) {
    durations.set(item.category, (durations.get(item.category) || 0) + Math.max(0, item.durationSec));
  }
  let best = items[0]?.category || '其他';
  let bestDuration = -1;
  for (const [category, duration] of durations) {
    if (duration > bestDuration) {
      best = category;
      bestDuration = duration;
    }
  }
  return best;
}

function mergedConfidence(items: TimeMapItem[]): TimeMapItem['confidence'] {
  if (items.some((item) => item.confidence === 'low')) return 'low';
  if (items.every((item) => item.confidence === 'high')) return 'high';
  return 'medium';
}

function displayAggregationTitle(item: TimedWeekItem, level: TimelineAggregationLevel, evidenceCount: number): string {
  if (level === 'activityType') {
    const label = ACTIVITY_TYPE_LABELS[item.activityType || 'unclear'] || `${item.activityType || 'unclear'}活动`;
    return `${label} · ${evidenceCount}条`;
  }
  return `${item.category} · ${evidenceCount}条`;
}

function mergeDisplayItems(previous: TimedWeekItem, current: TimedWeekItem, level: TimelineAggregationLevel): TimedWeekItem {
  const evidenceItems = [...flattenEvidence(previous), ...flattenEvidence(current)];
  const endMs = Math.max(previous.endMs, current.endMs);
  const firstEvidence = evidenceItems[0];
  const lastEvidence = evidenceItems[evidenceItems.length - 1];
  const title = displayAggregationTitle(previous, level, evidenceItems.length);
  const sameApp = evidenceItems.every((item) => item.app && item.app === firstEvidence.app);

  return {
    ...previous,
    id: `display:${level}:${displayAggregationKey(previous, level)}:${firstEvidence.id}:${lastEvidence.id}`,
    title,
    category: level === 'activityType' ? dominantCategory(evidenceItems) : previous.category,
    durationSec: durationSec(previous.startMs, endMs),
    observedFact: `${evidenceItems.length} 条截图证据按${level === 'activityType' ? '活动类型' : '分类'}聚合显示。最近证据：${current.observedFact || current.title}`,
    possibleActivity: `${formatUtcStorageTime(previous.startAt)} - ${formatItemEnd({ ...previous, durationSec: durationSec(previous.startMs, endMs) })} 的${title}`,
    confidence: mergedConfidence(evidenceItems),
    app: sameApp ? firstEvidence.app : undefined,
    windowTitle: current.windowTitle || previous.windowTitle,
    endMs,
    evidenceItems,
  };
}

function aggregateTimelineItems(items: TimeMapItem[], timelineScale: number): TimeMapItem[] {
  const level = getTimelineAggregationLevel(timelineScale);
  if (level === 'detail') return items;

  const merged: TimedWeekItem[] = [];
  const sorted = items
    .map(toTimedDisplayItem)
    .filter((item): item is TimedWeekItem => item !== null)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  for (const item of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && canDisplayMerge(previous, item, level)) {
      merged[merged.length - 1] = mergeDisplayItems(previous, item, level);
    } else {
      const evidenceItems = flattenEvidence(item);
      const hasAggregatedEvidence = evidenceItems.length > 1;
      merged.push({
        ...item,
        id: `display:${level}:${displayAggregationKey(item, level)}:${item.id}`,
        title: hasAggregatedEvidence ? displayAggregationTitle(item, level, evidenceItems.length) : item.title,
        category: level === 'activityType' && hasAggregatedEvidence ? dominantCategory(evidenceItems) : item.category,
        observedFact: hasAggregatedEvidence
          ? `${evidenceItems.length} 条截图证据按${level === 'activityType' ? '活动类型' : '分类'}聚合显示。`
          : item.observedFact,
        evidenceItems,
      });
    }
  }

  return merged.map(({ startMs: _startMs, endMs: _endMs, ...item }) => item);
}

function buildWeekDayItems(dateStr: string, activities: TimeMapItem[], idlePeriods: IdlePeriod[], now = new Date()): WeekDay {
  const windowStartMs = localBoundaryMs(dateStr, TIMELINE_START_HOUR);
  const windowEndMs = localBoundaryMs(dateStr, VISIBLE_END_HOUR);
  const nowMs = now.getTime();
  const dayResults = activities.filter((item) => localDateFromUtcStorage(item.startAt) === dateStr);
  const dayIdle = idlePeriods.filter((item) => idleOverlapsWindow(item, nowMs, windowStartMs, windowEndMs));
  const idleItems = mergeIdleBands(dayIdle
    .map((period) => toTimedIdle(period, nowMs, windowStartMs, windowEndMs))
    .filter((item): item is TimedWeekItem => item !== null)
    .sort((a, b) => a.startMs - b.startMs));
  const activityItems = dayResults
    .map((item) => toTimedActivity(item, windowStartMs, windowEndMs))
    .filter((item): item is TimedWeekItem => item !== null);
  const absorbed = absorbVisionIdleIntoIdleBands(idleItems, activityItems);
  const items = mergeDayItems([...absorbed.activityItems, ...absorbed.idleItems].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs));

  return {
    dateStr,
    label: dateStr.slice(5).replace('-', '/'),
    dayLabel: dayLabelForDate(dateStr),
    isToday: dateStr === formatLocalDate(now),
    idleBands: absorbed.idleItems.map(({ startMs: _startMs, endMs: _endMs, ...item }) => item),
    items: items
      .filter((item) => item.kind !== 'idle')
      .map(({ startMs: _startMs, endMs: _endMs, ...item }) => item),
  };
}

function itemPosition(item: TimeMapItem, pxPerMinute: number, startHour: number): { top: number; height: number } {
  const start = parseUtcStorageDateTime(item.startAt);
  if (!start) return { top: TIMELINE_TOP_PADDING, height: MIN_BLOCK_HEIGHT };
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const top = TIMELINE_TOP_PADDING + Math.max(0, (startMinutes - startHour * 60) * pxPerMinute);
  const height = Math.max((item.durationSec / 60) * pxPerMinute, MIN_BLOCK_HEIGHT);
  return { top, height };
}

function formatItemEnd(item: TimeMapItem): string {
  const start = parseUtcStorageDateTime(item.startAt);
  if (!start || item.durationSec <= 0) return '';
  return formatUtcStorageTime(formatUtcStorageDateTime(new Date(start.getTime() + item.durationSec * 1000)));
}

function WeekTimelineBlock({
  item,
  selected,
  pxPerMinute,
  startHour,
  onSelect,
}: {
  item: TimeMapItem;
  selected: boolean;
  pxPerMinute: number;
  startHour: number;
  onSelect: (item: TimeMapItem) => void;
}) {
  const { top, height } = itemPosition(item, pxPerMinute, startHour);
  const colorKey = item.kind === 'idle' ? 'idle' : item.activityType || 'unclear';
  const colors = ACTIVITY_COLORS[colorKey] || ACTIVITY_COLORS.unclear;
  const startTime = formatUtcStorageTime(item.startAt);
  const endTime = formatItemEnd(item);
  const evidenceCount = item.evidenceItems?.length || 0;
  const isSmall = height < 34;
  const isIdle = item.kind === 'idle';

  return (
    <button
      type="button"
      title={`${startTime}${endTime ? ` - ${endTime}` : ''} · ${getDurationLabel(item.durationSec)} · ${item.title}`}
      onClick={() => onSelect(item)}
      className={`animate-timeline-block-in absolute left-1 right-1 z-10 overflow-hidden text-left shadow-sm transition ${
        selected ? 'ring-2 ring-brand-500 ring-offset-1' : 'hover:shadow-md'
      }`}
      style={{
        top,
        height,
        minHeight: MIN_BLOCK_HEIGHT,
        borderRadius: 6,
        border: isIdle ? `1px dashed ${colors.border}` : `1px solid ${colors.border}`,
        backgroundColor: isIdle ? 'rgba(243,244,246,0.72)' : colors.bg,
        color: colors.text,
        transition: 'top 180ms ease, height 180ms ease, background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease',
        willChange: 'top, height',
      }}
    >
      {isSmall ? (
        <div className="flex h-full items-center gap-1 px-1.5">
          <span className="text-[10px] text-gray-500">{startTime}</span>
          <span className="min-w-0 truncate text-[10px] font-medium">{item.title}</span>
        </div>
      ) : (
        <div className="px-2 py-1">
          <div className="flex items-center gap-1 text-[10px] text-gray-500">
            <span>{startTime}</span>
            {endTime && <span>- {endTime}</span>}
            <span>· {getDurationLabel(item.durationSec)}</span>
          </div>
          <div className="mt-0.5 truncate text-[11px] font-semibold leading-tight">{item.title}</div>
          {height >= 58 && (
            <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-500">
              <span className="truncate">{item.app || item.activityType || 'unclear'}</span>
              {evidenceCount > 1 && <span className="shrink-0">· {evidenceCount}条</span>}
            </div>
          )}
        </div>
      )}
    </button>
  );
}

function WeekIdleBand({
  item,
  selected,
  pxPerMinute,
  startHour,
  onSelect,
}: {
  item: TimeMapItem;
  selected: boolean;
  pxPerMinute: number;
  startHour: number;
  onSelect: (item: TimeMapItem) => void;
}) {
  const { top, height } = itemPosition(item, pxPerMinute, startHour);
  const startTime = formatUtcStorageTime(item.startAt);
  const endTime = formatItemEnd(item);

  return (
    <button
      type="button"
      title={`${startTime}${endTime ? ` - ${endTime}` : ''} · 离开电脑`}
      onClick={() => onSelect(item)}
      className={`animate-timeline-block-in absolute left-1 right-1 z-0 overflow-hidden rounded-md border border-dashed bg-gray-50/80 text-left transition ${
        selected ? 'border-gray-500 ring-2 ring-gray-300' : 'border-gray-300 hover:bg-gray-100'
      }`}
      style={{
        top,
        height,
        minHeight: MIN_BLOCK_HEIGHT,
        transition: 'top 180ms ease, height 180ms ease, background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease',
        willChange: 'top, height',
      }}
    >
      <div className="px-2 py-1 text-[10px] leading-tight text-gray-500">
        <span>{startTime}</span>
        {endTime && <span> - {endTime}</span>}
        <span> · {getDurationLabel(item.durationSec)}</span>
      </div>
      {height >= 42 && (
        <div className="px-2 text-[11px] font-medium leading-tight text-gray-700">
          离开电脑
        </div>
      )}
    </button>
  );
}

function WeekTimeline({
  days,
  weekStart,
  selectedId,
  timelineScale,
  now,
  onZoomIn,
  onZoomOut,
  onSelect,
}: {
  days: WeekDay[];
  weekStart: string;
  selectedId: string | null;
  timelineScale: number;
  now: Date;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSelect: (item: TimeMapItem) => void;
}) {
  const pxPerMinute = timelineScale;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timelineStartHour = useMemo(() => {
    const earliestHour = Math.min(...days.flatMap((day) => [...day.idleBands, ...day.items]
      .map((item) => parseUtcStorageDateTime(item.startAt)?.getHours())
      .filter((hour): hour is number => hour !== undefined)));
    return Number.isFinite(earliestHour) ? Math.min(DEFAULT_SCROLL_HOUR, earliestHour) : DEFAULT_SCROLL_HOUR;
  }, [days]);
  const trackHeight = TIMELINE_TOP_PADDING + (VISIBLE_END_HOUR - timelineStartHour) * 60 * pxPerMinute;
  const currentTimeTop =
    now.getHours() >= timelineStartHour && now.getHours() < VISIBLE_END_HOUR
      ? TIMELINE_TOP_PADDING + ((now.getHours() - timelineStartHour) * 60 + now.getMinutes()) * pxPerMinute
      : null;

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = TIMELINE_TOP_PADDING + (DEFAULT_SCROLL_HOUR - timelineStartHour) * 60 * pxPerMinute;
  }, [timelineStartHour, weekStart]);

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute right-2 top-2 z-30 flex items-center gap-1 rounded-lg border border-gray-200 bg-white/90 p-1 shadow-sm backdrop-blur">
        <Button
          variant="ghost"
          size="sm"
          icon={ZoomOut}
          onClick={onZoomOut}
          disabled={timelineScale <= MIN_TIMELINE_SCALE}
          className="h-7 w-7 p-0"
          title="纵向缩小"
          aria-label="纵向缩小时间轴"
        />
        <Button
          variant="ghost"
          size="sm"
          icon={ZoomIn}
          onClick={onZoomIn}
          disabled={timelineScale >= MAX_TIMELINE_SCALE}
          className="h-7 w-7 p-0"
          title="纵向拉伸"
          aria-label="纵向拉伸时间轴"
        />
      </div>
      <div className="grid grid-cols-[60px_repeat(7,minmax(128px,1fr))] border-b border-gray-200 bg-white">
        <div className="px-2 py-3 text-xs text-gray-400">全天</div>
        {days.map((day) => (
          <div
            key={day.dateStr}
            className={`border-l border-gray-200 px-2 py-2 ${day.isToday ? 'bg-brand-50' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-gray-500">{day.dayLabel}</div>
                <div className="text-sm font-semibold text-gray-900">{day.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        ref={scrollContainerRef}
        className="max-h-[calc(100vh-250px)] overflow-auto"
        onWheel={(event) => {
          if (!event.ctrlKey || event.deltaY === 0) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.deltaY < 0) onZoomIn();
          else onZoomOut();
        }}
      >
        <div className="grid min-w-[1020px] grid-cols-[60px_repeat(7,minmax(128px,1fr))]">
          <div className="relative bg-white" style={{ height: trackHeight }}>
            {Array.from({ length: VISIBLE_END_HOUR - timelineStartHour + 1 }, (_, index) => {
              const hour = timelineStartHour + index;
              return (
                <div
                  key={hour}
                  className="absolute right-2 -translate-y-2 text-[11px] text-gray-400"
                  style={{ top: TIMELINE_TOP_PADDING + index * 60 * pxPerMinute }}
                >
                  {String(hour).padStart(2, '0')}:00
                </div>
              );
            })}
          </div>
          {days.map((day) => (
            <div
              key={day.dateStr}
              className={`relative border-l border-gray-200 bg-white ${day.isToday ? 'bg-brand-50/30' : ''}`}
              style={{ height: trackHeight }}
            >
              {Array.from({ length: VISIBLE_END_HOUR - timelineStartHour + 1 }, (_, index) => (
                <div
                  key={index}
                  className="absolute left-0 right-0 border-t border-dashed border-gray-200"
                  style={{ top: TIMELINE_TOP_PADDING + index * 60 * pxPerMinute }}
                />
              ))}
              {day.isToday && currentTimeTop !== null && (
                <div className="absolute left-0 right-0 z-20 border-t-2 border-red-500" style={{ top: currentTimeTop }} />
              )}
              {day.idleBands.map((item) => (
                <WeekIdleBand
                  key={item.id}
                  item={item}
                  selected={selectedId === item.id}
                  pxPerMinute={pxPerMinute}
                  startHour={timelineStartHour}
                  onSelect={onSelect}
                />
              ))}
              {day.items.map((item) => (
                <WeekTimelineBlock
                  key={item.id}
                  item={item}
                  selected={selectedId === item.id}
                  pxPerMinute={pxPerMinute}
                  startHour={timelineStartHour}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function TimelinePage() {
  const api = useXiabanyaApi();
  const { timelineScale, adjustTimelineScale } = useAppStore();
  const initialWeek = useMemo(() => getWeekRange(), []);
  const fetchSeqRef = useRef(0);
  const [results, setResults] = useState<VisionResultWithDuration[]>([]);
  const [idlePeriods, setIdlePeriods] = useState<IdlePeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [startDate, setStartDate] = useState(initialWeek.start);
  const [endDate, setEndDate] = useState(initialWeek.end);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedTimeMapId, setSelectedTimeMapId] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'table'>('map');
  const [showDelete, setShowDelete] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const fetchResults = useCallback(async (options?: { silent?: boolean }) => {
    const seq = ++fetchSeqRef.current;
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
      setError(false);
    }
    try {
      const data = await api.vision.listByDate({
        start: startDate,
        end: endDate,
        q: search || undefined,
        limit: 1000,
      });
      const idle = await api.idle.listByDate({
        start: startDate,
        end: endDate,
        limit: 1000,
      });
      if (seq !== fetchSeqRef.current) return;
      setResults(data);
      setIdlePeriods(idle);
    } catch (e: unknown) {
      if (seq !== fetchSeqRef.current) return;
      setError(true);
      const msg = e instanceof Error ? e.message : '加载失败';
      if (!silent) toast.error(`加载时间线失败: ${msg}`);
    } finally {
      if (seq === fetchSeqRef.current && !silent) setLoading(false);
    }
  }, [api, startDate, endDate, search]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  useEffect(() => {
    const unsub = api.vision.onResult((result) => {
      const resultDate = localDateFromUtcStorage(result.created_at);
      if (resultDate >= startDate && resultDate <= endDate) {
        fetchResults({ silent: true });
      }
    });
    return unsub;
  }, [api, endDate, fetchResults, startDate]);

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
      fetchResults({ silent: true });
    }, 15 * 1000);
    return () => clearInterval(id);
  }, [fetchResults]);

  const setWeekByStart = (weekStart: string) => {
    setStartDate(weekStart);
    const end = new Date(`${weekStart}T00:00:00`);
    end.setDate(end.getDate() + 6);
    setEndDate(formatLocalDate(end));
    setSelectedTimeMapId(null);
  };

  const setWeekByDate = (dateStr: string) => {
    const range = getWeekRange(new Date(`${dateStr}T00:00:00`));
    setStartDate(range.start);
    setEndDate(range.end);
    setSelectedTimeMapId(null);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const batchDelete = async () => {
    try {
      for (const id of selected) {
        await api.vision.deleteResult(id);
      }
      toast.success(`已删除 ${selected.size} 条 Vision 结果`);
      setSelected(new Set());
      setShowDelete(false);
      fetchResults();
    } catch {
      toast.error('删除失败');
    }
  };

  const timelineActivities = useMemo<TimeMapItem[]>(
    () => results.map(toTimeMapItem),
    [results],
  );

  const weekDays = useMemo<WeekDay[]>(
    () => weekDates(startDate).map((dateStr) => buildWeekDayItems(dateStr, timelineActivities, idlePeriods, now)),
    [startDate, timelineActivities, idlePeriods, now],
  );

  const displayWeekDays = useMemo<WeekDay[]>(
    () => weekDays.map((day) => ({
      ...day,
      items: aggregateTimelineItems(day.items, timelineScale),
    })),
    [timelineScale, weekDays],
  );

  const allTimeMapItems = useMemo(
    () => displayWeekDays.flatMap((day) => [...day.idleBands, ...day.items]),
    [displayWeekDays],
  );

  useEffect(() => {
    if (!selectedTimeMapId && allTimeMapItems.length > 0) {
      setSelectedTimeMapId(allTimeMapItems[0].id);
    }
    if (
      selectedTimeMapId &&
      allTimeMapItems.length > 0 &&
      !allTimeMapItems.some((item) => item.id === selectedTimeMapId)
    ) {
      setSelectedTimeMapId(allTimeMapItems[0].id);
    }
    if (allTimeMapItems.length === 0 && selectedTimeMapId) {
      setSelectedTimeMapId(null);
    }
  }, [selectedTimeMapId, allTimeMapItems]);

  const selectedTimeMapItem = selectedTimeMapId
    ? allTimeMapItems.find((item) => item.id === selectedTimeMapId) ?? null
    : null;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1.5">
          <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={() => setWeekByStart(addWeeks(startDate, -1))} />
          <div className="min-w-44 text-center">
            <div className="text-sm font-semibold text-gray-900">
              {startDate.slice(5).replace('-', '/')} - {endDate.slice(5).replace('-', '/')}
            </div>
            <div className="text-[11px] text-gray-400">周一到周日 · 08:00-24:00</div>
          </div>
          <Button variant="ghost" size="sm" icon={ChevronRight} onClick={() => setWeekByStart(addWeeks(startDate, 1))} />
          <Button variant="secondary" size="sm" icon={CalendarDays} onClick={() => setWeekByDate(formatLocalDate())}>
            本周
          </Button>
        </div>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setWeekByDate(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          title="选择任意一天，跳转到所在周"
        />
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题/事实/分类..."
            className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm w-56"
          />
        </div>
        <div className="flex gap-2 ml-auto">
          <Button
            variant={view === 'map' ? 'success' : 'secondary'}
            size="sm"
            icon={MapIcon}
            onClick={() => setView('map')}
          >
            周视图
          </Button>
          <Button
            variant={view === 'table' ? 'success' : 'secondary'}
            size="sm"
            icon={List}
            onClick={() => setView('table')}
          >
            管理列表
          </Button>
        </div>
      </div>

      {/* Batch Actions */}
      {selected.size > 0 && (
        <div className="bg-brand-50 border border-brand-200 rounded-lg px-4 py-2 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-brand-700">已选 {selected.size} 条</span>
          <Button
            variant="danger"
            size="sm"
            icon={Trash2}
            onClick={() => setShowDelete(true)}
            className="ml-auto"
          >
            删除
          </Button>
        </div>
      )}

      {/* Content States */}
      {loading ? (
        <Card className="p-5">
          <Skeleton.List count={8} />
        </Card>
      ) : error ? (
        <EmptyState
          icon={AlertCircle}
          title="加载失败"
          description="请检查后重试"
          actionLabel="重试"
          onAction={fetchResults}
        />
      ) : results.length === 0 && idlePeriods.length === 0 ? (
        <EmptyState
          icon={Eye}
          title="本周无 AI 识别结果"
          description="尝试切换周次，或确认 Vision Auto 正在运行"
        />
      ) : view === 'map' ? (
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-4">
          <WeekTimeline
            days={displayWeekDays}
            weekStart={startDate}
            selectedId={selectedTimeMapId}
            timelineScale={timelineScale}
            now={now}
            onZoomIn={() => adjustTimelineScale(TIMELINE_SCALE_STEP)}
            onZoomOut={() => adjustTimelineScale(-TIMELINE_SCALE_STEP)}
            onSelect={(item) => setSelectedTimeMapId(item.id)}
          />
          <DetailPanel item={selectedTimeMapItem} />
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2 text-left">时间</th>
                  <th className="px-3 py-2 text-left">分类</th>
                  <th className="px-3 py-2 text-left">标题</th>
                  <th className="px-3 py-2 text-left">观察事实</th>
                  <th className="px-3 py-2 text-left">置信/类型</th>
                  <th className="px-3 py-2 text-left">时长</th>
                  <th className="px-3 py-2 text-left">模型</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-gray-100 hover:bg-gray-50 hover:border-l-2 hover:border-l-brand-400 transition-colors"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
                      {r.created_at
                        ? formatUtcStorageTime(r.created_at, true)
                        : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <Badge category={r.category} />
                    </td>
                    <td className="px-3 py-2 text-gray-800 truncate max-w-[200px]">
                      {r.title}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs max-w-[280px] truncate">
                      {truncate(r.observed_fact || r.summary || '', 70)}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
                      {(r.confidence || '-') + ' / ' + (r.activity_type || '-')}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {r.approx_duration_sec > 0 ? dur(r.approx_duration_sec) : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-xs">
                      {r.model?.split('/').pop() || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={showDelete}
        title="删除 Vision 结果"
        message={`确认删除 ${selected.size} 条 AI 识别结果？此操作不可撤销。`}
        onConfirm={batchDelete}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}

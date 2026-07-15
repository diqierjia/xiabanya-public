import type { IdlePeriod } from '../../../shared/types';
import { formatUtcStorageDateTime, parseUtcStorageDateTime } from '../../../shared/time';
import type { TimeMapItem } from './ActivityBlock';
import { areCategoriesCompatibleForMediumMerge, dominantCategoryByDuration } from './segmentMergeRules';

const MAX_CONTINUITY_GAP_SEC = 120;
const MIN_VISIBLE_IDLE_SEC = 60;
const MIN_GAP_SEC = 10 * 60;
const DEFAULT_WORK_START_HOUR = 8;

interface BuildTimeMapSegmentsOptions {
  visibleStartAt?: string;
  visibleEndAt?: string;
}

export interface TimeMapVisibleWindow {
  visibleStartAt: string;
  visibleEndAt?: string;
}

interface TimedItem extends TimeMapItem {
  startMs: number;
  endMs: number;
}

function toMs(value: string): number | null {
  return parseUtcStorageDateTime(value)?.getTime() ?? null;
}

function fromMs(value: number): string {
  return formatUtcStorageDateTime(new Date(value));
}

function durationSec(startMs: number, endMs: number): number {
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

export function getTimeMapVisibleWindow(
  localDate: string,
  _activityItems: TimeMapItem[],
  _now = new Date()
): TimeMapVisibleWindow {
  const visibleStart = new Date(`${localDate}T${String(DEFAULT_WORK_START_HOUR).padStart(2, '0')}:00:00`);
  const visibleEnd = new Date(`${localDate}T00:00:00`);
  visibleEnd.setDate(visibleEnd.getDate() + 1);

  return {
    visibleStartAt: formatUtcStorageDateTime(visibleStart),
    visibleEndAt: formatUtcStorageDateTime(visibleEnd),
  };
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
  const rightTokens = right.split(/[\s,，。/\\|:：\-_*()[\]{}]+/).filter((token) => token.length >= 2);
  return rightTokens.some((token) => leftTokens.has(token));
}

function clipRange(startMs: number, endMs: number, visibleStartMs?: number, visibleEndMs?: number): { startMs: number; endMs: number } | null {
  const clippedStartMs = visibleStartMs === undefined ? startMs : Math.max(startMs, visibleStartMs);
  const clippedEndMs = visibleEndMs === undefined ? endMs : Math.min(endMs, visibleEndMs);
  if (clippedEndMs <= clippedStartMs) return null;
  return { startMs: clippedStartMs, endMs: clippedEndMs };
}

function toTimedActivity(item: TimeMapItem, visibleStartMs?: number, visibleEndMs?: number): TimedItem | null {
  const originalStartMs = toMs(item.startAt);
  if (originalStartMs === null) return null;
  const rawEndMs = originalStartMs + Math.max(0, item.durationSec) * 1000;
  const clipped = clipRange(originalStartMs, rawEndMs, visibleStartMs, visibleEndMs);
  if (!clipped) return null;
  const { startMs, endMs } = clipped;
  const clippedDuration = durationSec(startMs, endMs);
  if (clippedDuration <= 0) return null;
  return {
    ...item,
    kind: 'activity',
    startAt: fromMs(startMs),
    durationSec: clippedDuration,
    startMs,
    endMs,
    evidenceItems: item.evidenceItems || [item],
  };
}

function idleToTimedItem(period: IdlePeriod, nowMs: number, visibleStartMs?: number, visibleEndMs?: number): TimedItem | null {
  const originalStartMs = toMs(period.start_at);
  if (originalStartMs === null) return null;
  const rawEndMs = period.end_at ? toMs(period.end_at) : nowMs;
  if (rawEndMs === null) return null;
  const clipped = clipRange(originalStartMs, rawEndMs, visibleStartMs, visibleEndMs);
  if (!clipped) return null;
  const { startMs, endMs } = clipped;
  const sec = durationSec(startMs, endMs);
  if (sec < MIN_VISIBLE_IDLE_SEC) return null;
  return {
    id: `idle:${period.id}`,
    kind: 'idle',
    title: period.end_at ? '离开电脑' : '离开电脑中',
    category: '其他',
    startAt: fromMs(startMs),
    durationSec: sec,
    observedFact: '系统检测到键鼠长时间无输入。',
    possibleActivity: '这段时间应按空闲处理，不推断为工作活动。',
    confidence: 'high',
    activityType: 'idle',
    startMs,
    endMs,
    evidenceItems: [],
  };
}

function createGapItem(startMs: number, endMs: number, index: number): TimedItem {
  return {
    id: `gap:${startMs}:${index}`,
    kind: 'gap',
    title: '未记录',
    category: '其他',
    startAt: fromMs(startMs),
    durationSec: durationSec(startMs, endMs),
    observedFact: '这段时间没有可用的截图识别或空闲记录。',
    possibleActivity: '可能是采集暂停、应用未记录或数据缺失，需要用户确认。',
    confidence: 'low',
    activityType: 'unclear',
    startMs,
    endMs,
    evidenceItems: [],
  };
}

function canMergeActivity(previous: TimedItem, current: TimedItem): boolean {
  if (previous.kind !== 'activity' || current.kind !== 'activity') return false;
  if (current.startMs - previous.endMs > MAX_CONTINUITY_GAP_SEC * 1000) return false;
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
  return textLooksRelated(previous.possibleActivity || previous.title, current.possibleActivity || current.title);
}

function mergeActivity(previous: TimedItem, current: TimedItem): TimedItem {
  const evidenceItems = [...(previous.evidenceItems || [previous]), ...(current.evidenceItems || [current])];
  const summary = current.segmentMerge?.updated_segment_summary || current.possibleActivity || previous.possibleActivity || current.title;
  const sameTitle = previous.title === current.title;
  return {
    ...previous,
    id: `segment:${evidenceItems[0].id}:${evidenceItems[evidenceItems.length - 1].id}`,
    title: sameTitle ? previous.title : summary.slice(0, 30),
    category: dominantCategoryByDuration(evidenceItems),
    durationSec: durationSec(previous.startMs, current.endMs),
    observedFact: evidenceItems.length > 1
      ? `${evidenceItems.length} 条截图证据合并为连续时间段。最近证据：${current.observedFact || current.title}`
      : current.observedFact || previous.observedFact,
    possibleActivity: summary,
    confidence: previous.confidence === 'high' && current.confidence === 'high' ? 'high' : 'medium',
    app: previous.app === current.app ? previous.app : previous.app || current.app,
    windowTitle: current.windowTitle || previous.windowTitle,
    endMs: current.endMs,
    evidenceItems,
  };
}

function addGapItems(items: TimedItem[], visibleStartMs?: number): TimedItem[] {
  if (items.length === 0) return [];
  const withGaps: TimedItem[] = [];
  let previousEnd: number | null = visibleStartMs ?? null;
  for (const item of items) {
    if (previousEnd !== null && item.startMs > previousEnd) {
      const gapSec = durationSec(previousEnd, item.startMs);
      if (gapSec >= MIN_GAP_SEC) {
        withGaps.push(createGapItem(previousEnd, item.startMs, withGaps.length));
      }
    }
    withGaps.push(item);
    previousEnd = Math.max(previousEnd ?? item.endMs, item.endMs);
  }
  return withGaps;
}

export function buildTimeMapSegments(
  activityItems: TimeMapItem[],
  idlePeriods: IdlePeriod[] = [],
  now = new Date(),
  options: BuildTimeMapSegmentsOptions = {}
): TimeMapItem[] {
  const nowMs = now.getTime();
  const visibleStartMs = options.visibleStartAt ? toMs(options.visibleStartAt) ?? undefined : undefined;
  const visibleEndMs = options.visibleEndAt ? toMs(options.visibleEndAt) ?? undefined : undefined;
  const idleItems = idlePeriods
    .map((period) => idleToTimedItem(period, nowMs, visibleStartMs, visibleEndMs))
    .filter((item): item is TimedItem => item !== null)
    .sort((a, b) => a.startMs - b.startMs);

  const activities = activityItems
    .map((item) => toTimedActivity(item, visibleStartMs, visibleEndMs))
    .filter((item): item is TimedItem => item !== null);

  const baseItems = [...activities, ...idleItems].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const timelineItems = addGapItems(baseItems, visibleStartMs);
  const merged: TimedItem[] = [];

  for (const item of timelineItems) {
    const previous = merged[merged.length - 1];
    if (previous && canMergeActivity(previous, item)) {
      merged[merged.length - 1] = mergeActivity(previous, item);
    } else {
      merged.push(item);
    }
  }

  return merged.map(({ startMs: _startMs, endMs: _endMs, ...item }) => item);
}

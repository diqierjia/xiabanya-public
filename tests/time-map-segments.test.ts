import { describe, expect, it } from 'vitest';
import { buildTimeMapSegments, getTimeMapVisibleWindow } from '../src/renderer/components/time-map/buildTimeMapSegments';
import type { TimeMapItem } from '../src/renderer/components/time-map/ActivityBlock';
import type { IdlePeriod } from '../src/shared/types';
import { parseUtcStorageDateTime } from '../src/shared/time';

function activity(id: string, startAt: string, overrides: Partial<TimeMapItem> = {}): TimeMapItem {
  return {
    id,
    title: overrides.title || '编辑代码',
    category: overrides.category || '代码开发',
    startAt,
    durationSec: overrides.durationSec ?? 300,
    observedFact: overrides.observedFact || '代码编辑器中可见 TypeScript 文件。',
    possibleActivity: overrides.possibleActivity || '可能在继续开发时间地图功能。',
    confidence: overrides.confidence || 'high',
    activityType: overrides.activityType || 'work',
    app: overrides.app || 'Code',
    windowTitle: overrides.windowTitle || 'TimeMap.tsx',
    segmentMerge: overrides.segmentMerge,
  };
}

describe('buildTimeMapSegments()', () => {
  it('merges adjacent activities when the model marks them as the same segment', () => {
    const segments = buildTimeMapSegments([
      activity('a', '2026-07-08 01:00:00'),
      activity('b', '2026-07-08 01:05:00', {
        title: '调整时间地图',
        segmentMerge: {
          should_merge: true,
          confidence: 'high',
          reason: '仍在处理同一个时间地图功能',
          current_activity: '调整时间地图',
          updated_segment_summary: '继续开发时间地图聚合与展示',
        },
      }),
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0].durationSec).toBe(600);
    expect(segments[0].evidenceItems).toHaveLength(2);
    expect(segments[0].possibleActivity).toBe('继续开发时间地图聚合与展示');
  });

  it('lets a high-confidence model merge cross category segments', () => {
    const segments = buildTimeMapSegments([
      activity('a', '2026-07-08 01:00:00', {
        category: '代码开发',
        durationSec: 120,
      }),
      activity('b', '2026-07-08 01:04:00', {
        title: '查技术文档',
        category: '文献与阅读',
        durationSec: 300,
        app: 'Chrome',
        segmentMerge: {
          should_merge: true,
          confidence: 'high',
          reason: '查文档是当前代码任务的一部分',
          current_activity: '查技术文档',
          updated_segment_summary: '继续开发并查阅技术文档',
        },
      }),
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0].category).toBe('文献与阅读');
    expect(segments[0].evidenceItems).toHaveLength(2);
  });

  it('allows medium-confidence model merges only for compatible categories', () => {
    const segments = buildTimeMapSegments([
      activity('a', '2026-07-08 01:00:00', {
        category: '代码开发',
      }),
      activity('b', '2026-07-08 01:05:00', {
        title: '查资料',
        category: '检索与AI',
        app: 'Chrome',
        segmentMerge: {
          should_merge: true,
          confidence: 'medium',
          reason: '可能是在同一开发任务中检索资料',
          current_activity: '查资料',
          updated_segment_summary: '继续开发并检索资料',
        },
      }),
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0].category).toBe('检索与AI');
  });

  it('rejects medium-confidence model merges for incompatible categories', () => {
    const segments = buildTimeMapSegments([
      activity('a', '2026-07-08 01:00:00', {
        category: '代码开发',
      }),
      activity('b', '2026-07-08 01:05:00', {
        title: '回复微信',
        category: '沟通与协作',
        app: 'Weixin',
        segmentMerge: {
          should_merge: true,
          confidence: 'medium',
          reason: '可能仍在沟通同一项目',
          current_activity: '回复微信',
          updated_segment_summary: '继续处理开发任务并沟通',
        },
      }),
    ]);

    expect(segments).toHaveLength(2);
  });

  it('keeps idle as a hard boundary and clips the previous activity duration', () => {
    const idlePeriods: IdlePeriod[] = [{
      id: 'idle-1',
      start_at: '2026-07-08 01:05:00',
      end_at: '2026-07-08 01:20:00',
      created_at: '2026-07-08 01:20:00',
    }];

    const segments = buildTimeMapSegments([
      activity('a', '2026-07-08 01:00:00', { durationSec: 1800 }),
      activity('b', '2026-07-08 01:20:00', {
        segmentMerge: {
          should_merge: true,
          confidence: 'high',
          reason: '模型认为延续',
          current_activity: '继续开发',
          updated_segment_summary: '继续开发',
        },
      }),
    ], idlePeriods);

    expect(segments.map((item) => item.kind)).toEqual(['activity', 'idle', 'activity']);
    expect(segments[0].durationSec).toBe(300);
    expect(segments[1].title).toBe('离开电脑');
  });

  it('clips overnight idle to the default 08:00 workday start', () => {
    const idlePeriods: IdlePeriod[] = [{
      id: 'idle-overnight',
      start_at: '2026-07-07 19:00:00',
      end_at: null,
      created_at: '2026-07-07 19:00:00',
    }];
    const now = new Date('2026-07-08T12:00:00+08:00');

    const segments = buildTimeMapSegments(
      [],
      idlePeriods,
      now,
      getTimeMapVisibleWindow('2026-07-08', [], now)
    );

    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe('idle');
    expect(segments[0].durationSec).toBe(4 * 60 * 60);
  });

  it('uses the fixed 08:00-24:00 visible workday window', () => {
    const now = new Date('2026-07-08T12:00:00+08:00');
    const visibleWindow = getTimeMapVisibleWindow('2026-07-08', [], now);
    const visibleStart = parseUtcStorageDateTime(visibleWindow.visibleStartAt);
    const visibleEnd = parseUtcStorageDateTime(visibleWindow.visibleEndAt);

    expect(visibleStart?.getHours()).toBe(8);
    expect(visibleEnd?.getHours()).toBe(0);
    expect(visibleEnd && visibleStart ? visibleEnd.getTime() - visibleStart.getTime() : 0).toBe(16 * 60 * 60 * 1000);
  });

  it('clips real activity before 08:00 out of the fixed visible window', () => {
    const now = new Date('2026-07-08T12:00:00+08:00');
    const earlyActivity = activity('early', '2026-07-07 23:23:00');

    const segments = buildTimeMapSegments(
      [earlyActivity],
      [],
      now,
      getTimeMapVisibleWindow('2026-07-08', [earlyActivity], now)
    );

    expect(segments).toHaveLength(0);
  });
});

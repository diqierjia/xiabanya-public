import { describe, expect, it } from 'vitest';
import type { ActivityRecord, IdlePeriod, VisionResult } from '../src/shared/types';
import {
  FOCUS_RECOVER_ENABLED_KEY,
  HUMOR_ECHO_LAST_SENT_DATE_KEY,
  RETURN_GREETING_COUNT_KEY,
  RETURN_GREETING_LAST_SENT_DATE_KEY,
  buildOffworkCandidate,
  markProactiveMessageSent,
  parseProactiveCommand,
  predictOffworkTime,
  shouldSendFocusRecover,
  shouldSendHumorEcho,
  shouldSendReturnGreeting,
  shouldSendStuckHelp,
} from '../src/main/proactive-chat';
import { formatUtcStorageDateTime } from '../src/shared/time';

function localStorageTime(date: string, time: string): string {
  return formatUtcStorageDateTime(new Date(`${date}T${time}:00`));
}

function record(date: string, start: string, end: string): ActivityRecord {
  return {
    id: `${date}-${start}-${end}`,
    title: '工作',
    category: '代码开发',
    app: 'Code',
    window_title: '',
    start_at: localStorageTime(date, start),
    end_at: localStorageTime(date, end),
    notes: '',
    source: 'auto',
    created_at: localStorageTime(date, end),
    is_achievement: false,
    exclude_from_report: false,
  };
}

function idle(date: string, start: string, end: string): IdlePeriod {
  return {
    id: `${date}-${start}-${end}`,
    start_at: localStorageTime(date, start),
    end_at: localStorageTime(date, end),
    created_at: localStorageTime(date, start),
  };
}

function day(date: string, offworkStart: string) {
  return {
    date,
    records: [
      record(date, '09:30', '12:00'),
      record(date, '13:30', '17:50'),
    ],
    idlePeriods: [idle(date, offworkStart, '23:00')],
    visionResults: [] as VisionResult[],
  };
}

function vision(date: string, time: string, overrides: Partial<VisionResult> = {}): VisionResult {
  return {
    id: `${date}-${time}`,
    record_id: '',
    title: '识别结果',
    category: '代码开发',
    summary: '',
    observed_fact: '',
    possible_activity: '',
    confidence: 'high',
    activity_type: 'work',
    raw_response: '{}',
    app: 'Code',
    window_title: '',
    model: 'test',
    created_at: localStorageTime(date, time),
    ...overrides,
  };
}

function fakeDb(results: VisionResult[] = [], settings: Record<string, string> = {}) {
  const state = { ...settings };
  return {
    listVisionResultsByDate: () => results,
    getSetting: (key: string, defaultValue = '') => state[key] ?? defaultValue,
    setSetting: (key: string, value: string) => {
      state[key] = value;
    },
    listRecords: () => [],
    listIdlePeriodsByDateRange: () => [],
    __settings: state,
  } as any;
}

describe('predictOffworkTime()', () => {
  it('uses recent valid idle starts and filters a late-night outlier', () => {
    const prediction = predictOffworkTime([
      day('2026-07-06', '18:30'),
      day('2026-07-05', '18:20'),
      {
        ...day('2026-07-04', '18:30'),
        idlePeriods: [idle('2026-07-04', '22:50', '23:50')],
      },
      day('2026-07-03', '18:35'),
      day('2026-07-02', '18:25'),
      day('2026-07-01', '18:40'),
    ]);

    expect(prediction).not.toBeNull();
    expect(prediction!.displayTime).toBe('18:30');
    expect(prediction!.candidateCount).toBe(5);
    expect(prediction!.confidence).toBe('high');
  });

  it('does not predict from fewer than three usable days', () => {
    const prediction = predictOffworkTime([
      day('2026-07-06', '18:30'),
      day('2026-07-05', '18:20'),
    ]);

    expect(prediction).toBeNull();
  });
});

describe('buildOffworkCandidate()', () => {
  it('ignores a long idle period when sustained activity resumes after it', () => {
    const candidate = buildOffworkCandidate({
      date: '2026-07-06',
      records: [
        record('2026-07-06', '09:30', '12:00'),
        record('2026-07-06', '13:30', '17:20'),
        record('2026-07-06', '19:00', '19:40'),
      ],
      idlePeriods: [idle('2026-07-06', '17:30', '18:30')],
      visionResults: [],
    }, 1);

    expect(candidate?.source).toBe('activity');
    expect(candidate?.minuteOfDay).toBe(19 * 60 + 40);
  });
});

describe('parseProactiveCommand()', () => {
  it('recognizes wrap-up authorization phrases', () => {
    expect(parseProactiveCommand('下班前叫我整理一下')?.reply).toContain('快收尾');
  });

  it('recognizes quiet phrases', () => {
    expect(parseProactiveCommand('别烦我了')?.reply).toContain('少冒泡');
  });

  it('recognizes focus recover authorization phrases', () => {
    expect(parseProactiveCommand('今天别让我刷太久')?.reply).toContain('盯着一点');
  });
});

describe('proactive triggers', () => {
  it('sends stuck help only after a consecutive stuck streak', () => {
    const db = fakeDb([
      vision('2026-07-07', '18:12', { stuck_signal: { is_stuck_like: true, reason: '', evidence: ['failed'], confidence: 'high' } }),
      vision('2026-07-07', '18:06', { stuck_signal: { is_stuck_like: true, reason: '', evidence: ['error'], confidence: 'medium' } }),
      vision('2026-07-07', '18:01', { stuck_signal: { is_stuck_like: true, reason: '', evidence: ['timeout'], confidence: 'high' } }),
    ]);

    const message = shouldSendStuckHelp(db, new Date('2026-07-07T18:12:00'));
    expect(message?.trigger).toBe('stuck_help');
  });

  it('does not send focus recover until the user authorizes it', () => {
    const results = [
      vision('2026-07-07', '18:12', { distraction_signal: { is_distraction_like: true, activity_type: 'video', reason: '', confidence: 'high' } }),
      vision('2026-07-07', '18:06', { distraction_signal: { is_distraction_like: true, activity_type: 'video', reason: '', confidence: 'high' } }),
      vision('2026-07-07', '18:01', { distraction_signal: { is_distraction_like: true, activity_type: 'video', reason: '', confidence: 'medium' } }),
    ];
    expect(shouldSendFocusRecover(fakeDb(results), new Date('2026-07-07T18:12:00'))).toBeNull();

    const authorized = fakeDb(results, { [FOCUS_RECOVER_ENABLED_KEY]: 'true' });
    expect(shouldSendFocusRecover(authorized, new Date('2026-07-07T18:12:00'))?.trigger).toBe('focus_recover');
  });

  it('sends humor echo at most once per day', () => {
    const db = fakeDb([], {});
    const latest = vision('2026-07-07', '18:12', {
      content_mood: { mood: 'humorous', reason: '梗图', confidence: 'high' },
    });

    const message = shouldSendHumorEcho(db, latest, new Date('2026-07-07T18:12:00'));
    expect(message?.trigger).toBe('humor_echo');
    markProactiveMessageSent(db, message!, new Date('2026-07-07T18:12:00'));
    expect(db.__settings[HUMOR_ECHO_LAST_SENT_DATE_KEY]).toBe('2026-07-07');
    expect(shouldSendHumorEcho(db, latest, new Date('2026-07-07T19:00:00'))).toBeNull();
  });

  it('limits return greetings per day', () => {
    const db = fakeDb([], {
      [RETURN_GREETING_LAST_SENT_DATE_KEY]: '2026-07-07',
      [RETURN_GREETING_COUNT_KEY]: '3',
    });

    expect(shouldSendReturnGreeting(db, 10 * 60, new Date('2026-07-07T18:12:00'))).toBeNull();
    expect(shouldSendReturnGreeting(fakeDb(), 10 * 60, new Date('2026-07-07T18:12:00'))?.trigger).toBe('return_greeting');
  });
});

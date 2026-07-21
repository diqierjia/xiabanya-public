import { randomUUID } from 'crypto';
import type { ActivityRecord, IdlePeriod, ProactiveMessage, VisionResult } from '../shared/types';
import { formatLocalDate, formatUtcStorageDateTime, parseUtcStorageDateTime } from '../shared/time';
import type { DatabaseService } from './database';

export const PROACTIVE_LEVEL_KEY = 'desk_pet_proactive_level';
export const PROACTIVE_QUIET_DATE_KEY = 'desk_pet_quiet_date';
export const WRAP_UP_ENABLED_KEY = 'desk_pet_wrap_up_enabled';
export const WRAP_UP_LAST_SENT_DATE_KEY = 'desk_pet_wrap_up_last_sent_date';
export const FOCUS_RECOVER_ENABLED_KEY = 'desk_pet_focus_recover_enabled';
export const FOCUS_RECOVER_LAST_SENT_AT_KEY = 'desk_pet_focus_recover_last_sent_at';
export const STUCK_HELP_LAST_SENT_AT_KEY = 'desk_pet_stuck_help_last_sent_at';
export const HUMOR_ECHO_LAST_SENT_DATE_KEY = 'desk_pet_humor_echo_last_sent_date';
export const RETURN_GREETING_LAST_SENT_DATE_KEY = 'desk_pet_return_greeting_last_sent_date';
export const RETURN_GREETING_COUNT_KEY = 'desk_pet_return_greeting_count';

const MIN_VALID_ACTIVE_SECONDS = 2 * 60 * 60;
const MIN_OFFWORK_IDLE_SECONDS = 30 * 60;
const MIN_ACTIVE_AFTER_IDLE_SECONDS = 10 * 60;
const MIN_OFFWORK_MINUTE = 15 * 60;
const MAX_OFFWORK_MINUTE = 24 * 60;
const OUTLIER_WINDOW_MINUTES = 150;
const STUCK_MIN_SPAN_MINUTES = 8;
const DISTRACTION_MIN_SPAN_MINUTES = 10;
const ACTIVE_TRIGGER_COOLDOWN_MINUTES = 90;
const RETURN_GREETING_MAX_PER_DAY = 3;

type AppLanguage = 'zh-CN' | 'en-US';

function getAppLanguage(db: DatabaseService): AppLanguage {
  return db.getSetting('language', 'zh-CN') === 'en-US' ? 'en-US' : 'zh-CN';
}

function localized(db: DatabaseService, chinese: string, english: string): string {
  return getAppLanguage(db) === 'en-US' ? english : chinese;
}

export interface OffworkDayInput {
  date: string;
  records: ActivityRecord[];
  idlePeriods: IdlePeriod[];
  visionResults: VisionResult[];
}

export interface OffworkCandidate {
  date: string;
  minuteOfDay: number;
  source: 'idle' | 'activity';
  weight: number;
}

export interface OffworkPrediction {
  minuteOfDay: number;
  displayTime: string;
  candidateCount: number;
  confidence: 'low' | 'medium' | 'high';
  candidates: OffworkCandidate[];
}

function secondsBetween(start?: string | null, end?: string | null): number {
  const startDate = parseUtcStorageDateTime(start || '');
  const endDate = parseUtcStorageDateTime(end || '');
  if (!startDate || !endDate) return 0;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 1000));
}

function minutesBetween(start?: string | null, endDate = new Date()): number {
  const startDate = parseUtcStorageDateTime(start || '');
  if (!startDate) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
}

function minuteOfLocalDay(value?: string | null): number | null {
  const date = parseUtcStorageDateTime(value || '');
  if (!date) return null;
  return date.getHours() * 60 + date.getMinutes();
}

function formatMinuteOfDay(minute: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minute)));
  const hour = Math.floor(clamped / 60);
  const min = clamped % 60;
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function weightedMedian(candidates: OffworkCandidate[]): number {
  const sorted = [...candidates].sort((a, b) => a.minuteOfDay - b.minuteOfDay);
  const totalWeight = sorted.reduce((sum, candidate) => sum + candidate.weight, 0);
  let seen = 0;
  for (const candidate of sorted) {
    seen += candidate.weight;
    if (seen >= totalWeight / 2) return candidate.minuteOfDay;
  }
  return sorted[sorted.length - 1]?.minuteOfDay || 18 * 60;
}

function totalActiveSeconds(records: ActivityRecord[]): number {
  return records.reduce((sum, record) => sum + secondsBetween(record.start_at, record.end_at), 0);
}

function hasSustainedActivityAfter(records: ActivityRecord[], idleStart: string): boolean {
  const idleStartDate = parseUtcStorageDateTime(idleStart);
  if (!idleStartDate) return false;
  return records.some((record) => {
    const recordEnd = parseUtcStorageDateTime(record.end_at);
    if (!recordEnd || recordEnd <= idleStartDate) return false;
    return secondsBetween(record.start_at, record.end_at) >= MIN_ACTIVE_AFTER_IDLE_SECONDS;
  });
}

function latestActivityMinute(day: OffworkDayInput): number | null {
  const recordMinutes = day.records
    .map((record) => minuteOfLocalDay(record.end_at))
    .filter((minute): minute is number => minute !== null);
  const visionMinutes = day.visionResults
    .map((result) => minuteOfLocalDay(result.created_at))
    .filter((minute): minute is number => minute !== null);
  const minutes = [...recordMinutes, ...visionMinutes].filter(
    (minute) => minute >= MIN_OFFWORK_MINUTE && minute <= MAX_OFFWORK_MINUTE
  );
  return minutes.length ? Math.max(...minutes) : null;
}

export function buildOffworkCandidate(day: OffworkDayInput, weight: number): OffworkCandidate | null {
  if (totalActiveSeconds(day.records) < MIN_VALID_ACTIVE_SECONDS && day.visionResults.length < 6) {
    return null;
  }

  const idleCandidates = day.idlePeriods
    .filter((period) => period.end_at && secondsBetween(period.start_at, period.end_at) >= MIN_OFFWORK_IDLE_SECONDS)
    .map((period) => ({ period, minute: minuteOfLocalDay(period.start_at) }))
    .filter((item): item is { period: IdlePeriod; minute: number } => (
      item.minute !== null &&
      item.minute >= MIN_OFFWORK_MINUTE &&
      item.minute <= MAX_OFFWORK_MINUTE &&
      !hasSustainedActivityAfter(day.records, item.period.start_at)
    ))
    .sort((a, b) => b.minute - a.minute);

  if (idleCandidates[0]) {
    return {
      date: day.date,
      minuteOfDay: idleCandidates[0].minute,
      source: 'idle',
      weight,
    };
  }

  const fallbackMinute = latestActivityMinute(day);
  if (fallbackMinute === null) return null;
  return {
    date: day.date,
    minuteOfDay: fallbackMinute,
    source: 'activity',
    weight: weight * 0.55,
  };
}

export function predictOffworkTime(days: OffworkDayInput[]): OffworkPrediction | null {
  const candidates = days
    .map((day, index) => buildOffworkCandidate(day, Math.max(1, days.length - index)))
    .filter((candidate): candidate is OffworkCandidate => candidate !== null);

  if (candidates.length < 3) return null;

  const center = median(candidates.map((candidate) => candidate.minuteOfDay));
  const filtered = candidates.filter(
    (candidate) => Math.abs(candidate.minuteOfDay - center) <= OUTLIER_WINDOW_MINUTES
  );
  if (filtered.length < 3) return null;

  const minuteOfDay = Math.round(weightedMedian(filtered));
  const idleCount = filtered.filter((candidate) => candidate.source === 'idle').length;
  const confidence = filtered.length >= 5 && idleCount >= 3 ? 'high' : idleCount >= 2 ? 'medium' : 'low';

  return {
    minuteOfDay,
    displayTime: formatMinuteOfDay(minuteOfDay),
    candidateCount: filtered.length,
    confidence,
    candidates: filtered,
  };
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function buildRecentOffworkDays(db: DatabaseService, now = new Date(), daysBack = 7): OffworkDayInput[] {
  const days: OffworkDayInput[] = [];
  for (let offset = 1; offset <= daysBack; offset += 1) {
    const date = formatLocalDate(addDays(now, -offset));
    days.push({
      date,
      records: db.listRecords({ start: date, end: date, limit: 5000 }),
      idlePeriods: db.listIdlePeriodsByDateRange({ start: date, end: date }),
      visionResults: db.listVisionResultsByDate({ start: date, end: date, limit: 5000 }),
    });
  }
  return days;
}

export function parseProactiveCommand(content: string, language: AppLanguage = 'zh-CN'): { reply: string } | null {
  const text = content.trim();
  if (!text) return null;
  if (/别烦我|今天安静|今天别主动|别主动找我|先别提醒/.test(text)) {
    return { reply: language === 'en-US' ? 'Got it. I’ll keep a lower profile today.\n\nI’ll save anything important until you ask.' : '好，我今天少冒泡。\n\n有事我先攒着，你叫我我再说。' };
  }
  if (/少提醒|少打扰|降低频率/.test(text)) {
    return { reply: language === 'en-US' ? 'Got it. I’ll remind you less often.\n\nI’ll only pop up when it seems genuinely useful.' : '好，我会少提醒一点。\n\n只在比较有必要的时候冒个泡。' };
  }
  if (/恢复正常|正常提醒|可以提醒/.test(text)) {
    return { reply: language === 'en-US' ? 'Okay, back to normal.\n\nI’ll still try not to interrupt you too much.' : '好，恢复正常。\n\n我还是会尽量少打扰你。' };
  }
  if (/下班前.*(叫我|提醒我|收尾|整理)|收尾.*(叫我|提醒我)/.test(text)) {
    return { reply: language === 'en-US' ? 'Okay. Based on your recent rhythm, I’ll give you a gentle nudge when it is nearly time to wrap up.' : '好，我会按你最近的使用节奏，在快收尾的时候轻轻叫你一下。' };
  }
  if (/别让我.*(刷|玩|摸鱼)|刷.*(太久|超过).*提醒|玩.*(太久|超过).*提醒|拉我回来|专注模式|学习模式/.test(text)) {
    return { reply: language === 'en-US' ? 'Okay, I’ll keep a gentle eye on it.\n\nIf you stay in entertainment content for too long, I’ll nudge you back.' : '好，我会帮你盯着一点。\n\n如果你在娱乐内容里待久了，我轻轻拉你一下。' };
  }
  return null;
}

export function applyProactiveCommand(db: DatabaseService, content: string, now = new Date()): string | null {
  const parsed = parseProactiveCommand(content, getAppLanguage(db));
  if (!parsed) return null;

  if (/别烦我|今天安静|今天别主动|别主动找我|先别提醒/.test(content)) {
    db.setSetting(PROACTIVE_LEVEL_KEY, 'quiet_today');
    db.setSetting(PROACTIVE_QUIET_DATE_KEY, formatLocalDate(now));
  } else if (/少提醒|少打扰|降低频率/.test(content)) {
    db.setSetting(PROACTIVE_LEVEL_KEY, 'low');
  } else if (/恢复正常|正常提醒|可以提醒/.test(content)) {
    db.setSetting(PROACTIVE_LEVEL_KEY, 'normal');
    db.setSetting(PROACTIVE_QUIET_DATE_KEY, '');
  } else if (/下班前.*(叫我|提醒我|收尾|整理)|收尾.*(叫我|提醒我)/.test(content)) {
    db.setSetting(WRAP_UP_ENABLED_KEY, 'true');
  } else if (/别让我.*(刷|玩|摸鱼)|刷.*(太久|超过).*提醒|玩.*(太久|超过).*提醒|拉我回来|专注模式|学习模式/.test(content)) {
    db.setSetting(FOCUS_RECOVER_ENABLED_KEY, 'true');
  }

  return parsed.reply;
}

function isQuietToday(db: DatabaseService, now = new Date()): boolean {
  const today = formatLocalDate(now);
  return db.getSetting(PROACTIVE_LEVEL_KEY, 'normal') === 'quiet_today' &&
    db.getSetting(PROACTIVE_QUIET_DATE_KEY, '') === today;
}

function recentTodayVisionResults(db: DatabaseService, now = new Date(), limit = 6): VisionResult[] {
  const today = formatLocalDate(now);
  return db.listVisionResultsByDate({ start: today, end: today, limit });
}

function isSignalConfidenceUsable(confidence?: string): boolean {
  return confidence === 'high' || confidence === 'medium';
}

function leadingStreak<T>(items: T[], predicate: (item: T) => boolean): T[] {
  const streak: T[] = [];
  for (const item of items) {
    if (!predicate(item)) break;
    streak.push(item);
  }
  return streak;
}

function spanMinutes(results: VisionResult[]): number {
  if (results.length < 2) return 0;
  const newest = parseUtcStorageDateTime(results[0].created_at);
  const oldest = parseUtcStorageDateTime(results[results.length - 1].created_at);
  if (!newest || !oldest) return 0;
  return Math.max(0, Math.round((newest.getTime() - oldest.getTime()) / 60000));
}

function makeMessage(trigger: ProactiveMessage['trigger'], content: string, now = new Date()): ProactiveMessage {
  return {
    id: randomUUID(),
    trigger,
    content,
    created_at: formatUtcStorageDateTime(now),
  };
}

export function shouldSendStuckHelp(db: DatabaseService, now = new Date()): ProactiveMessage | null {
  if (isQuietToday(db, now)) return null;
  if (minutesBetween(db.getSetting(STUCK_HELP_LAST_SENT_AT_KEY, ''), now) < ACTIVE_TRIGGER_COOLDOWN_MINUTES) return null;

  const streak = leadingStreak(recentTodayVisionResults(db, now, 5), (result) => (
    result.stuck_signal?.is_stuck_like === true &&
    isSignalConfidenceUsable(result.stuck_signal.confidence)
  ));

  if (streak.length < 3 || spanMinutes(streak.slice(0, 3)) < STUCK_MIN_SPAN_MINUTES) return null;

  return makeMessage(
    'stuck_help',
    localized(db, '这个问题好像绕了一会儿了。\n\n要不要我帮你把现象和刚才试过的办法捋一下？', 'This issue seems to have been circling for a while.\n\nWant me to sort out what is happening and what you have already tried?'),
    now
  );
}

export function shouldSendFocusRecover(db: DatabaseService, now = new Date()): ProactiveMessage | null {
  if (db.getSetting(FOCUS_RECOVER_ENABLED_KEY, 'false') !== 'true') return null;
  if (isQuietToday(db, now)) return null;
  if (minutesBetween(db.getSetting(FOCUS_RECOVER_LAST_SENT_AT_KEY, ''), now) < ACTIVE_TRIGGER_COOLDOWN_MINUTES) return null;

  const streak = leadingStreak(recentTodayVisionResults(db, now, 5), (result) => (
    result.distraction_signal?.is_distraction_like === true &&
    result.distraction_signal.activity_type !== 'none' &&
    isSignalConfidenceUsable(result.distraction_signal.confidence)
  ));

  if (streak.length < 3 || spanMinutes(streak.slice(0, 3)) < DISTRACTION_MIN_SPAN_MINUTES) return null;

  return makeMessage(
    'focus_recover',
    localized(db, '你快被它吸走了。\n\n要不要我拉你回来学 20 分钟？', 'It is starting to pull you in.\n\nWant me to pull you back for 20 minutes of focused work?'),
    now
  );
}

export function shouldSendHumorEcho(db: DatabaseService, latest: VisionResult, now = new Date()): ProactiveMessage | null {
  const today = formatLocalDate(now);
  if (isQuietToday(db, now)) return null;
  if (db.getSetting(HUMOR_ECHO_LAST_SENT_DATE_KEY, '') === today) return null;
  if (latest.content_mood?.mood !== 'humorous' || !isSignalConfidenceUsable(latest.content_mood.confidence)) return null;

  return makeMessage('humor_echo', localized(db, '这个有点离谱哈哈。', 'This is kind of wild, haha.'), now);
}

export function shouldSendReturnGreeting(db: DatabaseService, idleSeconds: number, now = new Date()): ProactiveMessage | null {
  if (idleSeconds < 5 * 60) return null;
  if (isQuietToday(db, now)) return null;

  const today = formatLocalDate(now);
  const lastDate = db.getSetting(RETURN_GREETING_LAST_SENT_DATE_KEY, '');
  const count = lastDate === today ? Number(db.getSetting(RETURN_GREETING_COUNT_KEY, '0')) || 0 : 0;
  if (count >= RETURN_GREETING_MAX_PER_DAY) return null;

  return makeMessage('return_greeting', localized(db, '回来了。\n\n我还在。', 'Welcome back.\n\nI’m still here.'), now);
}

export function markProactiveMessageSent(db: DatabaseService, message: ProactiveMessage, now = new Date()): void {
  const today = formatLocalDate(now);
  if (message.trigger === 'stuck_help') {
    db.setSetting(STUCK_HELP_LAST_SENT_AT_KEY, formatUtcStorageDateTime(now));
  } else if (message.trigger === 'focus_recover') {
    db.setSetting(FOCUS_RECOVER_LAST_SENT_AT_KEY, formatUtcStorageDateTime(now));
  } else if (message.trigger === 'humor_echo') {
    db.setSetting(HUMOR_ECHO_LAST_SENT_DATE_KEY, today);
  } else if (message.trigger === 'return_greeting') {
    const lastDate = db.getSetting(RETURN_GREETING_LAST_SENT_DATE_KEY, '');
    const count = lastDate === today ? Number(db.getSetting(RETURN_GREETING_COUNT_KEY, '0')) || 0 : 0;
    db.setSetting(RETURN_GREETING_LAST_SENT_DATE_KEY, today);
    db.setSetting(RETURN_GREETING_COUNT_KEY, String(count + 1));
  } else if (message.trigger === 'wrap_up') {
    db.setSetting(WRAP_UP_LAST_SENT_DATE_KEY, today);
  }
}

export function shouldSendVisionProactiveMessage(db: DatabaseService, latest: VisionResult, now = new Date()): ProactiveMessage | null {
  return shouldSendHumorEcho(db, latest, now) ||
    shouldSendStuckHelp(db, now) ||
    shouldSendFocusRecover(db, now);
}

export function shouldSendWrapUp(db: DatabaseService, now = new Date()): { message: ProactiveMessage; prediction: OffworkPrediction } | null {
  const today = formatLocalDate(now);
  if (db.getSetting(WRAP_UP_ENABLED_KEY, 'false') !== 'true') return null;
  if (db.getSetting(WRAP_UP_LAST_SENT_DATE_KEY, '') === today) return null;
  if (isQuietToday(db, now)) return null;

  const todayRecords = db.listRecords({ start: today, end: today, limit: 1 });
  if (todayRecords.length === 0) return null;

  const prediction = predictOffworkTime(buildRecentOffworkDays(db, now));
  if (!prediction || prediction.confidence === 'low') return null;

  const minuteNow = now.getHours() * 60 + now.getMinutes();
  const windowStart = prediction.minuteOfDay - 30;
  const windowEnd = prediction.minuteOfDay + 15;
  if (minuteNow < windowStart || minuteNow > windowEnd) return null;

  return {
    prediction,
    message: {
      id: randomUUID(),
      trigger: 'wrap_up',
      content: localized(db, '差不多到你平时收尾的点了。\n\n要不要我把今天能确定的几件事先捞出来？', 'It is about the time you usually start wrapping up.\n\nWant me to pull out the things from today that we can be confident about?'),
      created_at: formatUtcStorageDateTime(now),
    },
  };
}

const OPEN_GREETINGS: Array<[string, string]> = [
  ['来了。', 'You’re here.'],
  ['在呢。', 'I’m here.'],
  ['嘿。', 'Hey.'],
  ['哦，你来了。', 'Oh, you’re here.'],
  ['我又站了一天了。', 'I have been standing here all day again.'],
  ['嘎。', 'Quack.'],
  ['今天也是打工的一天。', 'Another day at work.'],
  ['你来了，我还在。', 'You’re here. I’m still here too.'],
  ['刚才是不是有人说我坏话。', 'Did someone say something bad about me just now?'],
  ['工作累了吧，我也累了。', 'Work tired you out, huh? Me too.'],
  ['今天天气不错，我在屏幕里感觉不到。', 'The weather seems nice today. I cannot feel it from inside the screen.'],
  ['你知道吗，鸭子其实不会说话。', 'Did you know ducks do not actually talk?'],
  ['今天也是被 AI 支配的一天。', 'Another day ruled by AI.'],
  ['我帮你盯着呢，虽然什么也没盯住。', 'I was keeping an eye on things, though I did not catch much.'],
  ['你今天看起来状态不错（我猜的）。', 'You seem to be doing well today. I’m guessing, of course.'],
  ['你回来啦！', 'You’re back!'],
  ['嗷，是你！', 'Oh, it’s you!'],
  ['等你半天了。', 'I’ve been waiting for you for ages.'],
  ['我就知道你会来。', 'I knew you would come by.'],
  ['今天想我了没。', 'Did you miss me today?'],
  ['来啦来啦！', 'Here you are!'],
  ['终于有人跟我说话了。', 'Finally, someone is talking to me.'],
  ['你可算来了，我快无聊死了。', 'You finally came. I was getting so bored.'],
];

export function shouldSendOpenGreeting(db: DatabaseService, now = new Date()): ProactiveMessage | null {
  if (isQuietToday(db, now)) return null;
  const greeting = OPEN_GREETINGS[Math.floor(Math.random() * OPEN_GREETINGS.length)];
  const content = greeting[getAppLanguage(db) === 'en-US' ? 1 : 0];
  return makeMessage('open_greeting', content, now);
}

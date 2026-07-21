import { ipcMain, BrowserWindow, powerMonitor, screen } from 'electron';
import { DatabaseService } from './database';
import { ActivityTracker } from './tracker';
import type { TrackerCallback } from './tracker';
import { captureDisplayScreenshot, captureScreenshot } from './screenshot';
import { analyzeWithVision, compactChatMemory, describeScreenQuestion, extractRealtimeMemoryEvent, generateReport, requestChatCompactionToolCalls, requestMemoryChatTurn, selectRecentChatTurns, streamChatCompletion, type MemoryToolCall, type VisionPreviousSegmentContext } from './ai';
import { matchRealtimeMemoryCriticality } from './memory-keywords';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import { CATEGORIES, DEFAULT_API_BASE_URL, DEFAULT_SETTINGS, normalizeManagedCategories, type ChatHistoryMessage, type ChatMessage, type ChatMessagesQuery, type DeskPetState, type ExportJsonOptions, type IdlePeriod, type MemoryToolDebugCall, type ProactiveMessage, type RecordUpsertDTO, type RecordsQuery, type ReportsQuery, type VisionQuery } from '../shared/types';
import { formatLocalDate, formatLocalDateTime, formatUtcStorageDateTime, formatUtcStorageDateTimeLocal, formatUtcStorageTime, parseUtcStorageDateTime } from '../shared/time';
import { randomUUID } from 'crypto';
import { updateTrayLanguage } from './tray';
import {
  getDeskPetState,
  closeDeskPetScreenQuestionWindow,
  hideDeskPetChatWindow,
  isDeskPetState,
  isDeskPetChatSender,
  isDeskPetScreenQuestionSender,
  isDeskPetWindowVisible,
  openDeskPetScreenQuestionWindow,
  sendDeskPetChatMirrorEvent,
  sendDeskPetProactiveMessage,
  sendDeskPetScreenQuestionToChat,
  showDeskPetChatWindow,
  setDeskPetEnabled,
  setDeskPetState,
  refreshDeskPetLanguage,
} from './desk-pet-window';
import {
  applyProactiveCommand,
  buildRecentOffworkDays,
  markProactiveMessageSent,
  predictOffworkTime,
  shouldSendOpenGreeting,
  shouldSendReturnGreeting,
  shouldSendVisionProactiveMessage,
  shouldSendWrapUp,
} from './proactive-chat';

let tracker: ActivityTracker | null = null;
let visionTimer: ReturnType<typeof setInterval> | null = null;
let idleProbeTimer: ReturnType<typeof setInterval> | null = null;
let resumeCaptureTimer: ReturnType<typeof setTimeout> | null = null;
let visionCaptureInFlight = false;
let visionAutoRunToken = 0;
let visionAutoAbortController: AbortController | null = null;
let visionAutoIntervalMinutes = 5;
let idleState: 'active' | 'idle' = 'active';
let currentIdlePeriodId: string | null = null;
let currentIdleStartedAt: string | null = null;
let deskPetResumeTimer: ReturnType<typeof setTimeout> | null = null;
let proactiveTimer: ReturnType<typeof setInterval> | null = null;
let chatCompactionRetryTimer: ReturnType<typeof setTimeout> | null = null;
const chatStreamAbortControllers = new Map<string, AbortController>();
type ScreenQuestionObservation =
  | { ok: true; content: string; completedAt: number }
  | { ok: false; error: unknown; completedAt: number };

interface ScreenQuestionTiming {
  confirmedAt: number;
  visionUnderstandingLatencyMs: number;
}

let pendingScreenQuestion: {
  id: string;
  abortController: AbortController;
  fullObservation: Promise<ScreenQuestionObservation>;
} | null = null;
let screenQuestionAbortController: AbortController | null = null;
const screenQuestionTimings = new Map<string, ScreenQuestionTiming>();

const IDLE_THRESHOLD_SECONDS = 300;
const IDLE_PROBE_INTERVAL_MS = 5 * 1000;
const RESUME_CAPTURE_DELAY_MS = 30 * 1000;
const WINDOW_TRACE_MAX_AGE_MS = 60 * 60 * 1000;
const WINDOW_TRACE_MAX_SAMPLES = 720;

/** v2.2: 缓存 tracker 最近一次快照的 app/title，供 Vision Auto 截图时使用 */
let lastTrackerContext: { app: string; title: string } = { app: '截图', title: '自动识别' };

interface WindowTraceSample {
  app: string;
  title: string;
  observedAt: string;
}

const recentWindowTrace: WindowTraceSample[] = [];

function cleanWindowText(value: string, maxLength = 120): string {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function appendWindowTraceSample(sample: WindowTraceSample): void {
  recentWindowTrace.push({
    app: cleanWindowText(sample.app, 80) || '未知应用',
    title: cleanWindowText(sample.title, 160) || '无标题窗口',
    observedAt: sample.observedAt,
  });

  const cutoff = Date.now() - WINDOW_TRACE_MAX_AGE_MS;
  while (recentWindowTrace.length > 0) {
    const firstTime = parseUtcStorageDateTime(recentWindowTrace[0].observedAt)?.getTime() ?? 0;
    if (recentWindowTrace.length <= WINDOW_TRACE_MAX_SAMPLES && firstTime >= cutoff) break;
    recentWindowTrace.shift();
  }
}

function buildRecentWindowTraceText(minutes: number): string {
  const cutoff = Date.now() - Math.max(1, minutes) * 60 * 1000;
  const samples = recentWindowTrace.filter((sample) => {
    const observedAt = parseUtcStorageDateTime(sample.observedAt)?.getTime();
    return observedAt !== undefined && observedAt >= cutoff;
  });

  if (samples.length === 0) {
    return '过去窗口轨迹: 无可用窗口记录。';
  }

  const groups: Array<{ app: string; title: string; start: string; end: string; count: number }> = [];
  for (const sample of samples) {
    const current = groups[groups.length - 1];
    if (current && current.app === sample.app && current.title === sample.title) {
      current.end = sample.observedAt;
      current.count += 1;
    } else {
      groups.push({
        app: sample.app,
        title: sample.title,
        start: sample.observedAt,
        end: sample.observedAt,
        count: 1,
      });
    }
  }

  const lines = groups.slice(-10).map((group) => {
    const start = formatUtcStorageTime(group.start, true);
    const end = formatUtcStorageTime(group.end, true);
    const title = group.title.length > 90 ? `${group.title.slice(0, 90)}...` : group.title;
    return `- ${start}-${end} ${group.app} | ${title}`;
  });

  return [
    `过去窗口轨迹: 最近约 ${minutes} 分钟，共 ${samples.length} 次窗口采样，连续相同窗口已合并。`,
    ...lines,
  ].join('\n');
}

function clearDeskPetResumeTimer(): void {
  if (deskPetResumeTimer) {
    clearTimeout(deskPetResumeTimer);
    deskPetResumeTimer = null;
  }
}

function syncDeskPetWorkflowState(): void {
  clearDeskPetResumeTimer();
  if (idleState === 'idle') {
    setDeskPetState('sleep');
  } else if (visionCaptureInFlight) {
    setDeskPetState('thinking');
  } else if (tracker?.isRunning || visionTimer !== null) {
    setDeskPetState('working');
  } else {
    setDeskPetState('idle');
  }
}

function showDeskPetDoneThenResume(delayMs = 1600): void {
  clearDeskPetResumeTimer();
  setDeskPetState('done');
  deskPetResumeTimer = setTimeout(() => {
    deskPetResumeTimer = null;
    syncDeskPetWorkflowState();
  }, delayMs);
}

function getApiKey(db: DatabaseService): string {
  return db.getSetting('siliconflow_api_key', '');
}

function getApiBaseUrl(db: DatabaseService): string {
  const customEnabled = db.getSetting('custom_api_enabled', 'false') === 'true';
  const customUrl = db.getSetting('custom_api_base_url', '').trim();
  return customEnabled && customUrl ? customUrl : DEFAULT_API_BASE_URL;
}

function getManagedCategoryNames(db: DatabaseService): string[] {
  const managed = db.getSetting('managed_categories', '');
  try {
    if (managed) return normalizeManagedCategories(JSON.parse(managed));
    const legacy = db.getSetting('custom_categories', '[]');
    return normalizeManagedCategories([...CATEGORIES, ...JSON.parse(legacy)]);
  } catch {
    return normalizeManagedCategories([]);
  }
}

function getVisionModel(db: DatabaseService): string {
  return db.getSetting('vision_model', 'Qwen/Qwen3-VL-32B-Instruct');
}

function getReportModel(db: DatabaseService): string {
  return db.getSetting('report_model', 'deepseek-ai/DeepSeek-V4-Flash');
}

function getChatModel(db: DatabaseService): string {
  return db.getSetting('chat_model', 'deepseek-ai/DeepSeek-V4-Flash');
}

function getAppLanguage(db: DatabaseService): 'zh-CN' | 'en-US' {
  return db.getSetting('language', 'zh-CN') === 'en-US' ? 'en-US' : 'zh-CN';
}

type ChatStatusKey = 'thinking' | 'searchingRecords' | 'searchingMemory' | 'expandingMemory' | 'organizingMemory' | 'recordsFound' | 'memoryFound' | 'organizingReply' | 'replying';

function chatStatus(language: 'zh-CN' | 'en-US', key: ChatStatusKey): string {
  const english = language === 'en-US';
  const messages: Record<ChatStatusKey, [string, string]> = {
    thinking: ['小黄鸭在想…', 'Ducky is thinking…'],
    searchingRecords: ['正在翻翻之前的记录…', 'Looking through earlier records…'],
    searchingMemory: ['正在翻翻以前的记忆…', 'Looking through earlier memories…'],
    expandingMemory: ['正在看看那段回忆的细节…', 'Checking the details of that memory…'],
    organizingMemory: ['正在整理刚才想起来的内容…', 'Organizing what I just found…'],
    recordsFound: ['找到一些以前的记录，继续想想…', 'I found some earlier records. Thinking it through…'],
    memoryFound: ['找到一些相关回忆，继续想想…', 'I found some related memories. Thinking it through…'],
    organizingReply: ['我想好了，正在组织一下…', 'I have it. Let me put it together…'],
    replying: ['想好了，正在回复…', 'I have it. Replying now…'],
  };
  return messages[key][english ? 1 : 0];
}

function formatIdleForChat(period: IdlePeriod): string {
  const start = formatUtcStorageTime(period.start_at);
  const end = period.end_at ? formatUtcStorageTime(period.end_at) : '当前';
  return `${start}-${end} 离开电脑`;
}

interface ChatTimelineEntry {
  created_at: string;
  content: string;
}

type ModelChatMessage = ChatMessage & { id?: string; created_at?: string };

function interleaveChatTimeline(messages: ChatHistoryMessage[], entries: ChatTimelineEntry[]): ModelChatMessage[] {
  const chatMessages = selectRecentChatTurns(messages);
  const timeline = [
    ...chatMessages.map((message, index) => ({
      at: parseUtcStorageDateTime(message.created_at)?.getTime() || 0,
      order: 1,
      index,
      message,
    })),
    ...entries.map((entry, index) => ({
      at: parseUtcStorageDateTime(entry.created_at)?.getTime() || 0,
      order: 0,
      index,
      message: { role: 'system' as const, content: entry.content, created_at: entry.created_at },
    })),
  ];
  return timeline
    .sort((a, b) => a.at - b.at || a.order - b.order || a.index - b.index)
    .map((entry) => entry.message);
}

function buildDeskPetChatContext(db: DatabaseService): {
  text: string;
  timelineEntries: ChatTimelineEntry[];
  retrievedMemoryIndex: string;
  retrievedEventIds: string[];
  retrievedElementIds: string[];
} {
  const today = formatLocalDate();
  const visionResults = db.listVisionResultsByDate({ start: today, end: today, limit: 20 });
  const records = db.listRecords({ start: today, end: today, limit: 20 });
  const idlePeriods = db.listIdlePeriodsByDateRange({ start: today, end: today, limit: 10 });

  const parts: string[] = [];
  const timelineEntries: ChatTimelineEntry[] = [
    ...visionResults.map((item) => ({
      created_at: item.created_at,
      content: `[内部环境记录｜${formatUtcStorageTime(item.created_at)}]\nVision：${item.title}（${item.confidence || 'medium'}，${item.activity_type || 'unclear'}）- ${item.observed_fact || item.summary}`,
    })),
    ...records.map((item) => ({
      created_at: item.start_at,
      content: `[内部环境记录｜${formatUtcStorageTime(item.start_at)}-${formatUtcStorageTime(item.end_at)}]\n窗口：${item.title}（${item.app}）`,
    })),
    ...idlePeriods.map((item) => ({
      created_at: item.start_at,
      content: `[内部环境记录｜${formatIdleForChat(item)}]`,
    })),
  ];

  const workingSummary = db.getChatWorkingSummary();
  if (workingSummary) {
    parts.push(`会话连续摘要（由已移出原文窗口的旧聊天整理；如与当前原文冲突，以当前原文为准）：\n${workingSummary}`);
  }
  const shortTermMessageIds = new Set(selectRecentChatTurns(db.listChatMessages()).map((message) => message.id));
  const pendingCompactionMessages = db.getPendingChatCompactionMessages().filter((message) => !shortTermMessageIds.has(message.id));
  if (pendingCompactionMessages.length > 0) {
    parts.push(`正在整理的更早会话原文（仅为避免整理尚未完成时出现断层；时间为真实发生时间）：\n${pendingCompactionMessages.map((message) => `[${formatUtcStorageDateTimeLocal(message.created_at)}] ${message.role}: ${message.content}`).join('\n')}`);
  }

  const residentMemory = db.listResidentMemory(20);
  const retrievedMemoryIndex = residentMemory.map(({ kind, value }) => kind === 'event'
    ? `[${value.id}] 事件｜${value.title}｜${value.summary}｜#${value.tags.join(' #')}`
    : `[${value.id}] 元素｜${value.name}（${value.type}）｜当前状态：${value.current_state || '未形成稳定状态'}`
  ).join('\n');
  if (residentMemory.length > 0) {
    parts.push(`长期记忆 L0（事件卡与元素卡共用前 20 个常驻名额；仅在相关时使用，不确定不要补全）：\n${retrievedMemoryIndex}`);
  }

  return {
    text: parts.join('\n\n'),
    timelineEntries,
    retrievedMemoryIndex,
    retrievedEventIds: residentMemory.flatMap(({ kind, value }) => kind === 'event' ? [value.id] : []),
    retrievedElementIds: residentMemory.flatMap(({ kind, value }) => kind === 'element' ? [value.id] : []),
  };
}

function normalizeScreenshotInterval(interval: unknown): number {
  const minutes = Math.round(Number(interval) || 5);
  return Math.min(60, Math.max(1, minutes));
}

function getPreviousVisionSegmentContext(db: DatabaseService): VisionPreviousSegmentContext | undefined {
  const latest = db.listVisionResults(1)[0];
  if (!latest) return undefined;
  return {
    title: latest.title,
    category: latest.category,
    activity_type: latest.activity_type || 'unclear',
    confidence: latest.confidence || 'medium',
    app: latest.app || '',
    window_title: latest.window_title || '',
    summary: latest.segment_merge?.updated_segment_summary || latest.possible_activity || latest.summary || latest.title,
    created_at: latest.created_at,
  };
}

function getSystemIdleSeconds(): number {
  try {
    return powerMonitor.getSystemIdleTime();
  } catch (error) {
    console.warn('[Vision Auto] Failed to read system idle time; idle detection skipped.', error);
    return 0;
  }
}

function clearIdleProbeTimer(): void {
  if (idleProbeTimer) {
    clearInterval(idleProbeTimer);
    idleProbeTimer = null;
  }
}

function clearResumeCaptureTimer(): void {
  if (resumeCaptureTimer) {
    clearTimeout(resumeCaptureTimer);
    resumeCaptureTimer = null;
  }
}

function startVisionTimer(db: DatabaseService, mainWindow: BrowserWindow, minutes: number): void {
  if (visionTimer) clearInterval(visionTimer);
  visionAutoRunToken += 1;
  const runToken = visionAutoRunToken;
  visionAutoIntervalMinutes = minutes;
  visionTimer = setInterval(() => {
    runVisionCaptureCycle(db, mainWindow, runToken).catch((error) => {
      console.error('[Vision Auto] Capture cycle failed:', error);
    });
  }, minutes * 60 * 1000);
}

function abortInFlightVisionCapture(): void {
  visionAutoAbortController?.abort();
  visionAutoAbortController = null;
}

function enterIdle(db: DatabaseService, mainWindow: BrowserWindow, idleSeconds: number): void {
  if (idleState === 'idle') return;

  const lastInputTime = new Date(Date.now() - idleSeconds * 1000);
  const lastInputAt = formatUtcStorageDateTime(lastInputTime);
  idleState = 'idle';
  currentIdlePeriodId = db.createIdlePeriod(lastInputAt);
  currentIdleStartedAt = lastInputAt;
  const purged = db.purgeVisionResultsSince(lastInputAt);

  clearResumeCaptureTimer();
  abortInFlightVisionCapture();
  syncDeskPetWorkflowState();

  if (!idleProbeTimer) {
    idleProbeTimer = setInterval(() => {
      if (visionTimer === null) {
        clearIdleProbeTimer();
        return;
      }
      const probeIdleSeconds = getSystemIdleSeconds();
      if (probeIdleSeconds < IDLE_THRESHOLD_SECONDS) {
        exitIdleAndScheduleResumeCapture(db, mainWindow, probeIdleSeconds);
      }
    }, IDLE_PROBE_INTERVAL_MS);
  }

  console.log(`[Vision Auto] Entered idle. start=${lastInputAt}, purged=${purged}`);
}

function exitIdleAndScheduleResumeCapture(db: DatabaseService, mainWindow: BrowserWindow, idleSeconds: number): void {
  if (idleState !== 'idle') return;

  const resumeTime = new Date(Date.now() - idleSeconds * 1000);
  const resumeAt = formatUtcStorageDateTime(resumeTime);
  const idleStartedAt = currentIdleStartedAt;
  if (currentIdlePeriodId) {
    db.closeIdlePeriod(currentIdlePeriodId, resumeAt);
  }

  idleState = 'active';
  currentIdlePeriodId = null;
  currentIdleStartedAt = null;
  clearIdleProbeTimer();
  clearResumeCaptureTimer();
  startVisionTimer(db, mainWindow, visionAutoIntervalMinutes);
  syncDeskPetWorkflowState();

  const idleStartedDate = parseUtcStorageDateTime(idleStartedAt || '');
  const resumeDate = parseUtcStorageDateTime(resumeAt);
  const actualIdleSeconds = idleStartedDate && resumeDate
    ? Math.max(0, Math.round((resumeDate.getTime() - idleStartedDate.getTime()) / 1000))
    : 0;
  const greeting = shouldSendReturnGreeting(db, actualIdleSeconds);
  if (greeting) {
    dispatchProactiveMessage(db, greeting);
  }

  const runToken = visionAutoRunToken;
  resumeCaptureTimer = setTimeout(() => {
    resumeCaptureTimer = null;
    if (visionTimer === null || runToken !== visionAutoRunToken) return;

    const latestIdleSeconds = getSystemIdleSeconds();
    if (latestIdleSeconds >= IDLE_THRESHOLD_SECONDS) {
      enterIdle(db, mainWindow, latestIdleSeconds);
      return;
    }

    runVisionCaptureCycle(db, mainWindow, runToken).catch((error) => {
      console.error('[Vision Auto] Resume capture failed:', error);
    });
  }, RESUME_CAPTURE_DELAY_MS);

  console.log(`[Vision Auto] Exited idle. end=${resumeAt}, resume capture scheduled.`);
}

/**
 * v2.2: 计算 approx_duration_sec
 * listVisionResultsByDate 按 created_at DESC 返回：
 * - 最新一条: min(now - created_at, 1800) (上限 30 分钟)
 * - 其他条: 上一条（更新）created_at - 本条 created_at (秒)
 * - 负值视为 0
 */
function computeApproxDuration(visionResults: { created_at: string }[], index: number): number {
  const current = parseUtcStorageDateTime(visionResults[index].created_at)?.getTime();
  if (current === undefined) return 0;
  const end = index === 0
    ? Date.now()
    : parseUtcStorageDateTime(visionResults[index - 1].created_at)?.getTime();
  if (end === undefined) return 0;
  const diff = Math.round((end - current) / 1000);
  return Math.min(Math.max(0, diff), 1800);
}

/**
 * v2.2: 创建 tracker 回调。
 * session → 固化到数据库
 * snapshot → 推送前端 + 更新 lastTrackerContext
 */
function createTrackerCallback(db: DatabaseService, mainWindow: BrowserWindow): TrackerCallback {
  return (event) => {
    if (event.type === 'window') {
      appendWindowTraceSample(event.sample);
      lastTrackerContext = {
        app: event.sample.app,
        title: event.sample.title,
      };
      return;
    }

    if (event.type === 'session') {
      const { app, title, category, startTime, endTime } = event.session;
      const id = db.createRecord(
        { title, category, app, window_title: title, start_at: startTime, end_at: endTime, notes: '' },
        'auto'
      );
      const record = db.getRecord(id);
      if (record) {
        mainWindow.webContents.send(IPC_CHANNELS.TRACKER_EVENT, record);
      }
    } else {
      // snapshot
      lastTrackerContext = {
        app: event.session.app,
        title: event.session.title,
      };
      mainWindow.webContents.send(IPC_CHANNELS.TRACKER_SNAPSHOT, {
        app: event.session.app,
        title: event.session.title,
        category: '其他',
        startTime: event.session.startTime,
        endTime: event.session.endTime,
        durationMs: event.session.durationMs,
      });
    }
  };
}

/**
 * v2.2: Vision Auto 单次截屏 + 识别 + 存储 + 推送
 */
async function runVisionCaptureCycle(db: DatabaseService, mainWindow: BrowserWindow, runToken: number): Promise<void> {
  if (visionTimer === null || runToken !== visionAutoRunToken) return;

  const idleSeconds = getSystemIdleSeconds();
  if (idleSeconds >= IDLE_THRESHOLD_SECONDS) {
    enterIdle(db, mainWindow, idleSeconds);
    return;
  }
  if (idleState === 'idle') {
    exitIdleAndScheduleResumeCapture(db, mainWindow, idleSeconds);
    return;
  }

  if (visionCaptureInFlight) {
    console.warn('[Vision Auto] Previous capture is still running; skipped this tick.');
    return;
  }

  visionCaptureInFlight = true;
  syncDeskPetWorkflowState();
  const abortController = new AbortController();
  visionAutoAbortController = abortController;
  let completed = false;
  try {
    if (visionTimer === null || runToken !== visionAutoRunToken) return;

    const apiKey = getApiKey(db);
    if (!apiKey) return;
    const model = getVisionModel(db);

    const buf = await captureScreenshot(mainWindow);
    const base64 = buf.toString('base64');

    const ctxApp = lastTrackerContext.app || '截图';
    const ctxTitle = lastTrackerContext.title || '自动识别';
    const windowTraceText = buildRecentWindowTraceText(visionAutoIntervalMinutes);

    if (visionTimer === null || runToken !== visionAutoRunToken) return;

    const previousSegment = getPreviousVisionSegmentContext(db);
    const result = await analyzeWithVision(apiKey, model, base64, ctxApp, ctxTitle, windowTraceText, previousSegment, abortController.signal, getApiBaseUrl(db), getManagedCategoryNames(db), db.getSetting('language', 'zh-CN') === 'en-US' ? 'en-US' : 'zh-CN');
    if (visionTimer === null || runToken !== visionAutoRunToken) return;
    const latestIdleSeconds = getSystemIdleSeconds();
    if (latestIdleSeconds >= IDLE_THRESHOLD_SECONDS) {
      enterIdle(db, mainWindow, latestIdleSeconds);
      return;
    }

    db.addVisionResult({
      record_id: '',
      title: result.title,
      category: result.category as any,
      summary: result.summary,
      observed_fact: result.observed_fact,
      possible_activity: result.possible_activity,
      confidence: result.confidence,
      activity_type: result.activity_type,
      segment_merge: result.segment_merge,
      raw_response: JSON.stringify(result),
      stuck_signal: result.stuck_signal,
      distraction_signal: result.distraction_signal,
      content_mood: result.content_mood,
      app: ctxApp,
      window_title: ctxTitle,
      model,
    });
    const vr = db.listVisionResults(1)[0];
    if (vr) {
      mainWindow.webContents.send(IPC_CHANNELS.VISION_ON_RESULT, vr);
      completed = true;
      showDeskPetDoneThenResume();
      const proactiveMessage = shouldSendVisionProactiveMessage(db, vr);
      if (proactiveMessage) {
        dispatchProactiveMessage(db, proactiveMessage);
      }
    }
  } finally {
    if (visionAutoAbortController === abortController) {
      visionAutoAbortController = null;
    }
    visionCaptureInFlight = false;
    if (!completed) {
      syncDeskPetWorkflowState();
    }
  }
}

function startVisionAuto(db: DatabaseService, mainWindow: BrowserWindow, interval: unknown): number {
  const minutes = normalizeScreenshotInterval(interval);
  clearIdleProbeTimer();
  clearResumeCaptureTimer();
  idleState = 'active';
  currentIdlePeriodId = null;
  startVisionTimer(db, mainWindow, minutes);
  syncDeskPetWorkflowState();
  return minutes;
}

function stopVisionAuto(): void {
  visionAutoRunToken += 1;
  abortInFlightVisionCapture();
  clearIdleProbeTimer();
  clearResumeCaptureTimer();
  idleState = 'active';
  currentIdlePeriodId = null;
  if (visionTimer) {
    clearInterval(visionTimer);
    visionTimer = null;
  }
  syncDeskPetWorkflowState();
}

function sendToChatSender(sender: Electron.WebContents, channel: string, payload: unknown): void {
  if (sender.isDestroyed()) return;
  sender.send(channel, payload);
}

function normalizeChatStreamId(value: unknown): string {
  if (typeof value === 'string' && /^[a-zA-Z0-9_-]{8,96}$/.test(value) && !chatStreamAbortControllers.has(value)) {
    return value;
  }
  return randomUUID();
}

function getLatestUserChatMessage(messages: ChatMessage[]): ChatMessage | undefined {
  return [...messages].reverse().find((message) => (
    message.role === 'user' &&
    typeof message.content === 'string' &&
    message.content.trim().length > 0
  ));
}

function tryAddChatMessage(db: DatabaseService, message: {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  replyToMessageId?: string;
  responseLatencyMs?: number;
  visionUnderstandingLatencyMs?: number;
  totalWaitLatencyMs?: number;
}): string | undefined {
  try {
    return db.addChatMessage(message);
  } catch (error) {
    console.warn('[Chat] Failed to persist chat message:', error);
    return undefined;
  }
}

function tryAddCompletedChatTurn(
  db: DatabaseService,
  userMessageId: string | undefined,
  assistantContent: string,
  timings?: {
    responseLatencyMs?: number;
    visionUnderstandingLatencyMs?: number;
    totalWaitLatencyMs?: number;
  }
): { userMessageId?: string; assistantMessageId: string; turn: number } | undefined {
  const reply = assistantContent.trim();
  if (!reply) return undefined;
  const assistantMessageId = tryAddChatMessage(db, {
    role: 'assistant',
    content: reply,
    replyToMessageId: userMessageId,
    responseLatencyMs: timings?.responseLatencyMs,
    visionUnderstandingLatencyMs: timings?.visionUnderstandingLatencyMs,
    totalWaitLatencyMs: timings?.totalWaitLatencyMs,
  });
  if (!assistantMessageId) return undefined;
  return { userMessageId, assistantMessageId, turn: db.advanceMemoryTurn() };
}

function scheduleChatCompaction(
  db: DatabaseService,
  params: { apiKey: string; model: string; apiBaseUrl: string; language: 'zh-CN' | 'en-US' }
): void {
  const batch = db.claimNextChatCompactionBatch();
  if (!batch) return;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.MEMORY_UPDATED);
  }
  let settled = false;
  const leaseTimer = setTimeout(() => {
    if (settled) return;
    settled = true;
    const retry = db.failChatCompaction(batch.id, new Error('整理器超过 10 分钟未完成，已自动释放。'));
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.MEMORY_UPDATED);
    }
    if (retry.nextRetryAt) scheduleChatCompactionRetry(db, params, retry.nextRetryAt);
  }, 10 * 60 * 1000);

  void (async () => {
    const toolPass = await runChatCompactionToolPass(db, { ...params, batch });
    const result = await compactChatMemory(params.apiKey, params.model, {
      previousSummary: batch.previousSummary,
      messages: batch.messages,
      retrievedMemoryIndex: toolPass.residentIndex,
      retrievedDetails: toolPass.retrievedDetails,
      realtimeExtractedMessageIds: db.listRealtimeExtractedMessageIds(batch.messages.map((message) => message.id)),
    }, params.apiBaseUrl, params.language);
    if (settled) return;
    db.completeChatCompaction(batch.id, {
      conversationSummary: result.conversation_summary,
      events: result.events,
      elements: result.elements,
      calls: toolPass.calls,
      residentMemory: toolPass.residentMemory,
    });
    settled = true;
    clearTimeout(leaseTimer);
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.MEMORY_UPDATED);
    }
    scheduleChatCompaction(db, params);
  })().catch((error) => {
    if (settled) return;
    settled = true;
    clearTimeout(leaseTimer);
    const retry = db.failChatCompaction(batch.id, error);
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.MEMORY_UPDATED);
    }
    if (retry.nextRetryAt) scheduleChatCompactionRetry(db, params, retry.nextRetryAt);
    console.warn('[Memory] Chat compaction failed:', error);
  });
}

function scheduleChatCompactionRetry(
  db: DatabaseService,
  params: { apiKey: string; model: string; apiBaseUrl: string; language: 'zh-CN' | 'en-US' },
  retryAt: string,
): void {
  if (chatCompactionRetryTimer) clearTimeout(chatCompactionRetryTimer);
  const retryAtDate = parseUtcStorageDateTime(retryAt);
  const delayMs = Math.max(0, (retryAtDate?.getTime() || Date.now()) - Date.now());
  chatCompactionRetryTimer = setTimeout(() => {
    chatCompactionRetryTimer = null;
    scheduleChatCompaction(db, params);
  }, delayMs);
}

function resumeChatCompactionQueue(db: DatabaseService): void {
  const apiKey = getApiKey(db);
  if (!apiKey) return;
  scheduleChatCompaction(db, {
    apiKey,
    model: getChatModel(db),
    apiBaseUrl: getApiBaseUrl(db),
    language: getAppLanguage(db),
  });
}

/** 回复已落库后异步执行；未命中词表时不产生任何模型调用。 */
function scheduleRealtimeMemoryExtraction(
  db: DatabaseService,
  persisted: { userMessageId?: string; turn: number },
  userMessage: string
): void {
  const criticality = matchRealtimeMemoryCriticality(userMessage);
  if (!criticality || !persisted.userMessageId) return;
  if (!db.claimRealtimeMemoryExtraction(persisted.userMessageId, criticality)) return;
  const apiKey = getApiKey(db);
  if (!apiKey) {
    db.failRealtimeMemoryExtraction(persisted.userMessageId);
    return;
  }
  void extractRealtimeMemoryEvent(apiKey, getChatModel(db), userMessage, getApiBaseUrl(db), getAppLanguage(db))
    .then(({ event }) => {
      const eventIds = event
        ? db.createMemoryEvents([{ ...event, criticality, confidence: 0.95 }], [persisted.userMessageId!], persisted.turn, userMessage)
        : [];
      db.finishRealtimeMemoryExtraction(persisted.userMessageId!, eventIds);
      if (eventIds.length > 0) {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.MEMORY_UPDATED);
        }
      }
    })
    .catch((error) => {
      db.failRealtimeMemoryExtraction(persisted.userMessageId!);
      console.warn('[Memory] Realtime extraction failed:', error);
    });
}

interface PendingMemoryProposal {
  sourceMessageIds: string[];
  evidence: Array<{ message_id: string; quote: string }>;
  changes: Array<Record<string, unknown>>;
}

interface MemoryToolPassResult {
  toolMode: boolean;
  usedEventIds: string[];
  usedElementIds: string[];
  proposals: PendingMemoryProposal[];
  reply: string | null;
  calls: MemoryToolDebugCall[];
  fallbackContext: string;
  fallbackReason?: string;
}

function asStringArray(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].slice(0, limit)
    : [];
}

function compactEventIndex(events: ReturnType<DatabaseService['findMemoryEventsForChat']>): string {
  return events.map((event) => `[${event.id}] ${event.title}｜${event.summary}｜#${event.tags.join(' #')}`).join('\n');
}

function compactElementIndex(elements: ReturnType<DatabaseService['findMemoryElementsForChat']>): string {
  return elements.map((element) => `[${element.id}] ${element.name}｜${element.type}｜${element.current_state || '未形成稳定状态'}｜关联 ${element.event_count} 个事件`).join('\n');
}

function getToolDateRange(arguments_: Record<string, unknown>): { start: string; end: string } | { error: string } {
  const start = typeof arguments_.start_date === 'string' ? arguments_.start_date.trim() : '';
  const end = typeof arguments_.end_date === 'string' ? arguments_.end_date.trim() : '';
  const isDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };
  if (!isDate(start) || !isDate(end) || start > end) return { error: 'start_date 和 end_date 必须是顺序正确的 YYYY-MM-DD 本地日期' };
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
  if (days > 31) return { error: '单次最多查询 31 天，请缩小日期范围' };
  return { start, end };
}

function getToolLimit(arguments_: Record<string, unknown>): number {
  return Math.max(1, Math.min(40, Math.floor(Number(arguments_.limit) || 20)));
}

function getToolQuery(arguments_: Record<string, unknown>): string | undefined {
  const query = typeof arguments_.query === 'string' ? arguments_.query.trim().slice(0, 200) : '';
  return query || undefined;
}

function formatVisionResultsForTool(results: ReturnType<DatabaseService['listVisionResultsByDate']>): Array<Record<string, unknown>> {
  return results.slice().reverse().map((item) => ({
    id: item.id,
    at: formatUtcStorageDateTimeLocal(item.created_at),
    title: item.title,
    category: item.category,
    activity_type: item.activity_type || 'unclear',
    confidence: item.confidence || 'medium',
    observed_fact: item.observed_fact || '',
    possible_activity: item.possible_activity || item.summary,
    app: item.app,
    window_title: item.window_title,
  }));
}

function formatRecordsForTool(records: ReturnType<DatabaseService['listRecords']>): Array<Record<string, unknown>> {
  return records.slice().reverse().map((item) => ({
    id: item.id,
    start_at: formatUtcStorageDateTimeLocal(item.start_at),
    end_at: formatUtcStorageDateTimeLocal(item.end_at),
    title: item.title,
    category: item.category,
    app: item.app,
    window_title: item.window_title,
    notes: item.notes,
    source: item.source,
  }));
}

function expandEventForTool(db: DatabaseService, id: string, level: number): Record<string, unknown> | undefined {
  const event = db.getMemoryEvent(id);
  if (!event) return undefined;
  if (level === 1) return { id: event.id, timestamp: event.timestamp, title: event.title, summary: event.summary, narrative: event.narrative, tags: event.tags };
  if (level === 2) return {
    id: event.id, timestamp: event.timestamp, title: event.title, narrative: event.narrative,
    elements: event.elements.map((element) => ({ id: element.id, name: element.name, type: element.type, role: element.role })),
    relations: event.relations,
  };
  return { id: event.id, timestamp: event.timestamp, title: event.title, quotes: event.quotes, source_refs: event.source_refs };
}

function expandElementForTool(db: DatabaseService, id: string, level: number): Record<string, unknown> | undefined {
  const element = db.getMemoryElement(id);
  if (!element) return undefined;
  if (level === 1) return { id: element.id, name: element.name, type: element.type, current_state: element.current_state, event_count: element.event_count };
  if (level === 2) return {
    id: element.id, name: element.name, type: element.type, current_state: element.current_state,
    events: element.events.slice(0, 12).map((event) => ({ id: event.id, timestamp: event.timestamp, title: event.title, summary: event.summary })),
  };
  return {
    id: element.id, name: element.name, type: element.type, current_state: element.current_state,
    state_history: db.listMemoryElementStateHistory(id),
    events: element.events.slice(0, 12).map((event) => ({ id: event.id, timestamp: event.timestamp, title: event.title })),
  };
}

async function runMemoryToolPass(
  db: DatabaseService,
  params: {
    apiKey: string;
    model: string;
    apiBaseUrl: string;
    messages: ChatMessage[];
    sourceMessages: ChatHistoryMessage[];
    memoryContext: { text: string; retrievedEventIds: string[]; retrievedElementIds: string[] };
    language: 'zh-CN' | 'en-US';
    onStatus?: (status: string) => void;
  }
): Promise<MemoryToolPassResult> {
  const sourceById = new Map<string, ReturnType<DatabaseService['listChatMessages']>[number]>();
  const accessibleEventIds = new Set(params.memoryContext.retrievedEventIds);
  const accessibleElementIds = new Set(params.memoryContext.retrievedElementIds);
  const proposals: PendingMemoryProposal[] = [];
  const toolTranscript: Array<Record<string, unknown>> = [];
  const fallbackContextParts: string[] = [];
  const debugCalls: MemoryToolDebugCall[] = [];
  params.sourceMessages.forEach((message) => sourceById.set(message.id, message));

  // 小黄鸭不是长链任务 agent：最多两轮读取，第三次请求必须收束成自然回复。
  for (let toolRounds = 0; ; toolRounds += 1) {
    const allowTools = toolRounds < 2;
    const turn = await requestMemoryChatTurn(
      params.apiKey,
      params.model,
      params.messages,
      params.memoryContext.text,
      params.apiBaseUrl,
      toolTranscript,
      allowTools,
      params.language,
    );
    if (!turn.supported) {
      return {
        toolMode: false,
        usedEventIds: [],
        usedElementIds: [],
        proposals: [],
        reply: null,
        calls: debugCalls,
        fallbackContext: fallbackContextParts.join('\n\n'),
        fallbackReason: turn.error || '模型服务未返回兼容的工具调用响应，本轮回退为普通聊天。',
      };
    }
    if (turn.calls.length === 0) {
      return {
        toolMode: true,
        usedEventIds: turn.usedEventIds.filter((id) => accessibleEventIds.has(id)),
        usedElementIds: turn.usedElementIds.filter((id) => accessibleElementIds.has(id)),
        proposals,
        reply: turn.content.trim() || (params.language === 'en-US' ? 'Hmm… I did not find a good answer just now. Could you ask me again?' : '嗯……我刚刚没想出合适的话。你再问我一次？'),
        calls: debugCalls,
        fallbackContext: fallbackContextParts.join('\n\n'),
      };
    }

    params.onStatus?.(turn.calls.some((call) => call.name === 'search_vision_results' || call.name === 'search_records')
      ? chatStatus(params.language, 'searchingRecords')
      : turn.calls.some((call) => call.name === 'search_events' || call.name === 'search_elements')
        ? chatStatus(params.language, 'searchingMemory')
        : turn.calls.some((call) => call.name === 'expand_event' || call.name === 'expand_element')
        ? chatStatus(params.language, 'expandingMemory')
        : chatStatus(params.language, 'organizingMemory'));
    const calls = turn.calls.slice(0, 6);
    const outputs: Array<{ call: MemoryToolCall; output: Record<string, unknown> }> = [];
    for (const call of calls) {
      const output = executeMemoryToolCall(db, call, { sourceById, accessibleEventIds, accessibleElementIds, proposals });
      outputs.push({ call, output });
      debugCalls.push({ name: call.name, arguments: call.arguments, result: output });
      fallbackContextParts.push(`${call.name}:\n${JSON.stringify(output)}`);
    }
    toolTranscript.push({
      role: 'assistant', content: null,
      tool_calls: calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } })),
    });
    outputs.forEach(({ call, output }) => toolTranscript.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) }));
    params.onStatus?.(turn.calls.some((call) => call.name === 'search_vision_results' || call.name === 'search_records')
      ? chatStatus(params.language, 'recordsFound')
      : turn.calls.some((call) => call.name === 'search_events' || call.name === 'search_elements')
        ? chatStatus(params.language, 'memoryFound')
        : chatStatus(params.language, 'organizingReply'));
  }
}

function executeMemoryToolCall(
  db: DatabaseService,
  call: MemoryToolCall,
  state: {
    sourceById: Map<string, { id: string; role: 'user' | 'assistant'; content: string }>;
    accessibleEventIds: Set<string>;
    accessibleElementIds: Set<string>;
    proposals: PendingMemoryProposal[];
  }
): Record<string, unknown> {
  if (call.name === 'search_events') {
    const query = typeof call.arguments.query === 'string' ? call.arguments.query.trim().slice(0, 200) : '';
    const limit = Math.max(1, Math.min(6, Number(call.arguments.limit) || 6));
    if (!query) return { ok: false, error: 'query 不能为空' };
    const events = db.findMemoryEventsForChat(query, limit);
    events.forEach((event) => state.accessibleEventIds.add(event.id));
    return { ok: true, events: compactEventIndex(events) };
  }
  if (call.name === 'expand_event') {
    const id = typeof call.arguments.id === 'string' ? call.arguments.id : '';
    const level = Math.max(1, Math.min(3, Number(call.arguments.level) || 1));
    if (!state.accessibleEventIds.has(id)) return { ok: false, error: '只能展开本轮已检索到的事件卡' };
    const event = expandEventForTool(db, id, level);
    if (!event) return { ok: false, error: '事件卡不存在' };
    if (level === 2 && Array.isArray(event.elements)) {
      event.elements.forEach((element) => {
        if (element && typeof element === 'object' && typeof (element as { id?: unknown }).id === 'string') state.accessibleElementIds.add((element as { id: string }).id);
      });
    }
    return { ok: true, event };
  }
  if (call.name === 'search_elements') {
    const query = typeof call.arguments.query === 'string' ? call.arguments.query.trim().slice(0, 200) : '';
    const limit = Math.max(1, Math.min(6, Number(call.arguments.limit) || 6));
    if (!query) return { ok: false, error: 'query 不能为空' };
    const elements = db.findMemoryElementsForChat(query, limit);
    elements.forEach((element) => state.accessibleElementIds.add(element.id));
    return { ok: true, elements: compactElementIndex(elements) };
  }
  if (call.name === 'expand_element') {
    const id = typeof call.arguments.id === 'string' ? call.arguments.id : '';
    const level = Math.max(1, Math.min(3, Number(call.arguments.level) || 1));
    if (!state.accessibleElementIds.has(id)) return { ok: false, error: '只能展开本轮已检索到的元素卡' };
    const element = expandElementForTool(db, id, level);
    return element ? { ok: true, element } : { ok: false, error: '元素卡不存在' };
  }
  if (call.name === 'search_vision_results') {
    const range = getToolDateRange(call.arguments);
    if ('error' in range) return { ok: false, error: range.error };
    const limit = getToolLimit(call.arguments);
    const results = db.listVisionResultsByDate({ start: range.start, end: range.end, q: getToolQuery(call.arguments), limit: limit + 1 });
    return {
      ok: true,
      source: 'vision_results',
      date_range: range,
      returned: Math.min(results.length, limit),
      truncated: results.length > limit,
      results: formatVisionResultsForTool(results.slice(0, limit)),
    };
  }
  if (call.name === 'search_records') {
    const range = getToolDateRange(call.arguments);
    if ('error' in range) return { ok: false, error: range.error };
    const limit = getToolLimit(call.arguments);
    const records = db.listRecords({ start: range.start, end: range.end, q: getToolQuery(call.arguments), limit: limit + 1 });
    return {
      ok: true,
      source: 'records',
      date_range: range,
      returned: Math.min(records.length, limit),
      truncated: records.length > limit,
      records: formatRecordsForTool(records.slice(0, limit)),
    };
  }
  if (call.name === 'propose_memory') {
    const sourceMessageIds = asStringArray(call.arguments.source_message_ids, 12);
    const rawEvidence = Array.isArray(call.arguments.evidence) ? call.arguments.evidence : [];
    const evidence = rawEvidence.flatMap((item): Array<{ message_id: string; quote: string }> => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      const messageId = typeof record.message_id === 'string' ? record.message_id : '';
      const quote = typeof record.quote === 'string' ? record.quote.trim().slice(0, 240) : '';
      const message = state.sourceById.get(messageId);
      return message && quote && message.content.includes(quote) ? [{ message_id: messageId, quote }] : [];
    });
    const rawChanges = Array.isArray(call.arguments.changes) ? call.arguments.changes : [];
    const changes = rawChanges.filter((change): change is Record<string, unknown> => {
      if (!change || typeof change !== 'object') return false;
      const kind = (change as Record<string, unknown>).kind;
      return kind === 'event' || kind === 'element' || kind === 'element_state';
    }).slice(0, 6);
    const hasUserEvidence = evidence.some((item) => state.sourceById.get(item.message_id)?.role === 'user');
    if (sourceMessageIds.length === 0 || sourceMessageIds.some((id) => !state.sourceById.has(id)) || evidence.length === 0 || !hasUserEvidence || changes.length === 0) {
      return { ok: false, error: '候选记忆必须引用本轮短期聊天中的来源 ID 和可核验原话' };
    }
    const userEvidence = evidence.filter((item) => state.sourceById.get(item.message_id)?.role === 'user');
    state.proposals.push({ sourceMessageIds, evidence: [...userEvidence, ...evidence.filter((item) => state.sourceById.get(item.message_id)?.role !== 'user')], changes });
    return { ok: true, status: 'queued', changes: changes.map((change) => change.kind) };
  }
  return { ok: false, error: '未知工具' };
}

async function runChatCompactionToolPass(
  db: DatabaseService,
  params: { apiKey: string; model: string; apiBaseUrl: string; batch: { previousSummary: string; messages: ChatHistoryMessage[] } }
): Promise<{
  residentIndex: string;
  residentMemory: Array<{ kind: 'event' | 'element'; id: string; label: string }>;
  retrievedDetails: string;
  calls: MemoryToolDebugCall[];
}> {
  const resident = db.listResidentMemory(20);
  const residentIndex = resident.map(({ kind, value }) => kind === 'event'
    ? `[${value.id}] 事件｜${value.title}｜${value.summary}｜#${value.tags.join(' #')}`
    : `[${value.id}] 元素｜${value.name}（${value.type}）｜当前状态：${value.current_state || '未形成稳定状态'}`
  ).join('\n');
  const residentMemory = resident.map(({ kind, value }) => ({
    kind,
    id: value.id,
    label: kind === 'event' ? value.title : value.name,
  }));
  const accessibleEventIds = new Set(resident.flatMap(({ kind, value }) => kind === 'event' ? [value.id] : []));
  const accessibleElementIds = new Set(resident.flatMap(({ kind, value }) => kind === 'element' ? [value.id] : []));
  const calls: MemoryToolDebugCall[] = [];
  const retrievedDetails: string[] = [];
  const toolTranscript: Array<Record<string, unknown>> = [];
  const sourceById = new Map<string, { id: string; role: 'user' | 'assistant'; content: string }>();
  const context = `此前会话摘要：\n${params.batch.previousSummary || '无'}\n\n本次待整理原文：\n${params.batch.messages.map((message) => `[${message.id}] ${message.role}: ${message.content}`).join('\n')}\n\n默认长期记忆 L0（事件卡与元素卡共用前 20 条）：\n${residentIndex || '无'}`;

  for (let round = 0; round < 3; round += 1) {
    const planning = await requestChatCompactionToolCalls(params.apiKey, params.model, context, params.apiBaseUrl, toolTranscript, getAppLanguage(db));
    if (!planning.supported || planning.calls.length === 0) break;
    const stepCalls = planning.calls.slice(0, 6);
    const outputs: Array<{ call: MemoryToolCall; output: Record<string, unknown> }> = [];
    for (const call of stepCalls) {
      const output = executeMemoryToolCall(db, call, {
        sourceById,
        accessibleEventIds,
        accessibleElementIds,
        proposals: [],
      });
      calls.push({ name: call.name, arguments: call.arguments, result: output });
      retrievedDetails.push(`${call.name}: ${JSON.stringify(output).slice(0, 3200)}`);
      outputs.push({ call, output });
    }
    toolTranscript.push({
      role: 'assistant', content: null,
      tool_calls: stepCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } })),
    });
    outputs.forEach(({ call, output }) => toolTranscript.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(output) }));
  }
  return { residentIndex, residentMemory, retrievedDetails: retrievedDetails.join('\n\n'), calls };
}

function dispatchProactiveMessage(db: DatabaseService, message: ProactiveMessage): void {
  tryAddChatMessage(db, { id: message.id, role: 'assistant', content: message.content });
  sendDeskPetProactiveMessage(message);
  markProactiveMessageSent(db, message);
}

function sendLocalChatReply(sender: Electron.WebContents, streamId: string, reply: string): void {
  setTimeout(() => {
    sendToChatSender(sender, IPC_CHANNELS.CHAT_STREAM_DELTA, { streamId, type: 'content', delta: reply });
    sendToChatSender(sender, IPC_CHANNELS.CHAT_STREAM_DONE, { streamId });
    showDeskPetDoneThenResume(900);
  }, 80);
}

function startProactiveTimer(db: DatabaseService): void {
  if (proactiveTimer) return;

  const check = () => {
    try {
      const result = shouldSendWrapUp(db);
      if (!result) return;
      dispatchProactiveMessage(db, result.message);
    } catch (error) {
      console.warn('[ProactiveChat] Failed to check wrap-up trigger:', error);
    }
  };

  setTimeout(check, 30 * 1000);
  proactiveTimer = setInterval(check, 5 * 60 * 1000);
}

function trySendOpenGreeting(db: DatabaseService): void {
  try {
    const greeting = shouldSendOpenGreeting(db);
    if (greeting) dispatchProactiveMessage(db, greeting);
  } catch (error) {
    console.warn('[ProactiveChat] Failed to send open greeting:', error);
  }
}

export function registerIpcHandlers(db: DatabaseService, mainWindow: BrowserWindow): void {
  startProactiveTimer(db);
  // 启动后继续被异常中断的整理队列；过期 processing 已在数据库初始化时释放。
  setTimeout(() => resumeChatCompactionQueue(db), 0);

  // ===== 看图问鸭 =====
  ipcMain.handle(IPC_CHANNELS.DESK_PET_SCREEN_QUESTION_START, async (event) => {
    if (!isDeskPetChatSender(event.sender)) throw new Error('只能从桌宠聊天窗发起看图提问');
    const apiKey = getApiKey(db);
    if (!apiKey) throw new Error('请先配置 SiliconFlow API Key');

    screenQuestionAbortController?.abort();
    screenQuestionAbortController = null;
    // 必须先隐藏聊天窗，再捕获桌面；否则聊天气泡会成为截图上下文的一部分。
    hideDeskPetChatWindow();
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const screenshot = await captureDisplayScreenshot(display);
    const abortController = new AbortController();
    screenQuestionAbortController = abortController;
    // 用户框选和输入问题时，先并行完成低分辨率整屏观察；确认后只需补充高清框选细节。
    const fullObservation = describeScreenQuestion(
      apiKey,
      getVisionModel(db),
      { fullImageBase64: screenshot.context.toString('base64') },
      abortController.signal,
      getApiBaseUrl(db),
      getAppLanguage(db),
    )
      .then((content): ScreenQuestionObservation => ({ ok: true, content, completedAt: Date.now() }))
      .catch((error): ScreenQuestionObservation => ({ ok: false, error, completedAt: Date.now() }));
    const pending = { id: randomUUID(), abortController, fullObservation };
    pendingScreenQuestion = pending;
    openDeskPetScreenQuestionWindow(display, `data:image/jpeg;base64,${screenshot.overlay.toString('base64')}`);
  });

  ipcMain.handle(IPC_CHANNELS.DESK_PET_SCREEN_QUESTION_CANCEL, (event) => {
    if (!isDeskPetScreenQuestionSender(event.sender)) return;
    pendingScreenQuestion = null;
    screenQuestionAbortController?.abort();
    screenQuestionAbortController = null;
    closeDeskPetScreenQuestionWindow();
    showDeskPetChatWindow();
    syncDeskPetWorkflowState();
  });

  ipcMain.handle(IPC_CHANNELS.DESK_PET_SCREEN_QUESTION_SUBMIT, async (event, payload: { question?: unknown; cropDataUrl?: unknown }) => {
    if (!isDeskPetScreenQuestionSender(event.sender)) throw new Error('无效的看图提问请求');
    const pending = pendingScreenQuestion;
    const question = typeof payload?.question === 'string' ? payload.question.trim().replace(/\s+/g, ' ') : '';
    const cropDataUrl = typeof payload?.cropDataUrl === 'string' ? payload.cropDataUrl : '';
    const cropMatch = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(cropDataUrl);
    if (!pending || !question || question.length > 500 || !cropMatch || cropMatch[1].length > 8_000_000) {
      throw new Error('框选区域或问题无效，请重新选择');
    }

    const apiKey = getApiKey(db);
    if (!apiKey) throw new Error('请先配置 SiliconFlow API Key');
    const abortController = pending.abortController;
    const confirmedAt = Date.now();
    setDeskPetState('thinking');
    // 确认后立刻还桌面给用户。视觉观察和小黄鸭回复是后台的一件连续任务，
    // 但聊天窗会先占住这条问题的位置，避免后来消息插到它前面。
    pendingScreenQuestion = null;
    closeDeskPetScreenQuestionWindow();
    sendDeskPetScreenQuestionToChat({
      kind: 'chatPending',
      id: pending.id,
      message: `我框选了桌面中的一个区域，想问：${question}`,
    });

    const focusObservation = describeScreenQuestion(
      apiKey,
      getVisionModel(db),
      { focusImageBase64: cropMatch[1] },
      abortController.signal,
      getApiBaseUrl(db),
      getAppLanguage(db),
    )
      .then((content): ScreenQuestionObservation => ({ ok: true, content, completedAt: Date.now() }))
      .catch((error): ScreenQuestionObservation => ({ ok: false, error, completedAt: Date.now() }));

    void Promise.all([pending.fullObservation, focusObservation])
      .then(([full, focus]) => {
        if (abortController.signal.aborted) return;
        const failed = [full, focus].find((result) => !result.ok);
        if (failed && !failed.ok) throw failed.error;
        const visionReadyAt = Math.max(full.completedAt, focus.completedAt);
        screenQuestionTimings.set(pending.id, {
          confirmedAt,
          visionUnderstandingLatencyMs: Math.max(0, visionReadyAt - confirmedAt),
        });
        setTimeout(() => screenQuestionTimings.delete(pending.id), 10 * 60 * 1000);
        sendDeskPetScreenQuestionToChat({
          kind: 'chatReady',
          id: pending.id,
          message: `我框选了桌面中的一个区域，想问：${question}\n\n【整屏截图观察（仅描述画面，供你回答时参考）】\n${full.content}\n\n【框选区域观察（仅描述画面，供你回答时参考）】\n${focus.content}`,
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          sendDeskPetScreenQuestionToChat({ kind: 'chatError', id: pending.id, message: '看图提问已取消。' });
          return;
        }
        sendDeskPetScreenQuestionToChat({
          kind: 'chatError',
          id: pending.id,
          message: error instanceof Error ? error.message : '截图观察暂时失败，请重试。',
        });
      })
      .finally(() => {
        if (screenQuestionAbortController === abortController) screenQuestionAbortController = null;
        syncDeskPetWorkflowState();
      });
  });

  // open_greeting: 主窗口 show 时打招呼（5 分钟冷却，防连点）
  let lastGreetingAt = 0;
  const GREETING_COOLDOWN_MS = 5 * 60 * 1000;

  mainWindow.on('show', () => {
    const now = Date.now();
    if (now - lastGreetingAt < GREETING_COOLDOWN_MS) return;
    lastGreetingAt = now;
    trySendOpenGreeting(db);
  });

  // ===== Proactive: Offwork Prediction =====
  ipcMain.handle(IPC_CHANNELS.PROACTIVE_OFFWORK_PREDICTION, () => {
    const days = buildRecentOffworkDays(db);
    return predictOffworkTime(days);
  });

  // ===== Records =====
  ipcMain.handle(IPC_CHANNELS.RECORDS_LIST, (_e, query: RecordsQuery) => {
    return db.listRecords(query);
  });

  ipcMain.handle(IPC_CHANNELS.RECORDS_GET, (_e, id: string) => {
    return db.getRecord(id);
  });

  ipcMain.handle(IPC_CHANNELS.RECORDS_CREATE, (_e, dto: RecordUpsertDTO) => {
    return db.createRecord(dto, 'manual');
  });

  ipcMain.handle(IPC_CHANNELS.RECORDS_UPDATE, (_e, id: string, dto: Partial<RecordUpsertDTO>) => {
    db.updateRecord(id, dto);
  });

  ipcMain.handle(IPC_CHANNELS.RECORDS_DELETE, (_e, id: string) => {
    db.deleteRecord(id);
  });

  ipcMain.handle(IPC_CHANNELS.RECORDS_DELETE_BATCH, (_e, ids: string[]) => {
    db.deleteRecords(ids);
  });

  ipcMain.handle(IPC_CHANNELS.RECORDS_SET_TAG, (_e, id: string, tag: string, enabled: boolean) => {
    db.setRecordTag(id, tag as '成果' | '不写入日报', enabled);
  });

  ipcMain.handle(IPC_CHANNELS.RECORDS_UPDATE_CATEGORY, (_e, id: string, cat: string) => {
    db.updateRecordCategory(id, cat);
  });

  ipcMain.handle(IPC_CHANNELS.CATEGORIES_SAVE, (_e, payload: { categories: string[]; renames?: Array<{ from: string; to: string }> }) => {
    const categories = normalizeManagedCategories(payload?.categories);
    db.saveManagedCategories(categories, payload?.renames || []);
    return categories;
  });

  // ===== Reports =====
  ipcMain.handle(IPC_CHANNELS.REPORTS_LIST, (_e, query: ReportsQuery) => {
    return db.listReports(query);
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_GET, (_e, id: string) => {
    return db.getReport(id);
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_CREATE, (_e, report: any) => {
    return db.createReport(report);
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_UPDATE, (_e, id: string, content: string) => {
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new Error('报告内容不能为空');
    }
    return db.updateReportContent(id, content);
  });

  ipcMain.handle(IPC_CHANNELS.REPORTS_DELETE, (_e, id: string) => {
    db.deleteReport(id);
  });

  // v2.2: REPORTS_GENERATE — 双数据源：vision_results（主）+ records（辅）
  ipcMain.handle(IPC_CHANNELS.REPORTS_GENERATE, async (_e, params) => {
    setDeskPetState('thinking');
    let completed = false;
    try {
      const { report_type, template, start_date, end_date, custom_prompt } = params;
      const apiKey = getApiKey(db);
      const model = getReportModel(db);

      if (!apiKey) throw new Error('请先配置 SiliconFlow API Key');

      const visionResults = db.listVisionResultsByDate({
        start: start_date,
        end: end_date,
        limit: 500,
      });
      const records = db.listRecords({
        start: start_date,
        end: end_date,
        limit: 500,
      });
      const idlePeriods = db.listIdlePeriodsByDateRange({
        start: start_date,
        end: end_date,
        limit: 100,
      });

      const content = await generateReport(apiKey, model, {
        visionResults,
        records,
        idlePeriods,
        template,
        reportType: report_type,
        startDate: start_date,
        endDate: end_date,
        language: db.getSetting('language', 'zh-CN') === 'en-US' ? 'en-US' : 'zh-CN',
        customPrompt: typeof custom_prompt === 'string' ? custom_prompt : '',
      }, getApiBaseUrl(db));

      const id = db.createReport({
        report_type,
        template,
        start_date,
        end_date,
        content,
      });

      completed = true;
      showDeskPetDoneThenResume();
      return db.getReport(id);
    } finally {
      if (!completed) {
        syncDeskPetWorkflowState();
      }
    }
  });

  // ===== Settings =====
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_e, key: string, defaultVal?: string) => {
    return db.getSetting(key, defaultVal || '');
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_e, key: string, value: string) => {
    db.setSetting(key, value);
    if (key === 'language') {
      updateTrayLanguage(value === 'en-US' ? 'en-US' : 'zh-CN');
      refreshDeskPetLanguage();
    }
    if (key === 'desk_pet_enabled') {
      setDeskPetEnabled(value === 'true');
      syncDeskPetWorkflowState();
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, () => {
    return db.getAllSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_API_KEY, () => {
    return getApiKey(db);
  });

  // ===== Desk Pet =====
  ipcMain.handle(IPC_CHANNELS.DESK_PET_SET_ENABLED, (_e, enabled: boolean) => {
    const nextEnabled = Boolean(enabled);
    db.setSetting('desk_pet_enabled', String(nextEnabled));
    setDeskPetEnabled(nextEnabled);
    syncDeskPetWorkflowState();
  });

  ipcMain.handle(IPC_CHANNELS.DESK_PET_SET_STATE, (_e, state: DeskPetState) => {
    if (!isDeskPetState(state)) {
      throw new Error(`Invalid desk pet state: ${String(state)}`);
    }
    setDeskPetState(state);
  });

  ipcMain.handle(IPC_CHANNELS.DESK_PET_STATUS, () => {
    return {
      enabled: db.getSetting('desk_pet_enabled', String(DEFAULT_SETTINGS.desk_pet_enabled)) === 'true',
      visible: isDeskPetWindowVisible(),
      state: getDeskPetState(),
    };
  });

  // ===== Tracker =====
  const handleTrackerEvent = createTrackerCallback(db, mainWindow);

  ipcMain.handle(IPC_CHANNELS.TRACKER_START, () => {
    if (!tracker) {
      tracker = new ActivityTracker(mainWindow);
    }
    tracker.start(handleTrackerEvent);
    syncDeskPetWorkflowState();
  });

  ipcMain.handle(IPC_CHANNELS.TRACKER_STOP, () => {
    if (tracker) {
      tracker.stop();
      tracker = null;
    }
    syncDeskPetWorkflowState();
  });

  ipcMain.handle(IPC_CHANNELS.TRACKER_STATUS, () => {
    return { running: tracker?.isRunning || false };
  });

  // ===== Vision =====
  ipcMain.handle(IPC_CHANNELS.VISION_ANALYZE_ONCE, async () => {
    setDeskPetState('thinking');
    let completed = false;
    const apiKey = getApiKey(db);
    const model = getVisionModel(db);
    try {
      if (!apiKey) throw new Error('请先配置 API Key');

      const buf = await captureScreenshot(mainWindow);
      const base64 = buf.toString('base64');

      const ctxApp = lastTrackerContext.app || '截图';
      const ctxTitle = lastTrackerContext.title || '截图识别';
      const windowTraceText = buildRecentWindowTraceText(visionAutoIntervalMinutes);

      const previousSegment = getPreviousVisionSegmentContext(db);
      const result = await analyzeWithVision(apiKey, model, base64, ctxApp, ctxTitle, windowTraceText, previousSegment, undefined, getApiBaseUrl(db), getManagedCategoryNames(db), db.getSetting('language', 'zh-CN') === 'en-US' ? 'en-US' : 'zh-CN');
      const id = db.addVisionResult({
        record_id: '',
        title: result.title,
        category: result.category as any,
        summary: result.summary,
        observed_fact: result.observed_fact,
        possible_activity: result.possible_activity,
        confidence: result.confidence,
        activity_type: result.activity_type,
        segment_merge: result.segment_merge,
        raw_response: JSON.stringify(result),
        stuck_signal: result.stuck_signal,
        distraction_signal: result.distraction_signal,
        content_mood: result.content_mood,
        app: ctxApp,
        window_title: ctxTitle,
        model,
      });

      const vr = db.listVisionResults(1)[0];
      if (vr) {
        mainWindow.webContents.send(IPC_CHANNELS.VISION_ON_RESULT, vr);
      }
      completed = true;
      showDeskPetDoneThenResume();
      return id;
    } finally {
      if (!completed) {
        syncDeskPetWorkflowState();
      }
    }
  });

  ipcMain.handle(IPC_CHANNELS.VISION_START_AUTO, (_e, interval: number) => {
    const minutes = startVisionAuto(db, mainWindow, interval);
    db.setSetting('screenshot_interval', String(minutes));
    db.setSetting('auto_vision_toggle', 'true');
    syncDeskPetWorkflowState();
  });

  ipcMain.handle(IPC_CHANNELS.VISION_STOP_AUTO, () => {
    stopVisionAuto();
    db.setSetting('auto_vision_toggle', 'false');
    syncDeskPetWorkflowState();
  });

  ipcMain.handle(IPC_CHANNELS.VISION_RESULTS, (_e, limit?: number) => {
    return db.listVisionResults(limit || 20);
  });

  ipcMain.handle(IPC_CHANNELS.VISION_DELETE_RESULT, (_e, id: string) => {
    db.deleteVisionResult(id);
  });

  // v2.2: 按日期范围查询 vision_results，返回附带 approx_duration_sec 的增强数据
  ipcMain.handle(IPC_CHANNELS.VISION_LIST_BY_DATE, (_e, query: VisionQuery) => {
    const results = db.listVisionResultsByDate(query);
    return results.map((vr, i) => ({
      ...vr,
      approx_duration_sec: computeApproxDuration(results, i),
    }));
  });

  // v2.2: Vision Auto 运行状态
  ipcMain.handle(IPC_CHANNELS.VISION_AUTO_STATUS, () => {
    return { running: visionTimer !== null };
  });

  // ===== Idle Periods =====
  ipcMain.handle(IPC_CHANNELS.IDLE_LIST_BY_DATE, (_e, query: { start: string; end: string; limit?: number }) => {
    return db.listIdlePeriodsByDateRange(query);
  });

  // ===== 长期记忆 =====
  ipcMain.handle(IPC_CHANNELS.MEMORY_LIST, (_event, query) => db.listMemoryDashboard(query || {}));
  ipcMain.handle(IPC_CHANNELS.MEMORY_EVENT_GET, (_event, id: string) => db.getMemoryEvent(id));
  ipcMain.handle(IPC_CHANNELS.MEMORY_EVENT_UPDATE, (_event, id: string, update) => db.updateMemoryEvent(id, update || {}));
  ipcMain.handle(IPC_CHANNELS.MEMORY_EVENT_DELETE, (_event, id: string) => db.deleteMemoryEvent(id));
  ipcMain.handle(IPC_CHANNELS.MEMORY_EVENT_ACTION, (_event, id: string, action) => {
    if (!['pin', 'unpin', 'forget', 'restore'].includes(action)) throw new Error('不支持的记忆操作');
    db.actOnMemoryEvent(id, action);
  });
  ipcMain.handle(IPC_CHANNELS.MEMORY_ELEMENT_GET, (_event, id: string) => db.getMemoryElement(id));
  ipcMain.handle(IPC_CHANNELS.MEMORY_TOOL_DEBUG_LIST, (_event, limit?: number) => db.listMemoryToolDebugRuns(limit));
  ipcMain.handle(IPC_CHANNELS.MEMORY_TOOL_DEBUG_GET_BY_ASSISTANT_MESSAGE, (_event, assistantMessageId: string) => db.getMemoryToolDebugRunByAssistantMessageId(assistantMessageId));
  ipcMain.handle(IPC_CHANNELS.MEMORY_CHAT_RUNTIME_DEBUG, () => db.getChatMemoryRuntimeDebug());
  ipcMain.handle(IPC_CHANNELS.MEMORY_CHAT_COMPACTION_RETRY, (_event, id: string) => {
    const queued = db.retryChatCompaction(id);
    if (queued) {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.MEMORY_UPDATED);
      }
      resumeChatCompactionQueue(db);
    }
    return queued;
  });

  // ===== Chat =====
  ipcMain.handle(IPC_CHANNELS.CHAT_MESSAGES_LIST, (_event, query?: ChatMessagesQuery) => {
    return db.listChatMessages({
      q: query?.q || undefined,
      limit: query?.limit,
      before: query?.before,
    });
  });

  ipcMain.handle(IPC_CHANNELS.CHAT_QUEUE_MESSAGE, (_event, message: { id?: string; content?: string }) => {
    try {
      return db.queueChatMessage({
        id: typeof message?.id === 'string' ? message.id : undefined,
        content: typeof message?.content === 'string' ? message.content : '',
      });
    } catch (error) {
      console.warn('[Chat] Failed to queue chat message:', error);
      return undefined;
    }
  });

  ipcMain.handle(IPC_CHANNELS.CHAT_QUEUE_LIST, () => db.listQueuedChatMessages());

  ipcMain.handle(IPC_CHANNELS.CHAT_STREAM_START, async (event, messages: ChatMessage[], clientStreamId?: string, queuedMessageId?: string) => {
    const streamId = normalizeChatStreamId(clientStreamId);
    const abortController = new AbortController();
    chatStreamAbortControllers.set(streamId, abortController);
    setDeskPetState('thinking');
    let assistantContent = '';

    const sender = event.sender;
    const screenQuestionTiming = queuedMessageId ? screenQuestionTimings.get(queuedMessageId) : undefined;
    if (queuedMessageId) screenQuestionTimings.delete(queuedMessageId);
    const latestUserMessage = getLatestUserChatMessage(messages);
    // 用户一发出就保存，避免流式失败或退出时把原话一起丢掉。
    const persistedUserMessageId = (queuedMessageId ? db.promoteQueuedChatMessage(queuedMessageId) : undefined)
      || (latestUserMessage ? tryAddChatMessage(db, { role: 'user', content: latestUserMessage.content }) : undefined);
    if (latestUserMessage) {
      sendDeskPetChatMirrorEvent(sender, {
        streamId,
        type: 'user',
        content: latestUserMessage.content,
        messageId: persistedUserMessageId,
      });
    }

    // 模型不再信任渲染层传来的“无时间聊天数组”：以刚持久化完成的完整历史为准，
    // 才能区分昨晚、昨天和刚刚，也能让工具证据引用到真实消息 ID。
    const historicalMessages = db.listChatMessages();
    if (latestUserMessage) {
      const localReply = applyProactiveCommand(db, latestUserMessage.content);
      if (localReply) {
        chatStreamAbortControllers.delete(streamId);
        const persisted = tryAddCompletedChatTurn(db, persistedUserMessageId, localReply);
        if (persisted && latestUserMessage) scheduleRealtimeMemoryExtraction(db, persisted, latestUserMessage.content);
        sendDeskPetChatMirrorEvent(sender, { streamId, type: 'delta', content: localReply });
        sendDeskPetChatMirrorEvent(sender, { streamId, type: 'done', messageId: persisted?.assistantMessageId });
        sendLocalChatReply(sender, streamId, localReply);
        return streamId;
      }
    }

    const apiKey = getApiKey(db);
    if (!apiKey) {
      chatStreamAbortControllers.delete(streamId);
      syncDeskPetWorkflowState();
      throw new Error('请先配置 SiliconFlow API Key');
    }

    const chatModel = getChatModel(db);
    const apiBaseUrl = getApiBaseUrl(db);
    const chatLanguage = getAppLanguage(db);
    const memoryContext = buildDeskPetChatContext(db);
    const modelMessages = interleaveChatTimeline(historicalMessages, memoryContext.timelineEntries);
    // 以真正开始模型工作为起点；隐藏的记忆工具调用也属于用户实际等待的时间。
    const modelStartedAt = Date.now();
    let firstResponseLatencyMs: number | undefined;
    let totalWaitLatencyMs: number | undefined;
    const markFirstResponse = () => {
      if (firstResponseLatencyMs === undefined) {
        firstResponseLatencyMs = Date.now() - modelStartedAt;
        if (screenQuestionTiming) totalWaitLatencyMs = Date.now() - screenQuestionTiming.confirmedAt;
      }
    };
    const sendChatStatus = (status: string) => {
      sendToChatSender(sender, IPC_CHANNELS.CHAT_STREAM_DELTA, { streamId, type: 'status', delta: status });
    };
    sendChatStatus(chatStatus(chatLanguage, 'thinking'));
    let memoryToolPass: MemoryToolPassResult = { toolMode: false, usedEventIds: [], usedElementIds: [], proposals: [], reply: null, calls: [], fallbackContext: '', fallbackReason: '工具聊天尚未完成，本轮回退为普通聊天。' };
    try {
      memoryToolPass = await runMemoryToolPass(db, {
        apiKey,
        model: chatModel,
        apiBaseUrl,
      messages: modelMessages,
      sourceMessages: historicalMessages,
      memoryContext,
      language: chatLanguage,
      onStatus: sendChatStatus,
      });
    } catch (error) {
      console.warn('[MemoryTools] Tool pass unavailable:', error);
      memoryToolPass.fallbackReason = `工具聊天异常：${error instanceof Error ? error.message : '未知错误'}`;
    }

    const completeReply = memoryToolPass.reply !== null
      ? Promise.resolve().then(() => {
        assistantContent = memoryToolPass.reply || '';
        sendChatStatus(chatStatus(chatLanguage, 'replying'));
        if (assistantContent) {
          markFirstResponse();
          sendDeskPetChatMirrorEvent(sender, { streamId, type: 'delta', content: assistantContent });
          sendToChatSender(sender, IPC_CHANNELS.CHAT_STREAM_DELTA, { streamId, type: 'content', delta: assistantContent });
        }
      })
      : streamChatCompletion(
        apiKey,
        chatModel,
        modelMessages,
        // 已执行的工具结果不因最终协议失败而丢弃；工具 role 协议本身不重放给普通聊天模型。
        memoryToolPass.toolMode ? memoryContext.text : memoryToolPass.fallbackContext,
        (event) => {
          if (event.type === 'content') {
            markFirstResponse();
            assistantContent += event.delta;
            sendDeskPetChatMirrorEvent(sender, { streamId, type: 'delta', content: event.delta });
            sendToChatSender(sender, IPC_CHANNELS.CHAT_STREAM_DELTA, { streamId, ...event });
            return;
          }
          // 普通回退流也不向用户暴露模型内部推理，只保留一个自然的等待状态。
          sendChatStatus(chatStatus(chatLanguage, 'thinking'));
        },
        abortController.signal,
        apiBaseUrl,
        {},
        chatLanguage,
      );

    completeReply
      .then(() => {
        const persisted = tryAddCompletedChatTurn(db, persistedUserMessageId, assistantContent, {
          responseLatencyMs: firstResponseLatencyMs,
          visionUnderstandingLatencyMs: screenQuestionTiming?.visionUnderstandingLatencyMs,
          totalWaitLatencyMs,
        });
        if (persisted) {
          db.saveMemoryToolDebugRun({
            userMessageId: persisted.userMessageId,
            assistantMessageId: persisted.assistantMessageId,
            turn: persisted.turn,
            mode: memoryToolPass.toolMode ? 'tool' : 'fallback',
            calls: memoryToolPass.calls,
            usedEventIds: memoryToolPass.usedEventIds,
            usedElementIds: memoryToolPass.usedElementIds,
            proposalCount: memoryToolPass.proposals.length,
            fallbackReason: memoryToolPass.fallbackReason,
          });
          for (const window of BrowserWindow.getAllWindows()) {
            if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.MEMORY_UPDATED);
          }
        }
        if (memoryToolPass.toolMode && persisted) {
          db.adoptMemoryEvents(memoryToolPass.usedEventIds, persisted.turn);
          db.adoptMemoryElements(memoryToolPass.usedElementIds, persisted.turn);
          db.recordMemoryUseReceipts(memoryToolPass.usedEventIds, persisted.turn, persisted.assistantMessageId);
          if (memoryToolPass.usedEventIds.length > 0 || memoryToolPass.usedElementIds.length > 0) {
            for (const window of BrowserWindow.getAllWindows()) {
              if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.MEMORY_UPDATED);
            }
          }
        }
        if (persisted) {
          if (latestUserMessage) scheduleRealtimeMemoryExtraction(db, persisted, latestUserMessage.content);
          scheduleChatCompaction(db, {
            apiKey,
            model: chatModel,
            apiBaseUrl,
            language: getAppLanguage(db),
          });
        }
        sendDeskPetChatMirrorEvent(sender, { streamId, type: 'done', messageId: persisted?.assistantMessageId });
        sendToChatSender(sender, IPC_CHANNELS.CHAT_STREAM_DONE, {
          streamId,
          assistantMessageId: persisted?.assistantMessageId,
          firstResponseLatencyMs,
          visionUnderstandingLatencyMs: screenQuestionTiming?.visionUnderstandingLatencyMs,
          totalWaitLatencyMs,
        });
        showDeskPetDoneThenResume(1200);
      })
      .catch((error) => {
        if (!abortController.signal.aborted) {
          sendDeskPetChatMirrorEvent(sender, { streamId, type: 'error', content: error?.message || '下班鸭暂时没能回复。' });
          sendToChatSender(sender, IPC_CHANNELS.CHAT_STREAM_ERROR, {
            streamId,
            message: error?.message || '下班鸭暂时没能回复。',
          });
        }
        syncDeskPetWorkflowState();
      })
      .finally(() => {
        chatStreamAbortControllers.delete(streamId);
      });

    return streamId;
  });

  ipcMain.handle(IPC_CHANNELS.CHAT_STREAM_ABORT, (_event, streamId: string) => {
    const abortController = chatStreamAbortControllers.get(streamId);
    if (abortController) {
      abortController.abort();
      chatStreamAbortControllers.delete(streamId);
      sendDeskPetChatMirrorEvent(_event.sender, { streamId, type: 'cancel' });
      syncDeskPetWorkflowState();
    }
  });

  // ===== Export/Import =====
  ipcMain.handle(IPC_CHANNELS.EXPORT_JSON, (_e, options?: ExportJsonOptions) => {
    return db.exportAll(options);
  });

  ipcMain.handle(IPC_CHANNELS.IMPORT_JSON, (_e, data: any) => {
    return db.importAll(data);
  });

  // ===== Clear =====
  ipcMain.handle(IPC_CHANNELS.CLEAR_DATA, () => {
    db.clear();
  });
}

/**
 * v2.2: 自动启动 Tracker + Vision Auto。
 * 条件: auto_start_tracker=true；Vision Auto 额外要求 API Key 存在。
 * 从 main/index.ts 在 app.whenReady() 后调用。
 */
export function autoStartTrackerAndVision(db: DatabaseService, mainWindow: BrowserWindow): void {
  const apiKey = db.getSetting('siliconflow_api_key', '');

  // 自动启动 Tracker
  const autoStartSetting = db.getSetting('auto_start_tracker', 'false');
  if (autoStartSetting === 'true') {
    if (!tracker) {
      tracker = new ActivityTracker(mainWindow);
    }
    const cb = createTrackerCallback(db, mainWindow);
    tracker.start(cb);
  }

  // 自动启动 Vision Auto
  const autoVisionSetting = db.getSetting('auto_vision_toggle', 'false');
  if (apiKey && autoVisionSetting === 'true') {
    startVisionAuto(db, mainWindow, db.getSetting('screenshot_interval', '5'));
  }

  syncDeskPetWorkflowState();
}

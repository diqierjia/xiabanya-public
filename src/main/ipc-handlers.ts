import { ipcMain, BrowserWindow, powerMonitor } from 'electron';
import { DatabaseService } from './database';
import { ActivityTracker } from './tracker';
import type { TrackerCallback } from './tracker';
import { captureScreenshot } from './screenshot';
import { classifyWithVision, generateReport, streamChatCompletion } from './ai';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { ChatMessage, ChatMessagesQuery, DeskPetState, IdlePeriod, RecordUpsertDTO, RecordsQuery, ReportsQuery, VisionQuery } from '../shared/types';
import { formatLocalDate, formatUtcStorageDateTime, formatUtcStorageTime, parseUtcStorageDateTime } from '../shared/time';
import { randomUUID } from 'crypto';
import {
  getDeskPetState,
  isDeskPetState,
  isDeskPetWindowVisible,
  setDeskPetEnabled,
  setDeskPetState,
} from './desk-pet-window';

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
let deskPetResumeTimer: ReturnType<typeof setTimeout> | null = null;
const chatStreamAbortControllers = new Map<string, AbortController>();

const IDLE_THRESHOLD_SECONDS = 300;
const IDLE_PROBE_INTERVAL_MS = 5 * 1000;
const RESUME_CAPTURE_DELAY_MS = 30 * 1000;

/** v2.2: 缓存 tracker 最近一次快照的 app/title，供 Vision Auto 截图时使用 */
let lastTrackerContext: { app: string; title: string } = { app: '截图', title: '自动识别' };

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

function getVisionModel(db: DatabaseService): string {
  return db.getSetting('vision_model', 'Qwen/Qwen3-VL-32B-Instruct');
}

function getReportModel(db: DatabaseService): string {
  return db.getSetting('report_model', 'deepseek-ai/DeepSeek-V3');
}

function getChatModel(db: DatabaseService): string {
  return db.getSetting('chat_model', 'deepseek-ai/DeepSeek-V4-Flash');
}

function formatIdleForChat(period: IdlePeriod): string {
  const start = formatUtcStorageTime(period.start_at);
  const end = period.end_at ? formatUtcStorageTime(period.end_at) : '当前';
  return `${start}-${end} 离开电脑`;
}

function buildDeskPetChatContext(db: DatabaseService): string {
  const today = formatLocalDate();
  const visionResults = db.listVisionResultsByDate({ start: today, end: today, limit: 20 });
  const records = db.listRecords({ start: today, end: today, limit: 20 });
  const idlePeriods = db.listIdlePeriodsByDateRange({ start: today, end: today, limit: 10 });

  const parts: string[] = [`日期: ${today}`];
  if (visionResults.length > 0) {
    parts.push(
      `AI 截屏识别摘要:\n${visionResults
        .map((item, index) => `${index + 1}. [${formatUtcStorageTime(item.created_at)}] ${item.title} (${item.category}, ${item.confidence || 'medium'}, ${item.activity_type || 'unclear'}) - ${item.observed_fact || item.summary}`)
        .join('\n')}`
    );
  }
  if (records.length > 0) {
    parts.push(
      `窗口追踪记录:\n${records
        .map((item, index) => `${index + 1}. [${formatUtcStorageTime(item.start_at)}-${formatUtcStorageTime(item.end_at)}] ${item.title} (${item.category}, ${item.app})`)
        .join('\n')}`
    );
  }
  if (idlePeriods.length > 0) {
    parts.push(`空闲时段:\n${idlePeriods.map((item) => `- ${formatIdleForChat(item)}`).join('\n')}`);
  }
  if (parts.length === 1) {
    parts.push('今天还没有可用的识别或追踪记录。');
  }

  return parts.join('\n\n');
}

function normalizeScreenshotInterval(interval: unknown): number {
  const minutes = Math.round(Number(interval) || 5);
  return Math.min(60, Math.max(1, minutes));
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
  if (currentIdlePeriodId) {
    db.closeIdlePeriod(currentIdlePeriodId, resumeAt);
  }

  idleState = 'active';
  currentIdlePeriodId = null;
  clearIdleProbeTimer();
  clearResumeCaptureTimer();
  startVisionTimer(db, mainWindow, visionAutoIntervalMinutes);
  syncDeskPetWorkflowState();

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
        category: event.session.category,
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

    if (visionTimer === null || runToken !== visionAutoRunToken) return;

    const result = await classifyWithVision(apiKey, model, base64, ctxApp, ctxTitle, abortController.signal);
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
      raw_response: JSON.stringify(result),
      app: ctxApp,
      window_title: ctxTitle,
      model,
    });
    const vr = db.listVisionResults(1)[0];
    if (vr) {
      mainWindow.webContents.send(IPC_CHANNELS.VISION_ON_RESULT, vr);
      completed = true;
      showDeskPetDoneThenResume();
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

function getLatestUserChatMessage(messages: ChatMessage[]): ChatMessage | undefined {
  return [...messages].reverse().find((message) => (
    message.role === 'user' &&
    typeof message.content === 'string' &&
    message.content.trim().length > 0
  ));
}

function tryAddChatMessage(db: DatabaseService, message: { role: 'user' | 'assistant'; content: string }): void {
  try {
    db.addChatMessage(message);
  } catch (error) {
    console.warn('[Chat] Failed to persist chat message:', error);
  }
}

export function registerIpcHandlers(db: DatabaseService, mainWindow: BrowserWindow): void {
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

  ipcMain.handle(IPC_CHANNELS.REPORTS_DELETE, (_e, id: string) => {
    db.deleteReport(id);
  });

  // v2.2: REPORTS_GENERATE — 双数据源：vision_results（主）+ records（辅）
  ipcMain.handle(IPC_CHANNELS.REPORTS_GENERATE, async (_e, params) => {
    setDeskPetState('thinking');
    let completed = false;
    try {
      const { report_type, template, start_date, end_date } = params;
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
      });

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
      enabled: db.getSetting('desk_pet_enabled', 'false') === 'true',
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

      const result = await classifyWithVision(apiKey, model, base64, ctxApp, ctxTitle);
      const id = db.addVisionResult({
        record_id: '',
        title: result.title,
        category: result.category as any,
        summary: result.summary,
        observed_fact: result.observed_fact,
        possible_activity: result.possible_activity,
        confidence: result.confidence,
        activity_type: result.activity_type,
        raw_response: JSON.stringify(result),
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

  // ===== Chat =====
  ipcMain.handle(IPC_CHANNELS.CHAT_MESSAGES_LIST, (_event, query?: ChatMessagesQuery) => {
    return db.listChatMessages({
      q: query?.q || undefined,
      limit: query?.limit ?? 500,
    });
  });

  ipcMain.handle(IPC_CHANNELS.CHAT_STREAM_START, async (event, messages: ChatMessage[]) => {
    const streamId = randomUUID();
    const abortController = new AbortController();
    chatStreamAbortControllers.set(streamId, abortController);
    setDeskPetState('thinking');
    let assistantContent = '';

    const sender = event.sender;
    const apiKey = getApiKey(db);
    if (!apiKey) {
      chatStreamAbortControllers.delete(streamId);
      syncDeskPetWorkflowState();
      throw new Error('请先配置 SiliconFlow API Key');
    }

    const latestUserMessage = getLatestUserChatMessage(messages);
    if (latestUserMessage) {
      tryAddChatMessage(db, { role: 'user', content: latestUserMessage.content });
    }

    streamChatCompletion(
      apiKey,
      getChatModel(db),
      messages,
      buildDeskPetChatContext(db),
      (delta) => {
        assistantContent += delta;
        sendToChatSender(sender, IPC_CHANNELS.CHAT_STREAM_DELTA, { streamId, delta });
      },
      abortController.signal
    )
      .then(() => {
        if (assistantContent.trim()) {
          tryAddChatMessage(db, { role: 'assistant', content: assistantContent });
        }
        sendToChatSender(sender, IPC_CHANNELS.CHAT_STREAM_DONE, { streamId });
        showDeskPetDoneThenResume(1200);
      })
      .catch((error) => {
        if (!abortController.signal.aborted) {
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
      syncDeskPetWorkflowState();
    }
  });

  // ===== Export/Import =====
  ipcMain.handle(IPC_CHANNELS.EXPORT_JSON, () => {
    return db.exportAll();
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
 * 条件: API Key 存在 + auto_start_tracker=true。
 * 从 main/index.ts 在 app.whenReady() 后调用。
 */
export function autoStartTrackerAndVision(db: DatabaseService, mainWindow: BrowserWindow): void {
  const apiKey = db.getSetting('siliconflow_api_key', '');
  if (!apiKey) return;

  // 自动启动 Tracker
  const autoStartSetting = db.getSetting('auto_start_tracker', 'true');
  if (autoStartSetting === 'true') {
    if (!tracker) {
      tracker = new ActivityTracker(mainWindow);
    }
    const cb = createTrackerCallback(db, mainWindow);
    tracker.start(cb);
  }

  // 自动启动 Vision Auto
  const autoVisionSetting = db.getSetting('auto_vision_toggle', 'false');
  if (autoVisionSetting === 'true') {
    startVisionAuto(db, mainWindow, db.getSetting('screenshot_interval', '5'));
  }

  syncDeskPetWorkflowState();
}

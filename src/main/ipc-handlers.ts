import { ipcMain, BrowserWindow } from 'electron';
import { DatabaseService } from './database';
import { ActivityTracker } from './tracker';
import type { TrackerCallback } from './tracker';
import { captureScreenshot } from './screenshot';
import { classifyWithVision, generateReport } from './ai';
import { getSystemPrompt } from './report-generator';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { RecordUpsertDTO, RecordsQuery, ReportsQuery, VisionQuery } from '../shared/types';
import { classify } from './classifier';
import { parseUtcStorageDateTime } from '../shared/time';

let tracker: ActivityTracker | null = null;
let visionTimer: ReturnType<typeof setInterval> | null = null;
let visionCaptureInFlight = false;
let visionAutoRunToken = 0;
let visionAutoAbortController: AbortController | null = null;

/** v2.2: 缓存 tracker 最近一次快照的 app/title，供 Vision Auto 截图时使用 */
let lastTrackerContext: { app: string; title: string } = { app: '截图', title: '自动识别' };

function getApiKey(db: DatabaseService): string {
  return db.getSetting('siliconflow_api_key', '');
}

function getVisionModel(db: DatabaseService): string {
  return db.getSetting('vision_model', 'Qwen/Qwen3-VL-32B-Instruct');
}

function getReportModel(db: DatabaseService): string {
  return db.getSetting('report_model', 'deepseek-ai/DeepSeek-V3');
}

function normalizeScreenshotInterval(interval: unknown): number {
  const minutes = Math.round(Number(interval) || 5);
  return Math.min(60, Math.max(1, minutes));
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
  if (visionCaptureInFlight) {
    console.warn('[Vision Auto] Previous capture is still running; skipped this tick.');
    return;
  }

  visionCaptureInFlight = true;
  const abortController = new AbortController();
  visionAutoAbortController = abortController;
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

    db.addVisionResult({
      record_id: '',
      title: result.title,
      category: result.category as any,
      summary: result.summary,
      raw_response: JSON.stringify(result),
      app: ctxApp,
      window_title: ctxTitle,
      model,
    });
    const vr = db.listVisionResults(1)[0];
    if (vr) {
      mainWindow.webContents.send(IPC_CHANNELS.VISION_ON_RESULT, vr);
    }
  } finally {
    if (visionAutoAbortController === abortController) {
      visionAutoAbortController = null;
    }
    visionCaptureInFlight = false;
  }
}

function startVisionAuto(db: DatabaseService, mainWindow: BrowserWindow, interval: unknown): number {
  if (visionTimer) clearInterval(visionTimer);
  visionAutoRunToken += 1;
  const runToken = visionAutoRunToken;
  const minutes = normalizeScreenshotInterval(interval);
  visionTimer = setInterval(() => {
    runVisionCaptureCycle(db, mainWindow, runToken).catch(() => {});
  }, minutes * 60 * 1000);
  return minutes;
}

function stopVisionAuto(): void {
  visionAutoRunToken += 1;
  visionAutoAbortController?.abort();
  visionAutoAbortController = null;
  if (visionTimer) {
    clearInterval(visionTimer);
    visionTimer = null;
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

    const content = await generateReport(apiKey, model, {
      visionResults,
      records,
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

    return db.getReport(id);
  });

  // ===== Settings =====
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_e, key: string, defaultVal?: string) => {
    return db.getSetting(key, defaultVal || '');
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_e, key: string, value: string) => {
    db.setSetting(key, value);
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, () => {
    return db.getAllSettings();
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_API_KEY, () => {
    return getApiKey(db);
  });

  // ===== Tracker =====
  const handleTrackerEvent = createTrackerCallback(db, mainWindow);

  ipcMain.handle(IPC_CHANNELS.TRACKER_START, () => {
    if (!tracker) {
      tracker = new ActivityTracker(mainWindow);
    }
    tracker.start(handleTrackerEvent);
  });

  ipcMain.handle(IPC_CHANNELS.TRACKER_STOP, () => {
    if (tracker) {
      tracker.stop();
      tracker = null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.TRACKER_STATUS, () => {
    return { running: tracker?.isRunning || false };
  });

  // ===== Vision =====
  ipcMain.handle(IPC_CHANNELS.VISION_ANALYZE_ONCE, async () => {
    const apiKey = getApiKey(db);
    const model = getVisionModel(db);
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
      raw_response: JSON.stringify(result),
      app: ctxApp,
      window_title: ctxTitle,
      model,
    });

    const vr = db.listVisionResults(1)[0];
    if (vr) {
      mainWindow.webContents.send(IPC_CHANNELS.VISION_ON_RESULT, vr);
    }
    return id;
  });

  ipcMain.handle(IPC_CHANNELS.VISION_START_AUTO, (_e, interval: number) => {
    const minutes = startVisionAuto(db, mainWindow, interval);
    db.setSetting('screenshot_interval', String(minutes));
    db.setSetting('auto_vision_toggle', 'true');
  });

  ipcMain.handle(IPC_CHANNELS.VISION_STOP_AUTO, () => {
    stopVisionAuto();
    db.setSetting('auto_vision_toggle', 'false');
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
}

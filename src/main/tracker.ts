import type { BrowserWindow } from 'electron';
import activeWin from 'active-win';
import { classify } from './classifier';
import type { Category } from '../shared/types';
import { formatUtcStorageDateTime } from '../shared/time';

/** 追踪会话：代表一段连续活跃的应用使用片段 */
export interface TrackerSession {
  app: string;
  title: string;
  category: Category;
  startTime: string;    // 会话开始时间 (YYYY-MM-DD HH:MM:SS)
  endTime: string;      // 会话最近活跃时间 (持续更新)
  durationMs: number;   // 累计时长（毫秒）
}

/** 追踪器回调：type='session' 时固化到数据库，type='snapshot' 仅用于实时 UI */
export type TrackerCallback = (
  event:
    | { type: 'session'; session: TrackerSession }
    | { type: 'snapshot'; session: TrackerSession }
) => void;

const POLL_INTERVAL_MS = 5000;
const SNAPSHOT_INTERVAL_MS = 30000;

/**
 * 活动追踪器（会话合并模式）
 *
 * - 每 5 秒轮询一次活跃窗口
 * - 同一应用连续活跃 → 只更新 currentSession.endTime/durationMs，不写库
 * - 应用切换 → 固化上一个 session 为一条 ActivityRecord，开启新 session
 * - 每 30 秒 emit 一次 snapshot，供前端实时显示（不持久化）
 */
export class ActivityTracker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private callback: TrackerCallback | null = null;
  private currentSession: TrackerSession | null = null;
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  /** 启动追踪 */
  start(callback: TrackerCallback): void {
    if (this.timer) return;
    this.callback = callback;

    // 立即执行一次 poll
    this.poll();

    // 每 5 秒轮询活跃窗口
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);

    // 每 30 秒 emit 快照给前端
    this.snapshotTimer = setInterval(() => this.emitSnapshot(), SNAPSHOT_INTERVAL_MS);
  }

  /** 停止追踪：固化当前 session 并清理所有定时器 */
  stop(): void {
    // 固化当前未完成的 session
    this.flushCurrentSession();

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    this.callback = null;
    this.currentSession = null;
  }

  /** 是否正在追踪 */
  get isRunning(): boolean {
    return this.timer !== null;
  }

  /** 轮询当前活跃窗口 */
  private async poll(): Promise<void> {
    try {
      const result = await activeWin();
      if (!result || !this.callback) return;

      const app = result.owner.name;
      const title = result.title;
      const category = classify(app, title).category;
      const now = formatUtcStorageDateTime();

      if (this.currentSession && this.currentSession.app === app) {
        // 同一应用：仅更新时间戳和累计时长
        this.currentSession.endTime = now;
        this.currentSession.durationMs += POLL_INTERVAL_MS;
      } else {
        // 应用切换：先固化上一个 session
        this.flushCurrentSession();

        // 开启新 session
        this.currentSession = {
          app,
          title,
          category,
          startTime: now,
          endTime: now,
          durationMs: 0,
        };
      }
    } catch {
      // active-win 在某些平台可能失败，静默忽略
    }
  }

  /** 发送当前 session 快照给前端（不持久化） */
  private emitSnapshot(): void {
    if (this.currentSession && this.callback) {
      this.callback({ type: 'snapshot', session: { ...this.currentSession } });
    }
  }

  /** 将当前 session 固化为 'session' 事件并清空 */
  private flushCurrentSession(): void {
    if (this.currentSession && this.callback) {
      this.callback({ type: 'session', session: { ...this.currentSession } });
      this.currentSession = null;
    }
  }
}

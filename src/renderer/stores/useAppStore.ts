import { create } from 'zustand';
import type { PageKey } from '../App';

export const DEFAULT_TIMELINE_SCALE = 1;
export const MIN_TIMELINE_SCALE = 0.5;
export const MAX_TIMELINE_SCALE = 5;
export const TIMELINE_SCALE_STEP = 0.15;

function clampTimelineScale(scale: number): number {
  return Math.min(MAX_TIMELINE_SCALE, Math.max(MIN_TIMELINE_SCALE, Number(scale.toFixed(2))));
}

interface AppState {
  currentPage: PageKey;
  trackerRunning: boolean;
  sidebarCollapsed: boolean;
  notificationEnabled: boolean;
  /** v2.2: Vision Auto 运行状态 */
  visionAutoRunning: boolean;
  /** 时间轴缩放比例 (px per minute) */
  timelineScale: number;
  setPage: (page: PageKey) => void;
  setTrackerRunning: (running: boolean) => void;
  toggleSidebar: () => void;
  setNotificationEnabled: (enabled: boolean) => void;
  /** v2.2: 设置 Vision Auto 状态 */
  setVisionAutoRunning: (running: boolean) => void;
  /** 设置时间轴缩放比例（自动 clamp 到合法范围） */
  setTimelineScale: (scale: number) => void;
  /** 在当前缩放值上增减（步长 0.15，自动 clamp） */
  adjustTimelineScale: (delta: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'today',
  trackerRunning: false,
  sidebarCollapsed: false,
  notificationEnabled: true,
  visionAutoRunning: false,
  timelineScale: DEFAULT_TIMELINE_SCALE,
  setPage: (page) => set({ currentPage: page }),
  setTrackerRunning: (running) => set({ trackerRunning: running }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setNotificationEnabled: (enabled) => set({ notificationEnabled: enabled }),
  setVisionAutoRunning: (running) => set({ visionAutoRunning: running }),
  setTimelineScale: (scale) => set({ timelineScale: clampTimelineScale(scale) }),
  adjustTimelineScale: (delta) => set((s) => ({ timelineScale: clampTimelineScale(s.timelineScale + delta) })),
}));

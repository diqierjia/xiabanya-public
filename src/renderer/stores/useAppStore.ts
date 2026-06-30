import { create } from 'zustand';
import type { PageKey } from '../App';

interface AppState {
  currentPage: PageKey;
  trackerRunning: boolean;
  sidebarCollapsed: boolean;
  notificationEnabled: boolean;
  /** v2.2: Vision Auto 运行状态 */
  visionAutoRunning: boolean;
  setPage: (page: PageKey) => void;
  setTrackerRunning: (running: boolean) => void;
  toggleSidebar: () => void;
  setNotificationEnabled: (enabled: boolean) => void;
  /** v2.2: 设置 Vision Auto 状态 */
  setVisionAutoRunning: (running: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'today',
  trackerRunning: false,
  sidebarCollapsed: false,
  notificationEnabled: true,
  visionAutoRunning: false,
  setPage: (page) => set({ currentPage: page }),
  setTrackerRunning: (running) => set({ trackerRunning: running }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setNotificationEnabled: (enabled) => set({ notificationEnabled: enabled }),
  setVisionAutoRunning: (running) => set({ visionAutoRunning: running }),
}));

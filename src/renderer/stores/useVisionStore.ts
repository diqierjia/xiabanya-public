import { create } from 'zustand';
import type { VisionResult, VisionResultWithDuration, VisionQuery, VisionDailySummary, Category } from '../lib/types';
import { getXiabanyaApi } from '../hooks/useXiabanyaApi';
import { formatLocalDate, parseUtcStorageDateTime } from '../../shared/time';

interface VisionState {
  /** 今日 vision_results（含 approx_duration_sec） */
  todayResults: VisionResultWithDuration[];
  /** 按日期范围查询的 vision_results */
  rangeResults: VisionResultWithDuration[];
  loading: boolean;
  error: boolean;
  /** 获取今日 vision_results（首次加载，含 loading 状态） */
  fetchTodayResults: () => Promise<void>;
  /** 静默刷新（不设 loading，避免 UI 闪烁） */
  silentRefreshToday: () => Promise<void>;
  /** 按日期范围获取 vision_results */
  fetchRangeResults: (start: string, end: string) => Promise<void>;
  /** 从 todayResults 计算 VisionDailySummary */
  computeDailySummary: () => VisionDailySummary;
}

export const useVisionStore = create<VisionState>((set, get) => ({
  todayResults: [],
  rangeResults: [],
  loading: false,
  error: false,

  fetchTodayResults: async () => {
    const today = formatLocalDate();
    set({ loading: true, error: false });
    try {
      const api = getXiabanyaApi();
      const data = await api.vision.listByDate({ start: today, end: today, limit: 200 });
      set({ todayResults: data, loading: false });
    } catch {
      set({ loading: false, error: true });
    }
  },

  // 静默刷新：replace 整个数组，但不设 loading（避免 Skeleton 闪烁）
  silentRefreshToday: async () => {
    const today = formatLocalDate();
    try {
      const api = getXiabanyaApi();
      const data = await api.vision.listByDate({ start: today, end: today, limit: 200 });
      set({ todayResults: data });
    } catch {
      // 静默失败
    }
  },

  fetchRangeResults: async (start: string, end: string) => {
    set({ loading: true, error: false });
    try {
      const api = getXiabanyaApi();
      const data = await api.vision.listByDate({ start, end, limit: 500 });
      set({ rangeResults: data, loading: false });
    } catch {
      set({ loading: false, error: true });
    }
  },

  computeDailySummary: (): VisionDailySummary => {
    const results = get().todayResults;
    if (results.length === 0) {
      return {
        count: 0,
        categories: [],
        mainCategory: '其他' as Category,
        latest: null,
        activeSpanSec: 0,
      };
    }

    // 按 category 计数
    const catMap: Record<string, number> = {};
    results.forEach((r) => {
      catMap[r.category] = (catMap[r.category] || 0) + 1;
    });
    const categories = Object.entries(catMap)
      .map(([category, count]) => ({ category: category as Category, count }))
      .sort((a, b) => b.count - a.count);

    const mainCategory = categories[0]?.category || ('其他' as Category);
    const latest = results[0]; // 已按 created_at DESC 排序

    // activeSpanSec: 第一条到最后一条的时间跨度
    const first = parseUtcStorageDateTime(results[results.length - 1].created_at)?.getTime() ?? 0;
    const last = parseUtcStorageDateTime(results[0].created_at)?.getTime() ?? 0;
    const activeSpanSec = results.length > 1
      ? Math.round((last - first) / 1000)
      : latest.approx_duration_sec;

    return {
      count: results.length,
      categories,
      mainCategory,
      latest,
      activeSpanSec,
    };
  },
}));

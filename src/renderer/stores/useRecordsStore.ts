import { create } from 'zustand';
import type { ActivityRecord, Category, RecordUpsertDTO, RecordsQuery } from '../lib/types';
import { getXiabanyaApi } from '../hooks/useXiabanyaApi';
import { formatLocalDate } from '../../shared/time';

interface RecordsState {
  records: ActivityRecord[];
  todayRecords: ActivityRecord[];
  loading: boolean;
  error: boolean;
  fetchRecords: (query: RecordsQuery) => Promise<void>;
  fetchTodayRecords: () => Promise<void>;
  addRecord: (dto: RecordUpsertDTO) => Promise<string>;
  deleteRecord: (id: string) => Promise<void>;
  deleteRecords: (ids: string[]) => Promise<void>;
  updateCategory: (id: string, category: Category) => Promise<void>;
  setTag: (id: string, tag: string, enabled: boolean) => Promise<void>;
}

export const useRecordsStore = create<RecordsState>((set) => ({
  records: [],
  todayRecords: [],
  loading: false,
  error: false,

  fetchRecords: async (query) => {
    set({ loading: true, error: false });
    try {
      const api = getXiabanyaApi();
      const data = await api.records.list(query);
      set({ records: data, loading: false });
    } catch {
      set({ loading: false, error: true });
    }
  },

  fetchTodayRecords: async () => {
    const today = formatLocalDate();
    set({ loading: true, error: false });
    try {
      const api = getXiabanyaApi();
      const data = await api.records.list({ start: today, end: today });
      set({ todayRecords: data, loading: false });
    } catch {
      set({ loading: false, error: true });
    }
  },

  addRecord: async (dto) => {
    const api = getXiabanyaApi();
    const id = await api.records.create(dto);
    return id;
  },

  deleteRecord: async (id) => {
    const api = getXiabanyaApi();
    await api.records.delete(id);
    set((s) => ({
      records: s.records.filter((r) => r.id !== id),
      todayRecords: s.todayRecords.filter((r) => r.id !== id),
    }));
  },

  deleteRecords: async (ids) => {
    const api = getXiabanyaApi();
    await api.records.deleteBatch(ids);
    set((s) => ({
      records: s.records.filter((r) => !ids.includes(r.id)),
      todayRecords: s.todayRecords.filter((r) => !ids.includes(r.id)),
    }));
  },

  updateCategory: async (id, category) => {
    const api = getXiabanyaApi();
    await api.records.updateCategory(id, category);
    set((s) => ({
      records: s.records.map((r) => (r.id === id ? { ...r, category } : r)),
      todayRecords: s.todayRecords.map((r) => (r.id === id ? { ...r, category } : r)),
    }));
  },

  setTag: async (id, tag, enabled) => {
    const api = getXiabanyaApi();
    await api.records.setTag(id, tag, enabled);
    set((s) => {
      const update = (r: ActivityRecord) => {
        if (r.id !== id) return r;
        if (tag === '成果') return { ...r, is_achievement: enabled };
        return { ...r, exclude_from_report: enabled };
      };
      return {
        records: s.records.map(update),
        todayRecords: s.todayRecords.map(update),
      };
    });
  },
}));

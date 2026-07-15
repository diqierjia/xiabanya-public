import { create } from 'zustand';
import type { Report, ReportsQuery } from '../lib/types';
import { getXiabanyaApi } from '../hooks/useXiabanyaApi';

interface ReportsState {
  reports: Report[];
  loading: boolean;
  generating: boolean;
  fetchReports: (query?: ReportsQuery) => Promise<void>;
  generate: (params: { report_type: string; template: string; start_date: string; end_date: string }) => Promise<Report | null>;
  updateReport: (id: string, content: string) => Promise<Report>;
  deleteReport: (id: string) => Promise<void>;
}

export const useReportsStore = create<ReportsState>((set) => ({
  reports: [],
  loading: false,
  generating: false,

  fetchReports: async (query = {}) => {
    set({ loading: true });
    try {
      const api = getXiabanyaApi();
      const data = await api.reports.list(query);
      set({ reports: data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  generate: async (params) => {
    set({ generating: true });
    try {
      const api = getXiabanyaApi();
      const report = await api.reports.generate(params);
      set((s) => ({ reports: [report, ...s.reports], generating: false }));
      return report;
    } catch {
      set({ generating: false });
      return null;
    }
  },

  updateReport: async (id, content) => {
    const api = getXiabanyaApi();
    const report = await api.reports.update(id, content);
    set((s) => ({
      reports: s.reports.map((item) => (item.id === id ? report : item)),
    }));
    return report;
  },

  deleteReport: async (id) => {
    const api = getXiabanyaApi();
    await api.reports.delete(id);
    set((s) => ({ reports: s.reports.filter((r) => r.id !== id) }));
  },
}));

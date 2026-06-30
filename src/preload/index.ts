import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { ActivityRecord, Report, VisionResult, VisionResultWithDuration, VisionQuery, TrackerSnapshot, RecordUpsertDTO, RecordsQuery, ReportsQuery } from '../shared/types';

type CallbackFn = (...args: unknown[]) => void;

const api = {
  records: {
    list: (query: RecordsQuery) => ipcRenderer.invoke(IPC_CHANNELS.RECORDS_LIST, query) as Promise<ActivityRecord[]>,
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.RECORDS_GET, id) as Promise<ActivityRecord | undefined>,
    create: (dto: RecordUpsertDTO) => ipcRenderer.invoke(IPC_CHANNELS.RECORDS_CREATE, dto) as Promise<string>,
    update: (id: string, dto: Partial<RecordUpsertDTO>) => ipcRenderer.invoke(IPC_CHANNELS.RECORDS_UPDATE, id, dto),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.RECORDS_DELETE, id),
    deleteBatch: (ids: string[]) => ipcRenderer.invoke(IPC_CHANNELS.RECORDS_DELETE_BATCH, ids),
    setTag: (id: string, tag: string, enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.RECORDS_SET_TAG, id, tag, enabled),
    updateCategory: (id: string, cat: string) => ipcRenderer.invoke(IPC_CHANNELS.RECORDS_UPDATE_CATEGORY, id, cat),
  },
  reports: {
    list: (query: ReportsQuery) => ipcRenderer.invoke(IPC_CHANNELS.REPORTS_LIST, query) as Promise<Report[]>,
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.REPORTS_GET, id) as Promise<Report | undefined>,
    create: (report: Omit<Report, 'id' | 'created_at'>) => ipcRenderer.invoke(IPC_CHANNELS.REPORTS_CREATE, report) as Promise<string>,
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.REPORTS_DELETE, id),
    generate: (params: { report_type: string; template: string; start_date: string; end_date: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.REPORTS_GENERATE, params) as Promise<Report>,
  },
  settings: {
    get: (key: string, defaultVal?: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key, defaultVal) as Promise<string>,
    set: (key: string, value: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value),
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL) as Promise<Record<string, string>>,
    getApiKey: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_API_KEY) as Promise<string>,
  },
  tracker: {
    start: () => ipcRenderer.invoke(IPC_CHANNELS.TRACKER_START),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.TRACKER_STOP),
    status: () => ipcRenderer.invoke(IPC_CHANNELS.TRACKER_STATUS) as Promise<{ running: boolean }>,
    onEvent: (cb: (activity: ActivityRecord) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, activity: ActivityRecord) => cb(activity);
      ipcRenderer.on(IPC_CHANNELS.TRACKER_EVENT, listener);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.TRACKER_EVENT, listener); };
    },
    onSnapshot: (cb: (snapshot: TrackerSnapshot) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, snapshot: TrackerSnapshot) => cb(snapshot);
      ipcRenderer.on(IPC_CHANNELS.TRACKER_SNAPSHOT, listener);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.TRACKER_SNAPSHOT, listener); };
    },
  },
  vision: {
    analyzeOnce: () => ipcRenderer.invoke(IPC_CHANNELS.VISION_ANALYZE_ONCE) as Promise<string>,
    startAuto: (interval: number) => ipcRenderer.invoke(IPC_CHANNELS.VISION_START_AUTO, interval),
    stopAuto: () => ipcRenderer.invoke(IPC_CHANNELS.VISION_STOP_AUTO),
    listResults: (limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.VISION_RESULTS, limit) as Promise<VisionResult[]>,
    deleteResult: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.VISION_DELETE_RESULT, id),
    listByDate: (query: VisionQuery) => ipcRenderer.invoke(IPC_CHANNELS.VISION_LIST_BY_DATE, query) as Promise<VisionResultWithDuration[]>,
    autoStatus: () => ipcRenderer.invoke(IPC_CHANNELS.VISION_AUTO_STATUS) as Promise<{ running: boolean }>,
    onResult: (cb: (result: VisionResult) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, result: VisionResult) => cb(result);
      ipcRenderer.on(IPC_CHANNELS.VISION_ON_RESULT, listener);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.VISION_ON_RESULT, listener); };
    },
  },
  exportJson: () => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_JSON),
  importJson: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.IMPORT_JSON, data) as Promise<number>,
  clearData: () => ipcRenderer.invoke(IPC_CHANNELS.CLEAR_DATA),
};

contextBridge.exposeInMainWorld('xiabanyaApi', api);

export type XiabanyaApi = typeof api;

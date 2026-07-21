import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { ActivityRecord, ChatHistoryMessage, ChatMemoryRuntimeDebug, ChatMessage, ChatMessagesQuery, ChatStreamDeltaEvent, ChatStreamDoneEvent, DeskPetChatMirrorEvent, DeskPetState, ExportJsonData, ExportJsonOptions, IdlePeriod, MemoryDashboard, MemoryElementDetail, MemoryEventDetail, MemoryEventUpdate, MemoryListQuery, MemoryToolDebugRun, ProactiveMessage, QueuedChatMessage, Report, VisionResult, VisionResultWithDuration, VisionQuery, TrackerSnapshot, RecordUpsertDTO, RecordsQuery, ReportsQuery } from '../shared/types';

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
    update: (id: string, content: string) => ipcRenderer.invoke(IPC_CHANNELS.REPORTS_UPDATE, id, content) as Promise<Report>,
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.REPORTS_DELETE, id),
    generate: (params: { report_type: string; template: string; start_date: string; end_date: string; custom_prompt?: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.REPORTS_GENERATE, params) as Promise<Report>,
  },
  settings: {
    get: (key: string, defaultVal?: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key, defaultVal) as Promise<string>,
    set: (key: string, value: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value),
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL) as Promise<Record<string, string>>,
    getApiKey: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_API_KEY) as Promise<string>,
  },
  categories: {
    save: (payload: { categories: string[]; renames?: Array<{ from: string; to: string }> }) =>
      ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES_SAVE, payload) as Promise<string[]>,
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
  idle: {
    listByDate: (query: { start: string; end: string; limit?: number }) =>
      ipcRenderer.invoke(IPC_CHANNELS.IDLE_LIST_BY_DATE, query) as Promise<IdlePeriod[]>,
  },
  chat: {
    listMessages: (query?: ChatMessagesQuery) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_MESSAGES_LIST, query) as Promise<ChatHistoryMessage[]>,
    queueMessage: (id: string, content: string) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_QUEUE_MESSAGE, { id, content }) as Promise<string | undefined>,
    listQueuedMessages: () => ipcRenderer.invoke(IPC_CHANNELS.CHAT_QUEUE_LIST) as Promise<QueuedChatMessage[]>,
    startStream: (messages: ChatMessage[], streamId?: string, queuedMessageId?: string) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_STREAM_START, messages, streamId, queuedMessageId) as Promise<string>,
    abortStream: (streamId: string) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_STREAM_ABORT, streamId),
    onDelta: (cb: (event: ChatStreamDeltaEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: ChatStreamDeltaEvent) => cb(payload);
      ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_DELTA, listener);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_DELTA, listener); };
    },
    onDone: (cb: (event: ChatStreamDoneEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: ChatStreamDoneEvent) => cb(payload);
      ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_DONE, listener);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_DONE, listener); };
    },
    onError: (cb: (event: { streamId: string; message: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { streamId: string; message: string }) => cb(payload);
      ipcRenderer.on(IPC_CHANNELS.CHAT_STREAM_ERROR, listener);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.CHAT_STREAM_ERROR, listener); };
    },
    onProactiveMessage: (cb: (message: ProactiveMessage) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, message: ProactiveMessage) => cb(message);
      ipcRenderer.on(IPC_CHANNELS.CHAT_PROACTIVE_MESSAGE, listener);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.CHAT_PROACTIVE_MESSAGE, listener); };
    },
    onDeskPetMirror: (cb: (event: DeskPetChatMirrorEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: DeskPetChatMirrorEvent) => cb(payload);
      ipcRenderer.on(IPC_CHANNELS.CHAT_DESK_PET_MIRROR, listener);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.CHAT_DESK_PET_MIRROR, listener); };
    },
  },
  memory: {
    list: (query?: MemoryListQuery) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_LIST, query) as Promise<MemoryDashboard>,
    getEvent: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_EVENT_GET, id) as Promise<MemoryEventDetail | undefined>,
    updateEvent: (id: string, update: MemoryEventUpdate) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_EVENT_UPDATE, id, update),
    deleteEvent: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_EVENT_DELETE, id),
    actionEvent: (id: string, action: 'pin' | 'unpin' | 'forget' | 'restore') => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_EVENT_ACTION, id, action),
    getElement: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_ELEMENT_GET, id) as Promise<MemoryElementDetail | undefined>,
    listToolDebug: (limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_TOOL_DEBUG_LIST, limit) as Promise<MemoryToolDebugRun[]>,
    getToolDebugForAssistantMessage: (assistantMessageId: string) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_TOOL_DEBUG_GET_BY_ASSISTANT_MESSAGE, assistantMessageId) as Promise<MemoryToolDebugRun | undefined>,
    getChatRuntimeDebug: () => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_CHAT_RUNTIME_DEBUG) as Promise<ChatMemoryRuntimeDebug>,
    retryChatCompaction: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.MEMORY_CHAT_COMPACTION_RETRY, id) as Promise<boolean>,
    onUpdated: (cb: () => void) => {
      const listener = () => cb();
      ipcRenderer.on(IPC_CHANNELS.MEMORY_UPDATED, listener);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.MEMORY_UPDATED, listener); };
    },
  },
  deskPet: {
    setEnabled: (enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.DESK_PET_SET_ENABLED, enabled),
    setState: (state: DeskPetState) => ipcRenderer.invoke(IPC_CHANNELS.DESK_PET_SET_STATE, state),
    status: () => ipcRenderer.invoke(IPC_CHANNELS.DESK_PET_STATUS) as Promise<{ enabled: boolean; visible: boolean; state: DeskPetState }>,
  },
  deskPetWindow: {
    beginDrag: (point: { screenX: number; screenY: number }) => ipcRenderer.send(IPC_CHANNELS.DESK_PET_WINDOW_BEGIN_DRAG, point),
    drag: (point: { screenX: number; screenY: number }) => ipcRenderer.send(IPC_CHANNELS.DESK_PET_WINDOW_DRAG, point),
    beginResize: (point: { screenX: number; screenY: number }) => ipcRenderer.send(IPC_CHANNELS.DESK_PET_WINDOW_BEGIN_RESIZE, point),
    resize: (point: { screenX: number; screenY: number }) => ipcRenderer.send(IPC_CHANNELS.DESK_PET_WINDOW_RESIZE, point),
    endGesture: () => ipcRenderer.send(IPC_CHANNELS.DESK_PET_WINDOW_END_GESTURE),
    setChatOpen: (open: boolean) => ipcRenderer.send(IPC_CHANNELS.DESK_PET_WINDOW_SET_CHAT_OPEN, open),
    toggleChat: () => ipcRenderer.send(IPC_CHANNELS.DESK_PET_WINDOW_TOGGLE_CHAT),
    notifyBubbleContentHeight: (height: number) => ipcRenderer.send(IPC_CHANNELS.DESK_PET_BUBBLE_CONTENT_HEIGHT, height),
    startScreenQuestion: () => ipcRenderer.invoke(IPC_CHANNELS.DESK_PET_SCREEN_QUESTION_START),
    submitScreenQuestion: (payload: { question: string; cropDataUrl: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.DESK_PET_SCREEN_QUESTION_SUBMIT, payload),
    cancelScreenQuestion: () => ipcRenderer.invoke(IPC_CHANNELS.DESK_PET_SCREEN_QUESTION_CANCEL),
    onScreenQuestionReady: (cb: (payload: { kind: 'overlay' | 'chatPending' | 'chatReady' | 'chatError'; id?: string; imageDataUrl?: string; message?: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { kind: 'overlay' | 'chatPending' | 'chatReady' | 'chatError'; id?: string; imageDataUrl?: string; message?: string }) => cb(payload);
      ipcRenderer.on(IPC_CHANNELS.DESK_PET_SCREEN_QUESTION_READY, listener);
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.DESK_PET_SCREEN_QUESTION_READY, listener); };
    },
  },
  proactive: {
    getOffworkPrediction: () => ipcRenderer.invoke(IPC_CHANNELS.PROACTIVE_OFFWORK_PREDICTION) as Promise<{ minuteOfDay: number; displayTime: string; candidateCount: number; confidence: string; candidates: Array<{ date: string; minuteOfDay: number; source: string; weight: number }> } | null>,
  },
  exportJson: (options?: ExportJsonOptions) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_JSON, options) as Promise<ExportJsonData>,
  importJson: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.IMPORT_JSON, data) as Promise<number>,
  clearData: () => ipcRenderer.invoke(IPC_CHANNELS.CLEAR_DATA),
};

contextBridge.exposeInMainWorld('xiabanyaApi', api);

export type XiabanyaApi = typeof api;

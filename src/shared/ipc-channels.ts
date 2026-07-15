// ===== IPC 通道定义 =====
// 命名规范: namespace:action

export const IPC_CHANNELS = {
  // 活动记录 CRUD
  RECORDS_LIST: 'records:list',
  RECORDS_GET: 'records:get',
  RECORDS_CREATE: 'records:create',
  RECORDS_UPDATE: 'records:update',
  RECORDS_DELETE: 'records:delete',
  RECORDS_DELETE_BATCH: 'records:deleteBatch',
  RECORDS_SET_TAG: 'records:setTag',
  RECORDS_UPDATE_CATEGORY: 'records:updateCategory',

  // 报告
  REPORTS_LIST: 'reports:list',
  REPORTS_GET: 'reports:get',
  REPORTS_CREATE: 'reports:create',
  REPORTS_UPDATE: 'reports:update',
  REPORTS_DELETE: 'reports:delete',
  REPORTS_GENERATE: 'reports:generate',

  // 设置
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:getAll',
  SETTINGS_GET_API_KEY: 'settings:getApiKey',

  // 追踪
  TRACKER_START: 'tracker:start',
  TRACKER_STOP: 'tracker:stop',
  TRACKER_STATUS: 'tracker:status',
  TRACKER_EVENT: 'tracker:onEvent',
  TRACKER_SNAPSHOT: 'tracker:onSnapshot',

  // AI 识别
  VISION_ANALYZE_ONCE: 'vision:analyzeOnce',
  VISION_START_AUTO: 'vision:startAuto',
  VISION_STOP_AUTO: 'vision:stopAuto',
  VISION_RESULTS: 'vision:results',
  VISION_DELETE_RESULT: 'vision:deleteResult',
  VISION_ON_RESULT: 'vision:onResult',
  VISION_LIST_BY_DATE: 'vision:listByDate',
  VISION_AUTO_STATUS: 'vision:autoStatus',

  // 空闲时段
  IDLE_LIST_BY_DATE: 'idle:listByDate',

  // 主动通知
  PROACTIVE_OFFWORK_PREDICTION: 'proactive:offworkPrediction',

  // 对话
  CHAT_STREAM_START: 'chat:streamStart',
  CHAT_STREAM_ABORT: 'chat:streamAbort',
  CHAT_STREAM_DELTA: 'chat:streamDelta',
  CHAT_STREAM_DONE: 'chat:streamDone',
  CHAT_STREAM_ERROR: 'chat:streamError',
  CHAT_MESSAGES_LIST: 'chat:messagesList',
  CHAT_QUEUE_MESSAGE: 'chat:queueMessage',
  CHAT_QUEUE_LIST: 'chat:queueList',
  CHAT_PROACTIVE_MESSAGE: 'chat:proactiveMessage',
  CHAT_DESK_PET_MIRROR: 'chat:deskPetMirror',

  // 长期记忆
  MEMORY_LIST: 'memory:list',
  MEMORY_EVENT_GET: 'memory:eventGet',
  MEMORY_EVENT_UPDATE: 'memory:eventUpdate',
  MEMORY_EVENT_DELETE: 'memory:eventDelete',
  MEMORY_EVENT_ACTION: 'memory:eventAction',
  MEMORY_ELEMENT_GET: 'memory:elementGet',
  MEMORY_TOOL_DEBUG_LIST: 'memory:toolDebugList',
  MEMORY_TOOL_DEBUG_GET_BY_ASSISTANT_MESSAGE: 'memory:toolDebugGetByAssistantMessage',
  MEMORY_CHAT_RUNTIME_DEBUG: 'memory:chatRuntimeDebug',
  MEMORY_UPDATED: 'memory:updated',

  // 桌宠
  DESK_PET_SET_ENABLED: 'deskPet:setEnabled',
  DESK_PET_SET_STATE: 'deskPet:setState',
  DESK_PET_STATUS: 'deskPet:status',
  DESK_PET_WINDOW_BEGIN_DRAG: 'deskPetWindow:beginDrag',
  DESK_PET_WINDOW_DRAG: 'deskPetWindow:drag',
  DESK_PET_WINDOW_BEGIN_RESIZE: 'deskPetWindow:beginResize',
  DESK_PET_WINDOW_RESIZE: 'deskPetWindow:resize',
  DESK_PET_WINDOW_END_GESTURE: 'deskPetWindow:endGesture',
  DESK_PET_WINDOW_SET_CHAT_OPEN: 'deskPetWindow:setChatOpen',
  DESK_PET_WINDOW_TOGGLE_CHAT: 'deskPetWindow:toggleChat',
  DESK_PET_BUBBLE_CONTENT_HEIGHT: 'deskPet:bubbleContentHeight',
  DESK_PET_SCREEN_QUESTION_START: 'deskPet:screenQuestionStart',
  DESK_PET_SCREEN_QUESTION_SUBMIT: 'deskPet:screenQuestionSubmit',
  DESK_PET_SCREEN_QUESTION_CANCEL: 'deskPet:screenQuestionCancel',
  DESK_PET_SCREEN_QUESTION_READY: 'deskPet:screenQuestionReady',

  // 导入导出
  EXPORT_JSON: 'export:json',
  IMPORT_JSON: 'import:json',

  // 工具
  CLEAR_DATA: 'data:clear',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

// 验证：所有通道必须是唯一的
export const ALL_CHANNEL_NAMES: readonly string[] = Object.values(IPC_CHANNELS);

// 通道总数
export const CHANNEL_COUNT = Object.keys(IPC_CHANNELS).length;

// 按命名空间分组
export const CHANNELS_BY_NAMESPACE: Record<string, string[]> = {};
for (const ch of Object.values(IPC_CHANNELS)) {
  const ns = ch.split(':')[0];
  if (!CHANNELS_BY_NAMESPACE[ns]) {
    CHANNELS_BY_NAMESPACE[ns] = [];
  }
  CHANNELS_BY_NAMESPACE[ns].push(ch);
}

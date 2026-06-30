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

import { useCallback } from 'react';
import { useSettingsStore } from './stores/useSettingsStore';

export type UiLanguage = 'zh-CN' | 'en-US';

const messages = {
  'zh-CN': {
    today: '今天', ai: 'AI 小黄鸭', timeline: '时间线', records: 'AI 识别记录', memory: '记忆', review: '复盘', settings: '设置',
    language: '语言', languageHint: '选择下班鸭界面的显示语言。切换后会立即生效。', chinese: '简体中文', english: 'English',
    apiSettings: 'API 设置', screenshotSettings: '截图设置', automation: '自动功能', categories: '分类管理', dataManagement: '数据管理',
    languageSaved: '语言已切换', settingsSaveFailed: '设置保存失败',
    running: '运行中', stopped: '已停止', viewAllRecords: '查看全部记录', currentStatus: '当前状态', recognitionRecords: '识别记录',
    aiObservedToday: 'AI 观察到的今天', yesterdayObservation: '小黄鸭的昨日观察', todayTimelinePreview: '今日时间线预览',
    waitForFirstRecognition: '等待首次 AI 识别', noAiRecognitionToday: '今天还没有 AI 识别结果', localVisionDescription: '这里会显示从本地数据库读取的 Vision 记录。',
    noContinuousStatus: '暂无连续状态', rhythmScore: '节奏分', focusedWork: '专注工作',
    search: '搜索', refresh: '刷新', retry: '重试', cancel: '取消', save: '保存', delete: '删除', edit: '编辑', close: '关闭',
    loadingFailed: '加载失败', noMatchingRecords: '无匹配记录', noAiRecords: '暂无 AI 识别记录', clearSearch: '清除搜索',
    searchTitleApp: '搜索标题、应用名…', checkNetwork: '请检查网络后重试',
    output: '输出层', createOutput: '新建输出', outputHistory: '历史输出',
    screenFact: '屏幕事实', aiInference: 'AI 推断', confidence: '可信度', activityType: '类型', application: '应用', sourceEvidence: '原始证据',
    noScreenFact: '暂无屏幕事实', noInference: '暂无推断', noDescription: '暂无描述', selectTimeBlock: '选择一个时间块',
    selectTimeBlockHint: '右侧会显示屏幕事实、AI 推断、可信度和应用来源。',
    observedFact: '观察事实', possibleActivity: '可能活动', rawAiResponse: 'AI 原始响应', model: '模型', time: '时间',
    dateRangeToday: '今天', dateRangeYesterday: '昨天', dateRangeThisWeek: '本周', dateRangeThisMonth: '本月', dateRangeLast7Days: '近 7 天',
    apiConfiguration: 'API 配置', customApi: '自定义 API', visionModel: '视觉模型', reportModel: '报告模型', chatModel: '桌宠对话模型',
    screenshotInterval: '截图间隔（分钟）', keepScreenshots: '保留截图文件', autoStartTracking: '启动时自动开始追踪', autoVision: '自动开启截图识别', enableDeskPet: '启用桌宠',
    categoryName: '分类名称', addCategory: '添加分类', update: '更新', importJson: '导入 JSON', exportJson: '导出 JSON', clearData: '清空数据',
    settingsHelp: '设置说明', workReport: '工作日报', fullDayReview: '全天回顾',
  },
  'en-US': {
    today: 'Today', ai: 'AI Duck', timeline: 'Timeline', records: 'AI Records', memory: 'Memory', review: 'Review', settings: 'Settings',
    language: 'Language', languageHint: 'Choose the display language for Xiabanya. The change takes effect immediately.', chinese: 'Simplified Chinese', english: 'English',
    apiSettings: 'API Settings', screenshotSettings: 'Screenshot Settings', automation: 'Automation', categories: 'Category Management', dataManagement: 'Data Management',
    languageSaved: 'Language updated', settingsSaveFailed: 'Could not save settings',
    running: 'Running', stopped: 'Stopped', viewAllRecords: 'View all records', currentStatus: 'Current status', recognitionRecords: 'Recognition records',
    aiObservedToday: 'What AI observed today', yesterdayObservation: "Duck's observations from yesterday", todayTimelinePreview: "Today's timeline preview",
    waitForFirstRecognition: 'Waiting for the first AI recognition', noAiRecognitionToday: 'No AI recognition results yet today', localVisionDescription: 'Vision records from the local database will appear here.',
    noContinuousStatus: 'No continuous status yet', rhythmScore: 'Rhythm score', focusedWork: 'Focused work',
    search: 'Search', refresh: 'Refresh', retry: 'Retry', cancel: 'Cancel', save: 'Save', delete: 'Delete', edit: 'Edit', close: 'Close',
    loadingFailed: 'Could not load', noMatchingRecords: 'No matching records', noAiRecords: 'No AI recognition records', clearSearch: 'Clear search',
    searchTitleApp: 'Search titles and apps…', checkNetwork: 'Check your connection and try again',
    output: 'Output', createOutput: 'Create output', outputHistory: 'Output history',
    screenFact: 'Screen facts', aiInference: 'AI inference', confidence: 'Confidence', activityType: 'Type', application: 'Application', sourceEvidence: 'Source evidence',
    noScreenFact: 'No screen facts available', noInference: 'No inference available', noDescription: 'No description available', selectTimeBlock: 'Select a time block',
    selectTimeBlockHint: 'Screen facts, AI inference, confidence, and app source will appear here.',
    observedFact: 'Observed fact', possibleActivity: 'Possible activity', rawAiResponse: 'Raw AI response', model: 'Model', time: 'Time',
    dateRangeToday: 'Today', dateRangeYesterday: 'Yesterday', dateRangeThisWeek: 'This week', dateRangeThisMonth: 'This month', dateRangeLast7Days: 'Last 7 days',
    apiConfiguration: 'API Configuration', customApi: 'Custom API', visionModel: 'Vision model', reportModel: 'Report model', chatModel: 'Desk pet chat model',
    screenshotInterval: 'Screenshot interval (minutes)', keepScreenshots: 'Keep screenshot files', autoStartTracking: 'Start tracking on launch', autoVision: 'Enable screenshot recognition automatically', enableDeskPet: 'Enable desk pet',
    categoryName: 'Category name', addCategory: 'Add category', update: 'Update', importJson: 'Import JSON', exportJson: 'Export JSON', clearData: 'Clear data',
    settingsHelp: 'Settings help', workReport: 'Work report', fullDayReview: 'Full-day review',
  },
} as const;

export type TranslationKey = keyof typeof messages['zh-CN'];

const categoryLabels: Record<string, [string, string]> = {
  '代码开发': ['代码开发', 'Software development'], '文稿写作': ['文稿写作', 'Writing'], '视觉设计': ['视觉设计', 'Visual design'],
  '数据处理': ['数据处理', 'Data processing'], '文献与阅读': ['文献与阅读', 'Reading & research'], '沟通与协作': ['沟通与协作', 'Communication & collaboration'],
  '音视频会议': ['音视频会议', 'Meetings'], '规划与管理': ['规划与管理', 'Planning & management'], '检索与AI': ['检索与AI', 'Search & AI'],
  '系统与配置': ['系统与配置', 'System & configuration'], '休闲娱乐': ['休闲娱乐', 'Leisure'], '其他': ['其他', 'Other'],
};

const enumLabels: Record<string, [string, string]> = {
  work: ['工作', 'Work'], personal: ['个人活动', 'Personal'], idle: ['空闲', 'Idle'], unclear: ['待确认', 'Unclear'],
  high: ['高', 'High'], medium: ['中', 'Medium'], low: ['低', 'Low'],
  auto: ['自动', 'Automatic'], manual: ['手动', 'Manual'], vision: ['AI 识别', 'AI recognition'], import: ['导入', 'Imported'],
};

export function translate(language: UiLanguage, key: TranslationKey): string {
  return messages[language][key];
}

export function localizedCategory(category: string, language: UiLanguage): string {
  return categoryLabels[category]?.[language === 'en-US' ? 1 : 0] || category;
}

export function localizedEnum(value: string, language: UiLanguage): string {
  return enumLabels[value]?.[language === 'en-US' ? 1 : 0] || value;
}

export function formatUiDuration(seconds: number, language: UiLanguage): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (language === 'en-US') {
    if (minutes < 1) return '<1 min';
    const hours = Math.floor(minutes / 60);
    return hours ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes} min`;
  }
  if (minutes < 1) return '<1 分钟';
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} 小时${minutes % 60 ? ` ${minutes % 60} 分钟` : ''}` : `${minutes} 分钟`;
}

export function useTranslation() {
  const language = useSettingsStore((state) => state.settings.language);
  return {
    language,
    isEnglish: language === 'en-US',
    t: useCallback((key: TranslationKey) => translate(language, key), [language]),
    categoryLabel: useCallback((category: string) => localizedCategory(category, language), [language]),
    enumLabel: useCallback((value: string) => localizedEnum(value, language), [language]),
    durationLabel: useCallback((seconds: number) => formatUiDuration(seconds, language), [language]),
  };
}

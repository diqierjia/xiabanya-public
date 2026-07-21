import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Loader2, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { toast } from '../components/ui/Toast';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useAppStore } from '../stores/useAppStore';
import { useXiabanyaApi } from '../hooks/useXiabanyaApi';
import { formatLocalDate } from '../../shared/time';
import { CATEGORIES, DEFAULT_API_BASE_URL, normalizeManagedCategories } from '../../shared/types';
import { type UiLanguage, useTranslation } from '../i18n';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface PersistOptions {
  apply?: () => Promise<void> | void;
  successMessage?: string;
}

// 合法模型列表（用于校验 DB 中的旧值，自动替换为默认）
const VALID_VISION_MODELS = [
  'Qwen/Qwen3-VL-8B-Instruct',
  'Qwen/Qwen3-VL-32B-Instruct',
  'Qwen/Qwen2.5-VL-72B-Instruct',
];
const VALID_REPORT_MODELS = [
  'deepseek-ai/DeepSeek-V4-Flash',
  'Qwen/Qwen3.5-9B',
];
const VALID_CHAT_MODELS = [
  'deepseek-ai/DeepSeek-V4-Flash',
  'deepseek-ai/DeepSeek-V4-Pro',
];
const DEFAULT_VISION = 'Qwen/Qwen3-VL-32B-Instruct';
const DEFAULT_REPORT = 'deepseek-ai/DeepSeek-V4-Flash';
const DEFAULT_CHAT = 'deepseek-ai/DeepSeek-V4-Flash';

function normalizeScreenshotInterval(value: number): number {
  const minutes = Math.round(Number(value) || 5);
  return Math.min(60, Math.max(1, minutes));
}

export function SettingsPage() {
  const api = useXiabanyaApi();
  const { settings, loaded, fetchSettings, setSetting } = useSettingsStore();
  const { language, isEnglish, t, categoryLabel } = useTranslation();
  const { setTrackerRunning, setVisionAutoRunning } = useAppStore();
  const [showClear, setShowClear] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [apiKey, setApiKey] = useState('');
  const [customApiEnabled, setCustomApiEnabled] = useState(false);
  const [customApiBaseUrl, setCustomApiBaseUrl] = useState('');
  const [visionModel, setVisionModel] = useState('');
  const [reportModel, setReportModel] = useState('');
  const [chatModel, setChatModel] = useState('');
  const [screenshotInterval, setScreenshotInterval] = useState(5);
  const [keepScreenshots, setKeepScreenshots] = useState(false);
  const [autoStartTracker, setAutoStartTracker] = useState(false);
  const [autoVisionToggle, setAutoVisionToggle] = useState(false);
  const [deskPetEnabled, setDeskPetEnabled] = useState(false);

  // Category management
  const [managedCategories, setManagedCategories] = useState<string[]>([]);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [exportMode, setExportMode] = useState<'today' | 'range' | 'all'>('today');
  const [exportStart, setExportStart] = useState(formatLocalDate());
  const [exportEnd, setExportEnd] = useState(formatLocalDate());
  const skipApiKeyAutosaveRef = useRef(true);
  const skipCustomApiBaseUrlAutosaveRef = useRef(true);
  const skipVisionModelAutosaveRef = useRef(true);
  const skipReportModelAutosaveRef = useRef(true);
  const skipChatModelAutosaveRef = useRef(true);
  const initializedSettingsRef = useRef(false);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchManagedCategories();
  }, []);

  useEffect(() => {
    return () => {
      if (saveStatusTimerRef.current) {
        clearTimeout(saveStatusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!loaded || initializedSettingsRef.current) return;
    initializedSettingsRef.current = true;
    skipApiKeyAutosaveRef.current = true;
    skipCustomApiBaseUrlAutosaveRef.current = true;
    skipVisionModelAutosaveRef.current = true;
    skipReportModelAutosaveRef.current = true;
    skipChatModelAutosaveRef.current = true;
    const customEnabled = settings.custom_api_enabled;
    setApiKey(settings.siliconflow_api_key);
    setCustomApiEnabled(settings.custom_api_enabled);
    setCustomApiBaseUrl(settings.custom_api_base_url);
    setVisionModel(customEnabled || VALID_VISION_MODELS.includes(settings.vision_model) ? settings.vision_model : DEFAULT_VISION);
    setReportModel(customEnabled || VALID_REPORT_MODELS.includes(settings.report_model) ? settings.report_model : DEFAULT_REPORT);
    setChatModel(customEnabled || VALID_CHAT_MODELS.includes(settings.chat_model) ? settings.chat_model : DEFAULT_CHAT);
    setScreenshotInterval(settings.screenshot_interval);
    setKeepScreenshots(settings.keep_screenshots);
    setAutoStartTracker(settings.auto_start_tracker);
    setAutoVisionToggle(settings.auto_vision_toggle);
    setDeskPetEnabled(settings.desk_pet_enabled);
  }, [settings, loaded]);

  const markSaved = useCallback(() => {
    setSaveStatus('saved');
    if (saveStatusTimerRef.current) {
      clearTimeout(saveStatusTimerRef.current);
    }
    saveStatusTimerRef.current = setTimeout(() => {
      setSaveStatus('idle');
      saveStatusTimerRef.current = null;
    }, 1800);
  }, []);

  const persistSetting = useCallback(async (
    key: string,
    value: string | boolean | number,
    options: PersistOptions = {},
  ) => {
    try {
      setSaveStatus('saving');
      await setSetting(key, value);
      await options.apply?.();
      markSaved();
      if (options.successMessage) {
        toast.success(options.successMessage);
      }
    } catch (error) {
      console.error(`[Settings] Failed to save ${key}:`, error);
      setSaveStatus('error');
      toast.error(t('settingsSaveFailed'));
    }
  }, [markSaved, setSetting, t]);

  useEffect(() => {
    if (!loaded) return;
    if (skipApiKeyAutosaveRef.current) {
      skipApiKeyAutosaveRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      persistSetting('siliconflow_api_key', apiKey, {
        apply: async () => {
          if (autoVisionToggle && apiKey.trim()) {
            const interval = normalizeScreenshotInterval(screenshotInterval);
            await api.vision.startAuto(interval);
            setVisionAutoRunning(true);
          }
        },
      });
    }, 700);

    return () => clearTimeout(timer);
  }, [api, apiKey, autoVisionToggle, loaded, persistSetting, screenshotInterval, setVisionAutoRunning]);

  useEffect(() => {
    if (!loaded) return;
    if (skipCustomApiBaseUrlAutosaveRef.current) {
      skipCustomApiBaseUrlAutosaveRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      persistSetting('custom_api_base_url', customApiBaseUrl.trim());
    }, 700);

    return () => clearTimeout(timer);
  }, [customApiBaseUrl, loaded, persistSetting]);

  useEffect(() => {
    if (!loaded || !customApiEnabled) return;
    if (skipVisionModelAutosaveRef.current) {
      skipVisionModelAutosaveRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      persistSetting('vision_model', visionModel.trim() || DEFAULT_VISION);
    }, 700);

    return () => clearTimeout(timer);
  }, [customApiEnabled, loaded, persistSetting, visionModel]);

  useEffect(() => {
    if (!loaded || !customApiEnabled) return;
    if (skipReportModelAutosaveRef.current) {
      skipReportModelAutosaveRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      persistSetting('report_model', reportModel.trim() || DEFAULT_REPORT);
    }, 700);

    return () => clearTimeout(timer);
  }, [customApiEnabled, loaded, persistSetting, reportModel]);

  useEffect(() => {
    if (!loaded || !customApiEnabled) return;
    if (skipChatModelAutosaveRef.current) {
      skipChatModelAutosaveRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      persistSetting('chat_model', chatModel.trim() || DEFAULT_CHAT);
    }, 700);

    return () => clearTimeout(timer);
  }, [chatModel, customApiEnabled, loaded, persistSetting]);

  const updateVisionModel = (value: string) => {
    setVisionModel(value);
    persistSetting('vision_model', value);
  };

  const updateReportModel = (value: string) => {
    setReportModel(value);
    persistSetting('report_model', value);
  };

  const updateChatModel = (value: string) => {
    setChatModel(value);
    persistSetting('chat_model', value);
  };

  const updateCustomApiEnabled = (enabled: boolean) => {
    setCustomApiEnabled(enabled);
    persistSetting('custom_api_enabled', enabled);
    if (!enabled) {
      const nextVisionModel = VALID_VISION_MODELS.includes(visionModel) ? visionModel : DEFAULT_VISION;
      const nextReportModel = VALID_REPORT_MODELS.includes(reportModel) ? reportModel : DEFAULT_REPORT;
      const nextChatModel = VALID_CHAT_MODELS.includes(chatModel) ? chatModel : DEFAULT_CHAT;
      setVisionModel(nextVisionModel);
      setReportModel(nextReportModel);
      setChatModel(nextChatModel);
      persistSetting('vision_model', nextVisionModel);
      persistSetting('report_model', nextReportModel);
      persistSetting('chat_model', nextChatModel);
    }
  };

  const updateScreenshotInterval = (value: number) => {
    const interval = normalizeScreenshotInterval(value);
    setScreenshotInterval(interval);
    persistSetting('screenshot_interval', interval, {
      apply: async () => {
        if (autoVisionToggle && apiKey.trim()) {
          await api.vision.startAuto(interval);
          setVisionAutoRunning(true);
        }
      },
    });
  };

  const updateKeepScreenshots = (enabled: boolean) => {
    setKeepScreenshots(enabled);
    persistSetting('keep_screenshots', enabled);
  };

  const updateAutoStartTracker = (enabled: boolean) => {
    setAutoStartTracker(enabled);
    persistSetting('auto_start_tracker', enabled, {
      apply: async () => {
        if (enabled) {
          await api.tracker.start();
          setTrackerRunning(true);
        } else {
          await api.tracker.stop();
          setTrackerRunning(false);
        }
      },
      successMessage: enabled ? '窗口追踪已开启' : '窗口追踪已停止',
    });
  };

  const updateAutoVisionToggle = (enabled: boolean) => {
    if (enabled && !apiKey.trim()) {
      setAutoVisionToggle(false);
      persistSetting('auto_vision_toggle', false, {
        apply: async () => {
          await api.vision.stopAuto();
          setVisionAutoRunning(false);
        },
      });
      toast.error('请先填写 API Key，再开启自动截图识别');
      return;
    }

    setAutoVisionToggle(enabled);
    persistSetting('auto_vision_toggle', enabled, {
      apply: async () => {
        if (enabled) {
          const interval = normalizeScreenshotInterval(screenshotInterval);
          await api.vision.startAuto(interval);
          setVisionAutoRunning(true);
        } else {
          await api.vision.stopAuto();
          setVisionAutoRunning(false);
        }
      },
      successMessage: enabled ? '自动截图识别已开启' : '自动截图识别已停止',
    });
  };

  const updateDeskPetEnabled = (enabled: boolean) => {
    setDeskPetEnabled(enabled);
    persistSetting('desk_pet_enabled', enabled);
  };

  const fetchManagedCategories = async () => {
    try {
      const managedRaw = await api.settings.get('managed_categories', '');
      const legacyRaw = managedRaw || await api.settings.get('custom_categories', '[]');
      const categories = normalizeManagedCategories(managedRaw ? JSON.parse(legacyRaw) : [...CATEGORIES, ...JSON.parse(legacyRaw || '[]')]);
      setManagedCategories(categories);
      if (!managedRaw) {
        await api.categories.save({ categories });
      }
    } catch {
      setManagedCategories(normalizeManagedCategories([]));
    }
  };

  const saveManagedCategories = async (categories: string[], renames: Array<{ from: string; to: string }> = []) => {
    try {
      const saved = await api.categories.save({ categories, renames });
      setManagedCategories(saved);
      toast.success('分类已保存');
    } catch {
      toast.error('保存分类失败');
    }
  };

  const addCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    if (managedCategories.includes(name)) {
      toast.error('已有同名分类');
      return;
    }
    saveManagedCategories([...managedCategories, name]);
    resetCategoryForm();
  };

  const updateCategory = () => {
    const name = newCatName.trim();
    if (!editingCategory || !name) return;
    if (editingCategory === '其他' && name !== '其他') {
      toast.error('“其他”是兜底分类，不能改名');
      return;
    }
    if (name !== editingCategory && managedCategories.includes(name)) {
      toast.error('已有同名分类');
      return;
    }
    const updated = managedCategories.map((category) => category === editingCategory ? name : category);
    saveManagedCategories(updated, name === editingCategory ? [] : [{ from: editingCategory, to: name }]);
    resetCategoryForm();
  };

  const startEdit = (category: string) => {
    setEditingCategory(category);
    setNewCatName(category);
    setShowCategoryForm(true);
  };

  const resetCategoryForm = () => {
    setShowCategoryForm(false);
    setEditingCategory(null);
    setNewCatName('');
  };

  const handleExport = async () => {
    try {
      const today = formatLocalDate();
      const range = exportMode === 'today'
        ? { start: today, end: today }
        : exportMode === 'range'
          ? { start: exportStart, end: exportEnd }
          : undefined;
      if (range && (!range.start || !range.end || range.start > range.end)) {
        toast.error('请选择有效的导出日期范围');
        return;
      }
      const data = await api.exportJson(range);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const suffix = data.range ? `${data.range.start}_to_${data.range.end}` : 'all';
      a.download = `xiabanya-export-${suffix}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setShowExport(false);
      toast.success('数据已导出');
    } catch {
      toast.error('导出失败');
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const n = await api.importJson(data);
        toast.success(`导入 ${n} 条记录`);
      } catch {
        toast.error('导入失败，请检查文件格式');
      }
    };
    input.click();
  };

  const handleClear = async () => {
    try {
      await api.clearData();
      setShowClear(false);
      toast.success('数据已清空');
    } catch {
      toast.error('清空失败');
    }
  };

  const statusText = saveStatus === 'saving'
    ? '保存中'
    : saveStatus === 'saved'
      ? '已保存'
      : saveStatus === 'error'
        ? '保存失败'
        : '修改后自动保存';

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <div className="flex items-center justify-end gap-2 text-xs text-gray-500">
          {saveStatus === 'saving' ? (
            <Loader2 size={14} className="animate-spin text-brand-600" />
          ) : saveStatus === 'saved' ? (
            <CheckCircle2 size={14} className="text-brand-600" />
          ) : saveStatus === 'error' ? (
            <AlertCircle size={14} className="text-red-500" />
          ) : null}
          <span>{statusText}</span>
        </div>

      {/* API Config */}
      <Card className="p-5">
          <Card.Header>
            <div className="flex items-center justify-between gap-4">
              <Card.Title>{t('apiSettings')}</Card.Title>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customApiEnabled}
                  onChange={(e) => updateCustomApiEnabled(e.target.checked)}
                  className="rounded"
                />
                <span>{t('customApi')}</span>
              </label>
            </div>
          </Card.Header>
        <div className="space-y-3">
          <Input
            label={customApiEnabled ? 'API Key' : 'SiliconFlow API Key'}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
          {customApiEnabled && (
            <Input
              label={isEnglish ? 'Custom API URL' : '自定义 API 地址'}
              value={customApiBaseUrl}
              onChange={(e) => setCustomApiBaseUrl(e.target.value)}
              placeholder={DEFAULT_API_BASE_URL}
              hint={isEnglish ? 'An OpenAI-compatible /chat/completions base URL' : '兼容 OpenAI /chat/completions 的 Base URL'}
            />
          )}
          {customApiEnabled ? (
            <div className="grid grid-cols-2 gap-4">
              <Input
                label={t('visionModel')}
                value={visionModel}
                onChange={(e) => setVisionModel(e.target.value)}
                placeholder={DEFAULT_VISION}
                hint={isEnglish ? 'Used for screenshot recognition; enter the provider model name.' : '用于截图识别，按服务商文档填写模型名'}
              />
              <Input
                label={t('reportModel')}
                value={reportModel}
                onChange={(e) => setReportModel(e.target.value)}
                placeholder={DEFAULT_REPORT}
                hint={isEnglish ? 'Used to create reports and reviews.' : '用于生成日报和回顾'}
              />
              <Input
                label={t('chatModel')}
                value={chatModel}
                onChange={(e) => setChatModel(e.target.value)}
                placeholder={DEFAULT_CHAT}
                hint={isEnglish ? 'Used for desk-pet chat.' : '用于桌宠聊天'}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Select
                label={t('visionModel')}
                value={visionModel}
                onChange={(e) => updateVisionModel(e.target.value)}
                options={[
                  { value: 'Qwen/Qwen3-VL-8B-Instruct', label: isEnglish ? 'Qwen3-VL 8B (Fast)' : 'Qwen3-VL 8B (快速)' },
                  { value: 'Qwen/Qwen3-VL-32B-Instruct', label: isEnglish ? 'Qwen3-VL 32B (Balanced)' : 'Qwen3-VL 32B (均衡)' },
                  { value: 'Qwen/Qwen2.5-VL-72B-Instruct', label: isEnglish ? 'Qwen2.5-VL 72B (Accurate)' : 'Qwen2.5-VL 72B (精准)' },
                ]}
              />
              <Select
                label={t('reportModel')}
                value={reportModel}
                onChange={(e) => updateReportModel(e.target.value)}
                options={[
                  { value: 'deepseek-ai/DeepSeek-V4-Flash', label: isEnglish ? 'DeepSeek-V4-Flash (Recommended)' : 'DeepSeek-V4-Flash (推荐)' },
                  { value: 'Qwen/Qwen3.5-9B', label: isEnglish ? 'Qwen3.5-9B (Economical)' : 'Qwen/Qwen3.5-9B (省钱)' },
                ]}
              />
              <Select
                label={t('chatModel')}
                value={chatModel}
                onChange={(e) => updateChatModel(e.target.value)}
                options={[
                  { value: 'deepseek-ai/DeepSeek-V4-Flash', label: isEnglish ? 'DeepSeek-V4-Flash (Recommended)' : 'DeepSeek-V4-Flash (推荐)' },
                  { value: 'deepseek-ai/DeepSeek-V4-Pro', label: isEnglish ? 'DeepSeek-V4-Pro (More capable)' : 'DeepSeek-V4-Pro (更强)' },
                ]}
              />
            </div>
          )}
        </div>
      </Card>

      {/* Language */}
      <Card className="p-5">
        <Card.Header>
          <Card.Title>{t('language')}</Card.Title>
        </Card.Header>
        <div className="space-y-3">
          <p className="text-sm text-gray-500">{t('languageHint')}</p>
          <Select
            label={t('language')}
            value={language}
            onChange={(event) => {
              const nextLanguage = event.target.value as UiLanguage;
              void persistSetting('language', nextLanguage, { successMessage: t('languageSaved') });
            }}
            options={[
              { value: 'zh-CN', label: t('chinese') },
              { value: 'en-US', label: t('english') },
            ]}
          />
        </div>
      </Card>

      {/* Screenshot */}
      <Card className="p-5">
        <Card.Header>
          <Card.Title>{t('screenshotSettings')}</Card.Title>
        </Card.Header>
        <div className="space-y-3">
          <Input
            label={t('screenshotInterval')}
            type="number"
            value={String(screenshotInterval)}
            onChange={(e) => setScreenshotInterval(Number(e.target.value))}
            onBlur={(e) => updateScreenshotInterval(Number(e.target.value))}
            hint={isEnglish ? '1–60 minutes' : '1-60 分钟'}
            className="w-32"
          />
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={keepScreenshots}
              onChange={(e) => updateKeepScreenshots(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-600">{t('keepScreenshots')}</span>
          </label>
        </div>
      </Card>

      {/* Auto */}
      <Card className="p-5">
        <Card.Header>
          <Card.Title>{t('automation')}</Card.Title>
        </Card.Header>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoStartTracker}
              onChange={(e) => updateAutoStartTracker(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-600">{t('autoStartTracking')}<strong>{isEnglish ? ' (recommended)' : '（建议勾选）'}</strong></span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoVisionToggle}
              onChange={(e) => updateAutoVisionToggle(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-600">{t('autoVision')}<strong>{isEnglish ? ' (recommended)' : '（建议勾选）'}</strong></span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={deskPetEnabled}
              onChange={(e) => updateDeskPetEnabled(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-600">{t('enableDeskPet')}</span>
          </label>
        </div>
      </Card>

      {/* Category Management */}
      <Card className="p-5">
        <Card.Header>
          <Card.Title>{t('categories')}</Card.Title>
        </Card.Header>
        <div className="space-y-3">
          <p className="text-sm text-gray-500">{isEnglish ? 'These categories are shared by manual records and screenshot recognition. Renaming one updates existing records.' : '这里的分类会同时用于手动记录和截图识别。改名会同步更新已有记录。'}</p>
          {managedCategories.length > 0 && (
            <div className="space-y-2">
              {managedCategories.map((category) => (
                <div
                  key={category}
                  className="flex items-center gap-3 p-2 rounded-lg border border-gray-100"
                >
                  <span className="text-sm text-gray-700 flex-1">{categoryLabel(category)}</span>
                  {category === '其他' && <span className="text-xs text-gray-400">{isEnglish ? 'Fallback category' : '兜底分类'}</span>}
                  <button
                    onClick={() => startEdit(category)}
                    className="p-1 hover:bg-gray-100 rounded"
                    aria-label={`${t('edit')} ${categoryLabel(category)}`}
                  >
                    <Pencil size={14} className="text-gray-400" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {showCategoryForm ? (
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <Input
                label={t('categoryName')}
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder={isEnglish ? 'For example: Break' : '例如：摸鱼'}
                disabled={editingCategory === '其他'}
              />
              {editingCategory === '其他' && <p className="text-xs text-gray-400">{isEnglish ? '“Other” is the fixed fallback for unclassified items.' : '“其他”用于无法判断时兜底，名称固定。'}</p>}
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={editingCategory ? updateCategory : addCategory}
                  disabled={!newCatName.trim()}
                >
                  {editingCategory ? t('update') : t('addCategory')}
                </Button>
                <Button variant="ghost" size="sm" icon={X} onClick={resetCategoryForm}>
                  {t('cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => setShowCategoryForm(true)}>
              {t('addCategory')}
            </Button>
          )}
        </div>
      </Card>

      {/* Data Management */}
      <Card className="p-5">
        <Card.Header>
          <Card.Title>{t('dataManagement')}</Card.Title>
        </Card.Header>
        <div className="flex gap-3">
          <Button variant="secondary" icon={Download} onClick={() => setShowExport(true)}>
            {t('exportJson')}
          </Button>
          <Button variant="secondary" icon={Upload} onClick={handleImport}>
            {t('importJson')}
          </Button>
          <Button variant="danger" icon={Trash2} onClick={() => setShowClear(true)}>
            {t('clearData')}
          </Button>
        </div>
      </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card className="p-5">
          <Card.Header>
            <Card.Title>{t('settingsHelp')}</Card.Title>
          </Card.Header>
          <div className="space-y-4 text-sm leading-6 text-gray-600">
            <section>
              <h3 className="font-medium text-gray-800">{t('apiConfiguration')}</h3>
              <p>{isEnglish ? 'SiliconFlow is the default provider and requires an API key. You can also choose a custom API provider.' : '默认使用硅基流动 SiliconFlow 服务商，需要填写 API Key。您也可选择自定义自己的 API 服务商。'}</p>
              {customApiEnabled && (
                <p className="mt-2">{isEnglish ? `A custom API can use any OpenAI-compatible /chat/completions service. Example: ${DEFAULT_API_BASE_URL}. Use the provider's exact model name.` : `自定义 API 适合兼容 OpenAI /chat/completions 的服务。地址示例：${DEFAULT_API_BASE_URL}。模型名需要按服务商文档原样填写。`}</p>
              )}
            </section>
            <section>
              <h3 className="font-medium text-gray-800">{t('automation')}</h3>
              <p>{isEnglish ? 'An API key is required before using automated features. Window tracking records the current app and window title. Automatic screenshot recognition periodically uses a multimodal model to analyze screen content.' : '需要先填写 API Key 后使用。窗口追踪记录当前应用和窗口标题。自动截图识别会定时由多模态模型分析屏幕内容。'}</p>
              <p className="mt-2 font-medium text-red-600">{isEnglish ? 'For full automated use, turn on every automated feature.' : '完全使用自动功能，需要全部勾选。'}</p>
            </section>
            <section>
              <h3 className="font-medium text-gray-800">{isEnglish ? 'Desk pet' : '桌宠'}</h3>
              <p>{isEnglish ? 'The desk pet is enabled by default. It shows Xiabanya status, provides a chat entry point, and includes Ask Duck About Screen.' : '桌宠默认开启，用来显示下班鸭状态和提供聊天入口。此外还有看图问鸭功能。'}</p>
            </section>
            <section>
              <h3 className="font-medium text-gray-800">{t('screenshotSettings')}</h3>
              <p>{isEnglish ? 'A five-minute interval is the default. To prevent excessive storage use, keeping screenshot files is off by default; enable it only when local image evidence is needed for troubleshooting.' : '截图间隔默认 5 分钟即可。为防止存储占用过大，保留截图文件默认关闭，如有需要本地留图排查时再开启。'}</p>
            </section>
          </div>
        </Card>
      </aside>

      {showExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowExport(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">导出 JSON</h2>
              <button className="rounded p-1 hover:bg-gray-100" onClick={() => setShowExport(false)} aria-label="关闭导出设置">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 text-sm text-gray-700">
              <label className="flex items-center gap-2">
                <input type="radio" name="export-range" checked={exportMode === 'today'} onChange={() => setExportMode('today')} />
                今天（{formatLocalDate()}）
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="export-range" checked={exportMode === 'range'} onChange={() => setExportMode('range')} />
                自定义时间段
              </label>
              {exportMode === 'range' && (
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <Input label="开始日期" type="date" value={exportStart} onChange={(e) => setExportStart(e.target.value)} />
                  <Input label="结束日期" type="date" value={exportEnd} onChange={(e) => setExportEnd(e.target.value)} />
                </div>
              )}
              <label className="flex items-center gap-2">
                <input type="radio" name="export-range" checked={exportMode === 'all'} onChange={() => setExportMode('all')} />
                全部数据
              </label>
              <p className="pl-6 text-xs leading-5 text-gray-400">导出活动记录与报告；范围内会保留与日期区间相交的记录和报告。</p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowExport(false)}>取消</Button>
              <Button variant="primary" icon={Download} onClick={handleExport}>导出</Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showClear}
        title="清空所有数据"
        message="确认清空所有工作记录和报告？此操作不可撤销！"
        onConfirm={handleClear}
        onCancel={() => setShowClear(false)}
      />
    </div>
  );
}

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
import { DEFAULT_API_BASE_URL } from '../../shared/types';

interface UserCategory {
  name: string;
  color: string;
  keywords: string[];
}

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

  // Custom categories
  const [customCategories, setCustomCategories] = useState<UserCategory[]>([]);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<UserCategory | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#08a64f');
  const [newCatKeywords, setNewCatKeywords] = useState('');
  const skipApiKeyAutosaveRef = useRef(true);
  const skipCustomApiBaseUrlAutosaveRef = useRef(true);
  const skipVisionModelAutosaveRef = useRef(true);
  const skipReportModelAutosaveRef = useRef(true);
  const skipChatModelAutosaveRef = useRef(true);
  const initializedSettingsRef = useRef(false);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchCustomCategories();
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
      toast.error('设置保存失败');
    }
  }, [markSaved, setSetting]);

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

  const fetchCustomCategories = async () => {
    try {
      const raw = await api.settings.get('custom_categories', '[]');
      setCustomCategories(JSON.parse(raw));
    } catch {
      // No custom categories yet
    }
  };

  const saveCustomCategories = async (cats: UserCategory[]) => {
    try {
      await api.settings.set('custom_categories', JSON.stringify(cats));
      setCustomCategories(cats);
      toast.success('分类已保存');
    } catch {
      toast.error('保存分类失败');
    }
  };

  const addCategory = () => {
    if (!newCatName.trim()) return;
    const cat: UserCategory = {
      name: newCatName.trim(),
      color: newCatColor,
      keywords: newCatKeywords.split(',').map((k) => k.trim()).filter(Boolean),
    };
    saveCustomCategories([...customCategories, cat]);
    resetCategoryForm();
  };

  const updateCategory = () => {
    if (!editingCategory || !newCatName.trim()) return;
    const updated = customCategories.map((c) =>
      c === editingCategory
        ? { name: newCatName.trim(), color: newCatColor, keywords: newCatKeywords.split(',').map((k) => k.trim()).filter(Boolean) }
        : c,
    );
    saveCustomCategories(updated);
    resetCategoryForm();
  };

  const deleteCategory = (cat: UserCategory) => {
    saveCustomCategories(customCategories.filter((c) => c !== cat));
  };

  const startEdit = (cat: UserCategory) => {
    setEditingCategory(cat);
    setNewCatName(cat.name);
    setNewCatColor(cat.color);
    setNewCatKeywords(cat.keywords.join(', '));
    setShowCategoryForm(true);
  };

  const resetCategoryForm = () => {
    setShowCategoryForm(false);
    setEditingCategory(null);
    setNewCatName('');
    setNewCatColor('#08a64f');
    setNewCatKeywords('');
  };

  const handleExport = async () => {
    try {
      const data = await api.exportJson();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `xiabanya-export-${formatLocalDate()}.json`;
      a.click();
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
              <Card.Title>API 配置</Card.Title>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customApiEnabled}
                  onChange={(e) => updateCustomApiEnabled(e.target.checked)}
                  className="rounded"
                />
                <span>自定义 API</span>
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
              label="自定义 API 地址"
              value={customApiBaseUrl}
              onChange={(e) => setCustomApiBaseUrl(e.target.value)}
              placeholder={DEFAULT_API_BASE_URL}
              hint="兼容 OpenAI /chat/completions 的 Base URL"
            />
          )}
          {customApiEnabled ? (
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="视觉模型"
                value={visionModel}
                onChange={(e) => setVisionModel(e.target.value)}
                placeholder={DEFAULT_VISION}
                hint="用于截图识别，按服务商文档填写模型名"
              />
              <Input
                label="报告模型"
                value={reportModel}
                onChange={(e) => setReportModel(e.target.value)}
                placeholder={DEFAULT_REPORT}
                hint="用于生成日报和回顾"
              />
              <Input
                label="桌宠对话模型"
                value={chatModel}
                onChange={(e) => setChatModel(e.target.value)}
                placeholder={DEFAULT_CHAT}
                hint="用于桌宠聊天"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="视觉模型"
                value={visionModel}
                onChange={(e) => updateVisionModel(e.target.value)}
                options={[
                  { value: 'Qwen/Qwen3-VL-8B-Instruct', label: 'Qwen3-VL 8B (快速)' },
                  { value: 'Qwen/Qwen3-VL-32B-Instruct', label: 'Qwen3-VL 32B (均衡)' },
                  { value: 'Qwen/Qwen2.5-VL-72B-Instruct', label: 'Qwen2.5-VL 72B (精准)' },
                ]}
              />
              <Select
                label="报告模型"
                value={reportModel}
                onChange={(e) => updateReportModel(e.target.value)}
                options={[
                  { value: 'deepseek-ai/DeepSeek-V4-Flash', label: 'DeepSeek-V4-Flash (推荐)' },
                  { value: 'Qwen/Qwen3.5-9B', label: 'Qwen3.5-9B (省钱)' },
                ]}
              />
              <Select
                label="桌宠对话模型"
                value={chatModel}
                onChange={(e) => updateChatModel(e.target.value)}
                options={[
                  { value: 'deepseek-ai/DeepSeek-V4-Flash', label: 'DeepSeek-V4-Flash (推荐)' },
                  { value: 'deepseek-ai/DeepSeek-V4-Pro', label: 'DeepSeek-V4-Pro (更强)' },
                ]}
              />
            </div>
          )}
        </div>
      </Card>

      {/* Screenshot */}
      <Card className="p-5">
        <Card.Header>
          <Card.Title>截图设置</Card.Title>
        </Card.Header>
        <div className="space-y-3">
          <Input
            label="截图间隔 (分钟)"
            type="number"
            value={String(screenshotInterval)}
            onChange={(e) => setScreenshotInterval(Number(e.target.value))}
            onBlur={(e) => updateScreenshotInterval(Number(e.target.value))}
            hint="1-60 分钟"
            className="w-32"
          />
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={keepScreenshots}
              onChange={(e) => updateKeepScreenshots(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-600">保留截图文件</span>
          </label>
        </div>
      </Card>

      {/* Auto */}
      <Card className="p-5">
        <Card.Header>
          <Card.Title>自动功能</Card.Title>
        </Card.Header>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoStartTracker}
              onChange={(e) => updateAutoStartTracker(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-600">启动时自动开始追踪</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoVisionToggle}
              onChange={(e) => updateAutoVisionToggle(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-600">自动开启截图识别</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={deskPetEnabled}
              onChange={(e) => updateDeskPetEnabled(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-600">启用桌宠</span>
          </label>
        </div>
      </Card>

      {/* Custom Categories */}
      <Card className="p-5">
        <Card.Header>
          <Card.Title>自定义分类</Card.Title>
        </Card.Header>
        <div className="space-y-3">
          {customCategories.length > 0 && (
            <div className="space-y-2">
              {customCategories.map((cat) => (
                <div
                  key={cat.name}
                  className="flex items-center gap-3 p-2 rounded-lg border border-gray-100"
                >
                  <div
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="text-sm text-gray-700 flex-1">{cat.name}</span>
                  <div className="flex gap-1">
                    {cat.keywords.slice(0, 3).map((kw) => (
                      <span key={kw} className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        {kw}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={() => startEdit(cat)}
                    className="p-1 hover:bg-gray-100 rounded"
                  >
                    <Pencil size={14} className="text-gray-400" />
                  </button>
                  <button
                    onClick={() => deleteCategory(cat)}
                    className="p-1 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={14} className="text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {showCategoryForm ? (
            <div className="border border-gray-200 rounded-lg p-4 space-y-3">
              <Input
                label="分类名称"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="例如：摸鱼"
              />
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">颜色</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newCatColor}
                    onChange={(e) => setNewCatColor(e.target.value)}
                    className="w-10 h-10 rounded border cursor-pointer"
                  />
                  <span className="text-xs text-gray-400">{newCatColor}</span>
                </div>
              </div>
              <Input
                label="关键词 (逗号分隔)"
                value={newCatKeywords}
                onChange={(e) => setNewCatKeywords(e.target.value)}
                placeholder="weibo, 抖音, bilibili"
                hint="匹配窗口标题的关键词"
              />
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={editingCategory ? updateCategory : addCategory}
                  disabled={!newCatName.trim()}
                >
                  {editingCategory ? '更新' : '添加'}
                </Button>
                <Button variant="ghost" size="sm" icon={X} onClick={resetCategoryForm}>
                  取消
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => setShowCategoryForm(true)}>
              添加分类
            </Button>
          )}
        </div>
      </Card>

      {/* Data Management */}
      <Card className="p-5">
        <Card.Header>
          <Card.Title>数据管理</Card.Title>
        </Card.Header>
        <div className="flex gap-3">
          <Button variant="secondary" icon={Download} onClick={handleExport}>
            导出 JSON
          </Button>
          <Button variant="secondary" icon={Upload} onClick={handleImport}>
            导入 JSON
          </Button>
          <Button variant="danger" icon={Trash2} onClick={() => setShowClear(true)}>
            清空数据
          </Button>
        </div>
      </Card>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card className="p-5">
          <Card.Header>
            <Card.Title>设置说明</Card.Title>
          </Card.Header>
          <div className="space-y-4 text-sm leading-6 text-gray-600">
            <section>
              <h3 className="font-medium text-gray-800">API 配置</h3>
              <p>默认使用 SiliconFlow，只需要填写 API Key。视觉模型、报告模型和桌宠对话模型已经有默认选择，后续需要时再调整。</p>
              {customApiEnabled && (
                <p className="mt-2">自定义 API 适合兼容 OpenAI /chat/completions 的服务。地址示例：{DEFAULT_API_BASE_URL}。模型名需要按服务商文档原样填写。</p>
              )}
            </section>
            <section>
              <h3 className="font-medium text-gray-800">自动功能</h3>
              <p>窗口追踪记录当前应用和窗口标题，是时间线的基础。自动截图识别会定时分析屏幕内容，用来生成观察事实和可能活动，需要先填写 API Key。</p>
            </section>
            <section>
              <h3 className="font-medium text-gray-800">桌宠</h3>
              <p>桌宠默认开启，用来显示下班鸭状态和提供聊天入口。它本身不会替你开启截图识别。</p>
            </section>
            <section>
              <h3 className="font-medium text-gray-800">截图设置</h3>
              <p>截图间隔默认 5 分钟即可。保留截图文件默认关闭，只有需要本地留图排查时再开启。</p>
            </section>
          </div>
        </Card>
      </aside>

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

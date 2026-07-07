import { useEffect, useState } from 'react';
import { Save, Trash2, Download, Upload, Plus, Pencil, X } from 'lucide-react';
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

interface UserCategory {
  name: string;
  color: string;
  keywords: string[];
}

// 合法模型列表（用于校验 DB 中的旧值，自动替换为默认）
const VALID_VISION_MODELS = [
  'Qwen/Qwen3-VL-8B-Instruct',
  'Qwen/Qwen3-VL-32B-Instruct',
  'Qwen/Qwen2.5-VL-72B-Instruct',
];
const VALID_REPORT_MODELS = [
  'deepseek-ai/DeepSeek-V3',
  'Qwen/Qwen2.5-72B-Instruct',
  'Qwen/Qwen2.5-32B-Instruct',
];
const VALID_CHAT_MODELS = [
  'deepseek-ai/DeepSeek-V4-Flash',
  'deepseek-ai/DeepSeek-V3',
  'Qwen/Qwen2.5-32B-Instruct',
];
const DEFAULT_VISION = 'Qwen/Qwen3-VL-32B-Instruct';
const DEFAULT_REPORT = 'deepseek-ai/DeepSeek-V3';
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
  const [apiKey, setApiKey] = useState('');
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

  useEffect(() => {
    fetchSettings();
    fetchCustomCategories();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setApiKey(settings.siliconflow_api_key);
    setVisionModel(VALID_VISION_MODELS.includes(settings.vision_model) ? settings.vision_model : DEFAULT_VISION);
    setReportModel(VALID_REPORT_MODELS.includes(settings.report_model) ? settings.report_model : DEFAULT_REPORT);
    setChatModel(VALID_CHAT_MODELS.includes(settings.chat_model) ? settings.chat_model : DEFAULT_CHAT);
    setScreenshotInterval(settings.screenshot_interval);
    setKeepScreenshots(settings.keep_screenshots);
    setAutoStartTracker(settings.auto_start_tracker);
    setAutoVisionToggle(settings.auto_vision_toggle);
    setDeskPetEnabled(settings.desk_pet_enabled);
  }, [settings, loaded]);

  const save = async () => {
    try {
      const interval = normalizeScreenshotInterval(screenshotInterval);
      setScreenshotInterval(interval);

      await setSetting('siliconflow_api_key', apiKey);
      await setSetting('vision_model', visionModel);
      await setSetting('report_model', reportModel);
      await setSetting('chat_model', chatModel);
      await setSetting('screenshot_interval', interval);
      await setSetting('keep_screenshots', keepScreenshots);
      await setSetting('auto_start_tracker', autoStartTracker);
      await setSetting('auto_vision_toggle', autoVisionToggle);
      await setSetting('desk_pet_enabled', deskPetEnabled);

      if (autoStartTracker) {
        await api.tracker.start();
        setTrackerRunning(true);
      } else {
        await api.tracker.stop();
        setTrackerRunning(false);
      }

      if (autoVisionToggle && apiKey.trim()) {
        await api.vision.startAuto(interval);
        setVisionAutoRunning(true);
      } else {
        await api.vision.stopAuto();
        setVisionAutoRunning(false);
      }

      await fetchSettings();
      toast.success('设置已保存');
    } catch (error) {
      console.error('[Settings] Save failed:', error);
      toast.error('保存失败');
    }
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

  return (
    <div className="max-w-2xl space-y-6">
      {/* API Config */}
      <Card className="p-5">
        <Card.Header>
          <Card.Title>API 配置</Card.Title>
        </Card.Header>
        <div className="space-y-3">
          <Input
            label="SiliconFlow API Key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="视觉模型"
              value={visionModel}
              onChange={(e) => setVisionModel(e.target.value)}
              options={[
                { value: 'Qwen/Qwen3-VL-8B-Instruct', label: 'Qwen3-VL 8B (快速)' },
                { value: 'Qwen/Qwen3-VL-32B-Instruct', label: 'Qwen3-VL 32B (均衡)' },
                { value: 'Qwen/Qwen2.5-VL-72B-Instruct', label: 'Qwen2.5-VL 72B (精准)' },
              ]}
            />
            <Select
              label="报告模型"
              value={reportModel}
              onChange={(e) => setReportModel(e.target.value)}
              options={[
                { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3 (推荐)' },
                { value: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5 72B' },
                { value: 'Qwen/Qwen2.5-32B-Instruct', label: 'Qwen2.5 32B (快速)' },
              ]}
            />
            <Select
              label="桌宠对话模型"
              value={chatModel}
              onChange={(e) => setChatModel(e.target.value)}
              options={[
                { value: 'deepseek-ai/DeepSeek-V4-Flash', label: 'DeepSeek-V4-Flash (推荐)' },
                { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek-V3' },
                { value: 'Qwen/Qwen2.5-32B-Instruct', label: 'Qwen2.5 32B (快速)' },
              ]}
            />
          </div>
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
            hint="1-60 分钟"
            className="w-32"
          />
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={keepScreenshots}
              onChange={(e) => setKeepScreenshots(e.target.checked)}
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
              onChange={(e) => setAutoStartTracker(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-600">启动时自动开始追踪</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoVisionToggle}
              onChange={(e) => setAutoVisionToggle(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-600">自动开启截图识别</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={deskPetEnabled}
              onChange={(e) => setDeskPetEnabled(e.target.checked)}
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

      {/* Save */}
      <div className="flex items-center gap-3">
        <Button variant="primary" icon={Save} onClick={save}>
          保存设置
        </Button>
      </div>

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

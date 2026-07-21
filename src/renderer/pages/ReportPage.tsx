import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Download, FileJson, Brain, Monitor, Save, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { DateRangePicker } from '../components/DateRangePicker';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { Card } from '../components/ui/Card';
import { toast } from '../components/ui/Toast';
import { REPORT_TEMPLATES, today as todayFn } from '../lib/constants';
import { useXiabanyaApi } from '../hooks/useXiabanyaApi';

type ReportType = '日报' | '周报' | '月报';

const REPORT_PROMPT_SETTING_PREFIX = 'report_custom_prompt:';

const REPORT_TYPES: readonly ReportType[] = ['日报', '周报', '月报'];

function promptKey(template: string, reportType: ReportType): string {
  return `${template}:${reportType}`;
}

function outputName(template: string, reportType: ReportType): string {
  if (template === '工作日报') return `工作${reportType}`;
  if (reportType === '日报') return '全天回顾';
  return `全${reportType === '周报' ? '周' : '月'}回顾`;
}

const DEFAULT_REPORT_PROMPTS: Record<string, string> = {
  [promptKey('工作日报', '日报')]: `请以清楚、简洁、可直接编辑提交的工作日报形式输出。

建议结构：
## 今日工作
按主题归纳可确认的工作内容。
## 可写入日报的进展
提炼材料明确支持的进展，不夸大完成度。
## 待确认
列出需要我补充或确认的内容；没有则写“无”。`,
  [promptKey('工作日报', '周报')]: `请以清楚、简洁、可直接编辑提交的工作周报形式输出。

建议结构：
## 本周工作
按主题归纳本周可确认的工作内容。
## 阶段进展
提炼材料明确支持的进展，不夸大完成度。
## 待确认与下周关注
列出需要我补充、确认或继续跟进的内容；没有则写“无”。`,
  [promptKey('工作日报', '月报')]: `请以清楚、简洁、可直接编辑提交的工作月报形式输出。

建议结构：
## 本月工作
按主题归纳本月可确认的工作内容。
## 阶段进展
提炼材料明确支持的进展，不夸大完成度。
## 待确认与下月关注
列出需要我补充、确认或继续跟进的内容；没有则写“无”。`,
  [promptKey('全天回顾', '日报')]: `请以客观、不过度评判的方式复盘全天活动。

建议结构：
## 全天概览
用 2-4 句话概括这一天。
## 活动时间线
按时间顺序归纳主要活动和切换。
## 工作与生活分布
简要说明工作、个人/娱乐、空闲或不确定内容。`,
  [promptKey('全天回顾', '周报')]: `请以客观、不过度评判的方式复盘本周活动。

建议结构：
## 本周概览
用 2-4 句话概括本周的活动结构。
## 主要活动与变化
按时间或主题归纳主要活动和切换。
## 工作与生活分布
简要说明工作、个人/娱乐、空闲或不确定内容。`,
  [promptKey('全天回顾', '月报')]: `请以客观、不过度评判的方式复盘本月活动。

建议结构：
## 本月概览
用 2-4 句话概括本月的活动结构。
## 主要活动与变化
按时间或主题归纳主要活动和切换。
## 工作与生活分布
简要说明工作、个人/娱乐、空闲或不确定内容。`,
};

export function ReportPage() {
  const api = useXiabanyaApi();
  const [reportType, setReportType] = useState<ReportType>('日报');
  const [template, setTemplate] = useState<string>(REPORT_TEMPLATES[0]);
  const [startDate, setStartDate] = useState(todayFn);
  const [endDate, setEndDate] = useState(todayFn);
  const [content, setContent] = useState('');
  const [reportId, setReportId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [prompts, setPrompts] = useState<Record<string, string>>({ ...DEFAULT_REPORT_PROMPTS });
  const [promptsLoaded, setPromptsLoaded] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const currentPromptKey = promptKey(template, reportType);
  const currentOutputName = outputName(template, reportType);

  // v2.2: 素材预览
  const [materialPreview, setMaterialPreview] = useState<{
    visionCount: number;
    recordCount: number;
    loaded: boolean;
    loading: boolean;
  }>({ visionCount: 0, recordCount: 0, loaded: false, loading: false });

  useEffect(() => {
    let active = true;
    const promptTargets = REPORT_TEMPLATES.flatMap((reportTemplate) => REPORT_TYPES.map((type) => ({
      template: reportTemplate,
      reportType: type,
      key: promptKey(reportTemplate, type),
    })));
    void Promise.all(promptTargets.map(async ({ template: reportTemplate, reportType: type, key }) => {
      const saved = await api.settings.get(`${REPORT_PROMPT_SETTING_PREFIX}${key}`, '');
      // 旧版本按用途保存提示词；仅让它迁移到同用途的日报，避免日报结构误用于周报和月报。
      const legacy = type === '日报'
        ? await api.settings.get(`${REPORT_PROMPT_SETTING_PREFIX}${reportTemplate}`, '')
        : '';
      return [key, saved.trim() || legacy.trim() || DEFAULT_REPORT_PROMPTS[key]] as const;
    })).then((entries) => {
      if (!active) return;
      setPrompts(Object.fromEntries(entries));
      setPromptsLoaded(true);
    }).catch(() => {
      if (active) setPromptsLoaded(true);
    });
    return () => { active = false; };
  }, [api]);

  const currentPrompt = useMemo(
    () => prompts[currentPromptKey] || DEFAULT_REPORT_PROMPTS[currentPromptKey] || '',
    [prompts, currentPromptKey],
  );

  const setCurrentPrompt = (nextPrompt: string) => {
    setPrompts((previous) => ({ ...previous, [currentPromptKey]: nextPrompt }));
  };

  const savePrompt = async () => {
    const prompt = currentPrompt.trim();
    if (!prompt) {
      toast.error('提示词不能为空');
      return;
    }
    setSavingPrompt(true);
    try {
      await api.settings.set(`${REPORT_PROMPT_SETTING_PREFIX}${currentPromptKey}`, prompt);
      setCurrentPrompt(prompt);
      toast.success(`${currentOutputName}提示词已保存`);
    } catch {
      toast.error('提示词保存失败');
    } finally {
      setSavingPrompt(false);
    }
  };

  const restoreDefaultPrompt = async () => {
    const defaultPrompt = DEFAULT_REPORT_PROMPTS[currentPromptKey];
    setCurrentPrompt(defaultPrompt);
    setSavingPrompt(true);
    try {
      await api.settings.set(`${REPORT_PROMPT_SETTING_PREFIX}${currentPromptKey}`, defaultPrompt);
      toast.success(`已恢复${currentOutputName}默认提示词`);
    } catch {
      toast.error('恢复默认失败');
    } finally {
      setSavingPrompt(false);
    }
  };

  /** v2.2: 选择日期后预加载素材统计 */
  const previewMaterials = async (s: string, e: string) => {
    setMaterialPreview((prev) => ({ ...prev, loading: true }));
    try {
      const [visionData, recordData] = await Promise.all([
        api.vision.listByDate({ start: s, end: e, limit: 500 }),
        api.records.list({ start: s, end: e, limit: 500 }),
      ]);
      setMaterialPreview({
        visionCount: visionData.length,
        recordCount: recordData.length,
        loaded: true,
        loading: false,
      });
    } catch {
      setMaterialPreview({ visionCount: 0, recordCount: 0, loaded: false, loading: false });
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const report = await api.reports.generate({
        report_type: reportType,
        template,
        start_date: startDate,
        end_date: endDate,
        custom_prompt: currentPrompt,
      });
      setContent(report.content);
      setEditedContent(report.content);
      setReportId(report.id);
      setEditMode(false);
      toast.success('报告已生成');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '未知错误';
      toast.error(`报告生成失败: ${msg}`);
    }
    setGenerating(false);
  };

  const startEdit = () => {
    setEditedContent(content);
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditedContent(content);
    setEditMode(false);
  };

  const saveEdit = async () => {
    const nextContent = editedContent.trim();
    if (!nextContent) {
      toast.error('报告内容不能为空');
      return;
    }
    if (!reportId) {
      toast.error('没有可保存的报告记录');
      return;
    }

    setSavingEdit(true);
    try {
      const updated = await api.reports.update(reportId, editedContent);
      setContent(updated.content);
      setEditedContent(updated.content);
      setEditMode(false);
      toast.success('修改已保存');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '保存失败';
      toast.error(`保存失败: ${msg}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const copyContent = () => {
    navigator.clipboard.writeText(editMode ? editedContent : content);
    toast.success('已复制到剪贴板');
  };

  const exportMd = () => {
    const data = editMode ? editedContent : content;
    const blob = new Blob([data], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${reportType}-${startDate}.md`;
    a.click();
    toast.success('Markdown 已导出');
  };

  const exportJson = () => {
    const blob = new Blob(
      [JSON.stringify({ reportType, template, startDate, endDate, content: editMode ? editedContent : content }, null, 2)],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${reportType}-${startDate}.json`;
    a.click();
    toast.success('JSON 已导出');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Section 1: 报告周期 */}
      <Card className="p-5">
        <Card.Header>
          <Card.Title>报告周期</Card.Title>
        </Card.Header>
        <Card.Content>
          <div className="flex gap-3">
            {REPORT_TYPES.map((t) => (
              <Button
                key={t}
                variant={reportType === t ? 'success' : 'secondary'}
                size="sm"
                onClick={() => setReportType(t)}
              >
                {t}
              </Button>
            ))}
          </div>
        </Card.Content>
      </Card>

      {/* Section 2: 模板选择 */}
      <Card className="p-5">
        <Card.Header>
          <Card.Title>选择报告用途</Card.Title>
        </Card.Header>
        <Card.Content>
          <div className="grid grid-cols-2 gap-2">
            {REPORT_TEMPLATES.map((t) => (
              <button
                key={t}
                onClick={() => setTemplate(t)}
                className={`px-4 py-3 rounded-lg text-sm border text-left transition-colors ${
                  template === t
                    ? 'bg-brand-50 border-brand-400 text-brand-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <span className="font-medium">{t}</span>
                <span className="block text-xs text-gray-400 mt-0.5">
                  {t === '工作日报' && '排除娱乐、空闲、低置信内容'}
                  {t === '全天回顾' && '包含工作、休息、娱乐的客观复盘'}
                </span>
              </button>
            ))}
          </div>
        </Card.Content>
      </Card>

       {/* Section 3: 当前生成方案的提示词 */}
      <Card className="p-5">
        <Card.Header>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Card.Title className="flex items-center gap-2"><SlidersHorizontal size={17} /> 编辑{currentOutputName}提示词</Card.Title>
              <p className="text-xs text-gray-400 mt-1">每个复盘方案各自保存。可调整结构、重点和语气；素材范围与事实校验仍会保留。</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" size="sm" icon={RotateCcw} disabled={savingPrompt || !promptsLoaded} onClick={restoreDefaultPrompt}>
                恢复默认
              </Button>
              <Button variant="success" size="sm" icon={Save} loading={savingPrompt} disabled={!promptsLoaded} onClick={savePrompt}>
                保存提示词
              </Button>
            </div>
          </div>
        </Card.Header>
        <Card.Content>
          <textarea
            value={currentPrompt}
            disabled={!promptsLoaded}
            onChange={(event) => setCurrentPrompt(event.target.value)}
            maxLength={6000}
            className="w-full min-h-[220px] px-3 py-2 border border-gray-300 rounded-lg text-sm leading-6 resize-y disabled:bg-gray-50 disabled:text-gray-400"
            aria-label={`${currentOutputName}提示词`}
          />
          <p className="mt-2 text-xs text-gray-400">未保存的修改也会用于本次生成；保存后会作为此复盘方案的默认提示词。</p>
        </Card.Content>
      </Card>

      {/* Section 4: 日期范围 */}
      <Card className="p-5">
        <Card.Header>
          <Card.Title>日期范围</Card.Title>
        </Card.Header>
        <Card.Content>
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChange={(s, e) => {
              setStartDate(s);
              setEndDate(e);
              previewMaterials(s, e);
            }}
          />
        </Card.Content>
      </Card>

      {/* Section 5: 素材预览 */}
      <Card className="p-5">
        <Card.Header>
          <Card.Title>素材预览</Card.Title>
        </Card.Header>
        <Card.Content>
          {materialPreview.loading ? (
            <div className="space-y-2">
              <Skeleton variant="text" className="w-64" />
              <Skeleton variant="text" className="w-48" />
            </div>
          ) : materialPreview.loaded ? (
            <>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Brain size={18} className="text-brand-600" />
                  <span className="text-sm text-gray-700">
                    AI 识别 <strong className="text-brand-700">{materialPreview.visionCount}</strong> 条
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Monitor size={18} className="text-amber-500" />
                  <span className="text-sm text-gray-700">
                    窗口追踪 <strong className="text-amber-700">{materialPreview.recordCount}</strong> 条
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                工作日报会优先使用高置信工作内容；全天回顾会保留工作、休息和娱乐等全天活动
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400">选择日期范围后将自动加载素材统计</p>
          )}
        </Card.Content>
      </Card>

      {/* Section 6: 生成按钮 */}
      <div className="text-center">
        <Button
          variant="primary"
          size="lg"
          loading={generating}
          onClick={handleGenerate}
        >
          {generating ? 'AI 生成中...' : 'AI 生成报告'}
        </Button>
      </div>

      {/* Loading state while generating */}
      {generating && (
        <div className="space-y-3">
          <Skeleton variant="card" className="h-32" />
          <Skeleton.List count={8} />
        </div>
      )}

      {/* Section 7: 生成结果 */}
      {content && !generating && (
        <Card>
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50 rounded-t-xl">
            <div>
              <span className="text-sm font-medium text-gray-700">{reportType}</span>
              <span className="text-xs text-gray-400 mx-2">·</span>
              <span className="text-sm text-gray-600">{template}</span>
              <span className="text-xs text-gray-400 mx-2">·</span>
              <span className="text-xs text-gray-400">{startDate} ~ {endDate}</span>
            </div>
            <div className="flex gap-2">
              {editMode ? (
                <>
                  <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={savingEdit}>
                    取消
                  </Button>
                  <Button variant="success" size="sm" icon={Save} loading={savingEdit} onClick={saveEdit}>
                    保存
                  </Button>
                </>
              ) : (
                <Button variant="secondary" size="sm" onClick={startEdit}>
                  编辑
                </Button>
              )}
              <Button variant="secondary" size="sm" icon={Copy} onClick={copyContent}>
                复制
              </Button>
              <Button variant="secondary" size="sm" icon={Download} onClick={exportMd}>
                MD
              </Button>
              <Button variant="secondary" size="sm" icon={FileJson} onClick={exportJson}>
                JSON
              </Button>
            </div>
          </div>
          <div className="p-6">
            {editMode ? (
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full min-h-[300px] px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono resize-y"
              />
            ) : (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

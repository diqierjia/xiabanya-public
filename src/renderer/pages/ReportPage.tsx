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
import { type UiLanguage, useTranslation } from '../i18n';

type ReportType = '日报' | '周报' | '月报';

const REPORT_PROMPT_SETTING_PREFIX = 'report_custom_prompt:';

const REPORT_TYPES: readonly ReportType[] = ['日报', '周报', '月报'];

function promptKey(template: string, reportType: ReportType): string {
  return `${template}:${reportType}`;
}

function reportTypeLabel(reportType: ReportType, language: UiLanguage): string {
  if (language === 'zh-CN') return reportType;
  return { 日报: 'Daily', 周报: 'Weekly', 月报: 'Monthly' }[reportType];
}

function templateLabel(template: string, language: UiLanguage): string {
  if (language === 'zh-CN') return template;
  return template === '工作日报' ? 'Work Report' : 'Full-day Review';
}

function outputName(template: string, reportType: ReportType, language: UiLanguage): string {
  if (language === 'en-US') {
    const period = reportTypeLabel(reportType, language).toLowerCase();
    return template === '工作日报' ? `Work ${period} report` : `Full ${period} review`;
  }
  if (template === '工作日报') return `工作${reportType}`;
  if (reportType === '日报') return '全天回顾';
  return `全${reportType === '周报' ? '周' : '月'}回顾`;
}

const DEFAULT_REPORT_PROMPTS_ZH: Record<string, string> = {
  [promptKey('工作日报', '日报')]: `请写一份让不了解上下文的人也能一眼看懂的工作日报，可直接编辑提交。

写法：
- 按 2–5 个实际工作主题归纳；每个主题用 1–2 条完整句子说明“做了什么”和“当前进展”。
- 只保留对日报有用的信息：项目、具体动作、明确结果或当前阻塞。相似的截图记录合并，不按截图或时间逐条复述。
- “查看、讨论、规划、正在运行、出现报错”只能写成对应的过程或状态，不能改写成已完成。
- 不要出现 AI 评审分数、改动行数、工具/窗口名称、截图描述、原始英文短语、括号里的观察备注或 etc.，也不要猜测这些活动之间的关系。
- 不使用空泛的“推进、优化、赋能、闭环、协同”等词；用具体动作替代。没有足够信息就简短写“正在确认中”。

固定结构：
## 今日完成或推进
- 主题：做了什么；结果或当前状态。
## 进行中或待确认
- 只列确实尚未完成、被阻塞或需要补充的信息；没有则写“无”。

不要额外写摘要、素材说明、数据统计或重复的“可写入日报”段落。`,
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

const DEFAULT_REPORT_PROMPTS_EN: Record<string, string> = {
  [promptKey('工作日报', '日报')]: `Write a daily work report that someone without the original context can understand at a glance and edit for submission.

Writing rules:
- Group the work into 2–5 real topics. For each topic, use one or two complete sentences that say what was done and its current status.
- Keep only report-worthy details: project, concrete action, confirmed result, or current blocker. Merge repeated screenshots; do not retell them one by one or in time order.
- Treat “viewing,” “discussing,” “planning,” “running,” and errors as process or status, never as completed work.
- Do not include AI review scores, line-change counts, tool or window names, screenshot descriptions, raw Chinese or English fragments, parenthetical observation notes, or “etc.” Do not guess relationships between activities.
- Avoid vague business language such as “drive,” “optimize,” “enable,” or “synergize.” Use concrete actions instead. If the evidence is insufficient, say “In progress; details to confirm.”

Use exactly this structure:
## Completed or Advanced Today
- Topic: what was done; result or current status.
## In Progress or Needs Confirmation
- Include only genuinely unfinished, blocked, or missing details. Write "None" if there are none.

Do not add an executive summary, source/material notes, statistics, or a repeated “reportable progress” section.`,
  [promptKey('工作日报', '周报')]: `Write a clear, concise weekly work report that can be edited and submitted directly.

Suggested structure:
## This Week's Work
Group confirmed work from this week by topic.
## Progress
Summarize progress clearly supported by the material without overstating completion.
## Needs Confirmation and Next Week's Focus
List anything I need to add, confirm, or continue following up on. Write "None" if there is nothing.`,
  [promptKey('工作日报', '月报')]: `Write a clear, concise monthly work report that can be edited and submitted directly.

Suggested structure:
## This Month's Work
Group confirmed work from this month by topic.
## Progress
Summarize progress clearly supported by the material without overstating completion.
## Needs Confirmation and Next Month's Focus
List anything I need to add, confirm, or continue following up on. Write "None" if there is nothing.`,
  [promptKey('全天回顾', '日报')]: `Review the day's activities objectively and without excessive judgment.

Suggested structure:
## Day Overview
Summarize the day in 2–4 sentences.
## Activity Timeline
Summarize the main activities and switches in chronological order.
## Work and Life Distribution
Briefly describe work, personal or leisure, idle, and uncertain activity.`,
  [promptKey('全天回顾', '周报')]: `Review the week's activities objectively and without excessive judgment.

Suggested structure:
## Week Overview
Summarize the week's activity pattern in 2–4 sentences.
## Main Activities and Changes
Summarize main activities and switches by time or topic.
## Work and Life Distribution
Briefly describe work, personal or leisure, idle, and uncertain activity.`,
  [promptKey('全天回顾', '月报')]: `Review the month's activities objectively and without excessive judgment.

Suggested structure:
## Month Overview
Summarize the month's activity pattern in 2–4 sentences.
## Main Activities and Changes
Summarize main activities and switches by time or topic.
## Work and Life Distribution
Briefly describe work, personal or leisure, idle, and uncertain activity.`,
};

export function ReportPage() {
  const api = useXiabanyaApi();
  const { language, isEnglish } = useTranslation();
  const defaultPrompts = language === 'en-US' ? DEFAULT_REPORT_PROMPTS_EN : DEFAULT_REPORT_PROMPTS_ZH;
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
  const [prompts, setPrompts] = useState<Record<string, string>>({ ...defaultPrompts });
  const [promptsLoaded, setPromptsLoaded] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const currentPromptKey = promptKey(template, reportType);
  const currentOutputName = outputName(template, reportType, language);

  useEffect(() => {
    setPrompts((previous) => Object.fromEntries(Object.entries(previous).map(([key, prompt]) => [
      key,
      prompt === DEFAULT_REPORT_PROMPTS_ZH[key] || prompt === DEFAULT_REPORT_PROMPTS_EN[key]
        ? defaultPrompts[key]
        : prompt,
    ])));
  }, [defaultPrompts]);

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
      return [key, saved.trim() || legacy.trim() || defaultPrompts[key]] as const;
    })).then((entries) => {
      if (!active) return;
      setPrompts(Object.fromEntries(entries));
      setPromptsLoaded(true);
    }).catch(() => {
      if (active) setPromptsLoaded(true);
    });
    return () => { active = false; };
  }, [api, defaultPrompts]);

  const currentPrompt = useMemo(
    () => prompts[currentPromptKey] || defaultPrompts[currentPromptKey] || '',
    [prompts, currentPromptKey, defaultPrompts],
  );

  const setCurrentPrompt = (nextPrompt: string) => {
    setPrompts((previous) => ({ ...previous, [currentPromptKey]: nextPrompt }));
  };

  const savePrompt = async () => {
    const prompt = currentPrompt.trim();
    if (!prompt) {
      toast.error(isEnglish ? 'Prompt cannot be empty' : '提示词不能为空');
      return;
    }
    setSavingPrompt(true);
    try {
      await api.settings.set(`${REPORT_PROMPT_SETTING_PREFIX}${currentPromptKey}`, prompt);
      setCurrentPrompt(prompt);
      toast.success(isEnglish ? `${currentOutputName} prompt saved` : `${currentOutputName}提示词已保存`);
    } catch {
      toast.error(isEnglish ? 'Could not save prompt' : '提示词保存失败');
    } finally {
      setSavingPrompt(false);
    }
  };

  const restoreDefaultPrompt = async () => {
    const defaultPrompt = defaultPrompts[currentPromptKey];
    setCurrentPrompt(defaultPrompt);
    setSavingPrompt(true);
    try {
      await api.settings.set(`${REPORT_PROMPT_SETTING_PREFIX}${currentPromptKey}`, defaultPrompt);
      toast.success(isEnglish ? `${currentOutputName} prompt restored` : `已恢复${currentOutputName}默认提示词`);
    } catch {
      toast.error(isEnglish ? 'Could not restore default' : '恢复默认失败');
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
      toast.success(isEnglish ? 'Report generated' : '报告已生成');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : (isEnglish ? 'Unknown error' : '未知错误');
      toast.error(isEnglish ? `Could not generate report: ${msg}` : `报告生成失败: ${msg}`);
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
      toast.error(isEnglish ? 'Report content cannot be empty' : '报告内容不能为空');
      return;
    }
    if (!reportId) {
      toast.error(isEnglish ? 'There is no report to save' : '没有可保存的报告记录');
      return;
    }

    setSavingEdit(true);
    try {
      const updated = await api.reports.update(reportId, editedContent);
      setContent(updated.content);
      setEditedContent(updated.content);
      setEditMode(false);
      toast.success(isEnglish ? 'Changes saved' : '修改已保存');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : (isEnglish ? 'Could not save' : '保存失败');
      toast.error(isEnglish ? `Could not save: ${msg}` : `保存失败: ${msg}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const copyContent = () => {
    navigator.clipboard.writeText(editMode ? editedContent : content);
    toast.success(isEnglish ? 'Copied to clipboard' : '已复制到剪贴板');
  };

  const exportMd = () => {
    const data = editMode ? editedContent : content;
    const blob = new Blob([data], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${reportTypeLabel(reportType, language)}-${startDate}.md`;
    a.click();
    toast.success(isEnglish ? 'Markdown exported' : 'Markdown 已导出');
  };

  const exportJson = () => {
    const blob = new Blob(
      [JSON.stringify({ reportType, template, startDate, endDate, content: editMode ? editedContent : content }, null, 2)],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${reportTypeLabel(reportType, language)}-${startDate}.json`;
    a.click();
    toast.success(isEnglish ? 'JSON exported' : 'JSON 已导出');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Section 1: 报告周期 */}
      <Card className="p-5">
        <Card.Header>
          <Card.Title>{isEnglish ? 'Report period' : '报告周期'}</Card.Title>
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
                {reportTypeLabel(t, language)}
              </Button>
            ))}
          </div>
        </Card.Content>
      </Card>

      {/* Section 2: 模板选择 */}
      <Card className="p-5">
        <Card.Header>
          <Card.Title>{isEnglish ? 'Choose report purpose' : '选择报告用途'}</Card.Title>
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
                <span className="font-medium">{templateLabel(t, language)}</span>
                <span className="block text-xs text-gray-400 mt-0.5">
                  {t === '工作日报' && (isEnglish ? 'Excludes leisure, idle, and low-confidence content' : '排除娱乐、空闲、低置信内容')}
                  {t === '全天回顾' && (isEnglish ? 'An objective review of work, rest, and leisure' : '包含工作、休息、娱乐的客观复盘')}
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
              <Card.Title className="flex items-center gap-2"><SlidersHorizontal size={17} /> {isEnglish ? `Edit ${currentOutputName} prompt` : `编辑${currentOutputName}提示词`}</Card.Title>
              <p className="text-xs text-gray-400 mt-1">{isEnglish ? 'Each review option saves its own prompt. You can adjust structure, focus, and tone; the material scope and fact checks remain in place.' : '每个复盘方案各自保存。可调整结构、重点和语气；素材范围与事实校验仍会保留。'}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" size="sm" icon={RotateCcw} disabled={savingPrompt || !promptsLoaded} onClick={restoreDefaultPrompt}>
                {isEnglish ? 'Restore default' : '恢复默认'}
              </Button>
              <Button variant="success" size="sm" icon={Save} loading={savingPrompt} disabled={!promptsLoaded} onClick={savePrompt}>
                {isEnglish ? 'Save prompt' : '保存提示词'}
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
            aria-label={isEnglish ? `${currentOutputName} prompt` : `${currentOutputName}提示词`}
          />
          <p className="mt-2 text-xs text-gray-400">{isEnglish ? 'Unsaved edits will still be used for this generation. Once saved, they become the default prompt for this review option.' : '未保存的修改也会用于本次生成；保存后会作为此复盘方案的默认提示词。'}</p>
        </Card.Content>
      </Card>

      {/* Section 4: 日期范围 */}
      <Card className="p-5">
        <Card.Header>
          <Card.Title>{isEnglish ? 'Date range' : '日期范围'}</Card.Title>
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
          <Card.Title>{isEnglish ? 'Material preview' : '素材预览'}</Card.Title>
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
                    {isEnglish ? <>AI recognitions <strong className="text-brand-700">{materialPreview.visionCount}</strong></> : <>AI 识别 <strong className="text-brand-700">{materialPreview.visionCount}</strong> 条</>}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Monitor size={18} className="text-amber-500" />
                  <span className="text-sm text-gray-700">
                    {isEnglish ? <>Window tracking <strong className="text-amber-700">{materialPreview.recordCount}</strong></> : <>窗口追踪 <strong className="text-amber-700">{materialPreview.recordCount}</strong> 条</>}
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                {isEnglish ? 'Work reports prioritize high-confidence work content; full-day reviews retain work, rest, leisure, and other daily activity.' : '工作日报会优先使用高置信工作内容；全天回顾会保留工作、休息和娱乐等全天活动'}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400">{isEnglish ? 'Material statistics load automatically after you select a date range' : '选择日期范围后将自动加载素材统计'}</p>
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
          {generating ? (isEnglish ? 'Generating with AI...' : 'AI 生成中...') : (isEnglish ? 'Generate report with AI' : 'AI 生成报告')}
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
              <span className="text-sm font-medium text-gray-700">{reportTypeLabel(reportType, language)}</span>
              <span className="text-xs text-gray-400 mx-2">·</span>
              <span className="text-sm text-gray-600">{templateLabel(template, language)}</span>
              <span className="text-xs text-gray-400 mx-2">·</span>
              <span className="text-xs text-gray-400">{startDate} ~ {endDate}</span>
            </div>
            <div className="flex gap-2">
              {editMode ? (
                <>
                  <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={savingEdit}>
                    {isEnglish ? 'Cancel' : '取消'}
                  </Button>
                  <Button variant="success" size="sm" icon={Save} loading={savingEdit} onClick={saveEdit}>
                    {isEnglish ? 'Save' : '保存'}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" size="sm" onClick={startEdit}>
                  {isEnglish ? 'Edit' : '编辑'}
                </Button>
              )}
              <Button variant="secondary" size="sm" icon={Copy} onClick={copyContent}>
                {isEnglish ? 'Copy' : '复制'}
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

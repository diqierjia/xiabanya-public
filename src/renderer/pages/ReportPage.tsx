import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Download, FileJson, Brain, Monitor } from 'lucide-react';
import { DateRangePicker } from '../components/DateRangePicker';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { Card } from '../components/ui/Card';
import { toast } from '../components/ui/Toast';
import { REPORT_TEMPLATES, today as todayFn } from '../lib/constants';
import { useXiabanyaApi } from '../hooks/useXiabanyaApi';

type ReportType = '日报' | '周报' | '月报';

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

  // v2.2: 素材预览
  const [materialPreview, setMaterialPreview] = useState<{
    visionCount: number;
    recordCount: number;
    loaded: boolean;
    loading: boolean;
  }>({ visionCount: 0, recordCount: 0, loaded: false, loading: false });

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
      });
      setContent(report.content);
      setEditedContent(report.content);
      setReportId(report.id);
      toast.success('报告已生成');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '未知错误';
      toast.error(`报告生成失败: ${msg}`);
    }
    setGenerating(false);
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
            {(['日报', '周报', '月报'] as ReportType[]).map((t) => (
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

      {/* Section 3: 日期范围 */}
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

      {/* Section 4: 素材预览 */}
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

      {/* Section 5: 生成按钮 */}
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

      {/* Section 6: 生成结果 */}
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
              <Button variant="secondary" size="sm" onClick={() => { setEditMode(!editMode); setEditedContent(content); }}>
                {editMode ? '预览' : '编辑'}
              </Button>
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

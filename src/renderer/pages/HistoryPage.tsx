import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Download, ChevronDown, ChevronUp, Search, History } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { toast } from '../components/ui/Toast';
import { useReportsStore } from '../stores/useReportsStore';
import { useAppStore } from '../stores/useAppStore';
import { formatUtcStorageDateTimeLocal } from '../../shared/time';

export function HistoryPage() {
  const { reports, loading, fetchReports, deleteReport } = useReportsStore();
  const { setPage } = useAppStore();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('全部');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchReports({
      q: search || undefined,
      report_type: typeFilter !== '全部' ? (typeFilter as '日报' | '周报' | '月报') : undefined,
    });
  }, [typeFilter, search]);

  const copyContent = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success('已复制到剪贴板');
  };

  const exportMd = (report: typeof reports[0]) => {
    const blob = new Blob([report.content], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${report.report_type}-${report.start_date}.md`;
    a.click();
    toast.success('Markdown 已导出');
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteReport(id);
      toast.success('报告已删除');
    } catch {
      toast.error('删除失败');
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索报告..."
            className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div className="flex gap-1">
          {['全部', '日报', '周报', '月报'].map((t) => (
            <Button
              key={t}
              variant={typeFilter === t ? 'success' : 'secondary'}
              size="sm"
              onClick={() => setTypeFilter(t)}
            >
              {t}
            </Button>
          ))}
        </div>
      </div>

      {/* Content States */}
      {loading ? (
        <Skeleton.List count={5} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={History}
          title="还没有生成过报告"
          description="去生成你的第一份工作日报吧"
          actionLabel="去生成"
          onAction={() => setPage('review')}
        />
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Card key={r.id}>
              <div
                className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-gray-50 rounded-t-xl"
                onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700">{r.report_type}</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-sm text-gray-600">{r.template}</span>
                  <span className="text-xs text-gray-400">
                    {r.start_date} ~ {r.end_date}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{formatUtcStorageDateTimeLocal(r.created_at)}</span>
                  {expandedId === r.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </div>

              {expandedId === r.id && (
                <div className="border-t border-gray-100">
                  <div className="flex items-center gap-2 px-5 py-2 bg-gray-50 border-b border-gray-100">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Copy}
                      onClick={(e) => {
                        e.stopPropagation();
                        copyContent(r.content);
                      }}
                    >
                      复制
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Download}
                      onClick={(e) => {
                        e.stopPropagation();
                        exportMd(r);
                      }}
                    >
                      导出 MD
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(r.id);
                      }}
                      className="ml-auto"
                    >
                      删除
                    </Button>
                  </div>
                  <div className="p-6 prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.content}</ReactMarkdown>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

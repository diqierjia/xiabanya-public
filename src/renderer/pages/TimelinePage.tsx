import { useEffect, useState } from 'react';
import { Trash2, Clock, AlertCircle, Search, Eye } from 'lucide-react';
import { DateRangePicker } from '../components/DateRangePicker';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { toast } from '../components/ui/Toast';
import { CATEGORIES, today } from '../lib/constants';
import { dur, truncate } from '../lib/utils';
import { useXiabanyaApi } from '../hooks/useXiabanyaApi';
import type { VisionResultWithDuration } from '../../shared/types';
import { formatUtcStorageTime } from '../../shared/time';

export function TimelinePage() {
  const api = useXiabanyaApi();
  const [results, setResults] = useState<VisionResultWithDuration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    fetchResults();
  }, [startDate, endDate, search]);

  const fetchResults = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await api.vision.listByDate({
        start: startDate,
        end: endDate,
        q: search || undefined,
        limit: 500,
      });
      setResults(data);
    } catch (e: unknown) {
      setError(true);
      const msg = e instanceof Error ? e.message : '加载失败';
      toast.error(`加载时间线失败: ${msg}`);
    }
    setLoading(false);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const batchDelete = async () => {
    try {
      for (const id of selected) {
        await api.vision.deleteResult(id);
      }
      toast.success(`已删除 ${selected.size} 条 Vision 结果`);
      setSelected(new Set());
      setShowDelete(false);
      fetchResults();
    } catch {
      toast.error('删除失败');
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-4 flex-wrap">
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={(s, e) => {
            setStartDate(s);
            setEndDate(e);
          }}
        />
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题/摘要/分类..."
            className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm w-56"
          />
        </div>
      </div>

      {/* Batch Actions */}
      {selected.size > 0 && (
        <div className="bg-brand-50 border border-brand-200 rounded-lg px-4 py-2 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-brand-700">已选 {selected.size} 条</span>
          <Button
            variant="danger"
            size="sm"
            icon={Trash2}
            onClick={() => setShowDelete(true)}
            className="ml-auto"
          >
            删除
          </Button>
        </div>
      )}

      {/* Content States */}
      {loading ? (
        <Card className="p-5">
          <Skeleton.List count={8} />
        </Card>
      ) : error ? (
        <EmptyState
          icon={AlertCircle}
          title="加载失败"
          description="请检查后重试"
          actionLabel="重试"
          onAction={fetchResults}
        />
      ) : results.length === 0 ? (
        <EmptyState
          icon={Eye}
          title="所选日期范围内无 AI 识别结果"
          description="尝试调整日期范围或确认 Vision Auto 正在运行"
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2 text-left">时间</th>
                  <th className="px-3 py-2 text-left">分类</th>
                  <th className="px-3 py-2 text-left">标题</th>
                  <th className="px-3 py-2 text-left">摘要</th>
                  <th className="px-3 py-2 text-left">时长</th>
                  <th className="px-3 py-2 text-left">模型</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-gray-100 hover:bg-gray-50 hover:border-l-2 hover:border-l-brand-400 transition-colors"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs whitespace-nowrap">
                      {r.created_at
                        ? formatUtcStorageTime(r.created_at, true)
                        : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <Badge category={r.category} />
                    </td>
                    <td className="px-3 py-2 text-gray-800 truncate max-w-[200px]">
                      {r.title}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs max-w-[250px] truncate">
                      {truncate(r.summary || '', 60)}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {r.approx_duration_sec > 0 ? dur(r.approx_duration_sec) : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-xs">
                      {r.model?.split('/').pop() || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={showDelete}
        title="删除 Vision 结果"
        message={`确认删除 ${selected.size} 条 AI 识别结果？此操作不可撤销。`}
        onConfirm={batchDelete}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}

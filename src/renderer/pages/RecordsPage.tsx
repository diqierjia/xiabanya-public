import { useEffect, useState, useMemo, useCallback } from 'react';
import { Search, Calendar, ClipboardList, AlertCircle, X } from 'lucide-react';
import { useXiabanyaApi } from '../hooks/useXiabanyaApi';
import { today } from '../lib/utils';
import VisionResultCard from '../components/VisionResultCard';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import type { VisionResultWithDuration } from '../lib/types';
import { useTranslation } from '../i18n';

/**
 * RecordsPage — AI 识别记录独立页面
 *
 * 功能：
 * - 日期筛选（单天选择器，默认当天）
 * - 加载所选日期的 vision_results
 * - 按标题/应用名模糊搜索
 * - VisionResultCard 列表渲染
 * - 空状态提示
 */
export function RecordsPage() {
  const { isEnglish, t } = useTranslation();
  const api = useXiabanyaApi();
  const [selectedDate, setSelectedDate] = useState<string>(today());
  const [results, setResults] = useState<VisionResultWithDuration[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  /** 加载所选日期的 vision_results */
  const fetchResults = useCallback(async (date: string) => {
    setLoading(true);
    setError(false);
    try {
      const data = await api.vision.listByDate({
        start: date,
        end: date,
        limit: 500,
      });
      setResults(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchResults(selectedDate);
  }, [fetchResults, selectedDate]);

  /** 按标题/应用名/窗口标题模糊搜索 */
  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return results;
    const q = searchQuery.toLowerCase().trim();
    return results.filter((r) => {
      const title = (r.title || '').toLowerCase();
      const app = (r.app || '').toLowerCase();
      const windowTitle = (r.window_title || '').toLowerCase();
      const fact = (r.observed_fact || r.summary || '').toLowerCase();
      return (
        title.includes(q)
        || app.includes(q)
        || windowTitle.includes(q)
        || fact.includes(q)
      );
    });
  }, [results, searchQuery]);

  /** 清除搜索 */
  const clearSearch = () => setSearchQuery('');

  return (
    <div className="space-y-4">
      {/* Header: 日期选择器 + 搜索 */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* 日期选择器 */}
        <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2">
          <Calendar size={16} className="text-gray-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-sm text-gray-700 bg-transparent outline-none border-none focus:ring-0"
          />
        </div>

        {/* 搜索框 */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder={t('searchTitleApp')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-8"
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* 结果计数 */}
        <span className="text-xs text-gray-400">
          {filteredResults.length} {isEnglish ? 'records' : '条记录'}
        </span>
      </div>

      {/* 加载态 */}
      {loading && (
        <div className="space-y-3">
          <Skeleton.List count={5} />
        </div>
      )}

      {/* 错误态 */}
      {!loading && error && (
        <EmptyState
          icon={AlertCircle}
          title={t('loadingFailed')}
          description={t('checkNetwork')}
          actionLabel={t('retry')}
          onAction={() => fetchResults(selectedDate)}
        />
      )}

      {/* 空态 */}
      {!loading && !error && results.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title={t('noAiRecords')}
          description={isEnglish ? `No AI screenshot recognition records on ${selectedDate}` : `${selectedDate} 没有 AI 截屏识别记录`}
        />
      )}

      {/* 搜索无结果 */}
      {!loading && !error && results.length > 0 && filteredResults.length === 0 && (
        <EmptyState
          icon={Search}
          title={t('noMatchingRecords')}
          description={isEnglish ? `No AI recognition records related to “${searchQuery}”` : `未找到与 "${searchQuery}" 相关的 AI 识别记录`}
          actionLabel={t('clearSearch')}
          onAction={clearSearch}
        />
      )}

      {/* VisionResultCard 列表 */}
      {!loading && !error && filteredResults.length > 0 && (
        <div className="space-y-2">
          {filteredResults.map((result) => (
            <VisionResultCard
              key={result.id}
              result={result}
              variant="full"
            />
          ))}
        </div>
      )}
    </div>
  );
}

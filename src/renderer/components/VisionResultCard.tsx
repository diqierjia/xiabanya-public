import { useState } from 'react';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { Badge } from './ui/Badge';
import { dur } from '../lib/utils';
import type { VisionResultWithDuration } from '../../shared/types';
import { formatUtcStorageDateTimeLocal, formatUtcStorageTime, parseUtcStorageDateTime } from '../../shared/time';
import { useTranslation } from '../i18n';

interface VisionResultCardProps {
  result: VisionResultWithDuration;
  /** 展示模式：full=完整展示, compact=紧凑行 */
  variant?: 'full' | 'compact';
  /** 外部控制展开状态（用于列表级状态管理，防止刷新丢失） */
  expanded?: boolean;
  onToggle?: (id: string) => void;
}

/** 计算相对时间文案（如 "3 分钟前"） */
function relativeTime(createdAt: string, isEnglish: boolean): string {
  const now = Date.now();
  const then = parseUtcStorageDateTime(createdAt)?.getTime();
  if (then === undefined) return createdAt.substring(5, 16);
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return isEnglish ? 'Just now' : '刚刚';
  if (diffSec < 3600) return isEnglish ? `${Math.floor(diffSec / 60)} min ago` : `${Math.floor(diffSec / 60)} 分钟前`;
  if (diffSec < 86400) return isEnglish ? `${Math.floor(diffSec / 3600)} hr ago` : `${Math.floor(diffSec / 3600)} 小时前`;
  return createdAt.substring(5, 16);
}

/**
 * AI 识别结果卡片 — 可复用于 TodayPage 列表 & TimelinePage 表格
 */
export default function VisionResultCard({ result, variant = 'full', expanded: extExpanded, onToggle }: VisionResultCardProps) {
  const { t, isEnglish, enumLabel, durationLabel } = useTranslation();
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = extExpanded ?? localExpanded;
  const toggle = () => {
    if (onToggle) {
      onToggle(result.id);
    } else {
      setLocalExpanded(!localExpanded);
    }
  };
  const timeStr = result.created_at
    ? formatUtcStorageTime(result.created_at)
    : '';
  const observedFact = result.observed_fact || result.summary || '';
  const possibleActivity = result.possible_activity || result.summary || '';

  if (variant === 'compact') {
    return (
      <div>
        <div
          className="bg-white rounded-lg p-3 border border-gray-100 flex items-center gap-3 hover:shadow-sm transition-shadow cursor-pointer"
          onClick={toggle}
        >
          <span className="text-xs text-gray-400 w-16 shrink-0">{timeStr}</span>
          <span className="flex-1 text-sm text-gray-800 truncate">{result.title}</span>
          <Badge category={result.category} />
          {result.approx_duration_sec > 0 && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock size={10} />
              {dur(result.approx_duration_sec)}
            </span>
          )}
          {expanded ? (
            <ChevronUp size={14} className="text-gray-400 shrink-0" />
          ) : (
            <ChevronDown size={14} className="text-gray-400 shrink-0" />
          )}
          </div>
        {expanded && (
          <div className="bg-gray-50 rounded-b-lg px-4 py-3 border border-gray-100 border-t-0 -mt-px">
            {observedFact && (
              <p className="text-xs text-gray-600 mb-1">{isEnglish ? 'Fact' : '事实'}: {observedFact}</p>
            )}
            {possibleActivity && (
              <p className="text-xs text-gray-500 mb-2">{isEnglish ? 'Inference' : '推断'}: {possibleActivity}</p>
            )}
            <div className="flex gap-4 text-xs text-gray-400 flex-wrap">
              <span>{t('application')}: {result.app || '-'}</span>
              <span>{t('confidence')}: {enumLabel(result.confidence || '-')}</span>
              <span>{t('activityType')}: {enumLabel(result.activity_type || '-')}</span>
              <span>{t('model')}: {result.model || '-'}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // full variant
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-400">{relativeTime(result.created_at, isEnglish)}</span>
            <Badge category={result.category} />
          </div>
          <h3 className="text-sm font-semibold text-gray-800 truncate">{result.title}</h3>
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{observedFact}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {result.approx_duration_sec > 0 && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock size={10} />
              {isEnglish ? 'About ' : '约 '}{isEnglish ? durationLabel(result.approx_duration_sec) : dur(result.approx_duration_sec)}
            </span>
          )}
          {result.app && result.app !== '截图' && (
            <span className="text-xs text-gray-400">{result.app}</span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="space-y-2 mb-3">
            <div>
              <p className="text-xs text-gray-400 mb-1">{t('observedFact')}</p>
              <p className="text-xs text-gray-700">{observedFact || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">{t('possibleActivity')}</p>
              <p className="text-xs text-gray-700">{possibleActivity || '-'}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-1">{t('rawAiResponse')}:</p>
          <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap">
            {result.raw_response}
          </pre>
          <div className="flex gap-4 mt-2 text-xs text-gray-400 flex-wrap">
            <span>{t('application')}: {result.app || '-'}</span>
            <span>{t('confidence')}: {enumLabel(result.confidence || '-')}</span>
            <span>{t('activityType')}: {enumLabel(result.activity_type || '-')}</span>
            <span>{t('model')}: {result.model || '-'}</span>
            <span>{t('time')}: {formatUtcStorageDateTimeLocal(result.created_at)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

import { useMemo, useRef } from 'react';
import { Clock } from 'lucide-react';
import { Card } from '../ui/Card';
import { TimeRuler } from './TimeRuler';
import { TimeTrack } from './TimeTrack';
import { DetailPanel } from './DetailPanel';
import type { TimeMapItem } from './ActivityBlock';
import { PX_PER_MINUTE, computeHours } from './timeMapUtils';
import { formatUtcStorageDateTime } from '../../../shared/time';

interface TimeMapProps {
  items: TimeMapItem[];
  /** 时间轴可见窗口起始 UTC 时间，默认当天 08:00 */
  visibleStartAt?: string;
  selectedId?: string | null;
  onSelect?: (item: TimeMapItem) => void;
  /** TodayPage 传 true，渲染当前时间红线 */
  showCurrentTime?: boolean;
  /** 是否显示右侧详情面板，默认 true */
  showDetailPanel?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

/** 默认 visibleStartAt：当天 08:00 UTC */
function defaultVisibleStartAt(): string {
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return formatUtcStorageDateTime(new Date(`${localDate}T08:00:00`));
}

/**
 * TimeMap 容器 —— iPad 日历日程视图。
 * 左侧 TimeRuler + 中间 TimeTrack + 右侧 DetailPanel。
 */
export function TimeMap({
  items,
  visibleStartAt,
  selectedId,
  onSelect,
  showCurrentTime = false,
  showDetailPanel = true,
  emptyTitle = '暂无时间线数据',
  emptyDescription = '开启 Vision Auto 后，活动会按时间和时长显示在这里。',
  className = '',
}: TimeMapProps) {
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const startAt = visibleStartAt || defaultVisibleStartAt();

  // 按 startAt 升序排列
  const sorted = useMemo(() => [...items].sort((a, b) => {
    const aTime = new Date(a.startAt.replace(' ', 'T') + 'Z').getTime() || 0;
    const bTime = new Date(b.startAt.replace(' ', 'T') + 'Z').getTime() || 0;
    return aTime - bTime;
  }), [items]);

  const selected = selectedId ? sorted.find((item) => item.id === selectedId) ?? null : null;

  // 计算小时标签列表
  const hours = useMemo(() => computeHours(startAt, sorted), [startAt, sorted]);

  if (items.length === 0) {
    return (
      <Card className={`p-8 ${className}`}>
        <div className="text-center max-w-sm mx-auto">
          <div className="w-12 h-12 rounded-xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
            <Clock size={24} />
          </div>
          <h3 className="text-sm font-semibold text-gray-800 mt-4">{emptyTitle}</h3>
          <p className="text-sm text-gray-500 mt-2 leading-6">{emptyDescription}</p>
        </div>
      </Card>
    );
  }

  const gridCols = showDetailPanel
    ? 'grid grid-cols-[64px_1fr_320px]'
    : 'grid grid-cols-[64px_1fr]';

  return (
    <div className={`${gridCols} ${className}`}>
      {/* left: hourly ruler */}
      <TimeRuler hours={hours} pxPerMinute={PX_PER_MINUTE} />

      {/* center: track with positioned blocks */}
      <div className="relative">
        <TimeTrack
          items={sorted}
          visibleStartAt={startAt}
          pxPerMinute={PX_PER_MINUTE}
          showCurrentTime={showCurrentTime}
          nowRef={scrollAnchorRef}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </div>

      {/* right: detail panel */}
      {showDetailPanel && <DetailPanel item={selected} />}
    </div>
  );
}

import type { ActivityType, Category, VisionConfidence, VisionSegmentMerge } from '../../../shared/types';
import { formatUtcStorageDateTime, formatUtcStorageTime, parseUtcStorageDateTime } from '../../../shared/time';
import { ACTIVITY_COLORS, getDurationLabel } from './timeMapUtils';

export interface TimeMapItem {
  id: string;
  kind?: 'activity' | 'idle' | 'gap';
  title: string;
  category: Category;
  startAt: string;
  durationSec: number;
  observedFact?: string;
  possibleActivity?: string;
  confidence?: VisionConfidence;
  activityType?: ActivityType;
  segmentMerge?: VisionSegmentMerge;
  app?: string;
  windowTitle?: string;
  evidenceItems?: TimeMapItem[];
}

interface ActivityBlockProps {
  item: TimeMapItem;
  /** 父组件 TimeTrack 计算的绝对定位（position/top/height/left/right） */
  style: React.CSSProperties;
  selected?: boolean;
  onSelect?: (item: TimeMapItem) => void;
}

/** 格式化结束时间 */
function formatEndTime(startAt: string, durationSec: number): string {
  const start = parseUtcStorageDateTime(startAt);
  if (!start || durationSec <= 0) return '';
  const end = new Date(start.getTime() + durationSec * 1000);
  return formatUtcStorageTime(formatUtcStorageDateTime(end));
}

/** 解析颜色键（idle 类型特殊处理） */
function resolveColorKey(item: TimeMapItem): string {
  if (item.kind === 'idle') return 'idle';
  if (item.activityType && item.activityType in ACTIVITY_COLORS) return item.activityType;
  return 'unclear';
}

/**
 * iPad 日历风格活动块。
 * 渲染内容按高度分三档：
 * - < 24px  → 左侧色条 + 极小时间标签
 * - 24-48px → 时间 + 标题（省略）
 * - ≥ 48px  → 完整信息（时间区间 + 标题 + activityType 标签）
 */
export function ActivityBlock({ item, style, selected = false, onSelect }: ActivityBlockProps) {
  const height = (style.height as number) || 0;
  const isIdle = item.kind === 'idle';
  const colorKey = resolveColorKey(item);
  const colors = ACTIVITY_COLORS[colorKey];

  const startTime = formatUtcStorageTime(item.startAt);
  const endTime = formatEndTime(item.startAt, item.durationSec);
  const durationLabel = getDurationLabel(item.durationSec);
  const tooltip = endTime
    ? `${startTime} - ${endTime} · ${durationLabel}`
    : `${startTime} · ${durationLabel}`;

  const showTiny = height < 24;
  const showCompact = height >= 24 && height < 48;
  const showFull = height >= 48;
  const showMid = showCompact || showFull;

  const blockStyle: React.CSSProperties = {
    position: 'absolute',
    left: 8,
    right: 8,
    borderRadius: 8,
    border: isIdle
      ? `1px dashed ${colors.border}`
      : `1px solid ${colors.border}`,
    backgroundColor: isIdle ? 'rgba(243,244,246,0.5)' : colors.bg,
    padding: showTiny ? 0 : '4px 8px',
    overflow: 'hidden',
    cursor: 'pointer',
    boxSizing: 'border-box',
    transition: 'box-shadow 0.15s',
    ...style,
  };

  const textColor = { color: colors.text };

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      className={`text-left ${selected ? 'ring-2 ring-blue-400' : ''}`}
      style={blockStyle}
      title={tooltip}
    >
      {/* 极小模式：仅色条 + 时间 */}
      {showTiny && (
        <div className="flex items-center h-full gap-1">
          <div
            className="h-full shrink-0 rounded-l"
            style={{ width: 4, backgroundColor: colors.border }}
          />
          <span className="text-[8px] text-gray-400 truncate leading-none">{startTime}</span>
        </div>
      )}

      {/* 紧凑模式：时间 + 标题省略 */}
      {showCompact && (
        <div className="flex items-center gap-1.5 h-full min-w-0">
          <span className="text-[10px] text-gray-500 whitespace-nowrap shrink-0 leading-tight">
            {startTime}
          </span>
          <span
            className="text-xs truncate leading-tight"
            style={textColor}
          >
            {item.title}
          </span>
        </div>
      )}

      {/* 完整模式 */}
      {showFull && (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-500 whitespace-nowrap leading-tight">
              {startTime}{endTime ? ` - ${endTime}` : ''}
            </span>
            <span className="text-[11px] text-gray-400 leading-tight">
              · {durationLabel}
            </span>
          </div>
          <div
            className="text-xs font-medium mt-0.5 truncate leading-tight"
            style={textColor}
          >
            {item.title}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/60 border border-white text-gray-600 leading-none">
              {item.activityType || 'unclear'}
            </span>
          </div>
        </div>
      )}
    </button>
  );
}

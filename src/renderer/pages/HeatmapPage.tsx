import { useEffect, useState, useCallback } from 'react';
import { Grid3X3 } from 'lucide-react';
import { DateRangePicker } from '../components/DateRangePicker';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { toast } from '../components/ui/Toast';
import { today as todayFn } from '../lib/constants';
import { useXiabanyaApi } from '../hooks/useXiabanyaApi';
import { formatLocalDate, localDateFromUtcStorage, localHourFromUtcStorage } from '../../shared/time';

interface RawRecord {
  start_at: string;
  end_at: string;
  app: string;
}

interface HeatmapCell {
  day: string;
  hour: number;
  count: number;
  apps: string[];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatLocalDate(d);
}

/** GitHub-style 5-level green color scale */
function colorForLevel(level: number): string {
  const map: Record<number, string> = {
    0: '#ebedf0',
    1: '#9be9a8',
    2: '#40c463',
    3: '#30a14e',
    4: '#216e39',
  };
  return map[level] || '#ebedf0';
}

export function HeatmapPage() {
  const api = useXiabanyaApi();
  const [startDate, setStartDate] = useState(daysAgo(6));
  const [endDate, setEndDate] = useState(todayFn);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [tooltip, setTooltip] = useState<{ cell: HeatmapCell; x: number; y: number } | null>(null);

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  const fetchData = async () => {
    setLoading(true);
    setError(false);
    try {
      const data: RawRecord[] = await api.records.list({ start: startDate, end: endDate, limit: 5000 });
      const grid: Record<string, Record<number, { count: number; apps: Set<string> }>> = {};

      data.forEach((r) => {
        const day = localDateFromUtcStorage(r.start_at);
        const hour = localHourFromUtcStorage(r.start_at);
        if (!day) return;
        if (!grid[day]) grid[day] = {};
        if (!grid[day][hour]) grid[day][hour] = { count: 0, apps: new Set() };
        grid[day][hour].count++;
        grid[day][hour].apps.add(r.app);
      });

      const cells: HeatmapCell[] = [];
      const start = new Date(`${startDate}T00:00:00`);
      const end = new Date(`${endDate}T00:00:00`);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const day = formatLocalDate(d);
        for (let h = 0; h < 24; h++) {
          cells.push({
            day,
            hour: h,
            count: grid[day]?.[h]?.count || 0,
            apps: grid[day]?.[h] ? [...grid[day][h].apps] : [],
          });
        }
      }
      setHeatmap(cells);
    } catch {
      setError(true);
      toast.error('加载热力图数据失败');
    }
    setLoading(false);
  };

  const getLevel = (count: number): number => {
    if (count === 0) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    if (count <= 10) return 3;
    return 4;
  };

  const handleCellHover = useCallback(
    (cell: HeatmapCell, e: React.MouseEvent) => {
      if (cell.count === 0) {
        setTooltip(null);
        return;
      }
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setTooltip({
        cell,
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      });
    },
    [],
  );

  const rows: Record<string, HeatmapCell[]> = {};
  heatmap.forEach((c) => {
    if (!rows[c.day]) rows[c.day] = [];
    rows[c.day].push(c);
  });

  const dayLabels = Object.keys(rows).sort();

  if (loading) {
    return (
      <div className="space-y-4">
        <DateRangePicker startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />
        <Skeleton variant="card" className="h-[400px]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <DateRangePicker startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />
        <EmptyState
          icon={Grid3X3}
          title="加载失败"
          description="请检查后重试"
          actionLabel="重试"
          onAction={fetchData}
        />
      </div>
    );
  }

  if (dayLabels.length === 0) {
    return (
      <div className="space-y-4">
        <DateRangePicker startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />
        <EmptyState
          icon={Grid3X3}
          title="无活动数据"
          description="开始追踪后这里将显示活动热力图"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DateRangePicker startDate={startDate} endDate={endDate} onChange={(s, e) => { setStartDate(s); setEndDate(e); }} />

      <div className="bg-white rounded-xl border border-gray-200 p-4 overflow-auto">
        <div className="inline-block min-w-[700px]">
          {/* Hour header */}
          <div className="flex">
            <div className="w-24 shrink-0"></div>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="flex-1 text-center text-xs text-gray-400 pb-1">
                {h}
              </div>
            ))}
          </div>

          {/* Heatmap body */}
          {dayLabels.map((day) => (
            <div key={day} className="flex items-center h-8">
              <div className="w-24 shrink-0 text-xs text-gray-500 pr-2 text-right">
                {day.substring(5)}
              </div>
              {(rows[day] || []).map((cell) => (
                <div
                  key={cell.hour}
                  className="flex-1 h-6 mx-0.5 rounded-sm cursor-pointer transition-all hover:ring-2 hover:ring-brand-400 hover:scale-110"
                  style={{ backgroundColor: colorForLevel(getLevel(cell.count)) }}
                  onMouseEnter={(e) => handleCellHover(cell, e)}
                  onMouseLeave={() => setTooltip(null)}
                />
              ))}
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-400">低</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <div
                key={level}
                className="w-4 h-4 rounded-sm"
                style={{ backgroundColor: colorForLevel(level) }}
              />
            ))}
            <span className="text-xs text-gray-400">高</span>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-gray-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="font-medium">
            {tooltip.cell.day} {String(tooltip.cell.hour).padStart(2, '0')}:00
          </p>
          <p>{tooltip.cell.count} 条记录</p>
          {tooltip.cell.apps.length > 0 && (
            <p className="text-gray-300">{tooltip.cell.apps.slice(0, 5).join(', ')}</p>
          )}
        </div>
      )}
    </div>
  );
}

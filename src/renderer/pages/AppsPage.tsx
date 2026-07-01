import { useEffect, useState } from 'react';
import { BarChart3, PieChart, Monitor } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { Card } from '../components/ui/Card';
import { toast } from '../components/ui/Toast';
import { DateRangePicker } from '../components/DateRangePicker';
import { dur } from '../lib/utils';
import { today } from '../lib/constants';
import { useXiabanyaApi } from '../hooks/useXiabanyaApi';
import { localDateFromUtcStorage, parseUtcStorageDateTime } from '../../shared/time';

interface Record {
  app: string;
  start_at: string;
  end_at: string;
}

interface AppStat {
  app: string;
  count: number;
  totalSec: number;
  lastUsed: string;
}

/** 12 色分类色板 — 视觉互斥，色盲安全，与 globals.css chart tokens 同步 */
const CHART_COLORS = [
  '#4e79a7', // chart-1  蓝灰
  '#08a64f', // chart-2  品牌绿
  '#f28e2b', // chart-3  橙
  '#e15759', // chart-4  红
  '#76b7b2', // chart-5  青
  '#b07aa1', // chart-6  紫
  '#edc948', // chart-7  黄
  '#ff9da7', // chart-8  粉
  '#9c755f', // chart-9  棕
  '#59a14f', // chart-10 深绿
  '#bab0ac', // chart-11 灰
  '#5b9bd5', // chart-12 天蓝
];

export function AppsPage() {
  const api = useXiabanyaApi();
  const [view, setView] = useState<'bar' | 'pie'>('bar');
  const [stats, setStats] = useState<AppStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);

  useEffect(() => {
    fetchStats();
  }, [startDate, endDate]);

  const fetchStats = async () => {
    setLoading(true);
    setError(false);
    try {
      const data: Record[] = await api.records.list({
        start: startDate,
        end: endDate,
        limit: 5000,
      });
      const map = new Map<string, AppStat>();
      data.forEach((r) => {
        const start = parseUtcStorageDateTime(r.start_at);
        const end = parseUtcStorageDateTime(r.end_at);
        if (!start || !end) return;
        const sec = (end.getTime() - start.getTime()) / 1000;
        const existing = map.get(r.app) || { app: r.app, count: 0, totalSec: 0, lastUsed: r.start_at };
        existing.count++;
        existing.totalSec += Math.max(0, sec);
        if (r.start_at > existing.lastUsed) existing.lastUsed = r.start_at;
        map.set(r.app, existing);
      });
      setStats([...map.values()].sort((a, b) => b.totalSec - a.totalSec));
    } catch {
      setError(true);
      toast.error('加载应用统计失败');
    }
    setLoading(false);
  };

  const handleDateChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  };

  const rangeText = startDate === endDate ? startDate : `${startDate} 至 ${endDate}`;

  const toolbar = (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <DateRangePicker startDate={startDate} endDate={endDate} onChange={handleDateChange} />
      <div className="flex gap-2">
        <Button
          variant={view === 'bar' ? 'success' : 'secondary'}
          size="sm"
          icon={BarChart3}
          onClick={() => setView('bar')}
        >
          柱状图
        </Button>
        <Button
          variant={view === 'pie' ? 'success' : 'secondary'}
          size="sm"
          icon={PieChart}
          onClick={() => setView('pie')}
        >
          饼图
        </Button>
      </div>
    </div>
  );

  const barData = stats.slice(0, 15).map((s) => ({
    name: s.app,
    duration: Math.round(s.totalSec / 60),
    totalSec: s.totalSec,
  }));

  const pieData = stats.slice(0, 10).map((s) => ({
    name: s.app,
    value: Math.round(s.totalSec / 60),
    totalSec: s.totalSec,
  }));

  const formatTooltip = (value: number) => {
    return dur(value * 60);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {toolbar}
        <Skeleton variant="card" className="h-[300px]" />
        <Skeleton.List count={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        {toolbar}
        <EmptyState
          icon={Monitor}
          title="加载失败"
          description="请检查后重试"
          actionLabel="重试"
          onAction={fetchStats}
        />
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="space-y-6">
        {toolbar}
        <EmptyState
          icon={Monitor}
          title="所选日期范围内无应用使用数据"
          description="开始追踪后这里将显示应用使用统计"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toolbar}

      {/* Bar Chart */}
      {view === 'bar' && (
        <Card className="p-5">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-gray-800">应用使用时长 TOP 15</h2>
            <p className="text-xs text-gray-500 mt-1">统计范围：{rangeText}</p>
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={barData} layout="vertical" margin={{ left: 80, right: 20, top: 10, bottom: 10 }}>
              <XAxis type="number" tickFormatter={(v: number) => dur(v * 60)} fontSize={12} stroke="#9ca3af" />
              <YAxis type="category" dataKey="name" width={120} fontSize={12} stroke="#9ca3af" />
              <RechartsTooltip
                formatter={(value: number) => [dur(value * 60), '时长']}
                labelFormatter={(label: string) => `应用: ${label}`}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}
              />
              <Bar dataKey="duration" radius={[0, 4, 4, 0]}>
                {barData.map((_, index) => (
                  <Cell key={`bar-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Pie Chart */}
      {view === 'pie' && (
        <Card className="p-5">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-gray-800">应用使用占比 TOP 10</h2>
            <p className="text-xs text-gray-500 mt-1">统计范围：{rangeText}</p>
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <RePieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={130}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
              >
                {pieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip
                formatter={(value: number) => [dur(value * 60), '时长']}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}
              />
              <Legend formatter={(value: string) => <span className="text-xs text-gray-600">{value}</span>} />
            </RePieChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="px-4 py-2 text-left">应用</th>
                <th className="px-4 py-2 text-left">使用次数</th>
                <th className="px-4 py-2 text-left">总时长</th>
                <th className="px-4 py-2 text-left">最近使用</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.app} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-800">{s.app}</td>
                  <td className="px-4 py-2 text-gray-600">{s.count}</td>
                  <td className="px-4 py-2 text-gray-600">{dur(s.totalSec)}</td>
                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {localDateFromUtcStorage(s.lastUsed) || s.lastUsed.substring(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

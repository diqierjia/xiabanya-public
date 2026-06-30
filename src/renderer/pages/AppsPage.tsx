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
import { dur } from '../lib/utils';
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

const PIE_COLORS = [
  '#08a64f', '#22c55e', '#4ade80', '#86efac',
  '#bbf7d0', '#16a34a', '#15803d', '#166534',
  '#14532d', '#dcfce7',
];

export function AppsPage() {
  const api = useXiabanyaApi();
  const [view, setView] = useState<'bar' | 'pie'>('bar');
  const [stats, setStats] = useState<AppStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    setError(false);
    try {
      const data: Record[] = await api.records.list({
        start: '2000-01-01',
        end: '2099-12-31',
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
        <div className="flex gap-2">
          <Skeleton variant="rect" className="w-24 h-9 rounded-lg" />
          <Skeleton variant="rect" className="w-24 h-9 rounded-lg" />
        </div>
        <Skeleton variant="card" className="h-[300px]" />
        <Skeleton.List count={5} />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={Monitor}
        title="加载失败"
        description="请检查后重试"
        actionLabel="重试"
        onAction={fetchStats}
      />
    );
  }

  if (stats.length === 0) {
    return (
      <EmptyState
        icon={Monitor}
        title="无应用使用数据"
        description="开始追踪后这里将显示应用使用统计"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* View Toggle */}
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

      {/* Bar Chart */}
      {view === 'bar' && (
        <Card className="p-5">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={barData} layout="vertical" margin={{ left: 80, right: 20, top: 10, bottom: 10 }}>
              <XAxis type="number" tickFormatter={(v: number) => dur(v * 60)} fontSize={12} stroke="#9ca3af" />
              <YAxis type="category" dataKey="name" width={120} fontSize={12} stroke="#9ca3af" />
              <RechartsTooltip
                formatter={(value: number) => [dur(value * 60), '时长']}
                labelFormatter={(label: string) => `应用: ${label}`}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '13px' }}
              />
              <Bar dataKey="duration" fill="#08a64f" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Pie Chart */}
      {view === 'pie' && (
        <Card className="p-5">
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
                  <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
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

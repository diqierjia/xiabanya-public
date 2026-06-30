import { useEffect, useState, useCallback, useRef } from 'react';
import { Clock, Activity, Brain, Eye, AlertCircle, ClipboardList } from 'lucide-react';
import { useVisionStore } from '../stores/useVisionStore';
import { useRecordsStore } from '../stores/useRecordsStore';
import { useAppStore } from '../stores/useAppStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { StatCard } from '../components/StatCard';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { toast } from '../components/ui/Toast';
import { useXiabanyaApi } from '../hooks/useXiabanyaApi';
import { today } from '../lib/utils';
import VisionResultCard from '../components/VisionResultCard';
import TrackerDot from '../components/TrackerDot';

export function TodayPage() {
  const { todayResults, loading, error, fetchTodayResults, computeDailySummary } = useVisionStore();
  const { todayRecords } = useRecordsStore();
  const { setTrackerRunning, visionAutoRunning, setVisionAutoRunning } = useAppStore();
  const { settings, fetchSettings } = useSettingsStore();
  const api = useXiabanyaApi();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const prevResultsRef = useRef<typeof todayResults>([]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // v2.2: 初始加载 → 后续静默轮询（不触发 loading skeleton）
  useEffect(() => {
    fetchSettings();
    fetchTodayResults();
    useRecordsStore.getState().fetchTodayRecords();
    const t = setInterval(() => {
      useVisionStore.getState().silentRefreshToday();
      useRecordsStore.getState().fetchTodayRecords();
    }, 10000);
    return () => clearInterval(t);
  }, []);

  // 同步 tracker 和 vision auto 状态
  useEffect(() => {
    api.tracker.status().then((s) => setTrackerRunning(s.running)).catch(() => {});
    api.vision.autoStatus().then((s) => setVisionAutoRunning(s.running)).catch(() => {});
  }, []);

  const summary = computeDailySummary();

  const toggleVisionAuto = async () => {
    try {
      if (visionAutoRunning) {
        await api.vision.stopAuto();
        setVisionAutoRunning(false);
        toast.success('自动截图识别已停止');
      } else {
        if (!settings.siliconflow_api_key.trim()) {
          toast.error('请先在设置中配置 API Key');
          return;
        }
        await api.vision.startAuto(settings.screenshot_interval);
        setVisionAutoRunning(true);
        toast.success('自动截图识别已开始');
      }
      await useSettingsStore.getState().fetchSettings();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '操作失败';
      toast.error(`自动截图识别操作失败: ${msg}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* v2.2: Hero Banner — vision_results 摘要 */}
      <div className="bg-gradient-to-r from-brand-600 to-brand-700 rounded-2xl p-6 text-white relative">
        {/* Vision Auto 状态开关 */}
        <div className="absolute top-4 right-4">
          <TrackerDot running={visionAutoRunning} onToggle={toggleVisionAuto} />
        </div>

        {summary.latest ? (
          <div>
            <p className="text-brand-100 text-sm">{today()} AI 识别摘要</p>
            <div className="flex items-center gap-3 mt-2">
              <p className="text-2xl font-bold truncate max-w-md">{summary.latest.title}</p>
              <Badge category={summary.latest.category} />
            </div>
            <p className="text-brand-100/80 text-sm mt-2 line-clamp-2 max-w-lg">
              {summary.latest.summary || '暂无摘要'}
            </p>
            <div className="flex items-center gap-4 mt-3 text-xs text-brand-100/70">
              <span className="flex items-center gap-1">
                <Eye size={12} />
                今日 AI 识别 {summary.count} 条
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} />
                主要: {summary.mainCategory}
              </span>
              {summary.activeSpanSec > 0 && (
                <span>活跃跨度约 {Math.round(summary.activeSpanSec / 60)} 分钟</span>
              )}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-brand-100 text-sm">{today()} AI 工作台</p>
            <p className="text-2xl font-bold mt-2">AI 准备就绪</p>
            <p className="text-brand-100/80 text-sm mt-1">
              {visionAutoRunning
                ? '等待首次截屏识别…'
                : settings.siliconflow_api_key
                  ? 'Vision Auto 未启动，请在设置中开启自动识别'
                  : '请配置 API Key 以启用 AI 截屏识别'}
            </p>
          </div>
        )}
      </div>

      {/* v2.2: Stat Cards — Vision 维度 + Records 补充 */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={<Brain size={20} className="text-brand-600" />}
          label="AI 识别条数"
          value={`${summary.count}`}
          sub="条 Vision 结果"
        />
        <StatCard
          icon={<Clock size={20} className="text-amber-500" />}
          label="今日记录"
          value={`${todayRecords.length}`}
          sub="条追踪记录"
        />
        <StatCard
          icon={<Activity size={20} className="text-purple-500" />}
          label="主要分类"
          value={summary.mainCategory}
          sub={summary.categories[0] ? `${summary.categories[0].count} 条` : '-'}
        />
        <StatCard
          icon={<Eye size={20} className={visionAutoRunning ? 'text-green-500' : 'text-gray-400'} />}
          label="Vision Auto"
          value={visionAutoRunning ? '运行中' : '已停止'}
          color={visionAutoRunning ? '#08a64f' : '#9ca3af'}
        />
      </div>

      {/* v2.2: Vision Results 列表（compact 模式） */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton.CardGrid count={4} cols={4} />
          <Skeleton.List count={5} />
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertCircle}
          title="加载失败"
          description="请检查后重试"
          actionLabel="重试"
          onAction={fetchTodayResults}
        />
      ) : todayResults.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={visionAutoRunning ? '等待首次 AI 识别…' : '今天还没有 AI 识别结果'}
          description={
            visionAutoRunning
              ? 'AI 截屏识别将在下一个周期自动运行'
              : '请在设置中配置 API Key 并开启 Vision Auto'
          }
        />
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-500 px-1">
            AI 识别结果 ({todayResults.length} 条)
          </h3>
          {todayResults.slice(0, 20).map((r) => (
            <VisionResultCard
              key={r.id}
              result={r}
              variant="compact"
              expanded={expandedIds.has(r.id)}
              onToggle={toggleExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

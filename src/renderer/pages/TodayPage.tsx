import { useEffect, useState, useMemo } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  Eye,
  FileText,
  Lightbulb,
  PauseCircle,
  Radio,
  Sparkles,
  Timer,
} from 'lucide-react';
import { useVisionStore } from '../stores/useVisionStore';
import { useRecordsStore } from '../stores/useRecordsStore';
import { useAppStore } from '../stores/useAppStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { toast } from '../components/ui/Toast';
import { useXiabanyaApi } from '../hooks/useXiabanyaApi';
import { today } from '../lib/utils';
import TrackerDot from '../components/TrackerDot';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import type { TimeMapItem } from '../components/time-map/ActivityBlock';
import { buildTimeMapSegments, getTimeMapVisibleWindow } from '../components/time-map/buildTimeMapSegments';
import type { Category, IdlePeriod, TrackerSnapshot, VisionResultWithDuration } from '../../shared/types';
import { formatUtcStorageTime, parseUtcStorageDateTime } from '../../shared/time';
import duckImg from '../assets/duck_windows_icon_source_1024.png';
import codeDevelopmentDuck from '../assets/category-ducks/code-development.png';
import documentWritingDuck from '../assets/category-ducks/document-writing.png';
import visualDesignDuck from '../assets/category-ducks/visual-design.png';
import dataProcessingDuck from '../assets/category-ducks/data-processing.png';
import literatureReadingDuck from '../assets/category-ducks/literature-reading.png';
import communicationCollaborationDuck from '../assets/category-ducks/communication-collaboration.png';
import videoMeetingDuck from '../assets/category-ducks/video-meeting.png';
import planningManagementDuck from '../assets/category-ducks/planning-management.png';
import searchAiDuck from '../assets/category-ducks/search-ai.png';
import systemConfigurationDuck from '../assets/category-ducks/system-configuration.png';
import leisureEntertainmentDuck from '../assets/category-ducks/leisure-entertainment.png';
import otherDuck from '../assets/category-ducks/other.png';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const ACTIVITY_LABELS: Record<string, string> = {
  work: '专注工作',
  personal: '个人活动',
  idle: '休息',
  unclear: '待确认',
};

const ACTIVITY_DOT_COLORS: Record<string, string> = {
  work: '#22b868',
  personal: '#f59e0b',
  idle: '#9ca3af',
  unclear: '#60a5fa',
};

const CATEGORY_DUCK_IMAGES: Record<Category, string> = {
  代码开发: codeDevelopmentDuck,
  文稿写作: documentWritingDuck,
  视觉设计: visualDesignDuck,
  数据处理: dataProcessingDuck,
  文献与阅读: literatureReadingDuck,
  沟通与协作: communicationCollaborationDuck,
  音视频会议: videoMeetingDuck,
  规划与管理: planningManagementDuck,
  检索与AI: searchAiDuck,
  系统与配置: systemConfigurationDuck,
  休闲娱乐: leisureEntertainmentDuck,
  其他: otherDuck,
};

function formatTodayDate(): { date: string; weekday: string } {
  const now = new Date();
  return {
    date: today(),
    weekday: WEEKDAYS[now.getDay()],
  };
}

function durationCompact(sec: number): string {
  const minutes = Math.max(0, Math.round(sec / 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h${rest}m` : `${hours}h`;
}

function durationZh(sec: number): string {
  const minutes = Math.max(0, Math.round(sec / 60));
  if (minutes < 1) return '<1 分钟';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function itemStartMs(item: TimeMapItem): number {
  return parseUtcStorageDateTime(item.startAt)?.getTime() ?? 0;
}

function itemEndMs(item: TimeMapItem): number {
  return itemStartMs(item) + Math.max(0, item.durationSec) * 1000;
}

function isRealActivity(item: TimeMapItem): boolean {
  return item.kind !== 'gap' && item.kind !== 'idle' && item.activityType !== 'idle';
}

function isReliableWork(item: TimeMapItem): boolean {
  return isRealActivity(item) && item.activityType === 'work' && item.confidence !== 'low';
}

function pickLongest(items: TimeMapItem[]): TimeMapItem | null {
  return items.reduce<TimeMapItem | null>((best, item) => (
    !best || item.durationSec > best.durationSec ? item : best
  ), null);
}

function getCategoryDuckImage(category?: Category): string {
  return category ? CATEGORY_DUCK_IMAGES[category] : otherDuck;
}

function getStatusText(item: TimeMapItem | null, visionAutoRunning: boolean): string {
  if (!visionAutoRunning) return '已停止记录';
  if (!item) return '等待首次识别';
  if (item.activityType === 'work') {
    if (item.category === '代码开发') return '正在开发中';
    if (item.category === '文稿写作') return '正在写作中';
    if (item.category === '沟通与协作') return '正在协作中';
    if (item.category === '检索与AI') return '正在使用 AI 工具';
    return `正在${item.category}`;
  }
  if (item.activityType === 'personal') return '个人活动中';
  if (item.kind === 'idle') return '离开电脑中';
  return '记录中';
}

function buildHeroTitle(workItems: TimeMapItem[], latestItem: TimeMapItem | null): string {
  const longest = pickLongest(workItems);
  if (longest) {
    return `今天主要投入在 ${longest.category}：${longest.title}`;
  }
  if (latestItem) {
    return `AI 观察到你最近在处理：${latestItem.title}`;
  }
  return '开启 Vision Auto 后，我会开始整理今天的工作脉络。';
}

function buildHeroSubtitle(resultCount: number, workItems: TimeMapItem[]): string {
  if (resultCount === 0) return '首页会直接读取本地识别记录和时间线，不会展示未连接数据的占位内容。';
  if (workItems.length === 0) return `已读取 ${resultCount} 条 AI 识别记录，但还没有足够可信的工作片段。`;
  const evidenceCount = workItems.reduce((sum, item) => sum + (item.evidenceItems?.length || 1), 0);
  return `已从 ${resultCount} 条 AI 识别记录中整理出 ${workItems.length} 段可信工作片段，包含 ${evidenceCount} 条截图证据。`;
}

function buildAdvice(params: {
  lowConfidenceCount: number;
  gapCount: number;
  reliableWorkCount: number;
  visionAutoRunning: boolean;
}): { text: string; action: string; target: 'records' | 'timeline' | 'review' | 'start' } {
  if (!params.visionAutoRunning) {
    return {
      text: 'Vision Auto 还没运行，开启后我会按截图识别结果刷新首页。',
      action: '开启识别',
      target: 'start',
    };
  }
  if (params.lowConfidenceCount > 0) {
    return {
      text: `有 ${params.lowConfidenceCount} 条识别不太确定，先核对一下会让日报更可信。`,
      action: '核对记录',
      target: 'records',
    };
  }
  if (params.gapCount > 0) {
    return {
      text: `今天时间线上有 ${params.gapCount} 段未记录，生成日报前可以看一眼是否需要补充。`,
      action: '查看时间线',
      target: 'timeline',
    };
  }
  if (params.reliableWorkCount >= 3) {
    return {
      text: '今天已经有足够工作证据，可以先生成一版日报草稿。',
      action: '生成日报',
      target: 'review',
    };
  }
  return {
    text: '我会继续观察今天的工作脉络，有新识别结果会自动更新这里。',
    action: '查看时间线',
    target: 'timeline',
  };
}

function getActivityIcon(item: TimeMapItem) {
  if (item.category === '代码开发') return Code2;
  if (item.kind === 'idle') return PauseCircle;
  if (item.activityType === 'work') return CheckCircle2;
  if (item.activityType === 'personal') return Sparkles;
  return Eye;
}

function getTimelineColor(item: TimeMapItem): string {
  if (item.kind === 'gap') return '#e5e7eb';
  if (item.kind === 'idle') return '#d1d5db';
  return ACTIVITY_DOT_COLORS[item.activityType || 'unclear'] || '#60a5fa';
}

interface TimelinePreviewProps {
  items: TimeMapItem[];
  visibleStartAt: string;
  visibleEndAt?: string;
}

function TimelinePreview({ items, visibleStartAt, visibleEndAt }: TimelinePreviewProps) {
  const start = parseUtcStorageDateTime(visibleStartAt);
  const explicitEnd = parseUtcStorageDateTime(visibleEndAt);
  const now = new Date();
  const latestItemEnd = items.reduce((max, item) => Math.max(max, itemEndMs(item)), start?.getTime() || now.getTime());
  const endMs = Math.max(explicitEnd?.getTime() || now.getTime(), latestItemEnd, (start?.getTime() || now.getTime()) + 60 * 60 * 1000);
  const startMs = start?.getTime() || now.getTime();
  const totalMs = Math.max(60 * 60 * 1000, endMs - startMs);
  const markerLeft = now.getTime() >= startMs && now.getTime() <= endMs
    ? ((now.getTime() - startMs) / totalMs) * 100
    : null;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const tick = new Date(startMs + totalMs * ratio);
    const isEndMidnight = ratio === 1
      && tick.getHours() === 0
      && tick.getMinutes() === 0
      && tick.toDateString() !== new Date(startMs).toDateString();
    return {
      ratio,
      label: isEndMidnight ? '24:00' : tick.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
    };
  });

  return (
    <div>
      <div className="relative h-12">
        <div className="absolute left-0 right-0 top-4 h-3 overflow-hidden rounded-full bg-gray-100">
          {items.map((item) => {
            const leftMs = Math.max(itemStartMs(item), startMs);
            const rightMs = Math.min(itemEndMs(item), endMs);
            if (rightMs <= leftMs) return null;
            const left = ((leftMs - startMs) / totalMs) * 100;
            const width = Math.max(((rightMs - leftMs) / totalMs) * 100, 0.75);
            return (
              <div
                key={item.id}
                className="absolute inset-y-0"
                title={`${formatUtcStorageTime(item.startAt)} · ${item.title}`}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  backgroundColor: getTimelineColor(item),
                  opacity: item.kind === 'gap' ? 0.65 : 0.95,
                }}
              />
            );
          })}
        </div>
        {markerLeft !== null && (
          <div
            className="absolute top-1 bottom-1 z-10 w-px bg-red-500"
            style={{ left: `${markerLeft}%` }}
            title="现在"
          />
        )}
      </div>
      <div className="mt-2 grid grid-cols-5 text-[11px] text-gray-400">
        {ticks.map((tick) => (
          <span key={tick.ratio} className={tick.ratio === 1 ? 'text-right' : tick.ratio === 0 ? '' : 'text-center'}>
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function EventRow({ item }: { item: TimeMapItem }) {
  const Icon = getActivityIcon(item);
  return (
    <div className="grid grid-cols-[40px_38px_1fr] items-start gap-3">
      <div
        className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${getTimelineColor(item)}20`, color: getTimelineColor(item) }}
      >
        <Icon size={17} />
      </div>
      <span className="pt-1.5 text-xs text-gray-500">{formatUtcStorageTime(item.startAt)}</span>
      <div className="min-w-0 border-l border-gray-100 pl-3 pb-4">
        <div className="truncate text-sm font-semibold text-gray-800">{item.title}</div>
        <div className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500">
          {item.possibleActivity || item.observedFact || '暂无可展示摘要'}
        </div>
      </div>
    </div>
  );
}

export function TodayPage() {
  const { todayResults, loading, error, fetchTodayResults, computeDailySummary } = useVisionStore();
  const { todayRecords } = useRecordsStore();
  const { setTrackerRunning, visionAutoRunning, setVisionAutoRunning, setPage } = useAppStore();
  const { settings, fetchSettings } = useSettingsStore();
  const api = useXiabanyaApi();
  const [idlePeriods, setIdlePeriods] = useState<IdlePeriod[]>([]);
  const [prediction, setPrediction] = useState<string | null>(null);
  const [trackerSnapshot, setTrackerSnapshot] = useState<TrackerSnapshot | null>(null);

  // v2.2: 初始加载 → 后续静默轮询（不触发 loading skeleton）
  useEffect(() => {
    fetchSettings();
    fetchTodayResults();
    useRecordsStore.getState().fetchTodayRecords();
    api.idle.listByDate({ start: today(), end: today(), limit: 100 }).then(setIdlePeriods).catch(() => {});
    api.proactive.getOffworkPrediction().then((p) => { if (p) setPrediction(p.displayTime); else setPrediction(null); }).catch(() => setPrediction(null));
    const t = setInterval(() => {
      useVisionStore.getState().silentRefreshToday();
      useRecordsStore.getState().fetchTodayRecords();
      api.idle.listByDate({ start: today(), end: today(), limit: 100 }).then(setIdlePeriods).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, []);

  // 同步 tracker 和 vision auto 状态
  useEffect(() => {
    api.tracker.status().then((s) => setTrackerRunning(s.running)).catch(() => {});
    api.vision.autoStatus().then((s) => setVisionAutoRunning(s.running)).catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = api.tracker.onSnapshot((snapshot) => setTrackerSnapshot(snapshot));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = api.vision.onResult(() => {
      useVisionStore.getState().silentRefreshToday();
      api.idle.listByDate({ start: today(), end: today(), limit: 100 }).then(setIdlePeriods).catch(() => {});
    });
    return unsub;
  }, []);

  const summary = computeDailySummary();
  const baseTimeMapItems = useMemo<TimeMapItem[]>(() => todayResults.map((result) => ({
    id: result.id,
    title: result.title,
    category: result.category,
    startAt: result.created_at,
    durationSec: result.approx_duration_sec,
    observedFact: result.observed_fact || result.summary,
    possibleActivity: result.possible_activity || result.summary,
    confidence: result.confidence,
    activityType: result.activity_type,
    segmentMerge: result.segment_merge,
    app: result.app,
    windowTitle: result.window_title,
  })), [todayResults]);

  const visibleWindow = useMemo(
    () => getTimeMapVisibleWindow(today(), baseTimeMapItems),
    [baseTimeMapItems]
  );

  const timeMapItems = useMemo<TimeMapItem[]>(
    () => buildTimeMapSegments(
      baseTimeMapItems,
      idlePeriods,
      new Date(),
      visibleWindow
    ),
    [baseTimeMapItems, idlePeriods, visibleWindow]
  );

  const todayDate = useMemo(formatTodayDate, []);
  const reliableWorkItems = useMemo(() => timeMapItems.filter(isReliableWork), [timeMapItems]);
  const realActivityItems = useMemo(() => timeMapItems.filter(isRealActivity), [timeMapItems]);
  const latestActivity = useMemo(() => (
    [...realActivityItems].sort((a, b) => itemStartMs(b) - itemStartMs(a))[0] || null
  ), [realActivityItems]);
  const keyEvents = useMemo(() => (
    [...realActivityItems]
      .sort((a, b) => itemStartMs(b) - itemStartMs(a))
      .slice(0, 4)
      .sort((a, b) => itemStartMs(a) - itemStartMs(b))
  ), [realActivityItems]);
  const workDurationSec = reliableWorkItems.reduce((sum, item) => sum + item.durationSec, 0);
  const heroItem = useMemo(() => pickLongest(reliableWorkItems) || latestActivity, [reliableWorkItems, latestActivity]);
  const heroDuckImg = getCategoryDuckImage(heroItem?.category);
  const currentApp = trackerSnapshot?.app || summary.latest?.app || latestActivity?.app || '-';
  const currentAppSource = trackerSnapshot ? '当前应用' : currentApp !== '-' ? '最近识别' : '暂无应用';
  const currentFocusSec = trackerSnapshot ? Math.round(trackerSnapshot.durationMs / 1000) : latestActivity?.durationSec || 0;
  const lowConfidenceCount = todayResults.filter((item: VisionResultWithDuration) => item.confidence === 'low').length;
  const gapCount = timeMapItems.filter((item) => item.kind === 'gap').length;
  const advice = buildAdvice({
    lowConfidenceCount,
    gapCount,
    reliableWorkCount: reliableWorkItems.length,
    visionAutoRunning,
  });
  const heroTitle = buildHeroTitle(reliableWorkItems, latestActivity);
  const heroSubtitle = buildHeroSubtitle(todayResults.length, reliableWorkItems);
  const statusText = getStatusText(latestActivity, visionAutoRunning);

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

  const handleAdviceAction = () => {
    if (advice.target === 'start') {
      toggleVisionAuto();
      return;
    }
    setPage(advice.target);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-4">
          <h2 className="text-xl font-semibold text-gray-900">今天</h2>
          <span className="text-sm text-gray-400">{todayDate.date}</span>
          <span className="text-sm text-gray-400">{todayDate.weekday}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleVisionAuto}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
              visionAutoRunning
                ? 'border-brand-100 bg-brand-50 text-brand-700'
                : 'border-gray-200 bg-white text-gray-500'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${visionAutoRunning ? 'bg-brand-500' : 'bg-gray-300'}`} />
            Vision Auto
            <span>{visionAutoRunning ? '运行中' : '已停止'}</span>
          </button>
          <TrackerDot running={visionAutoRunning} onToggle={toggleVisionAuto} />
        </div>
      </div>

      <section className="relative overflow-hidden rounded-xl border border-brand-100 bg-gradient-to-r from-white via-brand-50 to-white p-6">
        <div className="relative z-10 grid grid-cols-[148px_1fr] gap-8">
          <div className="flex items-end justify-center">
            <img src={heroDuckImg} alt={heroItem?.category ? `${heroItem.category}小黄鸭` : '下班鸭'} className="h-32 w-32 object-contain drop-shadow-sm" />
          </div>
          <div className="min-w-0 py-2">
            <h3 className="text-xl font-semibold leading-8 text-gray-900">{heroTitle}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">{heroSubtitle}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">
                <Timer size={16} />
                专注工作 {durationCompact(workDurationSec)}
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700">
                <Radio size={16} />
                {statusText}
              </span>
              <span className="inline-flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                <Code2 size={16} />
                {currentApp}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-[1.15fr_0.95fr] gap-5">
        <Card className="p-5">
          <Card.Header>
            <Card.Title>AI 观察到的今天</Card.Title>
            <button
              type="button"
              onClick={() => setPage('records')}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
            >
              查看全部记录
              <ChevronRight size={14} />
            </button>
          </Card.Header>
          {keyEvents.length > 0 ? (
            <div>
              {keyEvents.map((item) => <EventRow key={item.id} item={item} />)}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center">
              <Eye size={24} className="mx-auto text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-700">
                {visionAutoRunning ? '等待首次 AI 识别' : '今天还没有 AI 识别结果'}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                这里会显示从本地数据库读取的 Vision 记录。
              </p>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <Card.Header>
              <Card.Title>当前状态</Card.Title>
              <Clock size={16} className="text-gray-400" />
            </Card.Header>
            <div className="flex items-center gap-3">
              <div className={`flex h-11 w-11 items-center justify-center rounded-full ${visionAutoRunning ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-400'}`}>
                <Radio size={22} />
              </div>
              <div>
                <div className={`text-lg font-semibold ${visionAutoRunning ? 'text-brand-700' : 'text-gray-500'}`}>
                  {statusText}
                </div>
                <div className="text-xs text-gray-400">
                  {currentFocusSec > 0 ? `已连续 ${durationZh(currentFocusSec)}` : '暂无连续状态'}
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 border-t border-gray-100 pt-4">
              <div>
                <div className="text-xs text-gray-400">{currentAppSource}</div>
                <div className="mt-1 truncate text-sm font-semibold text-gray-800">{currentApp}</div>
              </div>
              <div className="border-l border-gray-100 pl-4">
                <div className="text-xs text-gray-400">识别记录</div>
                <div className="mt-1 text-sm font-semibold text-gray-800">{summary.count} 条</div>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <Card.Header>
              <Card.Title>小鸭建议</Card.Title>
              <Lightbulb size={16} className="text-amber-500" />
            </Card.Header>
            <div className="flex gap-3">
              <img src={duckImg} alt="" className="h-9 w-9 object-contain" />
              <p className="text-sm leading-6 text-gray-600">{advice.text}</p>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button size="sm" variant="success" onClick={handleAdviceAction}>
                {advice.action}
              </Button>
              <Button size="sm" variant="secondary">
                稍后再说
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-5">
        <Card.Header>
          <div>
            <Card.Title>今日时间线预览</Card.Title>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
              {Object.entries(ACTIVITY_LABELS).map(([key, label]) => (
                <span key={key} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ACTIVITY_DOT_COLORS[key] }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
          <Button size="sm" variant="secondary" icon={ChevronRight} onClick={() => setPage('timeline')}>
            完整时间线
          </Button>
        </Card.Header>
        <TimelinePreview
          items={timeMapItems}
          visibleStartAt={visibleWindow.visibleStartAt}
          visibleEndAt={visibleWindow.visibleEndAt}
        />
      </Card>

      <div className="grid grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400"><Eye size={14} />AI 识别</div>
          <div className="mt-2 text-xl font-semibold text-gray-900">{summary.count}</div>
          <div className="mt-1 text-xs text-gray-400">来自 vision_results</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400"><FileText size={14} />追踪记录</div>
          <div className="mt-2 text-xl font-semibold text-gray-900">{todayRecords.length}</div>
          <div className="mt-1 text-xs text-gray-400">来自 records</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400"><Bell size={14} />预计下班</div>
          <div className="mt-2 text-xl font-semibold text-gray-900">{prediction ?? '-'}</div>
          <div className="mt-1 text-xs text-gray-400">{prediction ? '基于近 7 天数据' : '数据不足'}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400"><AlertCircle size={14} />待确认</div>
          <div className="mt-2 text-xl font-semibold text-gray-900">{lowConfidenceCount + gapCount}</div>
          <div className="mt-1 text-xs text-gray-400">低置信或未记录段</div>
        </Card>
      </div>

      {loading && todayResults.length === 0 ? (
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
      ) : null}
    </div>
  );
}

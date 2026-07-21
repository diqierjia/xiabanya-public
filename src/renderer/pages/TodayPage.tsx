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
  Gauge,
  PauseCircle,
  Radio,
  Sparkles,
  Timer,
} from 'lucide-react';
import { useVisionStore } from '../stores/useVisionStore';
import { useRecordsStore } from '../stores/useRecordsStore';
import { useAppStore } from '../stores/useAppStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n';
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
import { formatLocalDate, formatUtcStorageTime, parseUtcStorageDateTime } from '../../shared/time';
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

interface WorkRhythm {
  score: number;
  totalWorkSec: number;
  focusItem: TimeMapItem;
}

const MIN_RHYTHM_WORK_SEC = 45 * 60;

function getYesterdayDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return formatLocalDate(date);
}

function buildWorkRhythm(segments: TimeMapItem[]): WorkRhythm | null {
  const workItems = segments.filter(isReliableWork);
  const totalWorkSec = workItems.reduce((sum, item) => sum + item.durationSec, 0);
  const focusItem = pickLongest(workItems);
  if (!focusItem || totalWorkSec < MIN_RHYTHM_WORK_SEC) return null;

  const score = Math.min(96, Math.round(
    45
      + Math.min(24, totalWorkSec / 3600 * 10)
      + Math.min(27, focusItem.durationSec / 3600 * 18)
  ));

  return {
    score,
    totalWorkSec,
    focusItem,
  };
}

function getItemEndTime(item: TimeMapItem): string {
  const start = parseUtcStorageDateTime(item.startAt);
  if (!start) return '--:--';
  return formatUtcStorageTime(new Date(start.getTime() + item.durationSec * 1000).toISOString());
}

function visionResultToTimeMapItem(result: VisionResultWithDuration): TimeMapItem {
  return {
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
  };
}

function getWorkRhythmSummary(rhythm: WorkRhythm, isEnglish: boolean): string {
  if (isEnglish) {
    if (rhythm.score >= 80) return 'You had a solid stretch of focus yesterday.';
    if (rhythm.score >= 65) return 'Your work rhythm was fairly steady yesterday.';
    return 'Yesterday was more fragmented, but there are useful threads to pick up.';
  }
  if (rhythm.score >= 80) return '昨天有一段很稳的投入。';
  if (rhythm.score >= 65) return '昨天的工作节奏还不错。';
  return '昨天的工作比较零碎，但已经留下了可接续的线索。';
}

function getStatusText(item: TimeMapItem | null, visionAutoRunning: boolean, isEnglish: boolean, categoryLabel: (category: string) => string): string {
  if (!visionAutoRunning) return isEnglish ? 'Recording stopped' : '已停止记录';
  if (!item) return isEnglish ? 'Waiting for first recognition' : '等待首次识别';
  if (item.activityType === 'work') {
    if (isEnglish) {
      if (item.category === '代码开发') return 'Developing';
      if (item.category === '文稿写作') return 'Writing';
      if (item.category === '沟通与协作') return 'Collaborating';
      if (item.category === '检索与AI') return 'Using AI tools';
      return `Working on ${categoryLabel(item.category)}`;
    }
    if (item.category === '代码开发') return '正在开发中';
    if (item.category === '文稿写作') return '正在写作中';
    if (item.category === '沟通与协作') return '正在协作中';
    if (item.category === '检索与AI') return '正在使用 AI 工具';
    return `正在${item.category}`;
  }
  if (item.activityType === 'personal') return isEnglish ? 'Personal activity' : '个人活动中';
  if (item.kind === 'idle') return isEnglish ? 'Away from computer' : '离开电脑中';
  return isEnglish ? 'Recording activity' : '记录中';
}

function buildHeroTitle(workItems: TimeMapItem[], latestItem: TimeMapItem | null, isEnglish: boolean): string {
  const longest = pickLongest(workItems);
  if (longest) {
    return isEnglish ? `Today was mainly spent on ${longest.category}: ${longest.title}` : `今天主要投入在 ${longest.category}：${longest.title}`;
  }
  if (latestItem) {
    return isEnglish ? `AI observed you recently working on: ${latestItem.title}` : `AI 观察到你最近在处理：${latestItem.title}`;
  }
  return isEnglish ? 'Once Vision Auto is enabled, I will start organizing today’s work context.' : '开启 Vision Auto 后，我会开始整理今天的工作脉络。';
}

function buildHeroSubtitle(resultCount: number, workItems: TimeMapItem[]): string {
  if (resultCount === 0) return '首页会直接读取本地识别记录和时间线，不会展示未连接数据的占位内容。';
  if (workItems.length === 0) return `已读取 ${resultCount} 条 AI 识别记录，但还没有足够可信的工作片段。`;
  const evidenceCount = workItems.reduce((sum, item) => sum + (item.evidenceItems?.length || 1), 0);
  return `已从 ${resultCount} 条 AI 识别记录中整理出 ${workItems.length} 段可信工作片段，包含 ${evidenceCount} 条截图证据。`;
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
  const { language, isEnglish, t, durationLabel, categoryLabel } = useTranslation();
  const activityLabels = isEnglish
    ? { work: 'Focused work', personal: 'Personal activity', idle: 'Rest', unclear: 'Needs review' }
    : ACTIVITY_LABELS;
  const { todayResults, loading, error, fetchTodayResults, computeDailySummary } = useVisionStore();
  const { todayRecords } = useRecordsStore();
  const { setTrackerRunning, visionAutoRunning, setVisionAutoRunning, setPage } = useAppStore();
  const { settings, fetchSettings } = useSettingsStore();
  const api = useXiabanyaApi();
  const [idlePeriods, setIdlePeriods] = useState<IdlePeriod[]>([]);
  const [prediction, setPrediction] = useState<string | null>(null);
  const [trackerSnapshot, setTrackerSnapshot] = useState<TrackerSnapshot | null>(null);
  const [yesterdayResults, setYesterdayResults] = useState<VisionResultWithDuration[]>([]);
  const [yesterdayIdlePeriods, setYesterdayIdlePeriods] = useState<IdlePeriod[]>([]);

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

  useEffect(() => {
    const yesterday = getYesterdayDate();
    Promise.all([
      api.vision.listByDate({ start: yesterday, end: yesterday, limit: 200 }),
      api.idle.listByDate({ start: yesterday, end: yesterday, limit: 100 }),
    ]).then(([results, idlePeriods]) => {
      setYesterdayResults(results);
      setYesterdayIdlePeriods(idlePeriods);
    }).catch(() => {
      setYesterdayResults([]);
      setYesterdayIdlePeriods([]);
    });
  }, [api]);

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
  // AI 观察、首页语义时间线只展示截图多模态识别；本地窗口追踪仅保留在独立统计/应用记录中。
  const baseTimeMapItems = useMemo<TimeMapItem[]>(
    () => todayResults.map(visionResultToTimeMapItem),
    [todayResults]
  );

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

  const yesterdayTimeMapItems = useMemo<TimeMapItem[]>(() => {
    const yesterday = getYesterdayDate();
    const activityItems = yesterdayResults.map(visionResultToTimeMapItem);
    const yesterdayWindow = getTimeMapVisibleWindow(yesterday, activityItems);
    return buildTimeMapSegments(
      activityItems,
      yesterdayIdlePeriods,
      new Date(`${yesterday}T23:59:59`),
      yesterdayWindow
    );
  }, [yesterdayResults, yesterdayIdlePeriods]);

  const todayDate = useMemo(() => {
    const now = new Date();
    return {
      date: formatLocalDate(now),
      weekday: now.toLocaleDateString(language, { weekday: 'long' }),
    };
  }, [language]);
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
  const yesterdayReliableWorkSec = useMemo(
    () => yesterdayTimeMapItems.filter(isReliableWork).reduce((sum, item) => sum + item.durationSec, 0),
    [yesterdayTimeMapItems]
  );
  const yesterdayRhythm = useMemo(() => buildWorkRhythm(yesterdayTimeMapItems), [yesterdayTimeMapItems]);
  const heroTitle = buildHeroTitle(reliableWorkItems, latestActivity, isEnglish);
  const heroSubtitle = buildHeroSubtitle(todayResults.length, reliableWorkItems);
  const statusText = getStatusText(latestActivity, visionAutoRunning, isEnglish, categoryLabel);

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-4">
          <h2 className="text-xl font-semibold text-gray-900">{t('today')}</h2>
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
            <span>{visionAutoRunning ? t('running') : t('stopped')}</span>
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
                {t('focusedWork')} {isEnglish ? durationLabel(workDurationSec) : durationCompact(workDurationSec)}
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
            <Card.Title>{t('aiObservedToday')}</Card.Title>
            <button
              type="button"
              onClick={() => setPage('records')}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
            >
              {t('viewAllRecords')}
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
                {visionAutoRunning ? t('waitForFirstRecognition') : t('noAiRecognitionToday')}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {t('localVisionDescription')}
              </p>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <Card.Header>
              <Card.Title>{t('currentStatus')}</Card.Title>
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
                  {currentFocusSec > 0 ? (isEnglish ? `Continuous for ${durationLabel(currentFocusSec)}` : `已连续 ${durationZh(currentFocusSec)}`) : t('noContinuousStatus')}
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 border-t border-gray-100 pt-4">
              <div>
                <div className="text-xs text-gray-400">{currentAppSource}</div>
                <div className="mt-1 truncate text-sm font-semibold text-gray-800">{currentApp}</div>
              </div>
              <div className="border-l border-gray-100 pl-4">
                <div className="text-xs text-gray-400">{t('recognitionRecords')}</div>
                <div className="mt-1 text-sm font-semibold text-gray-800">{summary.count} {isEnglish ? '' : '条'}</div>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden border-amber-100 bg-gradient-to-br from-amber-50/70 via-white to-white p-5">
            <Card.Header>
              <Card.Title>{t('yesterdayObservation')}</Card.Title>
              <Gauge size={17} className="text-amber-500" />
            </Card.Header>
            {yesterdayRhythm ? (
              <>
                <div className="flex items-center gap-3">
                  <div className={`flex h-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-amber-100 text-amber-700 ${isEnglish ? 'w-16' : 'w-14'}`}>
                    <span className="text-xl font-semibold leading-5">{yesterdayRhythm.score}</span>
                    <span className={`mt-0.5 text-[10px] font-medium ${isEnglish ? 'whitespace-nowrap' : ''}`}>{t('rhythmScore')}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800">{getWorkRhythmSummary(yesterdayRhythm, isEnglish)}</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">
                      {isEnglish ? `Yesterday, ${durationLabel(yesterdayRhythm.totalWorkSec)} of reliable work was recognized.` : `昨天共识别到 ${durationZh(yesterdayRhythm.totalWorkSec)} 的可信工作片段。`}
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-amber-100 bg-white/80 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-gray-400">
                    <span>{isEnglish ? 'Most focused block' : '最投入的一段'}</span>
                    <span>{formatUtcStorageTime(yesterdayRhythm.focusItem.startAt)} – {getItemEndTime(yesterdayRhythm.focusItem)} · {isEnglish ? durationLabel(yesterdayRhythm.focusItem.durationSec) : durationZh(yesterdayRhythm.focusItem.durationSec)}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold leading-5 text-gray-800">
                    {yesterdayRhythm.focusItem.possibleActivity || yesterdayRhythm.focusItem.title}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex gap-3 rounded-xl border border-dashed border-amber-200 bg-white/70 p-3">
                <img src={duckImg} alt="" className="h-9 w-9 shrink-0 object-contain" />
                <div>
                  <p className="text-sm font-medium text-gray-700">{isEnglish ? 'No rhythm score for yesterday yet' : '昨天暂时不做节奏评分'}</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    {yesterdayReliableWorkSec > 0
                      ? (isEnglish ? `Semantic merging left only ${durationLabel(yesterdayReliableWorkSec)} of reliable work. A score needs at least 45 minutes.` : `语义合并后只有 ${durationZh(yesterdayReliableWorkSec)} 可信工作片段，满 45 分钟才会评分。`)
                      : (isEnglish ? 'There is not enough reliable work to evaluate yet.' : '还没有足够可信的工作片段可供评价。')}
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card className="p-5">
        <Card.Header>
          <div>
            <Card.Title>{t('todayTimelinePreview')}</Card.Title>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
              {Object.entries(activityLabels).map(([key, label]) => (
                <span key={key} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ACTIVITY_DOT_COLORS[key] }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
          <Button size="sm" variant="secondary" icon={ChevronRight} onClick={() => setPage('timeline')}>
            {isEnglish ? 'Full timeline' : '完整时间线'}
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
          <div className="flex items-center gap-2 text-xs text-gray-400"><Eye size={14} />{isEnglish ? 'AI recognition' : 'AI 识别'}</div>
          <div className="mt-2 text-xl font-semibold text-gray-900">{summary.count}</div>
          <div className="mt-1 text-xs text-gray-400">{isEnglish ? 'From vision_results' : '来自 vision_results'}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400"><FileText size={14} />{isEnglish ? 'Tracking records' : '追踪记录'}</div>
          <div className="mt-2 text-xl font-semibold text-gray-900">{todayRecords.length}</div>
          <div className="mt-1 text-xs text-gray-400">{isEnglish ? 'From records' : '来自 records'}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400"><Bell size={14} />{isEnglish ? 'Estimated finish' : '预计下班'}</div>
          <div className="mt-2 text-xl font-semibold text-gray-900">{prediction ?? '-'}</div>
          <div className="mt-1 text-xs text-gray-400">{prediction ? (isEnglish ? 'Based on the last 7 days' : '基于近 7 天数据') : (isEnglish ? 'Not enough data' : '数据不足')}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-gray-400"><AlertCircle size={14} />{isEnglish ? 'Needs review' : '待确认'}</div>
          <div className="mt-2 text-xl font-semibold text-gray-900">{lowConfidenceCount + gapCount}</div>
          <div className="mt-1 text-xs text-gray-400">{isEnglish ? 'Low-confidence or unrecorded segments' : '低置信或未记录段'}</div>
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

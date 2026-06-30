import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TodayPage } from './pages/TodayPage';
import { ReportPage } from './pages/ReportPage';
import { TimelinePage } from './pages/TimelinePage';
import { HeatmapPage } from './pages/HeatmapPage';
import { AppsPage } from './pages/AppsPage';
import { HistoryPage } from './pages/HistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { Toaster } from './components/ui/Toast';
import { useAppStore } from './stores/useAppStore';
import { useXiabanyaApi } from './hooks/useXiabanyaApi';

export type PageKey = 'today' | 'report' | 'timeline' | 'heatmap' | 'apps' | 'history' | 'settings';

const PAGE_TITLES: Record<PageKey, string> = {
  today: '今日工作台',
  report: '生成报告',
  timeline: '工作时间线',
  heatmap: '时段热力图',
  apps: '应用记录',
  history: '历史报告',
  settings: '设置',
};

const PAGE_COMPONENTS: Record<PageKey, React.FC> = {
  today: TodayPage,
  report: ReportPage,
  timeline: TimelinePage,
  heatmap: HeatmapPage,
  apps: AppsPage,
  history: HistoryPage,
  settings: SettingsPage,
};

export function App() {
  const { currentPage, setPage, setTrackerRunning, setVisionAutoRunning } = useAppStore();
  const api = useXiabanyaApi();

  // v2.2: 初始化时同步 tracker + vision auto 状态
  useEffect(() => {
    api.tracker.status()
      .then((s) => setTrackerRunning(s.running))
      .catch(() => {});
    api.vision.autoStatus()
      .then((s) => setVisionAutoRunning(s.running))
      .catch(() => {});
  }, []);

  // v2.2: 监听 vision:onResult 事件，新结果到达时自动刷新
  useEffect(() => {
    const unsub = api.vision.onResult(() => {
      // 新 vision result 到达，TodayPage 的定时刷新会自行处理，
      // 这里同步 visionAutoRunning 状态确保 UI 一致
      api.vision.autoStatus()
        .then((s) => setVisionAutoRunning(s.running))
        .catch(() => {});
    });
    return unsub;
  }, []);

  const PageComponent = PAGE_COMPONENTS[currentPage];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar currentPage={currentPage} onNavigate={setPage} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-gray-200 bg-white flex items-center px-6 shrink-0">
          <h1 className="text-lg font-semibold text-gray-800">{PAGE_TITLES[currentPage]}</h1>
        </header>
        <main className="flex-1 overflow-auto p-6 animate-fade-in" key={currentPage}>
          <PageComponent />
        </main>
      </div>
      <Toaster />
    </div>
  );
}

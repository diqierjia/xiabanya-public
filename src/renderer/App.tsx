import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TodayPage } from './pages/TodayPage';
import { TimelinePage } from './pages/TimelinePage';
import { AiPage } from './pages/AiPage';
import { MemoryPage } from './pages/MemoryPage';
import { ReviewPage } from './pages/ReviewPage';
import { InsightsPage } from './pages/InsightsPage';
import { SettingsPage } from './pages/SettingsPage';
import { RecordsPage } from './pages/RecordsPage';
import { Toaster } from './components/ui/Toast';
import { useAppStore } from './stores/useAppStore';
import { useXiabanyaApi } from './hooks/useXiabanyaApi';

export type PageKey = 'today' | 'ai' | 'timeline' | 'memory' | 'review' | 'insights' | 'settings' | 'records';

const PAGE_TITLES: Record<PageKey, string> = {
  today: '今天',
  ai: 'AI 小黄鸭',
  timeline: 'Timeline',
  memory: 'Memory',
  review: 'Review',
  insights: 'Insights',
  settings: '设置',
  records: 'AI 识别记录',
};

const PAGE_COMPONENTS: Record<PageKey, React.FC> = {
  today: TodayPage,
  timeline: TimelinePage,
  ai: AiPage,
  memory: MemoryPage,
  review: ReviewPage,
  insights: InsightsPage,
  settings: SettingsPage,
  records: RecordsPage,
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

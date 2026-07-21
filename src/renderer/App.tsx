import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { TodayPage } from './pages/TodayPage';
import { TimelinePage } from './pages/TimelinePage';
import { AiPage } from './pages/AiPage';
import { MemoryPage } from './pages/MemoryPage';
import { ReviewPage } from './pages/ReviewPage';
import { SettingsPage } from './pages/SettingsPage';
import { RecordsPage } from './pages/RecordsPage';
import { Toaster } from './components/ui/Toast';
import { useAppStore } from './stores/useAppStore';
import { useXiabanyaApi } from './hooks/useXiabanyaApi';
import { useSettingsStore } from './stores/useSettingsStore';
import { useTranslation } from './i18n';

export type PageKey = 'today' | 'ai' | 'timeline' | 'memory' | 'review' | 'settings' | 'records';

const PAGE_COMPONENTS: Record<PageKey, React.FC> = {
  today: TodayPage,
  timeline: TimelinePage,
  ai: AiPage,
  memory: MemoryPage,
  review: ReviewPage,
  settings: SettingsPage,
  records: RecordsPage,
};

export function App() {
  const { currentPage, setPage, setTrackerRunning, setVisionAutoRunning } = useAppStore();
  const fetchSettings = useSettingsStore((state) => state.fetchSettings);
  const { language, t } = useTranslation();
  const api = useXiabanyaApi();

  const pageTitles: Record<PageKey, string> = {
    today: t('today'), ai: t('ai'), timeline: t('timeline'), memory: t('memory'),
    review: t('review'), settings: t('settings'), records: t('records'),
  };

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

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
          <h1 className="text-lg font-semibold text-gray-800">{pageTitles[currentPage]}</h1>
        </header>
        <main className="flex-1 overflow-auto p-6 animate-fade-in" key={currentPage}>
          <PageComponent />
        </main>
      </div>
      <Toaster />
    </div>
  );
}

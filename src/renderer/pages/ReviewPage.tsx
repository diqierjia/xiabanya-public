import { useState } from 'react';
import { FileText, History } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ReportPage } from './ReportPage';
import { HistoryPage } from './HistoryPage';
import { useTranslation } from '../i18n';

type ReviewTab = 'create' | 'history';

export function ReviewPage() {
  const { isEnglish, t } = useTranslation();
  const [tab, setTab] = useState<ReviewTab>('create');

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">{t('output')}</p>
          <h2 className="text-xl font-semibold text-gray-900 mt-1">{isEnglish ? 'Create review material from a trustworthy timeline' : '从可信时间线生成复盘材料'}</h2>
          <p className="text-sm text-gray-500 mt-2 max-w-2xl">
            {isEnglish ? 'Work reports, full-day reviews, weekly reports, and output history are managed here.' : '工作日报、全天回顾、周报和历史输出都在这里管理。后续会把素材确认、低可信过滤和引用来源合并进同一条生成流程。'}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant={tab === 'create' ? 'success' : 'secondary'}
            size="sm"
            icon={FileText}
            onClick={() => setTab('create')}
          >
            {t('createOutput')}
          </Button>
          <Button
            variant={tab === 'history' ? 'success' : 'secondary'}
            size="sm"
            icon={History}
            onClick={() => setTab('history')}
          >
            {t('outputHistory')}
          </Button>
        </div>
      </div>

      {tab === 'create' ? <ReportPage /> : <HistoryPage />}
    </div>
  );
}

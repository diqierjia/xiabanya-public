import { AlertCircle, Brain, Eye } from 'lucide-react';
import { Card } from '../ui/Card';
import type { TimeMapItem } from './ActivityBlock';
import { getDurationLabel } from './timeMapUtils';
import { formatUtcStorageTime } from '../../../shared/time';
import { useTranslation } from '../../i18n';

interface DetailPanelProps {
  item: TimeMapItem | null;
  className?: string;
}

/**
 * TimeMap 右侧详情面板。
 * 显示选中时间块的屏幕事实、AI 推断、可信度、活动类型、应用来源及原始证据。
 */
export function DetailPanel({ item, className = '' }: DetailPanelProps) {
  const { t, enumLabel } = useTranslation();
  return (
    <Card className={`p-4 h-fit sticky top-0 ${className}`}>
      {item ? (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-gray-400">
                {formatUtcStorageTime(item.startAt)} · {getDurationLabel(item.durationSec)}
              </p>
              <h3 className="text-sm font-semibold text-gray-900 mt-1">{item.title}</h3>
            </div>
          </div>

          <div className="space-y-4 mt-4">
            <div>
              <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                <Eye size={12} />
                {t('screenFact')}
              </p>
              <p className="text-sm text-gray-700 leading-6">{item.observedFact || t('noScreenFact')}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                <Brain size={12} />
                {t('aiInference')}
              </p>
              <p className="text-sm text-gray-700 leading-6">{item.possibleActivity || t('noInference')}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-gray-50 p-2">
                <p className="text-gray-400">{t('confidence')}</p>
                <p className="text-gray-800 mt-1">{enumLabel(item.confidence || '-')}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-2">
                <p className="text-gray-400">{t('activityType')}</p>
                <p className="text-gray-800 mt-1">{enumLabel(item.activityType || '-')}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-2 col-span-2">
                <p className="text-gray-400">{t('application')}</p>
                <p className="text-gray-800 mt-1 truncate">{item.app || '-'}</p>
              </div>
            </div>
            {item.evidenceItems && item.evidenceItems.length > 1 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">{t('sourceEvidence')} ({item.evidenceItems.length})</p>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {item.evidenceItems.map((evidence) => (
                    <div key={evidence.id} className="rounded-lg bg-gray-50 p-2">
                      <p className="text-[11px] text-gray-400">
                        {formatUtcStorageTime(evidence.startAt)} · {getDurationLabel(evidence.durationSec)}
                      </p>
                      <p className="text-xs text-gray-800 mt-1 truncate">{evidence.title}</p>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {evidence.observedFact || evidence.possibleActivity || t('noDescription')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <AlertCircle size={24} className="text-gray-300 mx-auto" />
          <h3 className="text-sm font-medium text-gray-700 mt-3">{t('selectTimeBlock')}</h3>
          <p className="text-xs text-gray-500 mt-2 leading-5">
            {t('selectTimeBlockHint')}
          </p>
        </div>
      )}
    </Card>
  );
}

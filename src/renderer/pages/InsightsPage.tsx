import { useState } from 'react';
import { BarChart3, Grid3X3 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { HeatmapPage } from './HeatmapPage';
import { AppsPage } from './AppsPage';

type InsightsTab = 'rhythm' | 'apps';

export function InsightsPage() {
  const [tab, setTab] = useState<InsightsTab>('rhythm');

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">节奏层</p>
          <h2 className="text-xl font-semibold text-gray-900 mt-1">理解今天的工作节奏</h2>
          <p className="text-sm text-gray-500 mt-2 max-w-2xl">
            这里先聚合已有热力图和应用统计。后续会升级为专注段、频繁切换段、空闲段和周趋势的节奏地图。
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant={tab === 'rhythm' ? 'success' : 'secondary'}
            size="sm"
            icon={Grid3X3}
            onClick={() => setTab('rhythm')}
          >
            今日节奏
          </Button>
          <Button
            variant={tab === 'apps' ? 'success' : 'secondary'}
            size="sm"
            icon={BarChart3}
            onClick={() => setTab('apps')}
          >
            应用分布
          </Button>
        </div>
      </div>

      {tab === 'rhythm' ? <HeatmapPage /> : <AppsPage />}
    </div>
  );
}

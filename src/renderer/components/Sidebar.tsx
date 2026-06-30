import {
  LayoutDashboard,
  FileText,
  Clock,
  Grid3X3,
  Monitor,
  History,
  Settings,
} from 'lucide-react';
import type { PageKey } from '../App';
import logoImg from '../assets/xiabanya-logo.svg';

interface SidebarProps {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
}

interface NavGroup {
  label: string;
  items: { key: PageKey; label: string; icon: React.ElementType }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: '工作记录',
    items: [
      { key: 'today', label: '今日', icon: LayoutDashboard },
      { key: 'timeline', label: '时间线', icon: Clock },
      { key: 'heatmap', label: '热力图', icon: Grid3X3 },
      { key: 'apps', label: '应用', icon: Monitor },
    ],
  },
  {
    label: '报告',
    items: [
      { key: 'report', label: '生成报告', icon: FileText },
      { key: 'history', label: '历史报告', icon: History },
    ],
  },
  {
    label: '设置',
    items: [
      { key: 'settings', label: '设置', icon: Settings },
    ],
  },
];

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside className="w-[208px] bg-gray-900 text-gray-300 flex flex-col shrink-0">
      {/* Brand Logo */}
      <div className="h-16 flex items-center px-4 border-b border-gray-700 gap-3">
        <div className="w-12 h-12 flex items-center justify-center p-0 border-0 bg-transparent shrink-0">
          <img src={logoImg} alt="下班鸭" className="w-full h-full object-contain" />
        </div>
        <span className="text-xl font-bold text-brand-400">下班鸭</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-3">
            <p className="px-5 py-1 text-xs font-medium text-gray-500 uppercase tracking-wide">
              {group.label}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = currentPage === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                    active
                      ? 'bg-brand-700/60 text-brand-100 border-l-2 border-brand-400'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border-l-2 border-transparent'
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* App version */}
      <div className="px-5 py-3 border-t border-gray-700">
        <span className="text-xs text-gray-600">v2.3</span>
      </div>
    </aside>
  );
}

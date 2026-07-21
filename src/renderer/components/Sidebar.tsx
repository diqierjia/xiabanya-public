import {
  Bot,
  Clock,
  FileText,
  LayoutDashboard,
  MemoryStick,
  ScrollText,
  Settings,
} from 'lucide-react';
import type { PageKey } from '../App';
import logoImg from '../assets/xiabanya-logo.svg';
import { useTranslation } from '../i18n';

interface SidebarProps {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { language, t } = useTranslation();
  const navItems: { key: PageKey; label: string; icon: React.ElementType }[] = [
    { key: 'today', label: t('today'), icon: LayoutDashboard },
    { key: 'ai', label: t('ai'), icon: Bot },
    { key: 'timeline', label: t('timeline'), icon: Clock },
    { key: 'records', label: t('records'), icon: ScrollText },
    { key: 'memory', label: t('memory'), icon: MemoryStick },
    { key: 'review', label: t('review'), icon: FileText },
  ];
  return (
    <aside className="w-[208px] bg-gray-900 text-gray-300 flex flex-col shrink-0">
      {/* Brand Logo */}
      <div className="h-16 flex items-center px-4 border-b border-gray-700 gap-3">
        <div className="w-12 h-12 flex items-center justify-center p-0 border-0 bg-transparent shrink-0">
          <img src={logoImg} alt={t('ai')} className="w-full h-full object-contain" />
        </div>
        <span className="text-xl font-bold text-brand-400">{language === 'en-US' ? 'Ducky' : '下班鸭'}</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {navItems.map((item) => {
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
      </nav>

      {/* App version */}
      <div className="px-5 py-3 border-t border-gray-700">
        <button
          onClick={() => onNavigate('settings')}
          className={`mb-3 w-full flex items-center gap-3 py-2 text-sm transition-colors ${
            currentPage === 'settings'
              ? 'text-brand-100'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <Settings size={18} />
          <span>{t('settings')}</span>
        </button>
        <span className="text-xs text-gray-600">v2.6.3 · {language === 'zh-CN' ? '中文' : 'EN'}</span>
      </div>
    </aside>
  );
}

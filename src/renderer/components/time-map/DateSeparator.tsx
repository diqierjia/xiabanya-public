import { useTranslation } from '../../i18n';

interface DateSeparatorProps {
  /** 日期字符串，如 "2025-07-08" */
  dateStr: string;
}

/**
 * 格式化日期为中文显示：M月D日（周X）。
 * 使用原生 Intl API，无需额外依赖。
 */
function formatDateLabel(dateStr: string, language: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  if (isNaN(date.getTime())) return dateStr;

  if (language === 'en-US') return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
  const weekday = date.toLocaleDateString('zh-CN', { weekday: 'short' });
  return `${date.getMonth() + 1}月${date.getDate()}日（${weekday}）`;
}

/**
 * 日期分隔条。
 * 在跨天时间轴中标注日期边界，sticky 吸顶。
 */
export function DateSeparator({ dateStr }: DateSeparatorProps) {
  const { language } = useTranslation();
  return (
    <div className="sticky top-0 z-10 bg-gray-50/80 backdrop-blur-sm py-2 px-4 border-b border-gray-200 text-sm font-medium text-gray-500">
      {formatDateLabel(dateStr, language)}
    </div>
  );
}

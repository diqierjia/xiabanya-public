export type BadgeSize = 'sm' | 'md';
import { useTranslation } from '../../i18n';

export interface BadgeProps {
  category: string;
  size?: BadgeSize;
  color?: string;
  className?: string;
}

/** 分类 → 颜色样式映射 (PRD v2.1) */
const CATEGORY_COLOR_MAP: Record<string, string> = {
  '代码开发': 'bg-blue-50 text-blue-700',
  '文稿写作': 'bg-amber-50 text-amber-700',
  '视觉设计': 'bg-pink-50 text-pink-700',
  '数据处理': 'bg-cyan-50 text-cyan-700',
  '文献与阅读': 'bg-green-50 text-green-700',
  '沟通与协作': 'bg-purple-50 text-purple-700',
  '音视频会议': 'bg-indigo-50 text-indigo-700',
  '规划与管理': 'bg-rose-50 text-rose-700',
  '检索与AI': 'bg-violet-50 text-violet-700',
  '系统与配置': 'bg-orange-50 text-orange-700',
  '休闲娱乐': 'bg-gray-100 text-gray-600',
  '其他': 'bg-gray-50 text-gray-500',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
};

export function Badge({
  category,
  size = 'md',
  color,
  className = '',
}: BadgeProps) {
  const { categoryLabel } = useTranslation();
  const defaultColor = CATEGORY_COLOR_MAP[category] || 'bg-gray-100 text-gray-600';

  return (
    <span
      className={`inline-block rounded-full font-medium ${sizeStyles[size]} ${
        color ? '' : defaultColor
      } ${className}`}
      style={color ? { backgroundColor: `${color}18`, color } : undefined}
    >
      {categoryLabel(category)}
    </span>
  );
}

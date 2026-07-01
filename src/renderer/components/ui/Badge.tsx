export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  category: string;
  size?: BadgeSize;
  color?: string;
  className?: string;
}

/** 分类 → 颜色样式映射 (PRD v2.1) */
const CATEGORY_COLOR_MAP: Record<string, string> = {
  '开发': 'bg-blue-50 text-blue-700',
  '沟通': 'bg-purple-50 text-purple-700',
  '设计': 'bg-pink-50 text-pink-700',
  '文档': 'bg-amber-50 text-amber-700',
  '会议': 'bg-indigo-50 text-indigo-700',
  '学习': 'bg-green-50 text-green-700',
  '摸鱼': 'bg-gray-100 text-gray-600',
  '产品': 'bg-rose-50 text-rose-700',
  '数据分析': 'bg-teal-50 text-teal-700',
  '研究': 'bg-violet-50 text-violet-700',
  'AI/工具': 'bg-cyan-50 text-cyan-700',
  '配置环境': 'bg-orange-50 text-orange-700',
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
  const defaultColor = CATEGORY_COLOR_MAP[category] || 'bg-gray-100 text-gray-600';

  return (
    <span
      className={`inline-block rounded-full font-medium ${sizeStyles[size]} ${
        color ? '' : defaultColor
      } ${className}`}
      style={color ? { backgroundColor: `${color}18`, color } : undefined}
    >
      {category}
    </span>
  );
}

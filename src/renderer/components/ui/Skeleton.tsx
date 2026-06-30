export type SkeletonVariant = 'text' | 'card' | 'circle' | 'rect';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  className?: string;
}

const variantStyles: Record<SkeletonVariant, string> = {
  text: 'h-4 bg-gray-200 rounded animate-pulse',
  card: 'h-24 bg-gray-100 rounded-xl animate-pulse',
  circle: 'w-8 h-8 bg-gray-200 rounded-full animate-pulse',
  rect: 'bg-gray-200 rounded animate-pulse',
};

export function Skeleton({ variant = 'text', className = '' }: SkeletonProps) {
  return (
    <div className={`${variantStyles[variant]} ${className}`} />
  );
}

/** 列表骨架屏：连续 N 行 */
interface SkeletonListProps {
  count?: number;
  className?: string;
}

function SkeletonList({ count = 5, className = '' }: SkeletonListProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className={i === count - 1 ? 'w-3/4' : 'w-full'}
        />
      ))}
    </div>
  );
}

/** 卡片网格骨架屏 */
interface SkeletonCardGridProps {
  count?: number;
  cols?: number;
  className?: string;
}

function SkeletonCardGrid({ count = 4, cols = 2, className = '' }: SkeletonCardGridProps) {
  return (
    <div
      className={`grid gap-4 ${className}`}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} variant="card" />
      ))}
    </div>
  );
}

Skeleton.List = SkeletonList;
Skeleton.CardGrid = SkeletonCardGrid;

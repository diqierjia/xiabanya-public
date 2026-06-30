import { Button } from './Button';
import type { ButtonSize } from './Button';

export interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 text-center ${className}`}
    >
      <Icon size={48} className="text-gray-300 mb-4" />
      <h3 className="text-sm font-medium text-gray-500 mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-gray-400 mb-4 max-w-sm">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

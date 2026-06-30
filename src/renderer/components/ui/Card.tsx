import type { ReactNode } from 'react';

export type CardVariant = 'default' | 'elevated';

export interface CardProps {
  variant?: CardVariant;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}

interface CardSubProps {
  className?: string;
  children: ReactNode;
}

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-white rounded-xl border border-gray-200',
  elevated: 'bg-white rounded-xl border border-gray-200 shadow-sm',
};

export function Card({
  variant = 'default',
  className = '',
  onClick,
  children,
}: CardProps) {
  return (
    <div
      className={`${variantStyles[variant]} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}

function CardHeader({ className = '', children }: CardSubProps) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`}>
      {children}
    </div>
  );
}

function CardTitle({ className = '', children }: CardSubProps) {
  return (
    <h3 className={`text-sm font-semibold text-gray-700 ${className}`}>
      {children}
    </h3>
  );
}

function CardContent({ className = '', children }: CardSubProps) {
  return <div className={className}>{children}</div>;
}

Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Content = CardContent;

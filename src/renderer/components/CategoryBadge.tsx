import { Badge } from './ui/Badge';

interface CategoryBadgeProps {
  category: string;
}

/**
 * @deprecated Use `Badge` from './ui/Badge' instead.
 * This component is kept for backward compatibility.
 */
export function CategoryBadge({ category }: CategoryBadgeProps) {
  return <Badge category={category} />;
}

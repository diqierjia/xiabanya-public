import type { Category } from '../../../shared/types';
import type { TimeMapItem } from './ActivityBlock';

const MEDIUM_COMPATIBLE_CATEGORY_GROUPS: Category[][] = [
  ['代码开发', '系统与配置', '检索与AI', '数据处理', '文献与阅读'],
  ['文稿写作', '检索与AI', '文献与阅读', '数据处理', '视觉设计'],
  ['文献与阅读', '检索与AI', '规划与管理', '数据处理', '文稿写作'],
  ['沟通与协作', '音视频会议', '规划与管理'],
  ['视觉设计', '检索与AI', '文稿写作', '代码开发'],
];

export function areCategoriesCompatibleForMediumMerge(previous: Category, current: Category): boolean {
  if (previous === current) return true;
  if (previous === '其他' || current === '其他') return false;
  if (previous === '休闲娱乐' || current === '休闲娱乐') return false;

  return MEDIUM_COMPATIBLE_CATEGORY_GROUPS.some(
    (group) => group.includes(previous) && group.includes(current)
  );
}

export function dominantCategoryByDuration(items: Pick<TimeMapItem, 'category' | 'durationSec'>[]): Category {
  const durations = new Map<Category, number>();
  let best = items[0]?.category || '其他';
  let bestDuration = -1;

  for (const item of items) {
    const duration = Math.max(0, item.durationSec || 0);
    const total = (durations.get(item.category) || 0) + duration;
    durations.set(item.category, total);
    if (total >= bestDuration) {
      best = item.category;
      bestDuration = total;
    }
  }

  return best;
}

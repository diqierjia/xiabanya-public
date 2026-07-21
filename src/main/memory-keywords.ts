export type RealtimeMemoryCriticality = 'safety' | 'identity';

/**
 * 仅作为实时记忆的本地候选触发器：命中后仍须由轻量模型确认是用户本人、明确且当前有效的事实。
 * 词表独立于提取逻辑，后续可在这里低成本扩充。
 */
const REALTIME_MEMORY_KEYWORDS: Record<RealtimeMemoryCriticality, readonly string[]> = {
  safety: [
    '过敏', '哮喘', '糖尿病', '花生', '青霉素', '禁忌', '不能吃', '不能碰', '紧急联系人',
  ],
  identity: [
    '我叫', '我是', '住在', '研究生', '导师', '本科', '学校', '公司', '职位',
  ],
};

const REALTIME_MEMORY_PATTERNS: Record<RealtimeMemoryCriticality, readonly RegExp[]> = {
  safety: [],
  identity: [
    /我在.{1,40}(?:工作|上班)/,
  ],
};

export function matchRealtimeMemoryCriticality(message: string): RealtimeMemoryCriticality | undefined {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return undefined;
  for (const criticality of ['safety', 'identity'] as const) {
    if (REALTIME_MEMORY_KEYWORDS[criticality].some((keyword) => normalized.includes(keyword))) return criticality;
    if (REALTIME_MEMORY_PATTERNS[criticality].some((pattern) => pattern.test(normalized))) return criticality;
  }
  return undefined;
}

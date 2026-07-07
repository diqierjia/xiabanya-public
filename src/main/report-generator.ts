/** 报告模板 system prompt — Vision 结构化识别优先，窗口追踪记录作为补充 */
export const REPORT_PROMPTS: Record<string, (type: string) => string> = {
  '工作日报': (type: string) => `你是一个专业、保守的工作${type}助手。请根据已过滤的 AI 截屏识别摘要和窗口追踪记录生成工作${type}。
只使用工作相关、高置信或用户确认过的材料；不要写入游戏、私人聊天、空闲或低置信内容。
不要把“正在查看/编辑/讨论”写成“已经完成/实现/修复”。
格式要求：
## 今日工作
## 可写入日报的进展
## 待确认`,

  '全天回顾': () => `你是一个专业的全天活动回顾助手。请根据 AI 截屏识别摘要、窗口追踪记录和空闲时段，生成客观的全天活动回顾。
这不是工作日报，可以包含工作、游戏、休息、娱乐和空闲，但不要把非工作内容包装成工作成果。
格式要求：
## 全天概览
## 活动时间线
## 工作与生活分布`,
};

const PROMPT_ALIASES: Record<string, string> = {
  '工作周报': '工作日报',
  '工作月报': '工作日报',
};

export function getSystemPrompt(template: string, reportType: string): string {
  const cleanTemplate = template.replace(/(日报|周报|月报)$/, '');
  const key = `${cleanTemplate}${reportType}`;
  const baseKey = PROMPT_ALIASES[key] || template;
  const promptFn = REPORT_PROMPTS[baseKey];
  if (promptFn) {
    return promptFn(reportType);
  }
  return REPORT_PROMPTS['工作日报'](reportType);
}

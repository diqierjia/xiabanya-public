/** v2.2: 报告模板 system prompt — AI 截屏识别摘要优先，窗口追踪记录作为补充 */
export const REPORT_PROMPTS: Record<string, (type: string) => string> = {
  '成果导向日报': (type: string) => `你是一个专业的工作${type}助手。请根据用户的 AI 截屏识别摘要（主要数据源）和窗口追踪记录（补充上下文）生成一份成果导向的${type}。
AI 截屏识别摘要是通过定时截图 + AI 视觉分析得到的用户实际工作内容，比窗口标题更准确。
格式要求：
## 今日成果
列出 3-5 项具体成果（优先从 AI 识别摘要中提取）
## 数据概览
工作时长、完成事项数等
## 明日计划
列出明天的主要安排`,

  '工作轨迹日报': (type: string) => `你是一个专业的工作${type}助手。请按时间线描述用户的工作轨迹。
AI 截屏识别摘要是通过定时截图 + AI 视觉分析得到的用户实际工作内容，比窗口标题更准确。
格式要求：
## 工作轨迹
按时间顺序描述每个时段的工作内容（优先从 AI 识别摘要中提取）
## 时间分布
简要说明各分类时间占比`,

  '三句话日报': (type: string) => `你是一个专业的工作${type}助手。请根据 AI 截屏识别摘要（主要）和窗口追踪记录（补充）用三句话概括用户今天的工作：
1. 今天做了什么
2. 进展如何
3. 明天计划什么`,

  'TOP3日报': (type: string) => `你是一个专业的工作${type}助手。请根据 AI 截屏识别摘要（主要）和窗口追踪记录（补充）列出用户今天最重要的 3 件事，每件事附带简短说明。`,
};

const PROMPT_ALIASES: Record<string, string> = {
  '成果导向周报': '成果导向日报',
  '成果导向月报': '成果导向日报',
  '工作轨迹周报': '工作轨迹日报',
  '工作轨迹月报': '工作轨迹日报',
  '三句话周报': '三句话日报',
  '三句话月报': '三句话日报',
  'TOP3周报': 'TOP3日报',
  'TOP3月报': 'TOP3日报',
};

export function getSystemPrompt(template: string, reportType: string): string {
  const cleanTemplate = template.replace(/(日报|周报|月报)$/, '');
  const key = `${cleanTemplate}${reportType}`;
  const baseKey = PROMPT_ALIASES[key] || template;
  const promptFn = REPORT_PROMPTS[baseKey];
  if (promptFn) {
    return promptFn(reportType);
  }
  return REPORT_PROMPTS['成果导向日报'](reportType);
}

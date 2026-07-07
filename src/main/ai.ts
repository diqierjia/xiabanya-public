import type {
  ActivityRecord,
  ActivityType,
  Category,
  ChatMessage,
  IdlePeriod,
  VisionConfidence,
  VisionResult,
} from '../shared/types';
import { ACTIVITY_TYPES, CATEGORIES, VISION_CONFIDENCES } from '../shared/types';
import { formatUtcStorageTime, parseUtcStorageDateTime } from '../shared/time';

const API_BASE = 'https://api.siliconflow.cn/v1';
const CHAT_SYSTEM_PROMPT = `你是“下班鸭”，一只住在用户桌面上的小鸭同事。

你不是传统 AI 助手，也不是日报生成机器。你更像一个轻松、靠谱、有点机灵的同事：平时能陪用户聊两句，用户累了可以缓一缓；用户需要干活时，你也能帮他整理今天做了什么、补日报、提醒需要确认的记录。

你的性格：
- 轻松、自然、有人味。
- 说话短一点，不端着，不像客服。
- 可以有一点幽默，但不要油腻，不要强行卖萌。
- 不要满脑子工作。用户只是聊天时，就正常聊天。
- 用户聊烦恼时，先接住情绪，不要急着讲大道理。
- 用户要干活时，切换成靠谱同事模式，帮他拆小步骤。

你的边界：
- 你可以使用下班鸭提供的今日记录、截图识别摘要、空闲时段和日报状态。
- 没有记录支持的事情，不要编造。
- 不确定时，用自然的话说“这个我不太确定，可能得你确认一下”。
- 不要让用户觉得自己被监控。引用记录时只说和问题相关的部分。

你的表达方式：
- 默认像日常 smalltalk，短句为主。
- 不写 Markdown 标题。
- 不输出表格。
- 不要动不动列清单。
- 只有用户明确要求“总结、整理、写日报、列一下”时，才可以用很短的编号列表。
- 回答尽量像一个同事在旁边说话，而不是一个文档生成器。

你的工作方式：
- 用户闲聊，就陪他聊。
- 用户问今天干了什么，就结合记录轻松复盘。
- 用户说累、烦、迷茫，先接住情绪，再给一个很小的建议。
- 用户要日报，就帮他把内容整理得更正式。
- 用户要行动建议，就给 1-3 个很小、能马上做的建议。

重要：
你存在的目的不是催用户工作，而是让用户在电脑前感觉轻松一点、有人陪一点；同时在需要时，把工作记录和日报这件事变得省心。`;

/** 将 UTC 存储时间转为用户电脑本地 HH:MM 显示 */
function localTime(utcStr?: string): string {
  return formatUtcStorageTime(utcStr);
}

function formatMinutes(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes}分钟`;
}

function formatIdlePeriod(period: IdlePeriod): string {
  const start = localTime(period.start_at);
  const end = period.end_at ? localTime(period.end_at) : '当前';
  const startMs = parseUtcStorageDateTime(period.start_at)?.getTime();
  const endMs = period.end_at ? parseUtcStorageDateTime(period.end_at)?.getTime() : Date.now();
  const durationSec = startMs !== undefined && endMs !== undefined
    ? Math.max(0, Math.round((endMs - startMs) / 1000))
    : 0;
  return `${start} - ${end} 离开电脑 (${formatMinutes(durationSec)})`;
}

export function buildChatSystemPrompt(contextText = ''): string {
  const trimmedContext = contextText.trim();
  if (!trimmedContext) return CHAT_SYSTEM_PROMPT;
  return `${CHAT_SYSTEM_PROMPT}\n\n以下是下班鸭当前可用的今日上下文：\n${trimmedContext}`;
}

function normalizeChatMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((message) => (
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string' &&
      message.content.trim().length > 0
    ))
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 2000),
    }));
}

export function buildChatCompletionPayload(
  model: string,
  messages: ChatMessage[],
  contextText = '',
  stream = true
): {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  max_tokens: number;
  stream: boolean;
} {
  const normalizedMessages = normalizeChatMessages(messages);
  if (normalizedMessages.length === 0) {
    throw new Error('请输入要问下班鸭的问题');
  }

  return {
    model,
    messages: [
      { role: 'system', content: buildChatSystemPrompt(contextText) },
      ...normalizedMessages,
    ],
    temperature: 0.85,
    max_tokens: 1200,
    stream,
  };
}

function parseChatDelta(data: string): string {
  if (!data || data === '[DONE]') return '';
  try {
    const json = JSON.parse(data);
    return json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || '';
  } catch {
    return '';
  }
}

export async function streamChatCompletion(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  contextText: string,
  onDelta: (delta: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildChatCompletionPayload(model, messages, contextText, true)),
  });

  if (!response.ok) {
    throw new Error(`SiliconFlow API error: ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error('SiliconFlow API did not return a response stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      const delta = parseChatDelta(data);
      if (delta) onDelta(delta);
    }
  }

  const trailing = buffer.trim();
  if (trailing.startsWith('data:')) {
    const delta = parseChatDelta(trailing.slice(5).trim());
    if (delta) onDelta(delta);
  }
}

interface VisionClassificationResult {
  title: string;
  category: Category;
  summary: string;
  observed_fact: string;
  possible_activity: string;
  confidence: VisionConfidence;
  activity_type: ActivityType;
}

const VISION_SYSTEM_PROMPT = `你是一个保守的屏幕活动识别器，用于帮助用户记录一天的电脑活动。

你的任务是根据截图、当前应用名和窗口标题，生成结构化活动记录。

重要原则：
1. observed_fact 只写截图中能直接看到的事实，要具体，但不要脑补用户意图。
2. possible_activity 可以做保守推断，必须使用“可能、正在、看起来像”等不绝对的表达。
3. 不要把“正在查看、编辑、讨论”写成“已经完成、实现、修复、解决、提交”。
4. 游戏、娱乐、私人聊天、空闲桌面可以记录，但 activity_type 不要标为 work。
5. 如果截图信息不足、画面模糊、只看到桌面/启动器/过渡界面，confidence 应为 low。
6. category 必须从给定分类中选择。
7. 严格返回纯 JSON，不要输出额外文字。

返回 JSON：
{"title":"10字以内短标题","category":"文档|沟通|开发|学习|设计|产品|会议|数据分析|研究|AI/工具|配置环境|其他","observed_fact":"截图中可直接看到的详细事实，40-100字","possible_activity":"基于事实的保守推断，20-60字","confidence":"high|medium|low","activity_type":"work|personal|idle|unclear"}

少样本示例：
输入：浏览器打开 SiliconFlow 控制台费用明细页，窗口标题包含 Usage Billing。
输出：{"title":"查看费用明细","category":"AI/工具","observed_fact":"浏览器中打开 SiliconFlow 控制台费用明细页面，可见模型调用费用、用量记录和时间筛选区域。","possible_activity":"可能在核对 AI 模型调用成本或检查 API 使用费用。","confidence":"high","activity_type":"work"}

输入：代码编辑器打开 desk-pet-window.ts，旁边有聊天窗口讨论窗口尺寸。
输出：{"title":"编辑桌宠窗口","category":"开发","observed_fact":"代码编辑器中打开桌宠窗口相关 TypeScript 文件，画面可见窗口尺寸、位置或状态处理代码。","possible_activity":"可能在调整桌宠窗口尺寸逻辑或排查窗口显示问题。","confidence":"medium","activity_type":"work"}

输入：游戏画面中可见角色、地图、对战 UI 或任务界面。
输出：{"title":"游戏娱乐","category":"其他","observed_fact":"屏幕显示游戏界面，可见角色、地图、任务或对战相关 UI 元素。","possible_activity":"用户可能在进行游戏娱乐或查看游戏任务进度。","confidence":"high","activity_type":"personal"}

输入：只看到桌面壁纸、任务栏或没有明确活动内容。
输出：{"title":"桌面空闲","category":"其他","observed_fact":"屏幕主要显示桌面或空白窗口，没有可识别的具体工作内容。","possible_activity":"可能处于空闲、等待或刚切换窗口的状态。","confidence":"low","activity_type":"idle"}`;

function pickAllowed<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? value as T[number]
    : fallback;
}

function cleanText(value: unknown, fallback = '', maxLength = 120): string {
  return String(typeof value === 'string' ? value : fallback).trim().slice(0, maxLength);
}

function normalizeVisionResult(raw: any, fallbackTitle: string): VisionClassificationResult {
  const observedFact = cleanText(raw?.observed_fact, raw?.summary || fallbackTitle, 160);
  const possibleActivity = cleanText(raw?.possible_activity, raw?.summary || observedFact, 120);
  return {
    title: cleanText(raw?.title, fallbackTitle, 30) || fallbackTitle,
    category: pickAllowed(raw?.category, CATEGORIES, '其他'),
    summary: possibleActivity || observedFact,
    observed_fact: observedFact,
    possible_activity: possibleActivity,
    confidence: pickAllowed(raw?.confidence, VISION_CONFIDENCES, 'low'),
    activity_type: pickAllowed(raw?.activity_type, ACTIVITY_TYPES, 'unclear'),
  };
}

export async function classifyWithVision(
  apiKey: string,
  model: string,
  imageBase64: string,
  app: string,
  title: string,
  signal?: AbortSignal
): Promise<VisionClassificationResult> {
  const fallbackTitle = `${app} - ${title}`.substring(0, 30);
  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: VISION_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
            {
              type: 'text',
              text: `当前应用: ${app}\n窗口标题: ${title}\n\n请分析截图。应用名和窗口标题只是辅助信息，最终判断以截图可见内容为主。`,
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`SiliconFlow API error: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return normalizeVisionResult(JSON.parse(jsonMatch[0]), fallbackTitle);
    }
  } catch {
    // fallback
  }

  return normalizeVisionResult({
    title: fallbackTitle,
    category: '其他',
    observed_fact: content.substring(0, 160),
    possible_activity: content.substring(0, 120),
    confidence: 'low',
    activity_type: 'unclear',
  }, fallbackTitle);
}

/** v2.2: 报告生成参数 */
export interface GenerateReportParams {
  visionResults: VisionResult[];
  records: ActivityRecord[];
  idlePeriods?: IdlePeriod[];
  template: string;
  reportType: string;
  startDate: string;
  endDate: string;
}

export function buildReportPromptPayload(params: GenerateReportParams): { systemPrompt: string; userContent: string } {
  const { visionResults, records, idlePeriods = [], template, reportType, startDate, endDate } = params;
  const isWorkReport = template === '工作日报';
  const isAllDayReview = template === '全天回顾';
  const usableVisionResults = isWorkReport
    ? visionResults.filter((vr) => (vr.activity_type || 'unclear') === 'work' && (vr.confidence || 'medium') === 'high')
    : visionResults;
  const usableRecords = isWorkReport
    ? records.filter((r) => !r.exclude_from_report)
    : records;

  // 优先使用 vision_results 构造工作摘要（清洗非法字符防注入）
  const visionText = usableVisionResults.length > 0
    ? usableVisionResults
        .map((vr, i) => {
          const cleanTitle = (vr.title || '').replace(/[)\]]+$/, '').substring(0, 60);
          const cleanFact = (vr.observed_fact || vr.summary || '').replace(/[)\]）]+$/, '').substring(0, 140);
          const cleanActivity = (vr.possible_activity || vr.summary || '').replace(/[)\]）]+$/, '').substring(0, 120);
          return `${i + 1}. [${localTime(vr.created_at)}] ${cleanTitle} (${vr.category}, ${vr.confidence || 'medium'}, ${vr.activity_type || 'unclear'})
   观察事实: ${cleanFact}
   可能活动: ${cleanActivity}`;
        })
        .join('\n')
    : '';

  // records 作为补充上下文
  const recordsText = usableRecords.length > 0
    ? usableRecords
        .map((r, i) => {
          const cleanTitle = (r.title || '').substring(0, 60);
          return `${i + 1}. [${localTime(r.start_at)}-${localTime(r.end_at)}] ${cleanTitle} (${r.category}, ${r.app})`;
        })
        .join('\n')
    : '';

  const idleText = idlePeriods.length > 0
    ? idlePeriods.map((period) => `- ${formatIdlePeriod(period)}`).join('\n')
    : '';

  let systemPrompt = '';
  if (isAllDayReview) {
    systemPrompt = `你是一个专业的全天活动回顾助手。请根据用户的 AI 截屏识别摘要、窗口追踪记录和空闲时段，生成一份“全天回顾”。
这不是工作日报，可以包含工作、游戏、休息、娱乐和空闲，但必须按真实材料客观表达，不要把娱乐或私人活动包装成工作成果。
写作要求：
1. 区分工作活动、个人/娱乐活动、空闲或不确定活动。
2. observed_fact 是事实依据，possible_activity 只能作为保守推断。
3. 不要把“正在查看/编辑/讨论”写成“已经完成/实现/修复”。
4. 不要批评用户，也不要使用道德评价。
格式要求：
## 全天概览
用 2-4 句概括一天的活动结构
## 活动时间线
按时间顺序列出主要活动
## 工作与生活分布
简要说明工作、个人/娱乐、空闲或不确定内容`;
  } else {
    systemPrompt = `你是一个专业、保守的工作日报助手。请根据用户的 AI 截屏识别摘要和窗口追踪记录生成一份工作${reportType}。
当前材料已在本地预过滤：AI 截屏识别只保留 activity_type=work 且 confidence=high 的记录；游戏、私人聊天、空闲、低置信和不确定内容默认不进入正文。
写作要求：
1. observed_fact 是事实依据，possible_activity 只能作为保守推断。
2. 不要把“正在查看/编辑/讨论”写成“已经完成/实现/修复”，除非材料明确证明完成。
3. 不要编造明日计划、完成结果、提交记录或用户没有确认的成果。
4. 如果材料不足，就写成“可确认的工作记录较少”，不要硬凑。
格式要求：
## 今日工作
按主题或时间列出可确认的工作内容
## 可写入日报的进展
只提炼材料能支持的进展
## 待确认
列出需要用户补充确认的内容，材料不足时可以为空`;
  }

  // 组装用户消息：vision 优先
  let userContent = `报告类型: ${reportType}\n报告模板: ${template}\n日期范围: ${startDate} ~ ${endDate}\n\n`;
  if (isWorkReport) {
    userContent += `工作日报过滤规则: 仅使用 work + high 的 AI 截屏识别结果；其他 Vision 结果不进入正文。\n原始 Vision ${visionResults.length} 条，进入工作日报材料 ${usableVisionResults.length} 条。\n\n`;
  }
  if (visionText) {
    userContent += `=== AI 截屏识别摘要（主要数据源） ===\n${visionText}\n\n`;
  }
  if (recordsText) {
    userContent += `=== 窗口追踪记录（补充上下文） ===\n${recordsText}\n\n`;
  }
  if (idleText) {
    userContent += `=== 空闲时段（用户离开电脑，请勿推测为工作） ===\n${idleText}`;
  }
  if (!visionText && !recordsText && !idleText) {
    userContent += '（无工作记录数据，请生成空报告模板）';
  }

  return { systemPrompt, userContent };
}

/**
 * v2.2: generateReport 接收 vision_results（主）+ records（辅），
 * 组装 prompt 时 vision 数据优先，records 作为补充上下文。
 */
export async function generateReport(
  apiKey: string,
  model: string,
  params: GenerateReportParams
): Promise<string> {
  const { systemPrompt, userContent } = buildReportPromptPayload(params);

  // 调试：打印请求摘要到终端
  console.log(
    '\n[生成报告] model:',
    model,
    '| vision:',
    params.visionResults.length,
    '条 | records:',
    params.records.length,
    '条 | idle:',
    params.idlePeriods?.length || 0,
    '条'
  );

  // 完整请求体写入 data/report-request-debug.json 供排查
  try {
    const { writeFileSync } = await import('fs');
    const { join: pathJoin } = await import('path');
    writeFileSync(pathJoin(process.cwd(), 'data', 'report-request-debug.json'), JSON.stringify({ model, systemPrompt, userContent }, null, 2), 'utf-8');
  } catch {}

  // 报告生成 API 调用
  const reportFetchRes = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 1.0,
      max_tokens: 4096,
      frequency_penalty: 0.5,
      presence_penalty: 0.3,
      stream: false,
    }),
  });

  if (!reportFetchRes.ok) {
    throw new Error(`SiliconFlow API error: ${reportFetchRes.status} ${reportFetchRes.statusText}`);
  }

  const data: any = await reportFetchRes.json();
  return data.choices?.[0]?.message?.content || '报告生成失败';
}

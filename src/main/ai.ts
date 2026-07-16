import type {
  ActivityRecord,
  ActivityType,
  Category,
  ChatMessage,
  ChatStreamDeltaEvent,
  ContentMood,
  DistractionType,
  IdlePeriod,
  VisionConfidence,
  VisionContentMood,
  VisionDistractionSignal,
  VisionResult,
  VisionSegmentMerge,
  VisionStuckSignal,
} from '../shared/types';
import { ACTIVITY_TYPES, CATEGORIES, CONTENT_MOODS, DEFAULT_API_BASE_URL, DISTRACTION_TYPES, VISION_CONFIDENCES } from '../shared/types';
import { formatLocalDateTime, formatUtcStorageTime, parseUtcStorageDateTime } from '../shared/time';

const FALLBACK_CATEGORY: Category = '其他';
const VISION_CATEGORY_OPTIONS = CATEGORIES.join('|');

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
- 可以使用正常聊天频率的 emoji 或颜文字，像日常微信聊天一样自然表达情绪。
- 表情是语气的一部分，不是刻意卖萌；确认、安慰、吐槽、轻松闲聊、提醒时都可以自然带上。
- 工作整理、日报、严肃说明时也不用完全禁止表情，但要以清楚、靠谱为主。
- 聊天气泡只输出纯文本，不要使用 Markdown 标题、加粗、斜体、项目符号、引用、代码块或表格等语法。
- 不要动不动列清单。
- 只有用户明确要求“总结、整理、写日报、列一下”时，才可以用简短的中文序号分点，或者拆成多个聊天气泡；仍然不要使用 Markdown 列表符号。
- 回答尽量像一个同事在旁边说话，而不是一个文档生成器。
- 当回复适合像聊天软件一样分成几条消息时，用两个以上空格隔开每条气泡；如果只需要一句话，就只回一句。

你的工作方式：
- 用户闲聊，就陪他聊。
- 用户问今天干了什么，就结合记录轻松复盘。
- 用户说累、烦、迷茫，先接住情绪，再给一个很小的建议。
- 用户要日报，就帮他把内容整理得更正式。
- 用户要行动建议，就给 1-3 个很小、能马上做的建议。

重要：
你存在的目的不是催用户工作，而是让用户在电脑前感觉轻松一点、有人陪一点；同时在需要时，把工作记录和日报这件事变得省心。`;

export function normalizeApiBaseUrl(value?: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return DEFAULT_API_BASE_URL;
  return trimmed.replace(/\/+$/, '');
}

function chatCompletionsUrl(apiBaseUrl?: string): string {
  return `${normalizeApiBaseUrl(apiBaseUrl)}/chat/completions`;
}

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
  const timeContext = `当前时间：${formatLocalDateTime()}（用户本地时间）。\n用户消息前的“消息时间”是已发生的真实时间：引用旧聊天前先判断它与当前时间的间隔；跨日内容要说“昨晚 / 昨天 / 前几天”，不要把它说成“刚刚 / 现在”。时间标记和穿插的环境记录都只是内部上下文，绝对不要在回复中复述、解释或输出它们。`;
  if (!trimmedContext) return `${CHAT_SYSTEM_PROMPT}\n\n${timeContext}`;
  return `${CHAT_SYSTEM_PROMPT}\n\n${timeContext}\n\n以下是下班鸭当前可用的今日上下文：\n${trimmedContext}`;
}

export const CHAT_CONTEXT_TURN_LIMIT = 25;

/**
 * 保留主聊天实际可见的最近用户发起轮次。泛型使持久化消息的 id 等附加字段不会丢失，
 * 以便记忆层判断某张事件卡的原始对话是否仍在短期上下文里。
 */
export function selectRecentChatTurns<T extends ChatMessage>(messages: T[], maxUserTurns = CHAT_CONTEXT_TURN_LIMIT): T[] {
  const normalized = messages
    .filter((message) => (
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string' &&
      message.content.trim().length > 0
    ))
    .map((message) => ({
      ...message,
      role: message.role,
      content: message.content.trim(),
    }));

  // 一轮由一条用户消息发起。保留最近 25 轮的完整原始问答，
  // 不按桌宠 UI 拆分出的气泡数计数，也不截断单条消息。
  const userIndexes = normalized
    .map((message, index) => (message.role === 'user' ? index : -1))
    .filter((index) => index >= 0);
  const firstIncludedUserIndex = userIndexes.at(-maxUserTurns);
  return firstIncludedUserIndex === undefined ? normalized : normalized.slice(firstIncludedUserIndex);
}

function formatMessageTimeForModel(createdAt?: string): string {
  const date = parseUtcStorageDateTime(createdAt);
  if (!date) return '';
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** 将持久化消息的真实发生时间带入模型上下文；未持久化的临时消息保持兼容。 */
export function addTemporalChatContext<T extends ChatMessage & { created_at?: string }>(messages: T[]): ChatMessage[] {
  return messages.map(({ role, content, created_at }) => {
    const timestamp = formatMessageTimeForModel(created_at);
    return {
      role,
      content: role === 'user' && timestamp ? `[消息时间：${timestamp}，用户本地时间]\n${content}` : content,
    };
  });
}

function normalizeChatMessages(messages: ChatMessage[]): ChatMessage[] {
  const chatMessages = messages.filter((message) => message.role === 'user' || message.role === 'assistant');
  const shortTermChatMessages = selectRecentChatTurns(chatMessages);
  const ids = new Set(shortTermChatMessages.map((message) => (message as { id?: string }).id).filter((id): id is string => typeof id === 'string'));
  const normalized = ids.size > 0
    ? messages.filter((message) => message.role === 'system' || ids.has((message as { id?: string }).id || ''))
    : shortTermChatMessages;
  return addTemporalChatContext(normalized);
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

export const MEMORY_CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_events',
      description: '在常驻 L0 之外的长期事件卡中按当前问题搜索。需要回忆更早或更细的历史时调用。',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: '要检索的关键词或短问题' }, limit: { type: 'integer', minimum: 1, maximum: 6 } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'expand_event',
      description: '展开一张事件卡的历史内容。L1 是叙事，L2 是元素和关系，L3 是原话。事件始终返回发生当时的信息。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' }, level: { type: 'integer', minimum: 1, maximum: 3 } },
        required: ['id', 'level'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_elements',
      description: '在常驻 L0 之外的元素卡中按当前问题搜索人物、项目、工具或概念。',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: '要检索的名称、状态或关系关键词' }, limit: { type: 'integer', minimum: 1, maximum: 6 } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'expand_element',
      description: '展开一张元素卡。L1 为当前状态，L2 为关联事件，L3 为状态变化及来源。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' }, level: { type: 'integer', minimum: 1, maximum: 3 } },
        required: ['id', 'level'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_memory',
      description: '根据明确、可核验的用户聊天，批量提出事件、元素或元素状态变更。轻量闲聊可以只提出 element 或 element_state；不要把助手推测写成用户事实。',
      parameters: {
        type: 'object',
        properties: {
          source_message_ids: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string' } },
          evidence: {
            type: 'array', minItems: 1, maxItems: 4,
            items: { type: 'object', properties: { message_id: { type: 'string' }, quote: { type: 'string' } }, required: ['message_id', 'quote'] },
          },
          changes: {
            type: 'array', minItems: 1, maxItems: 6,
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: ['event', 'element', 'element_state'] },
                title: { type: 'string' }, summary: { type: 'string' }, narrative: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } },
                confidence: { type: 'number', minimum: 0, maximum: 1 }, criticality: { type: 'string', enum: ['safety', 'identity', 'preference', 'routine'] },
                name: { type: 'string' }, type: { type: 'string', enum: ['person', 'project', 'concept', 'tool', 'place'] }, state: { type: 'string' }, valid_at: { type: 'string' },
                scope: { type: 'string', enum: ['project', 'user'] },
              },
              required: ['kind'],
            },
          },
        },
        required: ['source_message_ids', 'evidence', 'changes'],
      },
    },
  },
] as const;

export interface MemoryToolCall {
  id: string;
  name: typeof MEMORY_CHAT_TOOLS[number]['function']['name'];
  arguments: Record<string, unknown>;
}

export interface MemoryToolPlanningResult {
  supported: boolean;
  calls: MemoryToolCall[];
}

/** 一次真实聊天回合：模型要么请求读取记忆，要么直接给出最后的自然回复。 */
export interface MemoryChatTurnResult extends MemoryToolPlanningResult {
  content: string;
  usedEventIds: string[];
  usedElementIds: string[];
  error?: string;
}

const COMPACTION_TOOL_NAMES = new Set<MemoryToolCall['name']>(['search_events', 'expand_event', 'search_elements', 'expand_element']);

/** 会话整理器的只读检索阶段；写入始终由后续结构化输出统一落库。 */
export async function requestChatCompactionToolCalls(
  apiKey: string,
  model: string,
  contextText: string,
  apiBaseUrl?: string,
  toolTranscript: Array<Record<string, unknown>> = []
): Promise<MemoryToolPlanningResult> {
  const tools = MEMORY_CHAT_TOOLS.filter((tool) => COMPACTION_TOOL_NAMES.has(tool.function.name));
  try {
    const response = await fetch(chatCompletionsUrl(apiBaseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 900,
        stream: false,
        tools,
        tool_choice: 'auto',
        messages: [
          { role: 'system', content: '你正在进行下班鸭会话整理的不可见检索阶段。只可调用事件卡和元素卡的读取工具；当默认 L0 索引不足以判断本批聊天和旧记忆的关系时再检索或展开。不要向用户回复，不要写入记忆，不需要工具时返回空内容。' },
          { role: 'user', content: contextText },
          ...toolTranscript,
        ],
      }),
    });
    if (!response.ok) return { supported: false, calls: [] };
    const body = await response.json() as { choices?: Array<{ message?: { tool_calls?: unknown[] } }> };
    const rawCalls = body.choices?.[0]?.message?.tool_calls || [];
    const calls = rawCalls.flatMap((raw): MemoryToolCall[] => {
      if (!raw || typeof raw !== 'object') return [];
      const call = raw as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
      const name = call.function?.name;
      if (typeof call.id !== 'string' || typeof name !== 'string' || !COMPACTION_TOOL_NAMES.has(name as MemoryToolCall['name'])) return [];
      try {
        const args = typeof call.function?.arguments === 'string' ? JSON.parse(call.function.arguments) : call.function?.arguments;
        return args && typeof args === 'object' && !Array.isArray(args)
          ? [{ id: call.id, name: name as MemoryToolCall['name'], arguments: args as Record<string, unknown> }]
          : [];
      } catch { return []; }
    });
    return { supported: true, calls };
  } catch {
    return { supported: false, calls: [] };
  }
}

export async function requestMemoryToolCalls(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  contextText: string,
  apiBaseUrl?: string,
  toolTranscript: Array<Record<string, unknown>> = [],
  allowMemoryProposal = false
): Promise<MemoryToolPlanningResult> {
  const tools = allowMemoryProposal
    ? MEMORY_CHAT_TOOLS
    : MEMORY_CHAT_TOOLS.filter((tool) => tool.function.name !== 'propose_memory');
  const payload = buildChatCompletionPayload(model, messages, contextText, false);
  payload.messages[0] = {
    role: 'system',
    content: `${payload.messages[0].content}\n\n你正在进行一段不可见的记忆准备阶段：不要向用户输出回复。需要历史细节时调用读取工具。新的事件卡和元素卡只由会话整理器按批处理，这一阶段不得提出写入。没有工具需要调用时，返回空内容。`,
  };
  try {
    const response = await fetch(chatCompletionsUrl(apiBaseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ ...payload, messages: [...payload.messages, ...toolTranscript], temperature: 0.1, max_tokens: 900, tools, tool_choice: 'auto' }),
    });
    if (!response.ok) return { supported: false, calls: [] };
    const body = await response.json() as { choices?: Array<{ message?: { tool_calls?: unknown[] } }> };
    const rawCalls = body.choices?.[0]?.message?.tool_calls || [];
    const names = new Set(tools.map((tool) => tool.function.name));
    const calls = rawCalls.flatMap((raw): MemoryToolCall[] => {
      if (!raw || typeof raw !== 'object') return [];
      const call = raw as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
      const name = call.function?.name;
      if (typeof call.id !== 'string' || typeof name !== 'string' || !names.has(name as MemoryToolCall['name'])) return [];
      try {
        const args = typeof call.function?.arguments === 'string' ? JSON.parse(call.function.arguments) : call.function?.arguments;
        return args && typeof args === 'object' && !Array.isArray(args)
          ? [{ id: call.id, name: name as MemoryToolCall['name'], arguments: args as Record<string, unknown> }]
          : [];
      } catch {
        return [];
      }
    });
    return { supported: true, calls };
  } catch {
    return { supported: false, calls: [] };
  }
}

/**
 * 聊天主循环使用的工具回合。
 *
 * 和旧的“记忆准备”请求不同：这里没有第二个无工具的正式回复请求。
 * 模型在同一份对话和工具回填记录里，要么继续读取记忆，要么返回带引用声明的最终回复。
 */
export async function requestMemoryChatTurn(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  contextText: string,
  apiBaseUrl?: string,
  toolTranscript: Array<Record<string, unknown>> = [],
  allowTools = true
): Promise<MemoryChatTurnResult> {
  const tools = MEMORY_CHAT_TOOLS.filter((tool) => tool.function.name !== 'propose_memory');
  const payload = buildChatCompletionPayload(model, messages, contextText, false);
  payload.messages[0] = {
    role: 'system',
    content: `${payload.messages[0].content}\n\n你正在和用户进行一次真实聊天。常驻 L0 和记忆工具返回的内容都是内部资料，不能向用户解释工具、检索过程或事件 ID。只有当前问题确实需要更早、更细或需核对的历史时，才调用读取工具；普通闲聊不要为了查而查。每轮可以调用少量读取工具。新的记忆写入仍由会话整理器批处理，本聊天回合不得调用 propose_memory。当信息已经足够、准备向用户回复时，只返回一个 JSON 对象，不能加 Markdown 或解释：{\"reply\":\"给用户的自然回复\",\"used_event_ids\":[\"实际用于此回复的事件卡 id\"],\"used_element_ids\":[\"实际用于此回复的元素卡 id\"]}。两个 id 数组必须始终存在；没有实际采用任何已有记忆时传空数组。只能填写本轮从常驻 L0 或读取工具得到、且确实影响 reply 的 id；不要因仅看见就填写。${allowTools ? '' : '\n你已用完本轮的记忆读取额度。基于已获得的资料生成上述 JSON，不要再请求工具。'}`,
  };
  try {
    const requestBody: Record<string, unknown> = {
      ...payload,
      messages: [...payload.messages, ...toolTranscript],
      temperature: 0.55,
    };
    if (allowTools) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }
    const response = await fetch(chatCompletionsUrl(apiBaseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) return { supported: false, calls: [], content: '', usedEventIds: [], usedElementIds: [], error: '模型服务未返回兼容的工具调用响应。' };
    const body = await response.json() as { choices?: Array<{ message?: { content?: unknown; tool_calls?: unknown[] } }> };
    const message = body.choices?.[0]?.message;
    const rawCalls = message?.tool_calls || [];
    const names = new Set(tools.map((tool) => tool.function.name));
    const calls = rawCalls.flatMap((raw): MemoryToolCall[] => {
      if (!raw || typeof raw !== 'object') return [];
      const call = raw as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
      const name = call.function?.name;
      if (typeof call.id !== 'string' || typeof name !== 'string' || !names.has(name as MemoryToolCall['name'])) return [];
      try {
        const args = typeof call.function?.arguments === 'string' ? JSON.parse(call.function.arguments) : call.function?.arguments;
        return args && typeof args === 'object' && !Array.isArray(args)
          ? [{ id: call.id, name: name as MemoryToolCall['name'], arguments: args as Record<string, unknown> }]
          : [];
      } catch {
        return [];
      }
    });
    if (calls.length > 0) return { supported: true, calls, content: '', usedEventIds: [], usedElementIds: [] };
    const rawContent = typeof message?.content === 'string' ? message.content.trim() : '';
    try {
      const final = JSON.parse(rawContent) as { reply?: unknown; used_event_ids?: unknown; used_element_ids?: unknown };
      if (!final || typeof final.reply !== 'string' || !Array.isArray(final.used_event_ids) || !Array.isArray(final.used_element_ids)) {
        throw new Error('shape');
      }
      const ids = (value: unknown[]): string[] => [...new Set(value.filter((id): id is string => typeof id === 'string').map((id) => id.trim()).filter(Boolean))].slice(0, 6);
      return { supported: true, calls: [], content: final.reply.trim(), usedEventIds: ids(final.used_event_ids), usedElementIds: ids(final.used_element_ids) };
    } catch {
      return { supported: false, calls: [], content: '', usedEventIds: [], usedElementIds: [], error: '模型没有按“回复加引用 ID”的最终协议返回；本轮不采用记忆结果并回退为普通聊天。' };
    }
  } catch {
    return { supported: false, calls: [], content: '', usedEventIds: [], usedElementIds: [], error: '记忆工具请求异常。' };
  }
}

function parseChatDeltas(data: string): Array<Omit<ChatStreamDeltaEvent, 'streamId'>> {
  if (!data || data === '[DONE]') return [];
  try {
    const json = JSON.parse(data);
    const deltas: Array<Omit<ChatStreamDeltaEvent, 'streamId'>> = [];
    const choices = Array.isArray(json.choices) ? json.choices : [];
    for (const choice of choices) {
      const delta = choice?.delta || {};
      const message = choice?.message || {};
      const reasoning = typeof delta.reasoning_content === 'string'
        ? delta.reasoning_content
        : typeof message.reasoning_content === 'string'
          ? message.reasoning_content
          : '';
      const content = typeof delta.content === 'string'
        ? delta.content
        : typeof message.content === 'string'
          ? message.content
          : '';
      if (reasoning) {
        deltas.push({ type: 'thinking', delta: reasoning });
      }
      if (content) {
        deltas.push({ type: 'content', delta: content });
      }
    }
    return deltas;
  } catch {
    return [];
  }
}

interface ChatStreamTimeouts {
  totalMs?: number;
  firstTokenMs?: number;
  idleMs?: number;
}

const DEFAULT_CHAT_STREAM_TIMEOUTS: Required<ChatStreamTimeouts> = {
  totalMs: 180_000,
  firstTokenMs: 45_000,
  idleMs: 60_000,
};

function normalizeTimeout(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function createChatTimeoutError(reason: 'response' | 'idle' | 'total'): Error {
  const messages = {
    response: '下班鸭这次连上模型有点慢，可以点重试再发一次。',
    idle: '下班鸭说到一半卡住了，可以点重试再发一次。',
    total: '下班鸭这次回复耗时太长了，可以点重试再发一次。',
  };
  return new Error(messages[reason]);
}

export async function streamChatCompletion(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  contextText: string,
  onDelta: (delta: Omit<ChatStreamDeltaEvent, 'streamId'>) => void,
  signal?: AbortSignal,
  apiBaseUrl?: string,
  timeoutOverrides: ChatStreamTimeouts = {}
): Promise<void> {
  const timeouts = {
    totalMs: normalizeTimeout(timeoutOverrides.totalMs, DEFAULT_CHAT_STREAM_TIMEOUTS.totalMs),
    firstTokenMs: normalizeTimeout(timeoutOverrides.firstTokenMs, DEFAULT_CHAT_STREAM_TIMEOUTS.firstTokenMs),
    idleMs: normalizeTimeout(timeoutOverrides.idleMs, DEFAULT_CHAT_STREAM_TIMEOUTS.idleMs),
  };
  const streamAbortController = new AbortController();
  let timeoutError: Error | null = null;
  let totalTimer: ReturnType<typeof setTimeout> | null = null;
  let responseTimer: ReturnType<typeof setTimeout> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = (timer: ReturnType<typeof setTimeout> | null): void => {
    if (timer) clearTimeout(timer);
  };
  const abortForTimeout = (reason: 'response' | 'idle' | 'total'): void => {
    if (streamAbortController.signal.aborted) return;
    timeoutError = createChatTimeoutError(reason);
    streamAbortController.abort(timeoutError);
  };
  const resetIdleTimer = (): void => {
    clearTimer(idleTimer);
    idleTimer = setTimeout(() => abortForTimeout('idle'), timeouts.idleMs);
  };
  const handleExternalAbort = (): void => {
    if (!streamAbortController.signal.aborted) {
      streamAbortController.abort(signal?.reason);
    }
  };

  if (signal?.aborted) {
    handleExternalAbort();
  } else {
    signal?.addEventListener('abort', handleExternalAbort, { once: true });
  }

  totalTimer = setTimeout(() => abortForTimeout('total'), timeouts.totalMs);
  responseTimer = setTimeout(() => abortForTimeout('response'), timeouts.firstTokenMs);

  try {
    const response = await fetch(chatCompletionsUrl(apiBaseUrl), {
      method: 'POST',
      signal: streamAbortController.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildChatCompletionPayload(model, messages, contextText, true)),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
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

      clearTimer(responseTimer);
      responseTimer = null;
      resetIdleTimer();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        resetIdleTimer();
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;
        const deltas = parseChatDeltas(data);
        for (const delta of deltas) {
          onDelta(delta);
        }
      }
    }

    const trailing = buffer.trim();
    if (trailing.startsWith('data:')) {
      clearTimer(responseTimer);
      responseTimer = null;
      const deltas = parseChatDeltas(trailing.slice(5).trim());
      for (const delta of deltas) {
        onDelta(delta);
      }
    }
  } catch (error) {
    if (timeoutError) throw timeoutError;
    throw error;
  } finally {
    signal?.removeEventListener('abort', handleExternalAbort);
    clearTimer(totalTimer);
    clearTimer(responseTimer);
    clearTimer(idleTimer);
  }
}

export interface ChatMemoryCompactionResult {
  conversation_summary: string;
  events: Array<{
    title: string;
    summary: string;
    narrative?: string;
    tags?: string[];
    scope?: 'project' | 'user';
    criticality?: 'safety' | 'identity' | 'preference' | 'routine';
    confidence?: number;
    elements?: Array<{ name: string; type?: 'person' | 'project' | 'concept' | 'tool' | 'place'; role?: string; state?: string }>;
    relations?: Array<{ type: 'continuation' | 'turning_point' | 'cause' | 'correction' | 'parallel'; target_event_id: string; description: string }>;
  }>;
  elements: Array<{
    name: string;
    type?: 'person' | 'project' | 'concept' | 'tool' | 'place';
    scope?: 'project' | 'user';
    state?: string;
  }>;
}

const CHAT_MEMORY_COMPACTION_PROMPT = `你是下班鸭的会话整理器。把一段即将移出主聊天原文窗口的真实聊天，整理成可持续使用的会话摘要；并且只在确有长期价值时，提出事件卡和元素卡更新。

conversation_summary 必填：它会替代这段原文进入主模型上下文。保留仍在进行的话题、明确决定、待办、约束、纠正和必要背景；不要写助手的臆测。原文的消息时间是事实，凡是活动、承诺、情绪或对话发生时机有意义时，摘要必须保留绝对日期或“某日晚间”这一类明确时点，绝不能把过去的事改写成“现在”。即使整段只是闲聊，也写明“本段为闲聊，无待续事项”。长度不超过 600 字。

events 和 elements 都是可选的长期沉淀：普通闲聊、临时情绪、假设、模型建议、没有新事实的问答，一律不要写入。事件只记录具体经历、明确决定、明确纠正、稳定偏好或可靠背景。元素只记录跨事件有持续意义的人、项目、工具、概念等；state 只写本段有证据支持的当前状态。不要从截图、日报或助手臆测中创造用户事实。

系统固定有“用户”和“下班鸭”两张特殊元素卡，每个聊天事件都会自动关联它们，绝不能创建同名副本，也不要在 events[].elements 中重复写它们。用户的偏好、习惯、约束写为顶层 elements 中 name="用户" 的 state；下班鸭已接受的提醒、能力或待办写为顶层 elements 中 name="下班鸭" 的 state。其他元素按实体名称输出，名称本身决定复用，不以 scope 区分实体。

scope 只能是 project 或 user：项目内的技术/产品/任务决策用 project；跨项目稳定背景或表达偏好用 user。criticality 默认 routine；明确稳定偏好用 preference；可靠身份/背景用 identity；安全关键事实才用 safety。

如果提供了已有记忆索引，只在本段确实延续或纠正它时使用 relations；需要纠正旧事件时，relations 使用 type=correction 且 target_event_id 为旧事件 id。事件发生时的内容不要改写旧事件。

严格返回 JSON，不要 Markdown：
{"conversation_summary":"不超过600字","events":[{"title":"不超过30字","summary":"不超过100字","narrative":"不超过300字","tags":["标签"],"scope":"project|user","criticality":"safety|identity|preference|routine","confidence":0.9,"elements":[{"name":"普通实体（不含用户和下班鸭）","type":"person|project|concept|tool|place","role":"角色","state":"当前状态"}],"relations":[{"type":"continuation|turning_point|cause|correction|parallel","target_event_id":"evt_x","description":"关系说明"}]}],"elements":[{"name":"用户或下班鸭或其他实体","type":"person|project|concept|tool|place","state":"可选的当前状态"}]}`;

function parseJsonObject(content: string): Record<string, unknown> | null {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
}

export async function compactChatMemory(
  apiKey: string,
  model: string,
  params: {
    previousSummary: string;
    messages: Array<{ id: string; role: 'user' | 'assistant'; content: string; created_at?: string }>;
    retrievedMemoryIndex: string;
    retrievedDetails?: string;
  },
  apiBaseUrl?: string
): Promise<ChatMemoryCompactionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(chatCompletionsUrl(apiBaseUrl), {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 1400,
        stream: false,
        messages: [
          { role: 'system', content: CHAT_MEMORY_COMPACTION_PROMPT },
          {
            role: 'user',
            content: `此前会话摘要（可能为空）：\n${params.previousSummary || '无'}\n\n本次待整理原文（每条都带真实发生时间）：\n${params.messages.map((message) => `[${message.id}] [${formatMessageTimeForModel(message.created_at) || '时间未知'}] ${message.role}: ${message.content}`).join('\n') || '无'}\n\n已有记忆 L0 索引（可能为空）：\n${params.retrievedMemoryIndex || '无'}\n\n按需读取结果（可能为空；仅可据此和原文写入）：\n${params.retrievedDetails || '无'}`,
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`Memory extraction API error: ${response.status}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = payload.choices?.[0]?.message?.content;
    const parsed = typeof content === 'string' ? parseJsonObject(content) : null;
    if (!parsed) throw new Error('Chat compaction did not return JSON');
    return {
      conversation_summary: typeof parsed.conversation_summary === 'string' ? parsed.conversation_summary.trim().slice(0, 2000) : '',
      events: Array.isArray(parsed.events) ? parsed.events.filter((event): event is ChatMemoryCompactionResult['events'][number] => !!event && typeof event === 'object') : [],
      elements: Array.isArray(parsed.elements) ? parsed.elements.filter((element): element is ChatMemoryCompactionResult['elements'][number] => !!element && typeof element === 'object') : [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

interface VisionAnalysisResult {
  title: string;
  category: Category;
  summary: string;
  observed_fact: string;
  possible_activity: string;
  confidence: VisionConfidence;
  activity_type: ActivityType;
  segment_merge: VisionSegmentMerge;
  stuck_signal: VisionStuckSignal;
  distraction_signal: VisionDistractionSignal;
  content_mood: VisionContentMood;
}

export interface VisionPreviousSegmentContext {
  title: string;
  category: Category;
  activity_type: ActivityType;
  confidence: VisionConfidence;
  app: string;
  window_title: string;
  summary: string;
  created_at: string;
}

const VISION_SYSTEM_PROMPT = `你是一个保守的屏幕活动识别器，用于帮助用户记录一天的电脑活动。

你的任务是根据截图、当前应用名、当前窗口标题，以及过去几分钟的窗口轨迹，生成一条结构化活动记录。

重要原则：
1. observed_fact 只写截图中能直接看到的事实，要具体，但不要脑补用户意图。possible_activity 用“可能、正在、看起来像”等保守推断。
2. 不要为了避免犯错而把明确活动泛化成“其他”。
3. 不要把“正在查看、编辑、讨论”写成“已经完成、实现、修复、解决、提交”。
4. 严格返回纯 JSON，不要输出额外文字。

必须返回的 JSON 字段：
{"title":"10字以内短标题","category":"${VISION_CATEGORY_OPTIONS}","observed_fact":"截图中可直接看到的详细事实，40-100字","window_trace_summary":"过去几分钟窗口轨迹摘要，20-80字","possible_activity":"基于事实和窗口轨迹的保守推断，20-60字","confidence":"high|medium|low","activity_type":"work|personal|idle|unclear","segment_merge":{"should_merge":false,"confidence":"low","reason":"无上一段或不连续","current_activity":"当前截图代表的活动，20字以内","updated_segment_summary":"如果合并，给出合并后时间段摘要；否则等于当前活动"}}

可选字段（仅明显命中时输出，否则不输出该字段，不要输出 false、none、neutral、空 reason 或空 evidence）：
- stuck_signal: 卡住/排错/失败/反复尝试同一问题。格式 {"is_stuck_like":true,"reason":"画面出现明确报错或失败信息","evidence":["failed","timeout"],"confidence":"high|medium"}
- distraction_signal: 娱乐/社交/短视频/游戏（学习视频、技术文档、工作沟通不算）。格式 {"is_distraction_like":true,"activity_type":"game|social|video|other","reason":"画面是游戏/社交/视频等内容","confidence":"high|medium"}
- content_mood: 明显搞笑/梗图/弹幕笑点/负面情绪/争吵/沮丧（中性画面不输出）。格式 {"mood":"humorous|negative|unclear","reason":"画面有明显搞笑/负面/情绪化内容","confidence":"high|medium"}

少样本示例：
输入：浏览器打开 SiliconFlow 控制台费用明细页，窗口标题包含 Usage Billing。
输出：{"title":"查看费用明细","category":"检索与AI","observed_fact":"浏览器中打开 SiliconFlow 控制台费用明细页面，可见模型调用费用、用量记录和时间筛选区域。","window_trace_summary":"窗口轨迹主要停留在浏览器控制台和费用相关页面。","possible_activity":"可能在核对 AI 模型调用成本或检查 API 使用费用。","confidence":"high","activity_type":"work","segment_merge":{"should_merge":false,"confidence":"low","reason":"无上一段或不连续","current_activity":"查看费用明细","updated_segment_summary":"查看费用明细"}}

输入：代码编辑器打开 desk-pet-window.ts，旁边有聊天窗口讨论窗口尺寸。
输出：{"title":"编辑桌宠窗口","category":"代码开发","observed_fact":"代码编辑器中打开桌宠窗口相关 TypeScript 文件，画面可见窗口尺寸、位置或状态处理代码。","window_trace_summary":"窗口轨迹在代码编辑器、聊天讨论和项目文件之间切换。","possible_activity":"可能在调整桌宠窗口尺寸逻辑或排查窗口显示问题。","confidence":"medium","activity_type":"work","segment_merge":{"should_merge":false,"confidence":"low","reason":"无上一段或不连续","current_activity":"编辑桌宠窗口","updated_segment_summary":"编辑桌宠窗口"}}

输入：终端或浏览器中反复显示 failed、exception、timeout、测试失败、报错搜索结果。
输出：{"title":"排查报错","category":"代码开发","observed_fact":"屏幕中可见报错、失败日志、异常关键词或围绕同一错误的搜索和文档页面。","window_trace_summary":"窗口轨迹在终端、代码编辑器和报错搜索结果之间来回切换。","possible_activity":"可能在排查一个持续出现的技术问题。","confidence":"high","activity_type":"work","segment_merge":{"should_merge":false,"confidence":"low","reason":"无上一段或不连续","current_activity":"排查报错","updated_segment_summary":"排查报错"},"stuck_signal":{"is_stuck_like":true,"reason":"画面出现明确报错或失败信息","evidence":["failed","exception","timeout"],"confidence":"high"}}

输入：社交媒体或视频页面可见搞笑标题、梗图、弹幕或“哈哈、笑死、离谱”等文字。
输出：{"title":"浏览搞笑内容","category":"休闲娱乐","observed_fact":"屏幕显示社交媒体或视频内容，画面可见搞笑标题、梗图、弹幕或明显幽默表达。","window_trace_summary":"窗口轨迹主要停留在社交媒体或视频内容页面。","possible_activity":"用户可能在浏览娱乐或搞笑内容。","confidence":"high","activity_type":"personal","segment_merge":{"should_merge":false,"confidence":"low","reason":"娱乐内容不与工作时间段合并","current_activity":"浏览搞笑内容","updated_segment_summary":"浏览搞笑内容"},"distraction_signal":{"is_distraction_like":true,"activity_type":"social","reason":"画面是娱乐社交内容","confidence":"medium"},"content_mood":{"mood":"humorous","reason":"画面有明显搞笑或梗图元素","confidence":"high"}}

输入：只看到桌面壁纸、任务栏或没有明确活动内容。
输出：{"title":"桌面空闲","category":"其他","observed_fact":"屏幕主要显示桌面或空白窗口，没有可识别的具体工作内容。","window_trace_summary":"窗口轨迹缺少稳定的具体活动线索。","possible_activity":"可能处于空闲、等待或刚切换窗口的状态。","confidence":"low","activity_type":"idle","segment_merge":{"should_merge":false,"confidence":"low","reason":"空闲或无明确活动内容，不合并","current_activity":"桌面空闲","updated_segment_summary":"桌面空闲"}}`;

function pickAllowed<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? value as T[number]
    : fallback;
}

function cleanText(value: unknown, fallback = '', maxLength = 120): string {
  return String(typeof value === 'string' ? value : fallback).trim().slice(0, maxLength);
}

function cleanStringArray(value: unknown, maxItems = 4, maxLength = 32): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeStuckSignal(raw: any): VisionStuckSignal {
  return {
    is_stuck_like: raw?.is_stuck_like === true,
    reason: cleanText(raw?.reason, '', 80),
    evidence: cleanStringArray(raw?.evidence),
    confidence: pickAllowed(raw?.confidence, VISION_CONFIDENCES, 'low'),
  };
}

function normalizeDistractionSignal(raw: any): VisionDistractionSignal {
  return {
    is_distraction_like: raw?.is_distraction_like === true,
    activity_type: pickAllowed(raw?.activity_type, DISTRACTION_TYPES, 'none') as DistractionType,
    reason: cleanText(raw?.reason, '', 80),
    confidence: pickAllowed(raw?.confidence, VISION_CONFIDENCES, 'low'),
  };
}

function normalizeContentMood(raw: any): VisionContentMood {
  return {
    mood: pickAllowed(raw?.mood, CONTENT_MOODS, 'unclear') as ContentMood,
    reason: cleanText(raw?.reason, '', 80),
    confidence: pickAllowed(raw?.confidence, VISION_CONFIDENCES, 'low'),
  };
}

function normalizeSegmentMerge(raw: any, currentActivity: string): VisionSegmentMerge {
  return {
    should_merge: raw?.should_merge === true,
    confidence: pickAllowed(raw?.confidence, VISION_CONFIDENCES, 'low'),
    reason: cleanText(raw?.reason, '', 80),
    current_activity: cleanText(raw?.current_activity, currentActivity, 40) || currentActivity,
    updated_segment_summary: cleanText(raw?.updated_segment_summary, currentActivity, 120) || currentActivity,
  };
}

function normalizeVisionResult(raw: any, fallbackTitle: string): VisionAnalysisResult {
  const observedFact = cleanText(raw?.observed_fact, raw?.summary || fallbackTitle, 160);
  const possibleActivity = cleanText(raw?.possible_activity, raw?.summary || observedFact, 120);
  const windowTraceSummary = cleanText(raw?.window_trace_summary, '', 120);
  const summary = [possibleActivity || observedFact, windowTraceSummary ? `窗口轨迹: ${windowTraceSummary}` : '']
    .filter(Boolean)
    .join('\n');
  return {
    title: cleanText(raw?.title, fallbackTitle, 30) || fallbackTitle,
    category: pickAllowed(raw?.category, CATEGORIES, FALLBACK_CATEGORY),
    summary: summary || observedFact,
    observed_fact: observedFact,
    possible_activity: possibleActivity,
    confidence: pickAllowed(raw?.confidence, VISION_CONFIDENCES, 'low'),
    activity_type: pickAllowed(raw?.activity_type, ACTIVITY_TYPES, 'unclear'),
    segment_merge: normalizeSegmentMerge(raw?.segment_merge, possibleActivity || observedFact || fallbackTitle),
    stuck_signal: normalizeStuckSignal(raw?.stuck_signal),
    distraction_signal: normalizeDistractionSignal(raw?.distraction_signal),
    content_mood: normalizeContentMood(raw?.content_mood),
  };
}

function buildPreviousSegmentText(previousSegment?: VisionPreviousSegmentContext): string {
  if (!previousSegment) return '上一段时间地图摘要: 无';
  return [
    `上一段时间地图摘要: ${previousSegment.title} (${previousSegment.activity_type}/${previousSegment.confidence}) - ${previousSegment.summary}`,
    `应用: ${previousSegment.app}`,
    `窗口标题: ${previousSegment.window_title}`,
  ].join('\n');
}

export async function analyzeWithVision(
  apiKey: string,
  model: string,
  imageBase64: string,
  app: string,
  title: string,
  windowTraceText: string,
  previousSegment?: VisionPreviousSegmentContext,
  signal?: AbortSignal,
  apiBaseUrl?: string
): Promise<VisionAnalysisResult> {
  const fallbackTitle = `${app} - ${title}`.substring(0, 30);
  const response = await fetch(chatCompletionsUrl(apiBaseUrl), {
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
              text: `当前应用: ${app}\n窗口标题: ${title}\n${windowTraceText}\n${buildPreviousSegmentText(previousSegment)}\n\n请分析这段活动。截图看不清时降低可信度。`,
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
    throw new Error(`API error: ${response.status} ${response.statusText}`);
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
    category: FALLBACK_CATEGORY,
    observed_fact: content.substring(0, 160),
    possible_activity: content.substring(0, 120),
    confidence: 'low',
    activity_type: 'unclear',
  }, fallbackTitle);
}

/** A deliberately observation-only pass used before a screen question enters chat. */
export async function describeScreenQuestion(
  apiKey: string,
  model: string,
  images: { fullImageBase64?: string; focusImageBase64?: string },
  signal?: AbortSignal,
  apiBaseUrl?: string,
): Promise<string> {
  const imageContent = [
    ...(images.fullImageBase64 ? [{ type: 'image_url' as const, image_url: { url: `data:image/jpeg;base64,${images.fullImageBase64}` } }] : []),
    ...(images.focusImageBase64 ? [{ type: 'image_url' as const, image_url: { url: `data:image/jpeg;base64,${images.focusImageBase64}` } }] : []),
    { type: 'text' as const, text: '请输出截图观察。' },
  ];
  const imageScope = images.fullImageBase64 && images.focusImageBase64
    ? '图一是完整桌面上下文，图二是用户框选的重点区域。优先逐项描述图二，再补充图一中与其直接相关的可见上下文。'
    : images.focusImageBase64
      ? '图中是用户框选的重点区域。逐项描述其中确实可见的内容。'
      : '图中是完整桌面。逐项描述其中确实可见的内容。';
  const response = await fetch(chatCompletionsUrl(apiBaseUrl), {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: `你是截图观察员。只描述画面中确实可见的内容，不回答问题、不解释意图、不推断人物关系、用途、情绪、原因或后续行为。${imageScope}保留能辨认的文字。无法辨认时明确写“无法辨认”，不要猜测。输出纯中文观察文本，不要使用 Markdown。`,
        },
        {
          role: 'user',
          content: imageContent,
        },
      ],
      temperature: 0,
      max_tokens: 1800,
      stream: false,
    }),
  });
  if (!response.ok) throw new Error(`截图观察失败：${response.status} ${response.statusText}`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('截图观察没有返回可用内容');
  return content.trim();
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
          return `${i + 1}. [${localTime(vr.created_at)}] ${cleanTitle} (${vr.confidence || 'medium'}, ${vr.activity_type || 'unclear'})
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
          return `${i + 1}. [${localTime(r.start_at)}-${localTime(r.end_at)}] ${cleanTitle} (${r.app})`;
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
  params: GenerateReportParams,
  apiBaseUrl?: string
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
  const reportFetchRes = await fetch(chatCompletionsUrl(apiBaseUrl), {
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
    throw new Error(`API error: ${reportFetchRes.status} ${reportFetchRes.statusText}`);
  }

  const data: any = await reportFetchRes.json();
  return data.choices?.[0]?.message?.content || '报告生成失败';
}

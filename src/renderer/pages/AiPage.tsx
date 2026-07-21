import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Archive, Bot, BrainCircuit, ChevronDown, Clock, Database, Layers3, RefreshCw, Send, User, Wrench } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { useXiabanyaApi } from '../hooks/useXiabanyaApi';
import { dur, today } from '../lib/utils';
import type { ChatMemoryRuntimeDebug, ChatMessage, MemoryToolDebugRun, VisionResultWithDuration } from '../../shared/types';
import { formatUtcStorageTime } from '../../shared/time';
import { useTranslation } from '../i18n';

type LocalChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: string;
  sequence?: number;
  pending?: boolean;
  error?: boolean;
  status?: string;
  responseLatencyMs?: number | null;
  visionUnderstandingLatencyMs?: number | null;
  totalWaitLatencyMs?: number | null;
};

const CHAT_HISTORY_PAGE_SIZE = 20;
const CHAT_TOP_LOAD_THRESHOLD = 40;
const CHAT_BOTTOM_THRESHOLD = 48;

function makeLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeStreamId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : makeLocalId('stream');
}

function toChatMessages(messages: LocalChatMessage[]): ChatMessage[] {
  return messages
    .filter((message) => message.content.trim())
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

function formatFirstResponseLatency(milliseconds: number): string {
  const seconds = milliseconds / 1000;
  return seconds < 1 ? `${Math.max(0.1, Math.round(seconds * 10) / 10)} 秒` : `${seconds.toFixed(1)} 秒`;
}

function ChatToolDebug({ run, loading, firstResponseLatencyMs, visionUnderstandingLatencyMs, totalWaitLatencyMs, isEnglish }: {
  run: MemoryToolDebugRun | null | undefined;
  loading: boolean;
  firstResponseLatencyMs?: number | null;
  visionUnderstandingLatencyMs?: number | null;
  totalWaitLatencyMs?: number | null;
  isEnglish: boolean;
}) {
  const isScreenQuestion = typeof visionUnderstandingLatencyMs === 'number' || typeof totalWaitLatencyMs === 'number';
  const latency = (typeof firstResponseLatencyMs === 'number' || isScreenQuestion) ? <div className="mt-2 grid gap-2 text-xs">
    {typeof visionUnderstandingLatencyMs === 'number' && <p className="rounded-lg bg-white px-2.5 py-2 leading-5 text-brand-800"><b>{isEnglish ? 'Screen understanding: ' : '看图理解：'}</b>{formatFirstResponseLatency(visionUnderstandingLatencyMs)}</p>}
    {typeof firstResponseLatencyMs === 'number' && <p className="rounded-lg bg-white px-2.5 py-2 leading-5 text-brand-800"><b>{isEnglish ? (isScreenQuestion ? 'Ducky first response: ' : 'Time to first response: ') : (isScreenQuestion ? '小黄鸭首段回复：' : '首段回复用时：')}</b>{formatFirstResponseLatency(firstResponseLatencyMs)}</p>}
    {typeof totalWaitLatencyMs === 'number' && <p className="rounded-lg bg-brand-100 px-2.5 py-2 leading-5 text-brand-900"><b>{isEnglish ? 'Total wait after confirming: ' : '确认提问后总等待：'}</b>{formatFirstResponseLatency(totalWaitLatencyMs)}</p>}
  </div> : null;
  if (loading) return <div className="mt-1 w-full rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-xs text-brand-700">{latency}{isEnglish ? 'Reading this turn’s call log…' : '正在读取本轮调用记录…'}</div>;
  if (!run) return <div className="mt-1 w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500">{latency}{isEnglish ? 'This reply has no tool debug record: it may be an older message, a built-in reply, or a reply that failed before logging completed.' : '这条回复没有工具调试记录：可能是旧消息、内置回复，或回复在记录完成前失败。'}</div>;
  return <div className="mt-1 w-full rounded-xl border border-brand-100 bg-brand-50/40 p-3 text-left">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-1.5 text-xs font-medium text-brand-800"><Wrench size={13} />{isEnglish ? 'How this reply was produced' : '这条回复的过程'}</div><div className="flex gap-1.5"><span className={`rounded px-1.5 py-0.5 text-[11px] ${run.mode === 'tool' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>{run.mode === 'tool' ? (isEnglish ? 'Tool chat completed' : '工具聊天完成') : (isEnglish ? 'Fell back to standard chat' : '已回退普通聊天')}</span><span className="rounded bg-white px-1.5 py-0.5 text-[11px] text-gray-600">{isEnglish ? `${run.calls.length} calls` : `${run.calls.length} 次调用`}</span></div></div>
    <p className="mt-2 rounded-lg bg-white px-2.5 py-2 text-xs leading-5 text-gray-600">{run.mode === 'tool' ? (isEnglish ? 'The reply first uses the current chat and resident memory to understand the question, then reads more when needed. The final reply also declares the memories it actually adopted.' : '先用当前聊天和常驻记忆理解问题；需要时按下面顺序读取，最终回复会同时声明实际采用的记忆。') : (isEnglish ? 'The tool service had no usable response, so this reply was generated directly from the current chat context.' : '工具服务没有可用响应，因此这条回复直接使用当前聊天上下文生成。')}</p>
    {latency}
    <div className="mt-2 grid gap-2 text-xs"><p className={`rounded-lg px-2.5 py-2 ${run.used_event_ids.length || run.used_element_ids.length ? 'bg-emerald-50 text-emerald-800' : 'bg-white text-gray-600'}`}><b>{isEnglish ? 'Actually adopted: ' : '最终实际采纳：'}</b>{[...run.used_event_ids, ...run.used_element_ids].length ? [...run.used_event_ids, ...run.used_element_ids].join('、') : (isEnglish ? 'No existing memory adopted' : '未采纳已有记忆')}</p>{run.proposal_count > 0 && <p className="rounded-lg bg-white px-2.5 py-2 text-gray-600"><b>{isEnglish ? 'Write proposals: ' : '写入提案：'}</b>{isEnglish ? `${run.proposal_count} applied.` : `${run.proposal_count} 个，已应用。`}</p>}</div>
    {run.fallback_reason && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-800">{isEnglish && run.fallback_reason === '模型没有按“回复加引用 ID”的最终协议返回；本轮不采用记忆结果并回退为普通聊天。' ? 'The model did not return the required final reply-with-reference-IDs format. Memory results were not used this turn, so the chat fell back to the standard flow.' : run.fallback_reason}</p>}
    {run.calls.length > 0 && <div className="mt-2 space-y-1.5">{run.calls.map((call, index) => <details key={`${call.name}-${index}`} className="rounded-lg bg-white px-2.5 py-2"><summary className="cursor-pointer text-xs font-medium text-gray-700">{call.name} · {call.result.ok === true ? (isEnglish ? 'Succeeded' : '执行成功') : call.result.ok === false ? (isEnglish ? 'Failed' : '执行未通过') : (isEnglish ? 'Returned a result' : '已返回结果')}</summary><div className="mt-2 grid gap-2 sm:grid-cols-2"><label className="text-[11px] text-gray-500">{isEnglish ? 'Arguments' : '参数'}<pre className="mt-1 max-h-36 overflow-auto rounded bg-gray-50 p-2 text-[10px] leading-4 text-gray-700">{JSON.stringify(call.arguments, null, 2)}</pre></label><label className="text-[11px] text-gray-500">{isEnglish ? 'Result' : '结果'}<pre className="mt-1 max-h-36 overflow-auto rounded bg-gray-50 p-2 text-[10px] leading-4 text-gray-700">{JSON.stringify(call.result, null, 2)}</pre></label></div></details>)}</div>}
  </div>;
}

function ChatMemoryRuntimePanel({ runtime, messages, loading, onRefresh, onRetry, retryingBatchId, isEnglish }: { runtime: ChatMemoryRuntimeDebug | null; messages: LocalChatMessage[]; loading: boolean; onRefresh: () => void; onRetry: (id: string) => void; retryingBatchId: string | null; isEnglish: boolean }) {
  const contentById = new Map(messages.map((message) => [message.id, message]));
  const statusClass = (status: string) => status === 'completed' ? 'bg-emerald-100 text-emerald-700' : status === 'processing' ? 'bg-brand-100 text-brand-700' : status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700';
  const statusLabel = (status: string) => status === 'completed' ? (isEnglish ? 'Completed' : '已完成') : status === 'processing' ? (isEnglish ? 'Compacting' : '整理中') : status === 'pending' ? (isEnglish ? 'Retrying automatically' : '自动重试中') : (isEnglish ? 'Compaction failed' : '整理失败');
  return <Card className="p-4">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="text-sm font-semibold text-gray-800">{isEnglish ? 'Conversation memory runtime map' : '对话记忆运行图'}</h3><p className="mt-1 text-xs leading-5 text-gray-500">{isEnglish ? 'Original text is always retained. This view shows the main-model window, compaction batches, and retrieval calls.' : '原文始终保留；这里展示主模型窗口、整理批次与读取调用。'}</p></div>
      <Button variant="ghost" size="sm" icon={RefreshCw} loading={loading} onClick={onRefresh} />
    </div>
    {!runtime ? <p className="mt-3 text-xs text-gray-500">{isEnglish ? 'No runtime data yet.' : '暂无运行数据。'}</p> : <div className="mt-3 space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center text-xs"><div className="rounded-lg bg-gray-50 p-2"><Database size={14} className="mx-auto text-gray-500" /><b className="mt-1 block text-gray-800">{runtime.full_message_count}</b><span className="text-gray-500">{isEnglish ? 'All original text' : '全部原文'}</span></div><div className="rounded-lg bg-brand-50 p-2"><Layers3 size={14} className="mx-auto text-brand-600" /><b className="mt-1 block text-brand-800">{runtime.short_term_message_ids.length}</b><span className="text-brand-700">{isEnglish ? 'Main-model original text' : '主模型原文'}</span></div><div className="rounded-lg bg-amber-50 p-2"><Archive size={14} className="mx-auto text-amber-600" /><b className="mt-1 block text-amber-800">{runtime.pending_message_ids.length}</b><span className="text-amber-700">{isEnglish ? 'Original text pending compaction' : '待整理原文'}</span></div></div>
      <details className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"><summary className="cursor-pointer text-xs font-medium text-gray-700">{isEnglish ? 'Current conversation state summary' : '当前会话状态摘要'}</summary><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-gray-600">{runtime.working_summary || (isEnglish ? 'No batch has been compacted yet.' : '尚未有批次被整理。')}</p></details>
      <div className="space-y-2"><p className="flex items-center gap-1.5 text-xs font-medium text-gray-700"><BrainCircuit size={13} />{isEnglish ? 'Compactor batches' : '整理器批次'}</p>{runtime.compactions.length === 0 ? <p className="text-xs text-gray-500">{isEnglish ? 'The first batch appears after 16 complete turns.' : '累计到第 16 个完整轮次后才会出现第一批。'}</p> : runtime.compactions.map((batch) => <details key={batch.id} className="rounded-lg border border-gray-100 bg-white px-3 py-2"><summary className="flex cursor-pointer items-center justify-between gap-2 text-xs"><span className="font-medium text-gray-700">{isEnglish ? `Turns ${batch.start_turn}–${batch.end_turn}` : `第 ${batch.start_turn}–${batch.end_turn} 轮`}</span><span className="flex items-center gap-1.5"><span className="text-gray-400">{isEnglish ? `${batch.calls.length} reads · ${batch.event_ids.length + batch.element_ids.length} writes` : `${batch.calls.length} 次读取 · ${batch.event_ids.length + batch.element_ids.length} 项写入`}</span><span className={`rounded px-1.5 py-0.5 ${statusClass(batch.status)}`}>{statusLabel(batch.status)}</span></span></summary><div className="mt-2 space-y-2 text-xs leading-5 text-gray-600">{batch.error && <p className="rounded bg-red-50 px-2 py-1.5 text-red-700">{batch.error}</p>}{batch.status === 'pending' && <p className="text-amber-700">{isEnglish ? `Automatically retried ${Math.max(0, batch.attempt_count - 1)}/3 times${batch.next_retry_at ? `; the next attempt starts at ${formatUtcStorageTime(batch.next_retry_at, true)}.` : '.'}` : `已自动重试 ${Math.max(0, batch.attempt_count - 1)}/3 次${batch.next_retry_at ? `，下一次将在 ${formatUtcStorageTime(batch.next_retry_at, true)} 发起。` : '。'}`}</p>}{batch.status === 'failed' && <div className="flex items-center justify-between gap-2 rounded bg-red-50 px-2 py-1.5"><span className="text-red-700">{isEnglish ? 'Automatic retries failed after 3 attempts.' : '已自动重试 3 次仍未完成。'}</span><Button variant="danger" size="sm" loading={retryingBatchId === batch.id} onClick={() => onRetry(batch.id)}>{isEnglish ? 'Retry' : '重试'}</Button></div>}<p><b>{isEnglish ? 'Conversation summary: ' : '会话摘要：'}</b>{batch.conversation_summary || (isEnglish ? 'Not produced yet.' : '尚未产出。')}</p><p><b>{isEnglish ? 'Default L0: ' : '默认 L0：'}</b>{batch.resident_memory.length ? batch.resident_memory.map((item) => `${isEnglish ? (item.kind === 'event' ? 'Event' : 'Element') : (item.kind === 'event' ? '事件' : '元素')} · ${item.label}`).join('、') : (isEnglish ? 'None' : '无')}</p><p><b>{isEnglish ? 'Tool calls: ' : '工具调用：'}</b>{batch.calls.length ? batch.calls.map((call) => call.name).join(' → ') : (isEnglish ? 'None (default L0 was sufficient or tools were unavailable)' : '未调用（默认 L0 已足够或工具不可用）')}</p>{batch.calls.map((call, index) => <details key={`${call.name}-${index}`} className="rounded bg-gray-50 px-2 py-1.5"><summary className="cursor-pointer">{call.name}</summary><pre className="mt-1 max-h-28 overflow-auto text-[10px] leading-4">{JSON.stringify({ arguments: call.arguments, result: call.result }, null, 2)}</pre></details>)}<details className="rounded bg-gray-50 px-2 py-1.5"><summary className="cursor-pointer">{isEnglish ? `Full original text for this batch (${batch.source_refs.length})` : `本批完整原文（${batch.source_refs.length} 条）`}</summary><div className="mt-1 space-y-1">{batch.source_refs.map((id) => <p key={id} className="break-words">{contentById.get(id) ? `${contentById.get(id)!.role === 'user' ? (isEnglish ? 'You' : '你') : (isEnglish ? 'Ducky' : '小黄鸭')}：${contentById.get(id)!.content}` : isEnglish ? `[${id}] Original text is retained but has not been loaded into this page.` : `[${id}] 原文仍保存，当前页面尚未加载该条。`}</p>)}</div></details></div></details>)}</div>
    </div>}
  </Card>;
}

export function AiPage() {
  const { isEnglish, t, enumLabel, durationLabel } = useTranslation();
  const api = useXiabanyaApi();
  const [messages, setMessages] = useState<LocalChatMessage[]>([]);
  const [contextItems, setContextItems] = useState<VisionResultWithDuration[]>([]);
  const [input, setInput] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [selectedToolDebugMessageId, setSelectedToolDebugMessageId] = useState<string | null>(null);
  const [toolDebugByAssistantId, setToolDebugByAssistantId] = useState<Record<string, MemoryToolDebugRun | null>>({});
  const [loadingToolDebugMessageId, setLoadingToolDebugMessageId] = useState<string | null>(null);
  const [memoryRuntime, setMemoryRuntime] = useState<ChatMemoryRuntimeDebug | null>(null);
  const [loadingMemoryRuntime, setLoadingMemoryRuntime] = useState(false);
  const [retryingCompactionId, setRetryingCompactionId] = useState<string | null>(null);
  const activeStreamIdRef = useRef<string | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingPrependScrollRef = useRef<{ height: number; top: number } | null>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const container = chatScrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await api.chat.listMessages({ limit: CHAT_HISTORY_PAGE_SIZE });
      setMessages(data.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.created_at,
        sequence: message.sequence,
        responseLatencyMs: message.response_latency_ms,
        visionUnderstandingLatencyMs: message.vision_understanding_latency_ms,
        totalWaitLatencyMs: message.total_wait_latency_ms,
      })));
      setHasOlderMessages(data.length === CHAT_HISTORY_PAGE_SIZE);
      requestAnimationFrame(() => scrollToBottom('auto'));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '加载失败';
      toast.error(`加载聊天历史失败: ${msg}`);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadOlderMessages = async () => {
    const oldest = messages[0];
    if (!oldest?.createdAt || !oldest.sequence || loadingOlderMessages || !hasOlderMessages) return;
    const container = chatScrollRef.current;
    if (container) {
      pendingPrependScrollRef.current = { height: container.scrollHeight, top: container.scrollTop };
    }
    setLoadingOlderMessages(true);
    try {
      const data = await api.chat.listMessages({
        limit: CHAT_HISTORY_PAGE_SIZE,
        before: { createdAt: oldest.createdAt, sequence: oldest.sequence },
      });
      setMessages((current) => {
        const knownIds = new Set(current.map((message) => message.id));
        const older = data
          .filter((message) => !knownIds.has(message.id))
          .map((message) => ({ id: message.id, role: message.role, content: message.content, createdAt: message.created_at, sequence: message.sequence, responseLatencyMs: message.response_latency_ms, visionUnderstandingLatencyMs: message.vision_understanding_latency_ms, totalWaitLatencyMs: message.total_wait_latency_ms }));
        return [...older, ...current];
      });
      setHasOlderMessages(data.length === CHAT_HISTORY_PAGE_SIZE);
    } catch (error: unknown) {
      pendingPrependScrollRef.current = null;
      const message = error instanceof Error ? error.message : '加载失败';
      toast.error(`加载更早聊天失败: ${message}`);
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  useEffect(() => {
    const pending = pendingPrependScrollRef.current;
    const container = chatScrollRef.current;
    if (!pending || !container) return;
    container.scrollTop = pending.top + container.scrollHeight - pending.height;
    pendingPrependScrollRef.current = null;
  }, [messages]);

  const handleChatScroll = () => {
    const container = chatScrollRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollToBottom(distanceFromBottom > CHAT_BOTTOM_THRESHOLD);
    if (container.scrollTop <= CHAT_TOP_LOAD_THRESHOLD) void loadOlderMessages();
  };

  const loadContext = async () => {
    setLoadingContext(true);
    try {
      const day = today();
      const data = await api.vision.listByDate({ start: day, end: day, limit: 12 });
      setContextItems(data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '加载失败';
      toast.error(`加载今日上下文失败: ${msg}`);
    } finally {
      setLoadingContext(false);
    }
  };

  const loadMemoryRuntime = async () => {
    setLoadingMemoryRuntime(true);
    try {
      setMemoryRuntime(await api.memory.getChatRuntimeDebug());
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast.error(`读取对话记忆运行图失败: ${message}`);
    } finally {
      setLoadingMemoryRuntime(false);
    }
  };

  const retryChatCompaction = async (id: string) => {
    setRetryingCompactionId(id);
    try {
      if (!await api.memory.retryChatCompaction(id)) {
        toast.error('该整理批次当前不能重试，请刷新后再试。');
        return;
      }
      toast.success('已重新入队，正在尝试整理。');
      await loadMemoryRuntime();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast.error(`重试整理批次失败: ${message}`);
    } finally {
      setRetryingCompactionId(null);
    }
  };

  useEffect(() => {
    loadHistory();
    loadContext();
    loadMemoryRuntime();
  }, []);

  useEffect(() => api.memory.onUpdated(() => { void loadMemoryRuntime(); }), []);

  useEffect(() => {
    const offDelta = api.chat.onDelta(({ streamId, type, delta }) => {
      if (streamId !== activeStreamIdRef.current || !activeAssistantIdRef.current) return;
      const assistantId = activeAssistantIdRef.current;
      if (type === 'status') {
        setMessages((prev) => prev.map((message) => (
          message.id === assistantId ? { ...message, status: delta } : message
        )));
        return;
      }
      if (type !== 'content') return;
      setMessages((prev) => prev.map((message) => (
        message.id === assistantId
          ? { ...message, content: message.content + delta, status: undefined }
          : message
      )));
    });

    const offDone = api.chat.onDone(({ streamId, assistantMessageId, firstResponseLatencyMs, visionUnderstandingLatencyMs, totalWaitLatencyMs }) => {
      if (streamId !== activeStreamIdRef.current || !activeAssistantIdRef.current) return;
      const assistantId = activeAssistantIdRef.current;
      setMessages((prev) => prev.map((message) => (
        message.id === assistantId ? {
          ...message,
          id: assistantMessageId || message.id,
          pending: false,
          status: undefined,
          responseLatencyMs: firstResponseLatencyMs,
          visionUnderstandingLatencyMs,
          totalWaitLatencyMs,
        } : message
      )));
      activeStreamIdRef.current = null;
      activeAssistantIdRef.current = null;
      setStreaming(false);
      loadContext();
      loadMemoryRuntime();
    });

    const offError = api.chat.onError(({ streamId, message }) => {
      if (streamId !== activeStreamIdRef.current || !activeAssistantIdRef.current) return;
      const assistantId = activeAssistantIdRef.current;
      setMessages((prev) => prev.map((item) => (
        item.id === assistantId
          ? { ...item, content: message || '下班鸭暂时没能回复。', pending: false, error: true, status: undefined }
          : item
      )));
      activeStreamIdRef.current = null;
      activeAssistantIdRef.current = null;
      setStreaming(false);
    });

    return () => {
      offDelta();
      offDone();
      offError();
    };
  }, []);

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || streaming) return;

    const userMessage: LocalChatMessage = {
      id: makeLocalId('user'),
      role: 'user',
      content,
    };
    const assistantMessage: LocalChatMessage = {
      id: makeLocalId('assistant'),
      role: 'assistant',
      content: '',
      pending: true,
      status: isEnglish ? 'Ducky is thinking…' : '小黄鸭在想…',
    };
    const nextMessages = [...messages, userMessage, assistantMessage];
    setMessages(nextMessages);
    requestAnimationFrame(() => scrollToBottom());
    setInput('');
    setStreaming(true);
    const streamId = makeStreamId();
    activeStreamIdRef.current = streamId;
    activeAssistantIdRef.current = assistantMessage.id;

    try {
      await api.chat.startStream(toChatMessages([...messages, userMessage]), streamId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '发送失败';
      setMessages((prev) => prev.map((message) => (
        message.id === assistantMessage.id
          ? { ...message, content: msg, pending: false, error: true, status: undefined }
          : message
      )));
      activeAssistantIdRef.current = null;
      activeStreamIdRef.current = null;
      setStreaming(false);
      toast.error(`发送失败: ${msg}`);
    }
  };

  const abortStream = async () => {
    const streamId = activeStreamIdRef.current;
    if (!streamId) return;
    await api.chat.abortStream(streamId);
    activeStreamIdRef.current = null;
    activeAssistantIdRef.current = null;
    setStreaming(false);
  };

  const toggleToolDebug = async (assistantMessageId: string) => {
    setSelectedToolDebugMessageId((selected) => selected === assistantMessageId ? null : assistantMessageId);
    if (assistantMessageId in toolDebugByAssistantId) return;
    setLoadingToolDebugMessageId(assistantMessageId);
    try {
      const run = await api.memory.getToolDebugForAssistantMessage(assistantMessageId);
      setToolDebugByAssistantId((current) => ({ ...current, [assistantMessageId]: run || null }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      toast.error(`读取工具调用记录失败: ${message}`);
    } finally {
      setLoadingToolDebugMessageId((current) => current === assistantMessageId ? null : current);
    }
  };

  return (
    <>
      <style>{`
        @keyframes thinking-dot-bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1.3); opacity: 1; }
        }
        .thinking-dot {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background-color: #9ca3af;
          animation: thinking-dot-bounce 1.4s ease-in-out infinite;
        }
      `}</style>
    <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-5 h-full min-h-[640px]">
      <Card className="flex flex-col min-h-[640px] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500">{isEnglish ? 'Core capability' : '主能力'}</p>
            <h2 className="text-lg font-semibold text-gray-900">{isEnglish ? 'Talk to an AI that understands your work' : '和理解你工作的 AI 对话'}</h2>
          </div>
          <Button variant="secondary" size="sm" icon={RefreshCw} loading={loadingHistory} onClick={loadHistory}>
            {isEnglish ? 'Refresh history' : '刷新历史'}
          </Button>
        </div>

        <div className="relative flex-1 min-h-0">
          <div ref={chatScrollRef} onScroll={handleChatScroll} className="h-full overflow-auto p-5 space-y-4 bg-gray-50/60">
            {loadingOlderMessages && <div className="sticky top-0 z-10 mx-auto w-fit rounded-full border border-gray-200 bg-white/95 px-3 py-1 text-xs text-gray-500 shadow-sm">{isEnglish ? 'Loading earlier messages…' : '正在加载更早消息…'}</div>}
            {loadingHistory ? (
            <Skeleton.List count={8} />
          ) : messages.length === 0 ? (
            <div className="h-full min-h-[360px] flex items-center justify-center">
              <div className="text-center max-w-sm">
                <div className="w-12 h-12 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center mx-auto">
                  <Bot size={24} />
                </div>
                <h3 className="text-sm font-semibold text-gray-800 mt-4">{isEnglish ? "Start with today's work context" : '从今天的工作上下文开始问'}</h3>
                <p className="text-sm text-gray-500 mt-2 leading-6">
                  {isEnglish ? 'For example: “What did I mainly do today?”, “What was that development work this morning?”, or “Help me prepare material for a work report.”' : '例如“今天我主要干了什么？”、“上午那段开发在做什么？”、“帮我准备一份日报素材”。'}
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => {
              const isUser = message.role === 'user';
              const isShortTermRaw = memoryRuntime?.short_term_message_ids.includes(message.id);
              const compaction = memoryRuntime?.compactions.find((batch) => batch.source_refs.includes(message.id));
              const Icon = isUser ? User : Bot;
              const canInspectToolDebug = !isUser && !message.pending;
              const isToolDebugOpen = selectedToolDebugMessageId === message.id;
              const bubbleClass = `rounded-xl px-3 py-2 text-sm leading-6 whitespace-pre-wrap break-words ${
                isUser
                  ? 'bg-gray-900 text-white rounded-br-md'
                  : message.error
                    ? 'bg-red-50 text-red-700 border border-red-100 rounded-bl-md'
                    : 'bg-white text-gray-800 border border-gray-100 rounded-bl-md'
              }`;
              const bubbleContent = message.content || (message.pending ? (
                <span className="flex items-center gap-2">
                  <span className="text-base leading-none shrink-0">🐥</span>
                   <span className="text-gray-600">{message.status || (isEnglish ? 'Duck is thinking' : '小黄鸭正在思考')}</span>
                  <span className="inline-flex items-center gap-[3px] ml-0.5">
                    <span className="thinking-dot" style={{ animationDelay: '0s' }} />
                    <span className="thinking-dot" style={{ animationDelay: '0.2s' }} />
                    <span className="thinking-dot" style={{ animationDelay: '0.4s' }} />
                  </span>
                </span>
              ) : '');
              return (
                <div key={message.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
                      <Icon size={16} />
                    </div>
                  )}
                  <div className={`max-w-[78%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    {canInspectToolDebug ? <button type="button" onClick={() => void toggleToolDebug(message.id)} className={`${bubbleClass} cursor-pointer text-left transition-colors hover:border-brand-200 hover:bg-brand-50/30`} title={isEnglish ? 'View tools used for this reply' : '点击查看本轮工具调用'}>{bubbleContent}</button> : <div className={bubbleClass}>{bubbleContent}</div>}
                    {message.pending && (
                      <span className="text-[11px] text-gray-400">{message.status || (isEnglish ? "Replying with today's context" : '正在根据今日上下文回复')}</span>
                    )}
                    {!message.pending && (isShortTermRaw || compaction) && <span className={`text-[11px] ${isShortTermRaw ? 'text-brand-600' : compaction?.status === 'completed' ? 'text-emerald-600' : 'text-amber-600'}`}>{isShortTermRaw ? (isEnglish ? 'Main-model full original-text window' : '主模型完整原文窗口') : compaction?.status === 'completed' ? (isEnglish ? `Original text compacted (turns ${compaction.start_turn}–${compaction.end_turn})` : `原文已整理（第 ${compaction.start_turn}–${compaction.end_turn} 轮）`) : (isEnglish ? 'Original text pending compaction / retry' : '原文待整理 / 重试中')}</span>}
                    {canInspectToolDebug && isToolDebugOpen && <ChatToolDebug run={toolDebugByAssistantId[message.id]} loading={loadingToolDebugMessageId === message.id} firstResponseLatencyMs={message.responseLatencyMs} visionUnderstandingLatencyMs={message.visionUnderstandingLatencyMs} totalWaitLatencyMs={message.totalWaitLatencyMs} isEnglish={isEnglish} />}
                  </div>
                  {isUser && (
                    <div className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0">
                      <Icon size={16} />
                    </div>
                  )}
                </div>
              );
            })
            )}
          </div>
          {showScrollToBottom && (
            <button
              type="button"
              onClick={() => scrollToBottom()}
              className="absolute bottom-4 right-5 flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-md transition hover:border-brand-200 hover:text-brand-700"
              title={isEnglish ? 'Back to newest message' : '回到最新消息'}
              aria-label={isEnglish ? 'Back to newest message' : '回到最新消息'}
            >
              <ChevronDown size={18} />
            </button>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-white">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={isEnglish ? 'Ask about today, a time range, report material, or your work rhythm…' : '问问今天、某个时间段、日报素材或你的工作节奏...'}
              className="flex-1 min-h-11 max-h-32 resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
            />
            {streaming ? (
              <Button variant="secondary" icon={AlertCircle} onClick={abortStream}>
                {isEnglish ? 'Stop' : '停止'}
              </Button>
            ) : (
              <Button icon={Send} onClick={sendMessage} disabled={!input.trim()}>
                {isEnglish ? 'Send' : '发送'}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <aside className="space-y-4">
        <ChatMemoryRuntimePanel runtime={memoryRuntime} messages={messages} loading={loadingMemoryRuntime} onRefresh={() => void loadMemoryRuntime()} onRetry={(id) => void retryChatCompaction(id)} retryingBatchId={retryingCompactionId} isEnglish={isEnglish} />
        <Card className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">{isEnglish ? "Today's context" : '今日上下文'}</h3>
              <p className="text-xs text-gray-500 mt-1">{isEnglish ? "This chat can use today's Vision, window records, and idle periods." : '当前聊天会使用今日 Vision、窗口记录和空闲时段。'}</p>
            </div>
            <Button variant="ghost" size="sm" icon={RefreshCw} loading={loadingContext} onClick={loadContext} />
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">{isEnglish ? 'Visible Vision segments' : '可见 Vision 片段'}</h3>
          {loadingContext ? (
            <Skeleton.List count={5} />
          ) : contextItems.length === 0 ? (
            <p className="text-sm text-gray-500 leading-6">{isEnglish ? 'There are no visible Vision results today. Turn on Vision Auto to give the AI useful time segments here.' : '今天还没有可展示的 Vision 结果。开启 Vision Auto 后，这里会显示 AI 可参考的时间片段。'}</p>
          ) : (
            <div className="space-y-3">
              {contextItems.slice(0, 8).map((item) => (
                <div key={item.id} className="border border-gray-100 rounded-lg p-3 bg-white">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-400">{formatUtcStorageTime(item.created_at)}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-800 mt-2 line-clamp-1">{item.title}</p>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.observed_fact || item.summary}</p>
                  <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-400">
                    <Clock size={11} />
                    <span>{item.approx_duration_sec > 0 ? (isEnglish ? durationLabel(item.approx_duration_sec) : dur(item.approx_duration_sec)) : (isEnglish ? 'Unknown duration' : '时长未知')}</span>
                    <span>{enumLabel(item.confidence || 'medium')}</span>
                    <span>{enumLabel(item.activity_type || 'unclear')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-800">{isEnglish ? 'What it can and cannot do' : '能力边界'}</h3>
          <p className="text-xs text-gray-500 mt-2 leading-5">
            {isEnglish ? 'Main chat and the session organizer share an L0 index of event and element cards and can expand it when needed. Original conversations are retained; confirm important work conclusions against Timeline evidence.' : '主聊天和会话整理器共享事件卡、元素卡的 L0 索引，并可按需展开；对话原文始终保留。关键工作结论仍应回到 Timeline 证据层确认。'}
          </p>
        </Card>
      </aside>
    </div>
    </>
  );
}

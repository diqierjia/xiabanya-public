import { useEffect, useMemo, useState } from 'react';
import { Archive, BookOpenText, CircleDot, Clock3, Eye, FileText, FolderKanban, GitFork, Info, Link2, Loader2, MessageSquareQuote, Moon, Pencil, Pin, PinOff, RefreshCw, Search, ShieldCheck, Sparkles, Trash2, UserRound, Wrench } from 'lucide-react';
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { toast } from '../components/ui/Toast';
import { useXiabanyaApi } from '../hooks/useXiabanyaApi';
import type { MemoryDashboard, MemoryElement, MemoryElementDetail, MemoryEvent, MemoryEventDetail, MemoryStatus, MemoryToolDebugRun } from '../../shared/types';
import { formatUtcStorageDateTimeLocal } from '../../shared/time';

type Selection = { kind: 'event'; id: string } | { kind: 'element'; id: string } | null;

const STATUS_LABEL: Record<MemoryStatus, string> = {
  active: '活跃',
  superseded: '已纠正',
  archived: '已归档',
  forgotten: '已遗忘',
};

const STATUS_STYLE: Record<MemoryStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  superseded: 'bg-gray-100 text-gray-600',
  archived: 'bg-amber-50 text-amber-700',
  forgotten: 'bg-red-50 text-red-600',
};

function formatStamp(value: string): string {
  return formatUtcStorageDateTimeLocal(value);
}

function weightLabel(weight: number): string {
  if (weight > 0.7) return '活跃';
  if (weight > 0.4) return '常规';
  if (weight > 0.15) return '衰退';
  return '遗忘';
}

function weightColor(weight: number): string {
  if (weight > 0.7) return 'text-emerald-600';
  if (weight > 0.4) return 'text-amber-600';
  if (weight > 0.15) return 'text-orange-600';
  return 'text-red-600';
}

function EventCard({ event, selected, onClick }: { event: MemoryEvent; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border p-4 transition-all hover:border-brand-300 hover:shadow-sm ${selected ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-200' : 'border-gray-200 bg-white'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-400 flex items-center gap-1"><Clock3 size={12} />{formatStamp(event.timestamp)}</p>
          <h3 className="mt-2 text-sm font-semibold text-gray-900 leading-5 line-clamp-2">{event.title}</h3>
          <p className="mt-1 font-mono text-[10px] text-gray-400 truncate">{event.id}</p>
        </div>
        <Sparkles size={17} className="shrink-0 text-brand-600" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">{event.scope}</span>
        <span className={`rounded-md px-1.5 py-0.5 text-[11px] ${STATUS_STYLE[event.status]}`}>{STATUS_LABEL[event.status]}</span>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-gray-500">权重 <b className={weightColor(event.weight.value)}>{event.weight.value.toFixed(2)}</b></span>
        <span className="text-gray-500 flex items-center gap-1"><MessageSquareQuote size={13} />{event.weight.mention_count}</span>
      </div>
    </button>
  );
}

function ElementCard({ element, selected, onClick }: { element: MemoryElement; selected: boolean; onClick: () => void }) {
  const Icon = element.type === 'project' ? FolderKanban : element.type === 'person' ? UserRound : Sparkles;
  const kindLabel = element.special_role === 'user' ? '特殊元素 · 用户' : element.special_role === 'assistant' ? '特殊元素 · 下班鸭' : element.type;
  return (
    <button type="button" onClick={onClick} className={`text-left rounded-xl border p-4 transition-all hover:border-brand-300 ${selected ? 'border-brand-500 bg-brand-50/40 ring-1 ring-brand-200' : 'border-gray-200 bg-white'}`}>
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <Icon size={19} className="text-brand-600" />
          <h3 className="mt-3 text-sm font-semibold text-gray-900 truncate">{element.name}</h3>
          <p className="mt-1 text-xs text-gray-500 truncate">{element.current_state || '等待更多事件补全状态'}</p>
        </div>
        {element.weight.pinned && <Pin size={15} className="text-emerald-600" />}
      </div>
      <div className="mt-3 flex justify-between text-xs text-gray-500"><span>{kindLabel} · {element.event_count} 个事件</span><b className={weightColor(element.weight.value)}>{element.weight.value.toFixed(2)}</b></div>
    </button>
  );
}

function buildChartData(detail: MemoryEventDetail, currentTurn: number) {
  const history = [...detail.weight_history].sort((a, b) => a.turn - b.turn || a.created_at.localeCompare(b.created_at));
  if (detail.weight.pinned) return [{ turn: Math.max(0, history[0]?.turn || 0), value: 1 }, { turn: Math.max(currentTurn, 1), value: 1 }];
  const floor = detail.weight.floor_weight;
  const cap = detail.weight.forced_cap;
  const points: Array<{ turn: number; value: number }> = [];
  const resets = history.filter((item) => item.kind === 'created' || item.kind === 'adopted');
  for (let index = 0; index < resets.length; index += 1) {
    const reset = resets[index];
    const nextTurn = resets[index + 1]?.turn ?? currentTurn;
    const mentions = Math.max(1, index + 1);
    const lambda = 0.15 / (1 + 1.5 * Math.log(mentions));
    if (index === 0 || points.at(-1)?.turn !== reset.turn) points.push({ turn: reset.turn, value: Math.min(1, cap ?? 1) });
    for (let turn = reset.turn + 1; turn <= nextTurn; turn += 1) {
      const value = Math.min(Math.max(floor, Math.exp(-lambda * (turn - reset.turn))), cap ?? 1);
      points.push({ turn, value: Number(value.toFixed(3)) });
    }
    if (index < resets.length - 1) points.push({ turn: nextTurn, value: Math.min(1, cap ?? 1) });
  }
  return points.length > 0 ? points : [{ turn: 0, value: detail.weight.value }, { turn: Math.max(1, currentTurn), value: detail.weight.value }];
}

function EventDetail({ detail, currentTurn, onRefresh }: { detail: MemoryEventDetail; currentTurn: number; onRefresh: () => Promise<void> }) {
  const api = useXiabanyaApi();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(detail.title);
  const [summary, setSummary] = useState(detail.summary);
  const [tags, setTags] = useState(detail.tags.join('、'));
  const [saving, setSaving] = useState(false);
  const chartData = useMemo(() => buildChartData(detail, currentTurn), [detail, currentTurn]);
  const chartStartTurn = chartData[0]?.turn ?? 0;
  // Anchor the chart to this event's first recorded turn. A newly-created event
  // therefore begins at the left edge even when it was created in a later global turn.
  const chartEndTurn = Math.max(currentTurn, chartStartTurn + 1);

  useEffect(() => {
    setTitle(detail.title);
    setSummary(detail.summary);
    setTags(detail.tags.join('、'));
    setEditing(false);
  }, [detail.id]);

  const action = async (name: 'pin' | 'unpin' | 'forget' | 'restore') => {
    await api.memory.actionEvent(detail.id, name);
    await onRefresh();
  };
  const save = async () => {
    setSaving(true);
    try {
      await api.memory.updateEvent(detail.id, { title, summary, tags: tags.split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean) });
      setEditing(false);
      await onRefresh();
      toast.success('记忆卡已更新');
    } catch (error) {
      toast.error(`保存失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!window.confirm('删除后无法恢复这张事件卡及其关联关系，确定继续吗？')) return;
    await api.memory.deleteEvent(detail.id);
    await onRefresh();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {editing ? <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-lg border border-brand-300 px-2 py-1 text-lg font-semibold outline-none" /> : <h2 className="text-lg font-semibold text-gray-900 leading-7">{detail.title}</h2>}
          <p className="mt-1 font-mono text-xs text-gray-400">{detail.id}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="success" icon={Pencil} onClick={() => setEditing((value) => !value)}>编辑</Button>
          <Button size="sm" variant="danger" icon={Trash2} onClick={remove}>删除</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs ${STATUS_STYLE[detail.status]}`}>{STATUS_LABEL[detail.status]}</span>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">{detail.scope}</span>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">{detail.criticality}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="当前权重" value={detail.weight.value.toFixed(2)} accent />
        <Stat label="提及次数" value={String(detail.weight.mention_count)} />
        <Stat label="上次检索" value={detail.weight.last_retrieved_at ? formatStamp(detail.weight.last_retrieved_at).slice(5) : '尚未检索'} small />
        <Stat label="floor_weight" value={detail.weight.floor_weight.toFixed(2)} />
      </div>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-800">遗忘曲线</h3><span className={`text-xs font-medium ${weightColor(detail.weight.value)}`}>{weightLabel(detail.weight.value)}</span></div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <XAxis type="number" dataKey="turn" domain={[chartStartTurn, chartEndTurn]} tick={{ fontSize: 11, fill: '#9ca3af' }} label={{ value: '聊天轮次', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#9ca3af' }} />
              <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <ReferenceLine y={0.7} stroke="#86efac" strokeDasharray="3 3" />
              <ReferenceLine y={0.4} stroke="#fcd34d" strokeDasharray="3 3" />
              <ReferenceLine y={0.15} stroke="#fca5a5" strokeDasharray="3 3" />
              <Tooltip formatter={(value) => [Number(value).toFixed(2), '权重']} labelFormatter={(turn) => `第 ${turn} 轮`} />
              <Line type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-xs text-gray-500">检索只记录访问时间；只有回复实际采纳时，曲线才会回到 1.0。</p>
      </Card>

      <Card className="overflow-hidden">
        <Disclosure title="L0 索引" badge="默认注入" tone="green"><p className="font-medium text-gray-800">{detail.title}</p><p className="mt-1 text-sm text-gray-600">{editing ? <textarea value={summary} onChange={(event) => setSummary(event.target.value)} className="w-full rounded-lg border border-brand-300 p-2 outline-none" rows={3} /> : detail.summary}</p><p className="mt-2 text-xs text-brand-700">标签：{editing ? <input value={tags} onChange={(event) => setTags(event.target.value)} className="rounded border border-brand-300 px-1.5 py-0.5" /> : detail.tags.map((tag) => `#${tag}`).join(' ') || '—'}</p></Disclosure>
        <Disclosure title="L1 叙事" badge="按需展开" tone="amber"><p className="text-sm leading-6 text-gray-600">{detail.narrative}</p></Disclosure>
        <Disclosure title="L2 结构" badge="关系与元素" tone="blue">
          <div className="space-y-2 text-sm text-gray-600">
            <p>参与元素：{detail.elements.length ? detail.elements.map((element) => `${element.name}（${element.role}）`).join('、') : '—'}</p>
            <p>事件关系：{detail.relations.length ? detail.relations.map((relation) => `${relation.type} → ${relation.target_event_id}`).join('；') : '—'}</p>
          </div>
        </Disclosure>
        <Disclosure title="L3 原话" badge="用户原文" tone="violet"><div className="space-y-2">{detail.quotes.length ? detail.quotes.map((quote, index) => <p key={index} className="rounded-lg bg-violet-50 p-2 text-sm leading-6 text-violet-900">“{quote}”</p>) : <p className="text-sm text-gray-400">暂无可引用原话</p>}</div></Disclosure>
        <Disclosure title="L4 原始" badge="来源引用" tone="gray"><p className="font-mono text-xs text-gray-500">{detail.source_refs.join(' · ') || '暂无来源'}</p></Disclosure>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-gray-800">治理与生命周期</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Stat label="confidence" value={detail.confidence.toFixed(2)} /><Stat label="状态" value={STATUS_LABEL[detail.status]} /></div>
        <div className="mt-4 flex flex-wrap gap-2">
          {detail.weight.pinned ? <Button size="sm" variant="secondary" icon={PinOff} onClick={() => action('unpin')}>取消固定</Button> : <Button size="sm" variant="success" icon={Pin} onClick={() => action('pin')}>固定</Button>}
          {detail.status === 'forgotten' ? <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => action('restore')}>恢复检索</Button> : <Button size="sm" variant="ghost" icon={Moon} onClick={() => action('forget')}>遗忘此卡</Button>}
        </div>
      </Card>
      {editing && <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>取消</Button><Button size="sm" loading={saving} onClick={save}>保存修改</Button></div>}
    </div>
  );
}

function ElementDetail({ detail }: { detail: MemoryElementDetail }) {
  return <div className="space-y-5">
    <div><p className="text-xs text-gray-500">{detail.special_role ? `特殊元素卡 · ${detail.special_role === 'user' ? '用户' : '下班鸭'}` : `元素卡 · ${detail.type}`}</p><h2 className="mt-1 text-lg font-semibold text-gray-900">{detail.name}</h2><p className="mt-2 text-sm leading-6 text-gray-600">{detail.current_state || '尚未形成稳定当前状态。'}</p></div>
    <div className="grid grid-cols-2 gap-2"><Stat label="当前权重" value={detail.weight.value.toFixed(2)} accent /><Stat label="实际使用" value={String(detail.weight.mention_count)} /></div>
    <Card className="p-4"><h3 className="text-sm font-semibold text-gray-800">变化时间线</h3><div className="mt-4 space-y-4">{detail.events.length ? detail.events.map((event) => <div key={event.id} className="relative border-l border-brand-200 pl-4"><CircleDot size={14} className="absolute -left-[7px] top-0 text-brand-600" /><p className="text-xs text-gray-400">{formatStamp(event.timestamp)}</p><p className="mt-1 text-sm font-medium text-gray-800">{event.title}</p><p className="mt-1 text-xs leading-5 text-gray-500">{event.summary}</p></div>) : <p className="text-sm text-gray-400">暂无关联事件</p>}</div></Card>
  </div>;
}

function ToolDebugPanel({ runs }: { runs: MemoryToolDebugRun[] }) {
  return <Card className="p-5">
    <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Wrench size={18} className="text-brand-700" /><h3 className="text-base font-semibold text-gray-900">记忆工具调试记录</h3></div><p className="mt-1 text-xs leading-5 text-gray-500">每轮会保存工具名、参数、返回结果，以及最终回复声明实际采纳的事件或元素。</p></div><span className="text-xs text-gray-400">最近 {runs.length} 轮</span></div>
    <div className="mt-4 space-y-3">
      {!runs.length ? <p className="rounded-lg bg-gray-50 px-3 py-4 text-sm text-gray-500">还没有完成过带记忆工具的聊天。</p> : runs.map((run) => <div key={run.id} className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium text-gray-800">第 {run.turn} 轮 · {formatStamp(run.created_at)}</p><p className="mt-0.5 font-mono text-[10px] text-gray-400">{run.id}</p></div><div className="flex flex-wrap gap-1.5"><span className={`rounded px-1.5 py-0.5 text-[11px] ${run.mode === 'tool' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{run.mode === 'tool' ? '工具聊天完成' : '已回退旧流程'}</span><span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{run.calls.length} 次调用</span></div></div>
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div className={`rounded-lg px-2.5 py-2 ${run.used_event_ids.length || run.used_element_ids.length ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-50 text-gray-600'}`}><b>最终实际采纳：</b>{[...run.used_event_ids, ...run.used_element_ids].length ? [...run.used_event_ids, ...run.used_element_ids].join('、') : '未采纳已有记忆'}</div><div className="rounded-lg bg-gray-50 px-2.5 py-2 text-gray-600"><b>写入提案：</b>{run.proposal_count ? `${run.proposal_count} 个（已应用）` : '无'}</div></div>
        {run.fallback_reason && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-800">{run.fallback_reason}</p>}
        {run.calls.length > 0 && <div className="mt-3 space-y-2">{run.calls.map((call, index) => <details key={`${call.name}-${index}`} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"><summary className="cursor-pointer text-xs font-medium text-gray-700">{call.name} · {call.result.ok === true ? '执行成功' : call.result.ok === false ? '执行未通过' : '已返回结果'}</summary><div className="mt-2 grid gap-2 lg:grid-cols-2"><label className="text-[11px] text-gray-500">参数<pre className="mt-1 max-h-44 overflow-auto rounded bg-white p-2 text-[10px] leading-4 text-gray-700">{JSON.stringify(call.arguments, null, 2)}</pre></label><label className="text-[11px] text-gray-500">结果<pre className="mt-1 max-h-44 overflow-auto rounded bg-white p-2 text-[10px] leading-4 text-gray-700">{JSON.stringify(call.result, null, 2)}</pre></label></div></details>)}</div>}
      </div>)}
    </div>
  </Card>;
}

function Stat({ label, value, accent = false, small = false }: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return <div className="rounded-lg border border-gray-100 bg-white px-2.5 py-2.5 text-center"><p className="text-[11px] text-gray-500">{label}</p><p className={`mt-1 font-semibold ${accent ? 'text-emerald-600' : 'text-gray-900'} ${small ? 'text-xs' : 'text-base'}`}>{value}</p></div>;
}

function Disclosure({ title, badge, tone, children }: { title: string; badge: string; tone: 'green' | 'amber' | 'blue' | 'violet' | 'gray'; children: React.ReactNode }) {
  const toneStyle = { green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700', violet: 'bg-violet-50 text-violet-700', gray: 'bg-gray-100 text-gray-600' }[tone];
  return <div className="border-b border-gray-100 p-4 last:border-b-0"><div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-semibold text-gray-800">{title}</h4><span className={`rounded px-1.5 py-0.5 text-[11px] ${toneStyle}`}>{badge}</span></div>{children}</div>;
}

export function MemoryPage() {
  const api = useXiabanyaApi();
  const [dashboard, setDashboard] = useState<MemoryDashboard | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [eventDetail, setEventDetail] = useState<MemoryEventDetail | null>(null);
  const [elementDetail, setElementDetail] = useState<MemoryElementDetail | null>(null);
  const [toolDebugRuns, setToolDebugRuns] = useState<MemoryToolDebugRun[]>([]);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [status, setStatus] = useState<'all' | MemoryStatus>('all');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [data, debugRuns] = await Promise.all([api.memory.list(), api.memory.listToolDebug(12)]);
      setDashboard(data);
      setToolDebugRuns(debugRuns);
      setSelection((current) => current || (data.events[0] ? { kind: 'event', id: data.events[0].id } : data.elements[0] ? { kind: 'element', id: data.elements[0].id } : null));
    } catch (error) {
      toast.error(`加载记忆失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    void load();
    const unsubscribe = api.memory.onUpdated(() => void load());
    const timer = window.setInterval(() => void load(), 15000);
    return () => { unsubscribe(); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!selection) { setEventDetail(null); setElementDetail(null); return; }
    if (selection.kind === 'event') {
      void api.memory.getEvent(selection.id).then((detail) => { setEventDetail(detail || null); setElementDetail(null); });
    } else {
      void api.memory.getElement(selection.id).then((detail) => { setElementDetail(detail || null); setEventDetail(null); });
    }
  }, [selection, dashboard]);

  const events = useMemo(() => (dashboard?.events || []).filter((event) => {
    const matchQuery = !query || `${event.title} ${event.summary} ${event.tags.join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
    return matchQuery && (scope === 'all' || event.scope === scope) && (status === 'all' || event.status === status);
  }), [dashboard, query, scope, status]);
  const elements = useMemo(() => (dashboard?.elements || []).filter((element) => !query || `${element.name} ${element.current_state}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [dashboard, query]);

  return <div className="mx-auto max-w-[1500px] space-y-5 pb-8">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm text-gray-500">事件网络 × 渐进披露 × 治理管控 × 遗忘曲线</p><h2 className="mt-1 text-2xl font-semibold text-gray-950">Memory 记忆系统</h2></div><Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => void load()}>刷新</Button></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(390px,0.75fr)]">
      <div className="min-w-0 space-y-5">
        <Card className="p-3"><div className="flex flex-wrap gap-2"><label className="relative min-w-[220px] flex-1"><Search size={16} className="absolute left-3 top-2.5 text-gray-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索事件 / 元素 / 标签" className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400" /></label><select value={scope} onChange={(event) => setScope(event.target.value)} className="rounded-lg border border-gray-200 px-2 text-sm text-gray-600"><option value="all">全部作用域</option><option value="project">项目</option><option value="user">用户</option></select><select value={status} onChange={(event) => setStatus(event.target.value as 'all' | MemoryStatus)} className="rounded-lg border border-gray-200 px-2 text-sm text-gray-600"><option value="all">全部状态</option>{Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div></Card>
        <section><div className="mb-3 flex items-center justify-between"><h3 className="text-base font-semibold text-gray-900">A. 事件卡</h3><span className="text-xs text-gray-400">按当前权重排序 · {events.length} 张</span></div>{loading ? <div className="flex h-52 items-center justify-center text-gray-400"><Loader2 className="animate-spin" /></div> : events.length ? <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{events.map((event) => <EventCard key={event.id} event={event} selected={selection?.kind === 'event' && selection.id === event.id} onClick={() => setSelection({ kind: 'event', id: event.id })} />)}</div> : <EmptyState icon={BookOpenText} text="还没有可展示的事件卡。完成一次信息明确的聊天后，小黄鸭会自动写入。" />}</section>
        <section><div className="mb-3 flex items-center justify-between"><h3 className="text-base font-semibold text-gray-900">B. 元素卡</h3><span className="text-xs text-gray-400">由关联事件派生权重</span></div>{elements.length ? <div className="grid gap-3 sm:grid-cols-2">{elements.map((element) => <ElementCard key={element.id} element={element} selected={selection?.kind === 'element' && selection.id === element.id} onClick={() => setSelection({ kind: 'element', id: element.id })} />)}</div> : <EmptyState icon={FolderKanban} text="事件中的人物、项目和概念会自动沉淀为元素卡。" />}</section>
      </div>
      <aside className="min-w-0"><Card className="sticky top-5 min-h-[620px] p-5">{eventDetail ? <EventDetail detail={eventDetail} currentTurn={dashboard?.current_turn || 0} onRefresh={load} /> : elementDetail ? <ElementDetail detail={elementDetail} /> : <div className="flex min-h-[500px] flex-col items-center justify-center text-center"><Eye size={28} className="text-gray-300" /><p className="mt-3 text-sm font-medium text-gray-600">选择一张卡片查看详情</p><p className="mt-1 max-w-xs text-xs leading-5 text-gray-400">这里会展示分层披露、原话来源、遗忘曲线和治理操作。</p></div>}</Card></aside>
    </div>
    <ToolDebugPanel runs={toolDebugRuns} />
    <Card className="border-brand-100 bg-brand-50/40 p-4"><div className="flex gap-3"><Info size={18} className="mt-0.5 shrink-0 text-brand-700" /><p className="text-sm leading-6 text-brand-900">聊天成功后会异步提炼清晰事件，并立即在下一轮对话中参与检索。检索本身不会保鲜；只有模型实际采纳已有记忆，才会重置它的遗忘曲线。所有卡片都可查看来源、编辑、固定或遗忘。</p></div></Card>
  </div>;
}

function EmptyState({ icon: Icon, text }: { icon: React.ElementType; text: string }) { return <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center"><Icon size={24} className="mx-auto text-gray-300" /><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-500">{text}</p></div>; }

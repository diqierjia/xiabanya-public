import { useEffect, useState } from 'react';
import { AlertCircle, Bot, MessageCircle, RefreshCw, Search, User } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { toast } from '../components/ui/Toast';
import { useXiabanyaApi } from '../hooks/useXiabanyaApi';
import type { ChatHistoryMessage } from '../../shared/types';
import { formatUtcStorageDateTimeLocal } from '../../shared/time';

export function ChatHistoryPage() {
  const api = useXiabanyaApi();
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchMessages = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await api.chat.listMessages({
        q: search || undefined,
        limit: 500,
      });
      setMessages(data);
    } catch (e: unknown) {
      setError(true);
      const msg = e instanceof Error ? e.message : '加载失败';
      toast.error(`加载聊天记录失败: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-56 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索聊天内容..."
            className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <Button variant="secondary" size="sm" icon={RefreshCw} loading={loading} onClick={fetchMessages}>
          刷新
        </Button>
      </div>

      {loading ? (
        <Card className="p-5">
          <Skeleton.List count={8} />
        </Card>
      ) : error ? (
        <EmptyState
          icon={AlertCircle}
          title="加载失败"
          description="请检查后重试"
          actionLabel="重试"
          onAction={fetchMessages}
        />
      ) : messages.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title={search ? '没有匹配的聊天记录' : '还没有聊天记录'}
          description="从现在开始，和下班鸭的对话会保存在这里"
        />
      ) : (
        <Card className="p-5">
          <div className="space-y-4">
            {messages.map((message) => {
              const isUser = message.role === 'user';
              const Icon = isUser ? User : Bot;
              return (
                <div
                  key={message.id}
                  className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
                      <Icon size={16} />
                    </div>
                  )}
                  <div className={`max-w-[78%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    <div className="text-[11px] text-gray-400">
                      {isUser ? '我' : '下班鸭'} · {formatUtcStorageDateTimeLocal(message.created_at)}
                    </div>
                    <div
                      className={`rounded-xl px-3 py-2 text-sm leading-6 whitespace-pre-wrap break-words ${
                        isUser
                          ? 'bg-gray-900 text-white rounded-br-md'
                          : 'bg-gray-100 text-gray-800 rounded-bl-md'
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                  {isUser && (
                    <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center shrink-0">
                      <Icon size={16} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

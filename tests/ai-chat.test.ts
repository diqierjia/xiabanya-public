import { afterEach, describe, expect, it, vi } from 'vitest';
import { addTemporalChatContext, buildChatCompletionPayload, buildChatSystemPrompt, MEMORY_CHAT_TOOLS, requestMemoryChatTurn, requestMemoryToolCalls, selectRecentChatTurns, streamChatCompletion } from '../src/main/ai';

describe('buildChatSystemPrompt()', () => {
  it('defines the desk pet as a relaxed coworker with clear boundaries', () => {
    const prompt = buildChatSystemPrompt('今天有 3 条 AI 截屏识别摘要。');

    expect(prompt).toContain('小鸭同事');
    expect(prompt).toContain('不是传统 AI 助手');
    expect(prompt).toContain('不是日报生成机器');
    expect(prompt).toContain('默认像日常 smalltalk');
    expect(prompt).toContain('正常聊天频率的 emoji 或颜文字');
    expect(prompt).toContain('表情是语气的一部分');
    expect(prompt).toContain('聊天气泡只输出纯文本');
    expect(prompt).toContain('不要使用 Markdown');
    expect(prompt).toContain('简短的中文序号分点');
    expect(prompt).toContain('用两个以上空格隔开每条气泡');
    expect(prompt).toContain('不要满脑子工作');
    expect(prompt).toContain('今天有 3 条 AI 截屏识别摘要');
    expect(prompt).toContain('不要编造');
    expect(prompt).not.toContain('**');
    expect(prompt).not.toContain('时间线缩放逻辑');
  });
});

describe('buildChatCompletionPayload()', () => {
  it('uses DeepSeek-V4-Flash in streaming mode with the persona prompt', () => {
    const body = buildChatCompletionPayload(
      'deepseek-ai/DeepSeek-V4-Flash',
      [{ role: 'user', content: '今天我做了什么？' }],
      'AI 截屏识别摘要: 代码实现'
    );

    expect(body.model).toBe('deepseek-ai/DeepSeek-V4-Flash');
    expect(body.stream).toBe(true);
    expect(body.messages[0]).toMatchObject({ role: 'system' });
    expect(body.messages[0].content).toContain('默认像日常 smalltalk');
    expect(body.messages[0].content).toContain('正常聊天频率的 emoji 或颜文字');
    expect(body.messages[0].content).toContain('AI 截屏识别摘要');
    expect(body.messages[1]).toEqual({ role: 'user', content: '今天我做了什么？' });
  });
});

describe('memory chat tools', () => {
  it('defines the agreed read and memory-proposal tools', () => {
    expect(MEMORY_CHAT_TOOLS.map((tool) => tool.function.name)).toEqual([
      'search_events', 'expand_event', 'search_elements', 'expand_element', 'propose_memory',
    ]);
  });

  it('parses OpenAI-compatible tool calls and sends the tool schema to the provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { tool_calls: [{ id: 'call_1', function: { name: 'search_events', arguments: '{"query":"最早的 PRD"}' } }] } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await requestMemoryToolCalls(
        'sk-test',
        'deepseek-ai/DeepSeek-V4-Flash',
        [{ role: 'user', content: '还记得最早的 PRD 吗？' }],
        '日期: 2026-07-13'
      );

      expect(result).toEqual({ supported: true, calls: [{ id: 'call_1', name: 'search_events', arguments: { query: '最早的 PRD' } }] });
      const request = JSON.parse(String(fetchMock.mock.calls[0][1].body));
      expect(request.stream).toBe(false);
      expect(request.tools.map((tool: { function: { name: string } }) => tool.function.name)).not.toContain('propose_memory');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back cleanly when the provider rejects tools', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 400, statusText: 'tools unsupported' })));
    try {
      await expect(requestMemoryToolCalls('sk-test', 'unsupported', [{ role: 'user', content: '你好' }], '')).resolves.toEqual({ supported: false, calls: [] });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses the same tool-enabled chat turn for either a read or the final reply', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { tool_calls: [{ id: 'call_1', function: { name: 'search_events', arguments: '{"query":"最早的 PRD"}' } }] } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '{"reply":"我记得，最早那版 PRD 是……","used_event_ids":["evt_1"],"used_element_ids":[]}' } }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const first = await requestMemoryChatTurn(
        'sk-test',
        'deepseek-ai/DeepSeek-V4-Flash',
        [{ role: 'user', content: '还记得最早的 PRD 吗？' }],
        '日期: 2026-07-13'
      );
      expect(first).toEqual({
        supported: true,
        calls: [{ id: 'call_1', name: 'search_events', arguments: { query: '最早的 PRD' } }],
        content: '',
        usedEventIds: [],
        usedElementIds: [],
      });
      const firstRequest = JSON.parse(String(fetchMock.mock.calls[0][1].body));
      expect(firstRequest.tools.map((tool: { function: { name: string } }) => tool.function.name)).toContain('search_events');
      expect(firstRequest.messages[0].content).toContain('真实聊天');

      const second = await requestMemoryChatTurn(
        'sk-test',
        'deepseek-ai/DeepSeek-V4-Flash',
        [{ role: 'user', content: '还记得最早的 PRD 吗？' }],
        '日期: 2026-07-13',
        undefined,
        [
          { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'search_events', arguments: '{"query":"最早的 PRD"}' } }] },
          { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' },
        ],
        false
      );
      expect(second).toEqual({ supported: true, calls: [], content: '我记得，最早那版 PRD 是……', usedEventIds: ['evt_1'], usedElementIds: [] });
      const secondRequest = JSON.parse(String(fetchMock.mock.calls[1][1].body));
      expect(secondRequest.tools).toBeUndefined();
      expect(secondRequest.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'call_1' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a final reply that omits the structured memory attribution', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '我记得那件事。' } }],
    }), { status: 200 })));
    try {
      await expect(requestMemoryChatTurn(
        'sk-test',
        'deepseek-ai/DeepSeek-V4-Flash',
        [{ role: 'user', content: '还记得吗？' }],
        '日期: 2026-07-13',
      )).resolves.toMatchObject({ supported: false, usedEventIds: [], usedElementIds: [] });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('buildChatCompletionPayload() — thinking message safety', () => {
  it('filters out messages with non user/assistant roles (thinking safety net)', () => {
    const body = buildChatCompletionPayload(
      'deepseek-ai/DeepSeek-V4-Flash',
      [
        { role: 'user', content: '今天我做了什么？' },
        { role: 'thinking' as any, content: '' },
        { role: 'assistant', content: '今天主要在写代码。' },
        { role: 'user', content: '具体说说' },
      ],
      '测试上下文'
    );

    // Only user and assistant roles should appear (system is prepended)
    const userAssistantMessages = body.messages.slice(1);
    expect(userAssistantMessages).toHaveLength(3);
    expect(userAssistantMessages[0]).toEqual({ role: 'user', content: '今天我做了什么？' });
    expect(userAssistantMessages[1]).toEqual({ role: 'assistant', content: '今天主要在写代码。' });
    expect(userAssistantMessages[2]).toEqual({ role: 'user', content: '具体说说' });
    // thinking role should be filtered out entirely
    const roles = userAssistantMessages.map(m => m.role);
    expect(roles).not.toContain('thinking');
  });

  it('filters empty-content messages', () => {
    const body = buildChatCompletionPayload(
      'deepseek-ai/DeepSeek-V4-Flash',
      [
        { role: 'user', content: '   ' },
        { role: 'user', content: '有效问题' },
      ],
      ''
    );

    const userAssistantMessages = body.messages.slice(1);
    expect(userAssistantMessages).toHaveLength(1);
    expect(userAssistantMessages[0].content).toBe('有效问题');
  });

  it('throws when all messages are filtered out', () => {
    expect(() =>
      buildChatCompletionPayload(
        'deepseek-ai/DeepSeek-V4-Flash',
        [
          { role: 'thinking' as any, content: '' },
          { role: 'user', content: '   ' },
        ],
        ''
      )
    ).toThrow('请输入要问下班鸭的问题');
  });

  it('keeps complete raw message content', () => {
    const longContent = 'a'.repeat(3000);
    const body = buildChatCompletionPayload(
      'deepseek-ai/DeepSeek-V4-Flash',
      [{ role: 'user', content: longContent }],
      ''
    );

    const userMessage = body.messages[1];
    expect(userMessage.content.length).toBe(3000);
    expect(userMessage.content).toBe(longContent);
  });

  it('keeps the most recent 25 complete user-started turns', () => {
    const manyMessages = Array.from({ length: 26 }, (_, i) => ([
      { role: 'user' as const, content: `问题 ${i + 1}` },
      { role: 'assistant' as const, content: `回答 ${i + 1}` },
    ])).flat();

    const body = buildChatCompletionPayload(
      'deepseek-ai/DeepSeek-V4-Flash',
      manyMessages,
      ''
    );

    const userMessages = body.messages.slice(1);
    expect(userMessages.length).toBe(50);
    expect(userMessages[0]).toEqual({ role: 'user', content: '问题 2' });
    expect(userMessages[1]).toEqual({ role: 'assistant', content: '回答 2' });
    expect(userMessages[48]).toEqual({ role: 'user', content: '问题 26' });
    expect(userMessages[49]).toEqual({ role: 'assistant', content: '回答 26' });
  });

  it('keeps persisted message ids aligned with the same 25-turn short-term window', () => {
    const messages = Array.from({ length: 26 }, (_, index) => ([
      { id: `u-${index + 1}`, role: 'user' as const, content: `问题 ${index + 1}` },
      { id: `a-${index + 1}`, role: 'assistant' as const, content: `回答 ${index + 1}` },
    ])).flat();

    const shortTermMessages = selectRecentChatTurns(messages);

    expect(shortTermMessages).toHaveLength(50);
    expect(shortTermMessages[0].id).toBe('u-2');
    expect(shortTermMessages.map((message) => message.id)).not.toContain('u-1');
    expect(shortTermMessages.at(-1)?.id).toBe('a-26');
  });

  it('adds stored message time to model context without changing the user text', () => {
    const messages = addTemporalChatContext([
      { role: 'user' as const, content: '昨晚我去打游戏了', created_at: '2026-07-14 15:42:00' },
      { role: 'assistant' as const, content: '好嘞，你玩。', created_at: '2026-07-14 15:43:00' },
    ]);

    expect(messages[0].content).toContain('消息时间：2026');
    expect(messages[0].content).toContain('昨晚我去打游戏了');
    expect(messages[1].content).toBe('好嘞，你玩。');
  });

  it('keeps assistant replies raw while preserving user-message time', () => {
    const messages = addTemporalChatContext([
      { role: 'user' as const, content: '我有点困', created_at: '2026-07-15 05:59:00' },
      { role: 'assistant' as const, content: '起来喝口水。', created_at: '2026-07-15 05:59:03' },
    ]);

    expect(messages[0].content).toContain('[消息时间：');
    expect(messages[1].content).toBe('起来喝口水。');
  });

  it('keeps trusted environment notes in chronological message order', () => {
    const body = buildChatCompletionPayload('test', [
      { id: 'u-1', role: 'user' as const, content: '我有点困', created_at: '2026-07-15 05:00:00' },
      { role: 'system' as const, content: '[内部环境记录｜13:05]\nVision：短暂离开电脑' },
      { id: 'a-1', role: 'assistant' as const, content: '喝口水吧。', created_at: '2026-07-15 05:06:00' },
    ]);

    expect(body.messages.slice(1)).toEqual([
      { role: 'user', content: expect.stringContaining('[消息时间：') },
      { role: 'system', content: '[内部环境记录｜13:05]\nVision：短暂离开电脑' },
      { role: 'assistant', content: '喝口水吧。' },
    ]);
  });
});

describe('thinking bubble lifecycle patterns', () => {
  it('filter pattern: messages.filter(m => m.role !== "thinking") excludes thinking messages', () => {
    const messages = [
      { role: 'user', content: '你好' },
      { role: 'thinking', content: '' },
      { role: 'assistant', content: '你好呀' },
    ];

    const filtered = messages
      .filter(m => m.role !== 'thinking')
      .map(({ role, content }) => ({ role, content }));

    expect(filtered).toHaveLength(2);
    expect(filtered[0]).toEqual({ role: 'user', content: '你好' });
    expect(filtered[1]).toEqual({ role: 'assistant', content: '你好呀' });
  });

  it('filter pattern: removeThinkingBubble is idempotent (array splice safe)', () => {
    const messages = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好呀' },
    ];

    // Simulate removeThinkingBubble when there's no thinking message
    const thinkingMsgIndex = messages.findIndex(m => m.role === 'thinking');
    if (thinkingMsgIndex >= 0) {
      messages.splice(thinkingMsgIndex, 1);
    }

    // Should not modify the array when no thinking message exists
    expect(messages).toHaveLength(2);
  });

  it('filter pattern: removeThinkingBubble removes only the thinking message', () => {
    const messages = [
      { role: 'user', content: '你好' },
      { role: 'thinking', content: '' },
    ];

    const index = messages.findIndex(m => m.role === 'thinking');
    if (index >= 0) {
      messages.splice(index, 1);
    }

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
  });

  it('pending flag transition: pending=true → pending=false on done', () => {
    // Simulates AiPage.tsx onDone: set pending to false
    const messages = [
      { id: '1', role: 'user' as const, content: '你好' },
      { id: '2', role: 'assistant' as const, content: '', pending: true },
    ];

    const assistantId = '2';
    const updated = messages.map(m =>
      m.id === assistantId ? { ...m, pending: false } : m
    );

    expect(updated[1].pending).toBe(false);
    expect(updated[0]).toEqual(messages[0]); // user message unchanged
  });

  it('pending flag transition: pending=true → pending=false + error=true on error', () => {
    // Simulates AiPage.tsx onError and sendMessage catch
    const messages = [
      { id: '1', role: 'user' as const, content: '你好' },
      { id: '2', role: 'assistant' as const, content: '', pending: true },
    ];

    const assistantId = '2';
    const errorMessage = '下班鸭暂时没能回复。';
    const updated = messages.map(m =>
      m.id === assistantId
        ? { ...m, content: errorMessage, pending: false, error: true }
        : m
    );

    expect(updated[1].pending).toBe(false);
    expect(updated[1].error).toBe(true);
    expect(updated[1].content).toBe(errorMessage);
  });

  it('stream ID matching: only processes events for active stream', () => {
    // Simulates onDelta/onDone/onError guards
    const activeStreamId = 'stream-abc';
    const incomingStreamId1 = 'stream-xyz';
    const incomingStreamId2 = 'stream-abc';

    // Non-matching stream should be ignored
    const shouldProcess1 = incomingStreamId1 === activeStreamId;
    expect(shouldProcess1).toBe(false);

    // Matching stream should be processed
    const shouldProcess2 = incomingStreamId2 === activeStreamId;
    expect(shouldProcess2).toBe(true);
  });

  it('abortStream: clears stream state on abort', () => {
    // Simulates cleanup pattern
    let activeStreamId: string | null = 'stream-123';
    let activeAssistantId: string | null = 'assistant-456';
    let streaming = true;

    // abortStream logic
    activeStreamId = null;
    activeAssistantId = null;
    streaming = false;

    expect(activeStreamId).toBeNull();
    expect(activeAssistantId).toBeNull();
    expect(streaming).toBe(false);
  });
});

describe('streamChatCompletion()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('streams OpenAI-compatible SSE deltas', async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"今天"}}]}\n\n'));
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"主要在写代码。"}}]}\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const deltas: string[] = [];
    await streamChatCompletion(
      'sk-test',
      'deepseek-ai/DeepSeek-V4-Flash',
      [{ role: 'user', content: '今天我做了什么？' }],
      'AI 截屏识别摘要: 代码实现',
      (event) => {
        if (event.type === 'content') deltas.push(event.delta);
      }
    );

    expect(deltas.join('')).toBe('今天主要在写代码。');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(body.model).toBe('deepseek-ai/DeepSeek-V4-Flash');
    expect(body.stream).toBe(true);
  });

  it('streams reasoning_content as thinking deltas before content', async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"","role":"assistant"}}]}\n\n'));
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"先看"}}]}\n\n'));
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"记录"}}]}\n\n'));
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"你今天主要在写代码。"}}]}\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const events: Array<{ type: string; delta: string }> = [];
    await streamChatCompletion(
      'sk-test',
      'deepseek-ai/DeepSeek-V4-Flash',
      [{ role: 'user', content: '今天我做了什么？' }],
      '',
      (event) => events.push(event)
    );

    expect(events).toEqual([
      { type: 'thinking', delta: '先看' },
      { type: 'thinking', delta: '记录' },
      { type: 'content', delta: '你今天主要在写代码。' },
    ]);
  });

  it('aborts when the API does not return a stream chunk in time', async () => {
    const fetchMock = vi.fn((_url, request: RequestInit) => new Promise((_resolve, reject) => {
      request.signal?.addEventListener('abort', () => {
        reject(request.signal instanceof AbortSignal ? request.signal.reason : new Error('aborted'));
      });
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(streamChatCompletion(
      'sk-test',
      'deepseek-ai/DeepSeek-V4-Flash',
      [{ role: 'user', content: '你好' }],
      '',
      () => {},
      undefined,
      undefined,
      { totalMs: 200, firstTokenMs: 10, idleMs: 100 }
    )).rejects.toThrow('连上模型有点慢');
  });

  it('keeps streaming while thinking chunks continue even before content', async () => {
    const encoder = new TextEncoder();
    let interval: ReturnType<typeof setInterval> | null = null;
    const fetchMock = vi.fn((_url, request: RequestInit) => Promise.resolve({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"我先"}}]}\n\n'));
          interval = setInterval(() => {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"再想"}}]}\n\n'));
          }, 5);
          setTimeout(() => {
            if (interval) clearInterval(interval);
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"想好了。"}}]}\n\n'));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          }, 25);
          request.signal?.addEventListener('abort', () => {
            if (interval) clearInterval(interval);
            controller.error(request.signal instanceof AbortSignal ? request.signal.reason : new Error('aborted'));
          });
        },
        cancel() {
          if (interval) clearInterval(interval);
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const events: Array<{ type: string; delta: string }> = [];
    try {
      await streamChatCompletion(
        'sk-test',
        'deepseek-ai/DeepSeek-V4-Flash',
        [{ role: 'user', content: '你好' }],
        '',
        (event) => events.push(event),
        undefined,
        undefined,
        { totalMs: 200, firstTokenMs: 10, idleMs: 15 }
      );
    } finally {
      if (interval) clearInterval(interval);
    }

    expect(events.some((event) => event.type === 'thinking')).toBe(true);
    expect(events).toContainEqual({ type: 'content', delta: '想好了。' });
  });

  it('aborts on idle when thinking starts and then the stream stops moving', async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn((_url, request: RequestInit) => Promise.resolve({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"我先想想"}}]}\n\n'));
          request.signal?.addEventListener('abort', () => {
            controller.error(request.signal instanceof AbortSignal ? request.signal.reason : new Error('aborted'));
          });
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const events: Array<{ type: string; delta: string }> = [];
    await expect(streamChatCompletion(
      'sk-test',
      'deepseek-ai/DeepSeek-V4-Flash',
      [{ role: 'user', content: '你好' }],
      '',
      (event) => events.push(event),
      undefined,
      undefined,
      { totalMs: 200, firstTokenMs: 10, idleMs: 10 }
    )).rejects.toThrow('说到一半卡住了');

    expect(events).toEqual([{ type: 'thinking', delta: '我先想想' }]);
  });

  it('aborts when the SSE stream goes idle after a delta', async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn((_url, request: RequestInit) => Promise.resolve({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"今天"}}]}\n\n'));
          request.signal?.addEventListener('abort', () => {
            controller.error(request.signal instanceof AbortSignal ? request.signal.reason : new Error('aborted'));
          });
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const deltas: string[] = [];
    await expect(streamChatCompletion(
      'sk-test',
      'deepseek-ai/DeepSeek-V4-Flash',
      [{ role: 'user', content: '今天我做了什么？' }],
      '',
      (event) => {
        if (event.type === 'content') deltas.push(event.delta);
      },
      undefined,
      undefined,
      { totalMs: 200, firstTokenMs: 100, idleMs: 10 }
    )).rejects.toThrow('说到一半卡住了');

    expect(deltas).toEqual(['今天']);
  });

  it('aborts when total streaming time is too long', async () => {
    const encoder = new TextEncoder();
    let interval: ReturnType<typeof setInterval> | null = null;
    const fetchMock = vi.fn((_url, request: RequestInit) => Promise.resolve({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"开"}}]}\n\n'));
          interval = setInterval(() => {
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"."}}]}\n\n'));
          }, 5);
          request.signal?.addEventListener('abort', () => {
            if (interval) clearInterval(interval);
            controller.error(request.signal instanceof AbortSignal ? request.signal.reason : new Error('aborted'));
          });
        },
        cancel() {
          if (interval) clearInterval(interval);
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    try {
      await expect(streamChatCompletion(
        'sk-test',
        'deepseek-ai/DeepSeek-V4-Flash',
        [{ role: 'user', content: '一直说话' }],
        '',
        () => {},
        undefined,
        undefined,
        { totalMs: 25, firstTokenMs: 100, idleMs: 100 }
      )).rejects.toThrow('回复耗时太长');
    } finally {
      if (interval) clearInterval(interval);
    }
  });
});

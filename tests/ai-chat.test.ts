import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildChatCompletionPayload, buildChatSystemPrompt, streamChatCompletion } from '../src/main/ai';

describe('buildChatSystemPrompt()', () => {
  it('defines the desk pet as a relaxed coworker with clear boundaries', () => {
    const prompt = buildChatSystemPrompt('今天有 3 条 AI 截屏识别摘要。');

    expect(prompt).toContain('小鸭同事');
    expect(prompt).toContain('不是传统 AI 助手');
    expect(prompt).toContain('不是日报生成机器');
    expect(prompt).toContain('默认像日常 smalltalk');
    expect(prompt).toContain('不要满脑子工作');
    expect(prompt).toContain('今天有 3 条 AI 截屏识别摘要');
    expect(prompt).toContain('不要编造');
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
    expect(body.messages[0].content).toContain('AI 截屏识别摘要');
    expect(body.messages[1]).toEqual({ role: 'user', content: '今天我做了什么？' });
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
      (delta) => deltas.push(delta)
    );

    expect(deltas.join('')).toBe('今天主要在写代码。');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(body.model).toBe('deepseek-ai/DeepSeek-V4-Flash');
    expect(body.stream).toBe(true);
  });
});

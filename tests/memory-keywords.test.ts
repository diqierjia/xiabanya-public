import { describe, expect, it } from 'vitest';
import { matchRealtimeMemoryCriticality } from '../src/main/memory-keywords';

describe('matchRealtimeMemoryCriticality()', () => {
  it('only classifies configured high-value candidate phrases locally', () => {
    expect(matchRealtimeMemoryCriticality('我对花生过敏，不能碰。')).toBe('safety');
    expect(matchRealtimeMemoryCriticality('我是研究生，现在在学校做课题。')).toBe('identity');
    expect(matchRealtimeMemoryCriticality('我在下班鸭工作。')).toBe('identity');
    expect(matchRealtimeMemoryCriticality('今天先聊聊日报。')).toBeUndefined();
  });

  it('prioritizes safety when one message contains both classes', () => {
    expect(matchRealtimeMemoryCriticality('我是研究生，对青霉素过敏。')).toBe('safety');
  });
});

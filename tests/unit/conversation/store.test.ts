import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHistory, setHistory, threadKey } from '../../../src/conversation/store.js';

describe('conversation store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-19T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an empty history for a key that has never been set', () => {
    expect(getHistory(threadKey('C1', '100.1'))).toEqual([]);
  });

  it('round-trips history set for a given thread key', () => {
    const key = threadKey('C1', '100.2');
    setHistory(key, [{ role: 'user', content: 'hi' }]);
    expect(getHistory(key)).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('keeps different thread keys isolated', () => {
    const keyA = threadKey('C1', '100.3');
    const keyB = threadKey('C1', '100.4');
    setHistory(keyA, [{ role: 'user', content: 'A' }]);
    setHistory(keyB, [{ role: 'user', content: 'B' }]);
    expect(getHistory(keyA)).toEqual([{ role: 'user', content: 'A' }]);
    expect(getHistory(keyB)).toEqual([{ role: 'user', content: 'B' }]);
  });

  it('evicts a thread once it has been idle past the TTL', () => {
    const key = threadKey('C1', '100.5');
    setHistory(key, [{ role: 'user', content: 'hi' }]);

    vi.advanceTimersByTime(31 * 60 * 1000);

    expect(getHistory(key)).toEqual([]);
  });

  it('does not evict a thread that is still within the TTL', () => {
    const key = threadKey('C1', '100.6');
    setHistory(key, [{ role: 'user', content: 'hi' }]);

    vi.advanceTimersByTime(29 * 60 * 1000);

    expect(getHistory(key)).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('truncates a long history at the nearest clean user-turn boundary, capping at 40 messages', () => {
    const key = threadKey('C1', '100.7');
    // 50 plain alternating turns: even index = user, odd = assistant, all plain string content.
    const messages = Array.from({ length: 50 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `turn-${i}`,
    }));

    setHistory(key, messages);
    const stored = getHistory(key);

    expect(stored).toHaveLength(40);
    // excess = 50 - 40 = 10; the earliest clean user turn at/after index 10 is index 10 itself.
    expect(stored[0]).toEqual({ role: 'user', content: 'turn-10' });
  });

  it('keeps the full history when no clean user-turn boundary exists within the excess prefix', () => {
    const key = threadKey('C1', '100.8');
    const messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [
      { role: 'user', content: 'start' },
    ];
    // 44 more messages with non-string content (simulating one long tool-use exchange) — no
    // further clean user turns for truncateHistory to cut at.
    for (let i = 0; i < 44; i++) {
      messages.push({
        role: i % 2 === 0 ? 'assistant' : 'user',
        content: [{ type: 'tool_result', tool_use_id: `t${i}`, content: 'x' }],
      });
    }

    setHistory(key, messages as never);
    const stored = getHistory(key);

    expect(stored).toHaveLength(45);
    expect(stored[0]).toEqual({ role: 'user', content: 'start' });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRateLimited } from '../../../src/slack/handlers/rateLimit.js';

describe('isRateLimited', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-19T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first 10 requests within a minute for a given user', () => {
    const user = 'U_first_ten';
    for (let i = 0; i < 10; i++) {
      expect(isRateLimited(user)).toBe(false);
    }
  });

  it('blocks the 11th request within the same minute', () => {
    const user = 'U_eleventh';
    for (let i = 0; i < 10; i++) isRateLimited(user);
    expect(isRateLimited(user)).toBe(true);
  });

  it('keeps different users independently throttled', () => {
    const userA = 'U_a';
    const userB = 'U_b';
    for (let i = 0; i < 10; i++) isRateLimited(userA);
    expect(isRateLimited(userA)).toBe(true);
    expect(isRateLimited(userB)).toBe(false);
  });

  it('allows requests again once the window has rolled past', () => {
    const user = 'U_rolling';
    for (let i = 0; i < 10; i++) isRateLimited(user);
    expect(isRateLimited(user)).toBe(true);

    vi.advanceTimersByTime(61 * 1000);

    expect(isRateLimited(user)).toBe(false);
  });
});

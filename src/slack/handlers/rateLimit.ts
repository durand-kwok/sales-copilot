const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

const requestTimestamps = new Map<string, number[]>();

/**
 * A simple sliding-window throttle per Slack user, so a runaway client or accidental spam can't
 * drive unbounded Anthropic API spend. Returns true when the caller should be turned away.
 */
export function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (requestTimestamps.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    requestTimestamps.set(userId, recent);
    return true;
  }

  recent.push(now);
  requestTimestamps.set(userId, recent);
  return false;
}

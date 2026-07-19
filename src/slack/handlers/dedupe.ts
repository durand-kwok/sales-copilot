const SEEN_EVENT_TTL_MS = 5 * 60 * 1000;

const seenEventIds = new Map<string, number>();

function evictExpired(now: number): void {
  for (const [eventId, seenAt] of seenEventIds) {
    if (now - seenAt > SEEN_EVENT_TTL_MS) {
      seenEventIds.delete(eventId);
    }
  }
}

/**
 * Returns true the first time an eventId is seen, false on any repeat delivery.
 * Slack retries event delivery when an ack is slow; this guards against double-processing.
 */
export function isDuplicateEvent(eventId: string): boolean {
  const now = Date.now();
  evictExpired(now);

  if (seenEventIds.has(eventId)) {
    return true;
  }
  seenEventIds.set(eventId, now);
  return false;
}

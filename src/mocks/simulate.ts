const MIN_LATENCY_MS = 80;
const MAX_LATENCY_MS = 260;
// Deterministic by default under the test runner; tests that want to exercise the
// error path pass an explicit failureRate instead of relying on randomness.
const DEFAULT_FAILURE_RATE = process.env.VITEST ? 0 : 0.05;

export class MockApiError extends Error {}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps a mock service call with realistic latency and an occasional simulated failure.
 * `failureRate` is overridable (e.g. to 0 or 1) so tests can force deterministic outcomes.
 */
export async function simulateCall<T>(
  fn: () => T,
  failureMessage: string,
  failureRate: number = DEFAULT_FAILURE_RATE,
): Promise<T> {
  const latency = MIN_LATENCY_MS + Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS);
  await delay(latency);
  if (Math.random() < failureRate) {
    throw new MockApiError(failureMessage);
  }
  return fn();
}

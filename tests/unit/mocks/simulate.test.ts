import { describe, expect, it } from 'vitest';
import { MockApiError, simulateCall } from '../../../src/mocks/simulate.js';

describe('simulateCall', () => {
  it('resolves with the function result when failureRate is 0', async () => {
    const result = await simulateCall(() => 42, 'should not happen', 0);
    expect(result).toBe(42);
  });

  it('throws a MockApiError with the given message when failureRate is 1', async () => {
    await expect(simulateCall(() => 42, 'boom', 1)).rejects.toThrow(MockApiError);
    await expect(simulateCall(() => 42, 'boom', 1)).rejects.toThrow('boom');
  });
});

import { describe, expect, it } from 'vitest';
import {
  getAccountUsageSummary,
  getFeatureAdoption,
  getUsageTrend,
} from '../../../src/mocks/usageService.js';

describe('usageService', () => {
  it('fetches the usage summary for an account', async () => {
    const usage = await getAccountUsageSummary('acc_acme');
    expect(usage?.accountId).toBe('acc_acme');
    expect(usage?.activeSeats).toBeLessThanOrEqual(usage!.licensedSeats);
  });

  it('returns null for an account with no usage record', async () => {
    const usage = await getAccountUsageSummary('acc_does_not_exist');
    expect(usage).toBeNull();
  });

  it('fetches feature adoption entries scoped to an account', async () => {
    const features = await getFeatureAdoption('acc_acme');
    expect(features.every((f) => f.accountId === 'acc_acme')).toBe(true);
    expect(features.some((f) => f.feature === 'AI Analytics' && !f.adopted)).toBe(true);
  });

  it('fetches the usage trend showing Acme adoption declining month over month', async () => {
    const trend = await getUsageTrend('acc_acme');
    expect(trend.length).toBeGreaterThan(1);
    const first = trend[0]!.score;
    const last = trend[trend.length - 1]!.score;
    expect(last).toBeLessThan(first);
  });

  it('returns an empty array for an account with no usage trend', async () => {
    const trend = await getUsageTrend('acc_does_not_exist');
    expect(trend).toEqual([]);
  });
});

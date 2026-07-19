import productUsageData from './data/productUsage.json' with { type: 'json' };
import featureAdoptionData from './data/featureAdoption.json' with { type: 'json' };
import type { FeatureAdoption, ProductUsage, UsageTrendPoint } from '../types/index.js';
import { simulateCall } from './simulate.js';

const productUsage = productUsageData as ProductUsage[];
const featureAdoption = featureAdoptionData as FeatureAdoption[];

export async function getAccountUsageSummary(accountId: string): Promise<ProductUsage | null> {
  return simulateCall(
    () => productUsage.find((usage) => usage.accountId === accountId) ?? null,
    `Failed to fetch usage summary for account ${accountId}`,
  );
}

export async function getFeatureAdoption(accountId: string): Promise<FeatureAdoption[]> {
  return simulateCall(
    () => featureAdoption.filter((entry) => entry.accountId === accountId),
    `Failed to fetch feature adoption for account ${accountId}`,
  );
}

export async function getUsageTrend(accountId: string): Promise<UsageTrendPoint[]> {
  return simulateCall(() => {
    const usage = productUsage.find((entry) => entry.accountId === accountId);
    return usage?.usageTrend ?? [];
  }, `Failed to fetch usage trend for account ${accountId}`);
}

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('../../../src/snowflake/client.js', () => ({
  querySnowflake: queryMock,
}));

import { getCampaignPerformance, getCampaignRetentionImpact } from '../../../src/data/marketingService.js';

beforeEach(() => {
  queryMock.mockReset();
});

describe('marketingService.getCampaignPerformance', () => {
  it('computes costPerAcquisition as totalBudget / totalConverted', async () => {
    queryMock.mockResolvedValueOnce([
      { CHANNEL: 'Email', TOTAL_BUDGET: 50000, TOTAL_CONVERTED: 500, TOTAL_REVENUE_ATTRIBUTED: 200000 },
    ]);
    const result = await getCampaignPerformance();
    expect(result[0]).toEqual({
      channel: 'Email',
      totalBudget: 50000,
      totalConverted: 500,
      totalRevenueAttributed: 200000,
      costPerAcquisition: 100,
    });
  });

  it('returns null costPerAcquisition when there are no conversions, instead of dividing by zero', async () => {
    queryMock.mockResolvedValueOnce([
      { CHANNEL: 'SMS', TOTAL_BUDGET: 1000, TOTAL_CONVERTED: 0, TOTAL_REVENUE_ATTRIBUTED: 0 },
    ]);
    const result = await getCampaignPerformance();
    expect(result[0]?.costPerAcquisition).toBeNull();
  });

  it('filters to a single channel when provided', async () => {
    queryMock.mockResolvedValueOnce([]);
    await getCampaignPerformance('Email');
    expect(queryMock.mock.calls[0]![0]).toContain('WHERE CHANNEL = ?');
    expect(queryMock.mock.calls[0]![1]).toEqual(['Email']);
  });
});

describe('marketingService.getCampaignRetentionImpact', () => {
  it('computes atRiskOrUnlikelyRenewalPct against respondedCustomerCount', async () => {
    queryMock.mockResolvedValueOnce([
      { CAMPAIGN_NAME: 'Spring Renewal Package - Denver', RESPONDED_CUSTOMER_COUNT: 100, AT_RISK_COUNT: 25, AVG_CHURN_PROBABILITY_PCT: 42.3 },
    ]);
    const result = await getCampaignRetentionImpact();
    expect(queryMock.mock.calls[0]![0]).toContain('DISTINCT CAMPAIGN_ID, CUSTOMER_ID');
    expect(result[0]).toEqual({
      campaignName: 'Spring Renewal Package - Denver',
      respondedCustomerCount: 100,
      atRiskOrUnlikelyRenewalCount: 25,
      atRiskOrUnlikelyRenewalPct: 25,
      avgChurnProbabilityPct: 42.3,
    });
  });

  it('defaults avgChurnProbabilityPct to 0 when the LEFT JOIN finds no health record at all', async () => {
    queryMock.mockResolvedValueOnce([
      { CAMPAIGN_NAME: 'X', RESPONDED_CUSTOMER_COUNT: 10, AT_RISK_COUNT: 0, AVG_CHURN_PROBABILITY_PCT: null },
    ]);
    const result = await getCampaignRetentionImpact();
    expect(result[0]?.avgChurnProbabilityPct).toBe(0);
  });
});

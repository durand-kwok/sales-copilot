import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('../../../src/snowflake/client.js', () => ({
  querySnowflake: queryMock,
}));

import { getChurnByLocation, getChurnCohortSummary, getCustomerHealth } from '../../../src/data/usageService.js';

beforeEach(() => {
  queryMock.mockReset();
});

describe('usageService.getCustomerHealth', () => {
  it('queries CUSTOMER_TIERS_AI by CUSTOMER_ID and maps the row to camelCase', async () => {
    queryMock.mockResolvedValueOnce([
      {
        CUSTOMER_ID: 1753,
        FIRST_NAME: 'Charlotte',
        LAST_NAME: 'Williams',
        HOME_LOCATION_ID: 5,
        LIFETIME_SPEND: 2401.2,
        TOTAL_VISITS: 23,
        VISIT_FREQUENCY_MONTHLY: 0.44,
        DAYS_SINCE_LAST_VISIT: 62,
        NPS_SCORE: 4,
        MEMBERSHIP_TYPE: 'Silver',
        PREFERRED_SERVICE: 'Float Therapy',
        AI_TIER: 'Bronze',
        CHURN_RISK: 'High',
        CHURN_PROBABILITY_PCT: 95,
        PREDICTED_LTV_12M: 2401.2,
        AI_RECOMMENDATION: '',
      },
    ]);

    const result = await getCustomerHealth(1753);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, binds] = queryMock.mock.calls[0]!;
    expect(sql).toContain('CUSTOMER_TIERS_AI');
    expect(binds).toEqual([1753]);

    expect(result).toEqual({
      customerId: 1753,
      firstName: 'Charlotte',
      lastName: 'Williams',
      homeLocationId: 5,
      lifetimeSpend: 2401.2,
      totalVisits: 23,
      visitFrequencyMonthly: 0.44,
      daysSinceLastVisit: 62,
      npsScore: 4,
      membershipType: 'Silver',
      preferredService: 'Float Therapy',
      aiTier: 'Bronze',
      churnRisk: 'High',
      churnProbabilityPct: 95,
      predictedLtv12M: 2401.2,
      aiRecommendation: '',
    });
  });

  it('returns null when the customer has no health record', async () => {
    queryMock.mockResolvedValueOnce([]);
    expect(await getCustomerHealth(999999)).toBeNull();
  });
});

describe('usageService.getChurnCohortSummary', () => {
  it('groups by MEMBERSHIP_TYPE when groupBy is "tier"', async () => {
    queryMock.mockResolvedValueOnce([
      {
        GROUP_VALUE: 'Silver',
        CUSTOMER_COUNT: 100,
        AVG_LTV: 2500,
        AVG_CHURN_PROBABILITY_PCT: 40,
        AVG_VISIT_FREQUENCY_MONTHLY: 1.2,
        AVG_DAYS_SINCE_LAST_VISIT: 30,
        AVG_NPS_SCORE: 6,
      },
    ]);
    await getChurnCohortSummary('tier');
    expect(queryMock.mock.calls[0]![0]).toContain('MEMBERSHIP_TYPE AS GROUP_VALUE');
  });

  it('groups by CHURN_RISK when groupBy is "churnRisk" and maps the row', async () => {
    queryMock.mockResolvedValueOnce([
      {
        GROUP_VALUE: 'High',
        CUSTOMER_COUNT: 50,
        AVG_LTV: 1800,
        AVG_CHURN_PROBABILITY_PCT: 88,
        AVG_VISIT_FREQUENCY_MONTHLY: 0.5,
        AVG_DAYS_SINCE_LAST_VISIT: 55,
        AVG_NPS_SCORE: 3,
      },
    ]);
    const result = await getChurnCohortSummary('churnRisk');
    expect(queryMock.mock.calls[0]![0]).toContain('CHURN_RISK AS GROUP_VALUE');
    expect(result[0]).toEqual({
      groupValue: 'High',
      customerCount: 50,
      avgLtv: 1800,
      avgChurnProbabilityPct: 88,
      avgVisitFrequencyMonthly: 0.5,
      avgDaysSinceLastVisit: 55,
      avgNpsScore: 3,
    });
  });
});

describe('usageService.getChurnByLocation', () => {
  it('computes highChurnRiskPct from highChurnRiskCount / customerCount', async () => {
    queryMock.mockResolvedValueOnce([
      { CITY: 'Miami', CUSTOMER_COUNT: 200, AVG_CHURN_PROBABILITY_PCT: 45.5, HIGH_CHURN_RISK_COUNT: 50 },
    ]);
    const result = await getChurnByLocation();
    expect(result[0]).toEqual({
      city: 'Miami',
      customerCount: 200,
      avgChurnProbabilityPct: 45.5,
      highChurnRiskCount: 50,
      highChurnRiskPct: 25,
    });
  });

  it('returns 0 highChurnRiskPct when there are no customers', async () => {
    queryMock.mockResolvedValueOnce([
      { CITY: 'X', CUSTOMER_COUNT: 0, AVG_CHURN_PROBABILITY_PCT: 0, HIGH_CHURN_RISK_COUNT: 0 },
    ]);
    const result = await getChurnByLocation();
    expect(result[0]?.highChurnRiskPct).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('../../../src/snowflake/client.js', () => ({
  querySnowflake: queryMock,
}));

import {
  getBookingDemandTrend,
  getRecruitingPipeline,
  getRetentionRiskForecast,
  getStaffingSummary,
  getTenureAndTurnover,
} from '../../../src/data/workforceService.js';

beforeEach(() => {
  queryMock.mockReset();
});

describe('workforceService.getBookingDemandTrend', () => {
  it('maps booking count and therapist hours by city/month', async () => {
    queryMock.mockResolvedValueOnce([
      { CITY: 'Miami', MONTH: '2026-04-01', BOOKING_COUNT: 320, THERAPIST_HOURS_REQUIRED: 480 },
    ]);
    const result = await getBookingDemandTrend('Miami');
    expect(queryMock.mock.calls[0]![1]).toEqual([6, 'Miami']);
    expect(result[0]).toEqual({ city: 'Miami', month: '2026-04-01', bookingCount: 320, therapistHoursRequired: 480 });
  });
});

describe('workforceService.getStaffingSummary', () => {
  it('coalesces missing joins to zero (e.g. a not-yet-opened location)', async () => {
    queryMock.mockResolvedValueOnce([
      {
        CITY: 'Portland',
        ACTIVE_HEADCOUNT: 0,
        THERAPIST_HEADCOUNT: 0,
        OPEN_REQUISITIONS: 0,
        HEADCOUNT_REQUESTED: 0,
        RECRUITING_SPEND: 0,
      },
    ]);
    const result = await getStaffingSummary();
    expect(result[0]).toEqual({
      city: 'Portland',
      activeHeadcount: 0,
      therapistHeadcount: 0,
      openRequisitions: 0,
      headcountRequested: 0,
      recruitingSpendLast6Months: 0,
    });
  });

  it('passes only the city bind (no months param for this snapshot tool)', async () => {
    queryMock.mockResolvedValueOnce([]);
    await getStaffingSummary('Miami');
    expect(queryMock.mock.calls[0]![1]).toEqual(['Miami']);
  });
});

describe('workforceService.getTenureAndTurnover', () => {
  it('computes turnoverRatePct as terminated / total recorded employees', async () => {
    queryMock.mockResolvedValueOnce([
      {
        CITY: 'Denver',
        ROLE: 'Therapist',
        ACTIVE_HEADCOUNT: 8,
        AVG_TENURE_MONTHS: 14.3,
        TERMINATED_COUNT: 2,
        TOTAL_COUNT: 10,
        AVG_COMPENSATION: 55000,
      },
    ]);
    const result = await getTenureAndTurnover('Denver', 'Therapist');
    expect(queryMock.mock.calls[0]![1]).toEqual(['Denver', 'Therapist']);
    expect(result[0]).toEqual({
      city: 'Denver',
      role: 'Therapist',
      headcount: 8,
      avgTenureMonths: 14.3,
      terminatedCount: 2,
      turnoverRatePct: 20,
      avgCompensationAnnual: 55000,
    });
  });

  it('builds an unfiltered query with no binds when neither city nor role is given', async () => {
    queryMock.mockResolvedValueOnce([]);
    await getTenureAndTurnover();
    expect(queryMock.mock.calls[0]![0]).not.toContain('WHERE');
    expect(queryMock.mock.calls[0]![1]).toEqual([]);
  });

  it('returns 0 turnover rate when there is no recorded headcount', async () => {
    queryMock.mockResolvedValueOnce([
      {
        CITY: 'X',
        ROLE: 'Y',
        ACTIVE_HEADCOUNT: 0,
        AVG_TENURE_MONTHS: 0,
        TERMINATED_COUNT: 0,
        TOTAL_COUNT: 0,
        AVG_COMPENSATION: 0,
      },
    ]);
    const result = await getTenureAndTurnover();
    expect(result[0]?.turnoverRatePct).toBe(0);
  });
});

describe('workforceService.getRetentionRiskForecast', () => {
  it('casts the VARIANT CITY column to a plain string in the query', async () => {
    queryMock.mockResolvedValueOnce([
      { CITY: 'London', FORECAST_MONTH: '2026-08-01', PREDICTED_TERMINATIONS: 2, WORST_CASE_TERMINATIONS: 5 },
    ]);
    const result = await getRetentionRiskForecast('London');
    expect(queryMock.mock.calls[0]![0]).toContain('CITY::STRING');
    expect(queryMock.mock.calls[0]![1]).toEqual(['London']);
    expect(result[0]).toEqual({
      city: 'London',
      forecastMonth: '2026-08-01',
      predictedTerminations: 2,
      worstCaseTerminations: 5,
    });
  });
});

describe('workforceService.getRecruitingPipeline', () => {
  it('maps open/filled counts and avg days-to-fill / days-open', async () => {
    queryMock.mockResolvedValueOnce([
      {
        CITY: 'Denver',
        ROLE: 'Therapist',
        OPEN_COUNT: 2,
        FILLED_COUNT: 5,
        AVG_DAYS_TO_FILL: 32.5,
        AVG_DAYS_OPEN_STILL_OPEN: 14,
      },
    ]);
    const result = await getRecruitingPipeline('Denver', 'Therapist');
    expect(queryMock.mock.calls[0]![1]).toEqual(['Denver', 'Therapist']);
    expect(result[0]).toEqual({
      city: 'Denver',
      role: 'Therapist',
      openCount: 2,
      filledCount: 5,
      avgDaysToFill: 32.5,
      avgDaysOpenForStillOpen: 14,
    });
  });

  it('returns null for avg days fields when there are no filled/open requisitions to average', async () => {
    queryMock.mockResolvedValueOnce([
      { CITY: 'X', ROLE: 'Y', OPEN_COUNT: 0, FILLED_COUNT: 0, AVG_DAYS_TO_FILL: null, AVG_DAYS_OPEN_STILL_OPEN: null },
    ]);
    const result = await getRecruitingPipeline();
    expect(result[0]?.avgDaysToFill).toBeNull();
    expect(result[0]?.avgDaysOpenForStillOpen).toBeNull();
  });
});

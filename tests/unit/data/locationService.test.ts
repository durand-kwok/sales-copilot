import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('../../../src/snowflake/client.js', () => ({
  querySnowflake: queryMock,
}));

import { getBookingForecast, getRevenueTrendByCity } from '../../../src/data/locationService.js';

beforeEach(() => {
  queryMock.mockReset();
});

describe('locationService.getRevenueTrendByCity', () => {
  it('anchors the lookback window on MAX(BOOKING_MONTH), not CURRENT_DATE(), and maps rows to camelCase', async () => {
    queryMock.mockResolvedValueOnce([
      { CITY: 'Austin', BOOKING_MONTH: '2026-04-01', TOTAL_REVENUE: 125000.5 },
      { CITY: 'Austin', BOOKING_MONTH: '2026-05-01', TOTAL_REVENUE: 130000 },
    ]);

    const result = await getRevenueTrendByCity();

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, binds] = queryMock.mock.calls[0]!;
    expect(sql).toContain('SALESFORCE_BOOKINGS');
    expect(sql).toContain('LOCATION_MASTER');
    expect(sql).toContain('MAX(BOOKING_MONTH)');
    expect(sql).not.toContain('CURRENT_DATE');
    expect(binds).toEqual([12]);

    expect(result).toEqual([
      { city: 'Austin', month: '2026-04-01', totalRevenue: 125000.5 },
      { city: 'Austin', month: '2026-05-01', totalRevenue: 130000 },
    ]);
  });

  it('defaults the lookback to 12 months when not specified', async () => {
    queryMock.mockResolvedValueOnce([]);
    await getRevenueTrendByCity();
    expect(queryMock.mock.calls[0]![1]).toEqual([12]);
  });

  it('passes a custom months value through as a bind', async () => {
    queryMock.mockResolvedValueOnce([]);
    await getRevenueTrendByCity(undefined, 6);
    expect(queryMock.mock.calls[0]![1]).toEqual([6]);
  });

  it('filters to a single city when provided, adding it as a second bind', async () => {
    queryMock.mockResolvedValueOnce([]);
    await getRevenueTrendByCity('Austin', 6);

    const [sql, binds] = queryMock.mock.calls[0]!;
    expect(sql).toContain('lm.CITY = ?');
    expect(binds).toEqual([6, 'Austin']);
  });

  it('returns an empty array when there is no matching data', async () => {
    queryMock.mockResolvedValueOnce([]);
    expect(await getRevenueTrendByCity('Nowhere')).toEqual([]);
  });
});

describe('locationService.getBookingForecast', () => {
  it('casts the VARIANT CITY column to a plain string and joins in MONTHLY_CAPACITY', async () => {
    queryMock.mockResolvedValueOnce([
      { CITY: 'London', FORECAST_MONTH: '2026-08-01', PREDICTED_BOOKINGS: 1200, LOWER_BOUND: 1100, UPPER_BOUND: 1300, MONTHLY_CAPACITY: 1250 },
    ]);
    const result = await getBookingForecast('London');
    expect(queryMock.mock.calls[0]![0]).toContain('CITY::STRING');
    expect(queryMock.mock.calls[0]![1]).toEqual(['London']);
    expect(result[0]).toEqual({
      city: 'London',
      forecastMonth: '2026-08-01',
      predictedBookings: 1200,
      lowerBound: 1100,
      upperBound: 1300,
      monthlyCapacity: 1250,
    });
  });
});

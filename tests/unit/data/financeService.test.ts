import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('../../../src/snowflake/client.js', () => ({
  querySnowflake: queryMock,
}));

import {
  getLaborCostByRole,
  getLocationPnL,
  getOperationalCostBreakdown,
  getRefundBreakdown,
  getRevenueByServiceType,
  getRevenuePerRoom,
} from '../../../src/data/financeService.js';

beforeEach(() => {
  queryMock.mockReset();
});

describe('financeService.getLocationPnL', () => {
  it('computes totalCost, profit, and marginPct from revenue/labor/operational cost', async () => {
    queryMock.mockResolvedValueOnce([
      { CITY: 'Austin', MONTH: '2026-04-01', REVENUE: 100000, LABOR_COST: 40000, OPERATIONAL_COST: 20000 },
    ]);

    const result = await getLocationPnL();

    expect(queryMock.mock.calls[0]![0]).toContain('MAX(BOOKING_MONTH)');
    expect(result[0]).toEqual({
      city: 'Austin',
      month: '2026-04-01',
      revenue: 100000,
      laborCost: 40000,
      operationalCost: 20000,
      totalCost: 60000,
      profit: 40000,
      marginPct: 40,
    });
  });

  it('defaults months to 6 and adds a city bind when a city is given', async () => {
    queryMock.mockResolvedValueOnce([]);
    await getLocationPnL('Denver');
    expect(queryMock.mock.calls[0]![1]).toEqual([6, 'Denver']);
    expect(queryMock.mock.calls[0]![0]).toContain('WHERE lm.CITY = ?');
  });

  it('returns 0 margin when revenue is 0 to avoid dividing by zero', async () => {
    queryMock.mockResolvedValueOnce([
      { CITY: 'Denver', MONTH: '2026-04-01', REVENUE: 0, LABOR_COST: 5000, OPERATIONAL_COST: 1000 },
    ]);
    const result = await getLocationPnL();
    expect(result[0]?.marginPct).toBe(0);
  });
});

describe('financeService.getRefundBreakdown', () => {
  it('aggregates at the city level only when no city is given', async () => {
    queryMock.mockResolvedValueOnce([
      { CITY: 'Denver', SERVICE_TYPE: null, BOOKING_COUNT: 1000, REFUND_COUNT: 20, REFUND_AMOUNT: 4000, REVENUE: 100000 },
    ]);
    const result = await getRefundBreakdown();
    expect(queryMock.mock.calls[0]![0]).not.toContain('b.SERVICE_TYPE');
    expect(result[0]).toEqual({
      city: 'Denver',
      serviceType: null,
      bookingCount: 1000,
      refundCount: 20,
      refundAmount: 4000,
      revenue: 100000,
      refundRatePct: 2,
    });
  });

  it('breaks down by service type when a single city is given', async () => {
    queryMock.mockResolvedValueOnce([
      { CITY: 'Denver', SERVICE_TYPE: 'Massage', BOOKING_COUNT: 500, REFUND_COUNT: 15, REFUND_AMOUNT: 3000, REVENUE: 50000 },
    ]);
    await getRefundBreakdown('Denver');
    expect(queryMock.mock.calls[0]![0]).toContain('b.SERVICE_TYPE');
    expect(queryMock.mock.calls[0]![0]).toContain('GROUP BY lm.CITY, b.SERVICE_TYPE');
  });

  it('returns 0 refund rate when there are no bookings', async () => {
    queryMock.mockResolvedValueOnce([
      { CITY: 'Denver', SERVICE_TYPE: null, BOOKING_COUNT: 0, REFUND_COUNT: 0, REFUND_AMOUNT: 0, REVENUE: 0 },
    ]);
    const result = await getRefundBreakdown();
    expect(result[0]?.refundRatePct).toBe(0);
  });
});

describe('financeService.getRevenuePerRoom', () => {
  it('divides total revenue by months and then by treatment rooms', async () => {
    queryMock.mockResolvedValueOnce([{ CITY: 'London', TREATMENT_ROOMS: 5, TOTAL_REVENUE: 600000 }]);
    const result = await getRevenuePerRoom(undefined, 6);
    // avgMonthlyRevenue = 600000 / 6 = 100000; per room = 100000 / 5 = 20000
    expect(result[0]).toEqual({
      city: 'London',
      avgMonthlyRevenue: 100000,
      treatmentRooms: 5,
      avgMonthlyRevenuePerRoom: 20000,
    });
  });

  it('returns 0 per-room revenue when treatmentRooms is 0', async () => {
    queryMock.mockResolvedValueOnce([{ CITY: 'X', TREATMENT_ROOMS: 0, TOTAL_REVENUE: 1000 }]);
    const result = await getRevenuePerRoom();
    expect(result[0]?.avgMonthlyRevenuePerRoom).toBe(0);
  });
});

describe('financeService.getLaborCostByRole', () => {
  it('computes costPerEmployee from totalLaborCost and average headcount', async () => {
    queryMock.mockResolvedValueOnce([
      { CITY: 'Denver', ROLE: 'Therapist', AVG_HEADCOUNT: 10, TOTAL_LABOR_COST: 500000, OVERTIME_COST: 30000 },
    ]);
    const result = await getLaborCostByRole('Denver');
    expect(result[0]).toEqual({
      city: 'Denver',
      role: 'Therapist',
      headcount: 10,
      totalLaborCost: 500000,
      overtimeCost: 30000,
      costPerEmployee: 50000,
    });
  });

  it('returns 0 costPerEmployee when headcount is 0', async () => {
    queryMock.mockResolvedValueOnce([
      { CITY: 'Denver', ROLE: 'Therapist', AVG_HEADCOUNT: 0, TOTAL_LABOR_COST: 0, OVERTIME_COST: 0 },
    ]);
    const result = await getLaborCostByRole();
    expect(result[0]?.costPerEmployee).toBe(0);
  });
});

describe('financeService.getRevenueByServiceType', () => {
  it('maps booking count and revenue by city and service type', async () => {
    queryMock.mockResolvedValueOnce([
      { CITY: 'Denver', SERVICE_TYPE: 'Massage Therapy', BOOKING_COUNT: 1742, REVENUE: 209040 },
    ]);
    const result = await getRevenueByServiceType('Denver');
    expect(queryMock.mock.calls[0]![0]).toContain('ORDER BY lm.CITY, REVENUE DESC');
    expect(result[0]).toEqual({
      city: 'Denver',
      serviceType: 'Massage Therapy',
      bookingCount: 1742,
      revenue: 209040,
    });
  });
});

describe('financeService.getOperationalCostBreakdown', () => {
  it('maps cost category and amount by city', async () => {
    queryMock.mockResolvedValueOnce([{ CITY: 'London', COST_CATEGORY: 'Rent', AMOUNT: 50000 }]);
    const result = await getOperationalCostBreakdown('London');
    expect(queryMock.mock.calls[0]![0]).toContain('SAGE_OPERATIONAL_COSTS');
    expect(result[0]).toEqual({ city: 'London', costCategory: 'Rent', amount: 50000 });
  });
});

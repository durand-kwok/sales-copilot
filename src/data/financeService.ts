import type {
  LaborCostByRole,
  LocationPnL,
  OperationalCostBreakdown,
  RefundBreakdown,
  RevenueByServiceType,
  RevenuePerRoom,
} from '../types/index.js';
import { querySnowflake } from '../snowflake/client.js';

interface RawPnLRow {
  CITY: string;
  MONTH: string;
  REVENUE: number;
  LABOR_COST: number;
  OPERATIONAL_COST: number;
}

/**
 * Revenue, labor cost, and operational cost by city and month, anchored on the latest
 * BOOKING_MONTH in SALESFORCE_BOOKINGS (not CURRENT_DATE()) — see locationService.ts for why.
 */
export async function getLocationPnL(city?: string, months = 6): Promise<LocationPnL[]> {
  const sql = `
    WITH rev AS (
      SELECT LOCATION_ID, BOOKING_MONTH AS MONTH, SUM(REVENUE) AS REVENUE
      FROM SALESFORCE_BOOKINGS
      WHERE BOOKING_MONTH > DATEADD(month, -?, (SELECT MAX(BOOKING_MONTH) FROM SALESFORCE_BOOKINGS))
      GROUP BY LOCATION_ID, BOOKING_MONTH
    ),
    labor AS (
      SELECT LOCATION_ID, MONTH, SUM(TOTAL_LABOR_COST) AS LABOR_COST
      FROM SAGE_LABOR_COSTS
      GROUP BY LOCATION_ID, MONTH
    ),
    opex AS (
      SELECT LOCATION_ID, MONTH, SUM(AMOUNT) AS OPERATIONAL_COST
      FROM SAGE_OPERATIONAL_COSTS
      GROUP BY LOCATION_ID, MONTH
    )
    SELECT lm.CITY, rev.MONTH, rev.REVENUE,
           COALESCE(labor.LABOR_COST, 0) AS LABOR_COST,
           COALESCE(opex.OPERATIONAL_COST, 0) AS OPERATIONAL_COST
    FROM rev
    JOIN LOCATION_MASTER lm ON lm.LOCATION_ID = rev.LOCATION_ID
    LEFT JOIN labor ON labor.LOCATION_ID = rev.LOCATION_ID AND labor.MONTH = rev.MONTH
    LEFT JOIN opex ON opex.LOCATION_ID = rev.LOCATION_ID AND opex.MONTH = rev.MONTH
    ${city ? 'WHERE lm.CITY = ?' : ''}
    ORDER BY lm.CITY, rev.MONTH
  `;
  const binds = city ? [months, city] : [months];

  const rows = await querySnowflake<RawPnLRow>(sql, binds);
  return rows.map((row) => {
    const revenue = Number(row.REVENUE);
    const totalCost = Number(row.LABOR_COST) + Number(row.OPERATIONAL_COST);
    const profit = revenue - totalCost;
    return {
      city: row.CITY,
      month: row.MONTH,
      revenue,
      laborCost: Number(row.LABOR_COST),
      operationalCost: Number(row.OPERATIONAL_COST),
      totalCost,
      profit,
      marginPct: revenue > 0 ? Number(((profit / revenue) * 100).toFixed(2)) : 0,
    };
  });
}

interface RawRefundRow {
  CITY: string;
  SERVICE_TYPE: string | null;
  BOOKING_COUNT: number;
  REFUND_COUNT: number;
  REFUND_AMOUNT: number;
  REVENUE: number;
}

/**
 * Refund rate and lost revenue by city — broken down by service type when a single city is
 * requested (the natural "what's driving this city's refunds" drill-down), or aggregated at the
 * city level across all cities when no city is given.
 */
export async function getRefundBreakdown(city?: string, months = 12): Promise<RefundBreakdown[]> {
  const groupByService = Boolean(city);
  const sql = `
    SELECT lm.CITY, ${groupByService ? 'b.SERVICE_TYPE' : 'NULL AS SERVICE_TYPE'},
           SUM(b.BOOKING_COUNT) AS BOOKING_COUNT,
           SUM(b.REFUND_COUNT) AS REFUND_COUNT,
           SUM(b.REFUND_AMOUNT) AS REFUND_AMOUNT,
           SUM(b.REVENUE) AS REVENUE
    FROM SALESFORCE_BOOKINGS b
    JOIN LOCATION_MASTER lm ON lm.LOCATION_ID = b.LOCATION_ID
    WHERE b.BOOKING_MONTH > DATEADD(month, -?, (SELECT MAX(BOOKING_MONTH) FROM SALESFORCE_BOOKINGS))
    ${city ? 'AND lm.CITY = ?' : ''}
    GROUP BY lm.CITY${groupByService ? ', b.SERVICE_TYPE' : ''}
    ORDER BY lm.CITY${groupByService ? ', b.SERVICE_TYPE' : ''}
  `;
  const binds = city ? [months, city] : [months];

  const rows = await querySnowflake<RawRefundRow>(sql, binds);
  return rows.map((row) => {
    const bookingCount = Number(row.BOOKING_COUNT);
    const refundCount = Number(row.REFUND_COUNT);
    return {
      city: row.CITY,
      serviceType: row.SERVICE_TYPE,
      bookingCount,
      refundCount,
      refundAmount: Number(row.REFUND_AMOUNT),
      revenue: Number(row.REVENUE),
      refundRatePct: bookingCount > 0 ? Number(((refundCount / bookingCount) * 100).toFixed(2)) : 0,
    };
  });
}

interface RawRevenuePerRoomRow {
  CITY: string;
  TREATMENT_ROOMS: number;
  TOTAL_REVENUE: number;
}

/** Average monthly revenue per treatment room, by city — useful for capital ROI/payback questions. */
export async function getRevenuePerRoom(city?: string, months = 6): Promise<RevenuePerRoom[]> {
  const sql = `
    SELECT lm.CITY, lm.TREATMENT_ROOMS, SUM(b.REVENUE) AS TOTAL_REVENUE
    FROM SALESFORCE_BOOKINGS b
    JOIN LOCATION_MASTER lm ON lm.LOCATION_ID = b.LOCATION_ID
    WHERE b.BOOKING_MONTH > DATEADD(month, -?, (SELECT MAX(BOOKING_MONTH) FROM SALESFORCE_BOOKINGS))
    ${city ? 'AND lm.CITY = ?' : ''}
    GROUP BY lm.CITY, lm.TREATMENT_ROOMS
    ORDER BY lm.CITY
  `;
  const binds = city ? [months, city] : [months];

  const rows = await querySnowflake<RawRevenuePerRoomRow>(sql, binds);
  return rows.map((row) => {
    const treatmentRooms = Number(row.TREATMENT_ROOMS);
    const avgMonthlyRevenue = Number(row.TOTAL_REVENUE) / months;
    return {
      city: row.CITY,
      avgMonthlyRevenue: Number(avgMonthlyRevenue.toFixed(2)),
      treatmentRooms,
      avgMonthlyRevenuePerRoom: treatmentRooms > 0 ? Number((avgMonthlyRevenue / treatmentRooms).toFixed(2)) : 0,
    };
  });
}

interface RawLaborCostRow {
  CITY: string;
  ROLE: string;
  AVG_HEADCOUNT: number;
  TOTAL_LABOR_COST: number;
  OVERTIME_COST: number;
}

/** Labor cost by city and role, over a lookback window — headcount is averaged, costs are summed. */
export async function getLaborCostByRole(city?: string, months = 6): Promise<LaborCostByRole[]> {
  const sql = `
    SELECT lm.CITY, lc.ROLE,
           AVG(lc.HEADCOUNT) AS AVG_HEADCOUNT,
           SUM(lc.TOTAL_LABOR_COST) AS TOTAL_LABOR_COST,
           SUM(lc.OVERTIME_COST) AS OVERTIME_COST
    FROM SAGE_LABOR_COSTS lc
    JOIN LOCATION_MASTER lm ON lm.LOCATION_ID = lc.LOCATION_ID
    WHERE lc.MONTH > DATEADD(month, -?, (SELECT MAX(MONTH) FROM SAGE_LABOR_COSTS))
    ${city ? 'AND lm.CITY = ?' : ''}
    GROUP BY lm.CITY, lc.ROLE
    ORDER BY lm.CITY, lc.ROLE
  `;
  const binds = city ? [months, city] : [months];

  const rows = await querySnowflake<RawLaborCostRow>(sql, binds);
  return rows.map((row) => {
    const headcount = Number(row.AVG_HEADCOUNT);
    const totalLaborCost = Number(row.TOTAL_LABOR_COST);
    return {
      city: row.CITY,
      role: row.ROLE,
      headcount: Number(headcount.toFixed(1)),
      totalLaborCost,
      overtimeCost: Number(row.OVERTIME_COST),
      costPerEmployee: headcount > 0 ? Number((totalLaborCost / headcount).toFixed(2)) : 0,
    };
  });
}

interface RawRevenueByServiceRow {
  CITY: string;
  SERVICE_TYPE: string;
  BOOKING_COUNT: number;
  REVENUE: number;
}

/** Revenue and booking volume by city and service type — which services drive the most revenue. */
export async function getRevenueByServiceType(city?: string, months = 6): Promise<RevenueByServiceType[]> {
  const sql = `
    SELECT lm.CITY, b.SERVICE_TYPE, SUM(b.BOOKING_COUNT) AS BOOKING_COUNT, SUM(b.REVENUE) AS REVENUE
    FROM SALESFORCE_BOOKINGS b
    JOIN LOCATION_MASTER lm ON lm.LOCATION_ID = b.LOCATION_ID
    WHERE b.BOOKING_MONTH > DATEADD(month, -?, (SELECT MAX(BOOKING_MONTH) FROM SALESFORCE_BOOKINGS))
    ${city ? 'AND lm.CITY = ?' : ''}
    GROUP BY lm.CITY, b.SERVICE_TYPE
    ORDER BY lm.CITY, REVENUE DESC
  `;
  const binds = city ? [months, city] : [months];

  const rows = await querySnowflake<RawRevenueByServiceRow>(sql, binds);
  return rows.map((row) => ({
    city: row.CITY,
    serviceType: row.SERVICE_TYPE,
    bookingCount: Number(row.BOOKING_COUNT),
    revenue: Number(row.REVENUE),
  }));
}

interface RawOpexBreakdownRow {
  CITY: string;
  COST_CATEGORY: string;
  AMOUNT: number;
}

/** Operational cost by city and category (Rent, Utilities, Supplies & Products, etc.). */
export async function getOperationalCostBreakdown(city?: string, months = 6): Promise<OperationalCostBreakdown[]> {
  const sql = `
    SELECT lm.CITY, oc.COST_CATEGORY, SUM(oc.AMOUNT) AS AMOUNT
    FROM SAGE_OPERATIONAL_COSTS oc
    JOIN LOCATION_MASTER lm ON lm.LOCATION_ID = oc.LOCATION_ID
    WHERE oc.MONTH > DATEADD(month, -?, (SELECT MAX(MONTH) FROM SAGE_OPERATIONAL_COSTS))
    ${city ? 'AND lm.CITY = ?' : ''}
    GROUP BY lm.CITY, oc.COST_CATEGORY
    ORDER BY lm.CITY, AMOUNT DESC
  `;
  const binds = city ? [months, city] : [months];

  const rows = await querySnowflake<RawOpexBreakdownRow>(sql, binds);
  return rows.map((row) => ({
    city: row.CITY,
    costCategory: row.COST_CATEGORY,
    amount: Number(row.AMOUNT),
  }));
}

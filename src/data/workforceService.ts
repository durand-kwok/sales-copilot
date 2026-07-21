import type {
  BookingDemandPoint,
  RecruitingPipelineStats,
  RetentionRiskForecast,
  StaffingSummary,
  TenureAndTurnover,
} from '../types/index.js';
import { querySnowflake } from '../snowflake/client.js';

interface RawBookingDemandRow {
  CITY: string;
  MONTH: string;
  BOOKING_COUNT: number;
  THERAPIST_HOURS_REQUIRED: number;
}

/** Month-over-month booking volume and required therapist hours, by city — for demand-growth questions. */
export async function getBookingDemandTrend(city?: string, months = 6): Promise<BookingDemandPoint[]> {
  const sql = `
    SELECT lm.CITY, b.BOOKING_MONTH AS MONTH,
           SUM(b.BOOKING_COUNT) AS BOOKING_COUNT,
           SUM(b.THERAPIST_HOURS_REQUIRED) AS THERAPIST_HOURS_REQUIRED
    FROM SALESFORCE_BOOKINGS b
    JOIN LOCATION_MASTER lm ON lm.LOCATION_ID = b.LOCATION_ID
    WHERE b.BOOKING_MONTH > DATEADD(month, -?, (SELECT MAX(BOOKING_MONTH) FROM SALESFORCE_BOOKINGS))
    ${city ? 'AND lm.CITY = ?' : ''}
    GROUP BY lm.CITY, b.BOOKING_MONTH
    ORDER BY lm.CITY, b.BOOKING_MONTH
  `;
  const binds = city ? [months, city] : [months];

  const rows = await querySnowflake<RawBookingDemandRow>(sql, binds);
  return rows.map((row) => ({
    city: row.CITY,
    month: row.MONTH,
    bookingCount: Number(row.BOOKING_COUNT),
    therapistHoursRequired: Number(row.THERAPIST_HOURS_REQUIRED),
  }));
}

interface RawStaffingSummaryRow {
  CITY: string;
  ACTIVE_HEADCOUNT: number;
  THERAPIST_HEADCOUNT: number;
  OPEN_REQUISITIONS: number;
  HEADCOUNT_REQUESTED: number;
  RECRUITING_SPEND: number;
}

/**
 * Current staffing snapshot by city: active headcount, therapist headcount, open recruiting
 * requisitions, and recent recruiting spend. Every city appears (including locations with zero
 * staff, e.g. a not-yet-opened location), since this is built from LOCATION_MASTER outward.
 */
export async function getStaffingSummary(city?: string): Promise<StaffingSummary[]> {
  const sql = `
    WITH emp AS (
      SELECT LOCATION_ID,
             COUNT(*) AS ACTIVE_HEADCOUNT,
             SUM(CASE WHEN ROLE ILIKE '%Therapist%' THEN 1 ELSE 0 END) AS THERAPIST_HEADCOUNT
      FROM WORKDAY_HCM_EMPLOYEES
      WHERE EMPLOYMENT_STATUS = 'Active'
      GROUP BY LOCATION_ID
    ),
    reqs AS (
      SELECT LOCATION_ID,
             SUM(CASE WHEN STATUS = 'Open' THEN 1 ELSE 0 END) AS OPEN_REQUISITIONS,
             SUM(CASE WHEN STATUS = 'Open' THEN HEADCOUNT_REQUESTED ELSE 0 END) AS HEADCOUNT_REQUESTED
      FROM WORKDAY_RECRUITING_REQUISITIONS
      GROUP BY LOCATION_ID
    ),
    recruit_cost AS (
      SELECT LOCATION_ID, SUM(AMOUNT) AS RECRUITING_SPEND
      FROM GEM_RECRUITING_COSTS
      WHERE MONTH > DATEADD(month, -6, (SELECT MAX(MONTH) FROM GEM_RECRUITING_COSTS))
      GROUP BY LOCATION_ID
    )
    SELECT lm.CITY,
           COALESCE(emp.ACTIVE_HEADCOUNT, 0) AS ACTIVE_HEADCOUNT,
           COALESCE(emp.THERAPIST_HEADCOUNT, 0) AS THERAPIST_HEADCOUNT,
           COALESCE(reqs.OPEN_REQUISITIONS, 0) AS OPEN_REQUISITIONS,
           COALESCE(reqs.HEADCOUNT_REQUESTED, 0) AS HEADCOUNT_REQUESTED,
           COALESCE(recruit_cost.RECRUITING_SPEND, 0) AS RECRUITING_SPEND
    FROM LOCATION_MASTER lm
    LEFT JOIN emp ON emp.LOCATION_ID = lm.LOCATION_ID
    LEFT JOIN reqs ON reqs.LOCATION_ID = lm.LOCATION_ID
    LEFT JOIN recruit_cost ON recruit_cost.LOCATION_ID = lm.LOCATION_ID
    ${city ? 'WHERE lm.CITY = ?' : ''}
    ORDER BY lm.CITY
  `;
  const binds = city ? [city] : [];

  const rows = await querySnowflake<RawStaffingSummaryRow>(sql, binds);
  return rows.map((row) => ({
    city: row.CITY,
    activeHeadcount: Number(row.ACTIVE_HEADCOUNT),
    therapistHeadcount: Number(row.THERAPIST_HEADCOUNT),
    openRequisitions: Number(row.OPEN_REQUISITIONS),
    headcountRequested: Number(row.HEADCOUNT_REQUESTED),
    recruitingSpendLast6Months: Number(row.RECRUITING_SPEND),
  }));
}

interface RawTenureRow {
  CITY: string;
  ROLE: string;
  ACTIVE_HEADCOUNT: number;
  AVG_TENURE_MONTHS: number;
  TERMINATED_COUNT: number;
  TOTAL_COUNT: number;
  AVG_COMPENSATION: number;
}

/**
 * Tenure and turnover by city and role, computed from all recorded employees (active + terminated)
 * at that city/role. turnoverRatePct is a share-of-all-time-recorded metric, not an annualized rate
 * — describe it to the user as such rather than implying it's a standard annual turnover figure.
 */
export async function getTenureAndTurnover(city?: string, role?: string): Promise<TenureAndTurnover[]> {
  const conditions = [city ? 'lm.CITY = ?' : null, role ? 'e.ROLE = ?' : null].filter(Boolean);
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const binds = [city, role].filter((v): v is string => Boolean(v));

  const sql = `
    SELECT lm.CITY, e.ROLE,
           SUM(CASE WHEN e.EMPLOYMENT_STATUS = 'Active' THEN 1 ELSE 0 END) AS ACTIVE_HEADCOUNT,
           AVG(CASE
                 WHEN e.EMPLOYMENT_STATUS = 'Active' THEN DATEDIFF(month, e.HIRE_DATE, CURRENT_DATE())
                 ELSE DATEDIFF(month, e.HIRE_DATE, e.TERMINATION_DATE)
               END) AS AVG_TENURE_MONTHS,
           SUM(CASE WHEN e.EMPLOYMENT_STATUS = 'Terminated' THEN 1 ELSE 0 END) AS TERMINATED_COUNT,
           COUNT(*) AS TOTAL_COUNT,
           AVG(e.COMPENSATION_ANNUAL) AS AVG_COMPENSATION
    FROM WORKDAY_HCM_EMPLOYEES e
    JOIN LOCATION_MASTER lm ON lm.LOCATION_ID = e.LOCATION_ID
    ${whereClause}
    GROUP BY lm.CITY, e.ROLE
    ORDER BY lm.CITY, e.ROLE
  `;

  const rows = await querySnowflake<RawTenureRow>(sql, binds);
  return rows.map((row) => {
    const totalCount = Number(row.TOTAL_COUNT);
    const terminatedCount = Number(row.TERMINATED_COUNT);
    return {
      city: row.CITY,
      role: row.ROLE,
      headcount: Number(row.ACTIVE_HEADCOUNT),
      avgTenureMonths: Number(Number(row.AVG_TENURE_MONTHS).toFixed(1)),
      terminatedCount,
      turnoverRatePct: totalCount > 0 ? Number(((terminatedCount / totalCount) * 100).toFixed(1)) : 0,
      avgCompensationAnnual: Number(Number(row.AVG_COMPENSATION).toFixed(2)),
    };
  });
}

interface RawRetentionRiskRow {
  CITY: string;
  FORECAST_MONTH: string;
  PREDICTED_TERMINATIONS: number;
  WORST_CASE_TERMINATIONS: number;
}

/** AI-forecasted attrition risk by city and month, from FORECAST_ATTRITION_RESULTS. */
export async function getRetentionRiskForecast(city?: string): Promise<RetentionRiskForecast[]> {
  const sql = `
    SELECT CITY::STRING AS CITY, FORECAST_MONTH, PREDICTED_TERMINATIONS, WORST_CASE_TERMINATIONS
    FROM FORECAST_ATTRITION_RESULTS
    ${city ? 'WHERE CITY::STRING = ?' : ''}
    ORDER BY CITY::STRING, FORECAST_MONTH
  `;
  const binds = city ? [city] : [];

  const rows = await querySnowflake<RawRetentionRiskRow>(sql, binds);
  return rows.map((row) => ({
    city: row.CITY,
    forecastMonth: row.FORECAST_MONTH,
    predictedTerminations: Number(row.PREDICTED_TERMINATIONS),
    worstCaseTerminations: Number(row.WORST_CASE_TERMINATIONS),
  }));
}

interface RawRecruitingPipelineRow {
  CITY: string;
  ROLE: string;
  OPEN_COUNT: number;
  FILLED_COUNT: number;
  AVG_DAYS_TO_FILL: number | null;
  AVG_DAYS_OPEN_STILL_OPEN: number | null;
}

/**
 * Recruiting pipeline stats by city and role: open/filled requisition counts, average days-to-fill
 * for filled reqs, and average days-still-open for currently open reqs. Employee hire/requisition
 * dates in this dataset stay before wall-clock "today", so CURRENT_DATE() is safe to use here
 * (unlike the booking/cost tables — see the anchor-date note elsewhere in this file).
 */
export async function getRecruitingPipeline(city?: string, role?: string): Promise<RecruitingPipelineStats[]> {
  const conditions = [city ? 'lm.CITY = ?' : null, role ? 'r.ROLE = ?' : null].filter(Boolean);
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const binds = [city, role].filter((v): v is string => Boolean(v));

  const sql = `
    SELECT lm.CITY, r.ROLE,
           SUM(CASE WHEN r.STATUS = 'Open' THEN 1 ELSE 0 END) AS OPEN_COUNT,
           SUM(CASE WHEN r.STATUS = 'Filled' THEN 1 ELSE 0 END) AS FILLED_COUNT,
           AVG(CASE WHEN r.STATUS = 'Filled' THEN DATEDIFF(day, r.POSTED_DATE, r.FILLED_DATE) END) AS AVG_DAYS_TO_FILL,
           AVG(CASE WHEN r.STATUS = 'Open' THEN DATEDIFF(day, r.POSTED_DATE, CURRENT_DATE()) END) AS AVG_DAYS_OPEN_STILL_OPEN
    FROM WORKDAY_RECRUITING_REQUISITIONS r
    JOIN LOCATION_MASTER lm ON lm.LOCATION_ID = r.LOCATION_ID
    ${whereClause}
    GROUP BY lm.CITY, r.ROLE
    ORDER BY lm.CITY, r.ROLE
  `;

  const rows = await querySnowflake<RawRecruitingPipelineRow>(sql, binds);
  return rows.map((row) => ({
    city: row.CITY,
    role: row.ROLE,
    openCount: Number(row.OPEN_COUNT),
    filledCount: Number(row.FILLED_COUNT),
    avgDaysToFill: row.AVG_DAYS_TO_FILL === null ? null : Number(Number(row.AVG_DAYS_TO_FILL).toFixed(1)),
    avgDaysOpenForStillOpen:
      row.AVG_DAYS_OPEN_STILL_OPEN === null ? null : Number(Number(row.AVG_DAYS_OPEN_STILL_OPEN).toFixed(1)),
  }));
}

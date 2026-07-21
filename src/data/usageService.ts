import type { AiTier, ChurnByLocation, ChurnCohortGroupBy, ChurnCohortSummary, ChurnRisk, CustomerHealth } from '../types/index.js';
import { querySnowflake } from '../snowflake/client.js';

interface RawCustomerHealthRow {
  CUSTOMER_ID: number;
  FIRST_NAME: string;
  LAST_NAME: string;
  HOME_LOCATION_ID: number;
  LIFETIME_SPEND: number;
  TOTAL_VISITS: number;
  VISIT_FREQUENCY_MONTHLY: number;
  DAYS_SINCE_LAST_VISIT: number;
  NPS_SCORE: number;
  MEMBERSHIP_TYPE: string;
  PREFERRED_SERVICE: string;
  AI_TIER: AiTier;
  CHURN_RISK: ChurnRisk;
  CHURN_PROBABILITY_PCT: number;
  PREDICTED_LTV_12M: number;
  AI_RECOMMENDATION: string;
}

export async function getCustomerHealth(customerId: number): Promise<CustomerHealth | null> {
  const rows = await querySnowflake<RawCustomerHealthRow>(`SELECT * FROM CUSTOMER_TIERS_AI WHERE CUSTOMER_ID = ?`, [
    customerId,
  ]);
  const row = rows[0];
  if (!row) return null;
  return {
    customerId: Number(row.CUSTOMER_ID),
    firstName: row.FIRST_NAME,
    lastName: row.LAST_NAME,
    homeLocationId: Number(row.HOME_LOCATION_ID),
    lifetimeSpend: Number(row.LIFETIME_SPEND),
    totalVisits: Number(row.TOTAL_VISITS),
    visitFrequencyMonthly: Number(row.VISIT_FREQUENCY_MONTHLY),
    daysSinceLastVisit: Number(row.DAYS_SINCE_LAST_VISIT),
    npsScore: Number(row.NPS_SCORE),
    membershipType: row.MEMBERSHIP_TYPE,
    preferredService: row.PREFERRED_SERVICE,
    aiTier: row.AI_TIER,
    churnRisk: row.CHURN_RISK,
    churnProbabilityPct: Number(row.CHURN_PROBABILITY_PCT),
    predictedLtv12M: Number(row.PREDICTED_LTV_12M),
    aiRecommendation: row.AI_RECOMMENDATION,
  };
}

interface RawChurnCohortRow {
  GROUP_VALUE: string;
  CUSTOMER_COUNT: number;
  AVG_LTV: number;
  AVG_CHURN_PROBABILITY_PCT: number;
  AVG_VISIT_FREQUENCY_MONTHLY: number;
  AVG_DAYS_SINCE_LAST_VISIT: number;
  AVG_NPS_SCORE: number;
}

/**
 * Aggregate customer-health stats grouped by paid membership tier (MEMBERSHIP_TYPE) or AI churn-risk
 * bucket (CHURN_RISK). Use 'tier' for LTV/churn-by-plan questions, 'churnRisk' to compare engagement
 * signals (visit frequency, days since last visit) across risk cohorts — e.g. to check whether visit
 * drop-off precedes high churn risk.
 */
export async function getChurnCohortSummary(groupBy: ChurnCohortGroupBy): Promise<ChurnCohortSummary[]> {
  const column = groupBy === 'tier' ? 'MEMBERSHIP_TYPE' : 'CHURN_RISK';
  const sql = `
    SELECT ${column} AS GROUP_VALUE,
           COUNT(*) AS CUSTOMER_COUNT,
           AVG(PREDICTED_LTV_12M) AS AVG_LTV,
           AVG(CHURN_PROBABILITY_PCT) AS AVG_CHURN_PROBABILITY_PCT,
           AVG(VISIT_FREQUENCY_MONTHLY) AS AVG_VISIT_FREQUENCY_MONTHLY,
           AVG(DAYS_SINCE_LAST_VISIT) AS AVG_DAYS_SINCE_LAST_VISIT,
           AVG(NPS_SCORE) AS AVG_NPS_SCORE
    FROM CUSTOMER_TIERS_AI
    GROUP BY ${column}
    ORDER BY ${column}
  `;

  const rows = await querySnowflake<RawChurnCohortRow>(sql, []);
  return rows.map((row) => ({
    groupValue: row.GROUP_VALUE,
    customerCount: Number(row.CUSTOMER_COUNT),
    avgLtv: Number(Number(row.AVG_LTV).toFixed(2)),
    avgChurnProbabilityPct: Number(Number(row.AVG_CHURN_PROBABILITY_PCT).toFixed(1)),
    avgVisitFrequencyMonthly: Number(Number(row.AVG_VISIT_FREQUENCY_MONTHLY).toFixed(2)),
    avgDaysSinceLastVisit: Number(Number(row.AVG_DAYS_SINCE_LAST_VISIT).toFixed(1)),
    avgNpsScore: Number(Number(row.AVG_NPS_SCORE).toFixed(1)),
  }));
}

interface RawChurnByLocationRow {
  CITY: string;
  CUSTOMER_COUNT: number;
  AVG_CHURN_PROBABILITY_PCT: number;
  HIGH_CHURN_RISK_COUNT: number;
}

/** Customer churn-risk aggregated by home location — pair with workforce_getStaffingSummary to check for a staffing/churn relationship. */
export async function getChurnByLocation(): Promise<ChurnByLocation[]> {
  const sql = `
    SELECT lm.CITY,
           COUNT(*) AS CUSTOMER_COUNT,
           AVG(t.CHURN_PROBABILITY_PCT) AS AVG_CHURN_PROBABILITY_PCT,
           SUM(CASE WHEN t.CHURN_RISK = 'High' THEN 1 ELSE 0 END) AS HIGH_CHURN_RISK_COUNT
    FROM CUSTOMER_TIERS_AI t
    JOIN LOCATION_MASTER lm ON lm.LOCATION_ID = t.HOME_LOCATION_ID
    GROUP BY lm.CITY
    ORDER BY lm.CITY
  `;

  const rows = await querySnowflake<RawChurnByLocationRow>(sql, []);
  return rows.map((row) => {
    const customerCount = Number(row.CUSTOMER_COUNT);
    const highChurnRiskCount = Number(row.HIGH_CHURN_RISK_COUNT);
    return {
      city: row.CITY,
      customerCount,
      avgChurnProbabilityPct: Number(Number(row.AVG_CHURN_PROBABILITY_PCT).toFixed(1)),
      highChurnRiskCount,
      highChurnRiskPct: customerCount > 0 ? Number(((highChurnRiskCount / customerCount) * 100).toFixed(1)) : 0,
    };
  });
}

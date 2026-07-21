import type { CampaignPerformance, CampaignRetentionImpact } from '../types/index.js';
import { querySnowflake } from '../snowflake/client.js';

interface RawCampaignPerformanceRow {
  CHANNEL: string;
  TOTAL_BUDGET: number;
  TOTAL_CONVERTED: number;
  TOTAL_REVENUE_ATTRIBUTED: number;
}

/**
 * Campaign performance aggregated by marketing channel (Email/SMS/Social Media/Push Notification).
 * Note: this channel dimension is NOT the same as SALESFORCE_CUSTOMERS.REFERRAL_SOURCE (Walk-in,
 * TripAdvisor, Referral, Google Ads, Instagram, Email) — only "Email" overlaps between the two, so
 * this is an approximation for "CAC by referral source" questions, not an exact answer.
 */
export async function getCampaignPerformance(channel?: string): Promise<CampaignPerformance[]> {
  const sql = `
    SELECT CHANNEL,
           SUM(BUDGET) AS TOTAL_BUDGET,
           SUM(TOTAL_CONVERTED) AS TOTAL_CONVERTED,
           SUM(REVENUE_ATTRIBUTED) AS TOTAL_REVENUE_ATTRIBUTED
    FROM HUBSPOT_CAMPAIGNS
    ${channel ? 'WHERE CHANNEL = ?' : ''}
    GROUP BY CHANNEL
    ORDER BY CHANNEL
  `;
  const binds = channel ? [channel] : [];

  const rows = await querySnowflake<RawCampaignPerformanceRow>(sql, binds);
  return rows.map((row) => {
    const totalConverted = Number(row.TOTAL_CONVERTED);
    const totalBudget = Number(row.TOTAL_BUDGET);
    return {
      channel: row.CHANNEL,
      totalBudget,
      totalConverted,
      totalRevenueAttributed: Number(row.TOTAL_REVENUE_ATTRIBUTED),
      costPerAcquisition: totalConverted > 0 ? Number((totalBudget / totalConverted).toFixed(2)) : null,
    };
  });
}

interface RawCampaignRetentionRow {
  CAMPAIGN_NAME: string;
  RESPONDED_CUSTOMER_COUNT: number;
  AT_RISK_COUNT: number;
  AVG_CHURN_PROBABILITY_PCT: number | null;
}

/**
 * For each campaign, the distinct customers who responded (HUBSPOT_CAMPAIGN_RESPONSES.CUSTOMER_ID),
 * how many currently show an "At Risk"/"Unlikely" renewal or have no renewal record, and their average
 * churn probability. This is a directional signal (correlation, not causation) for "which campaigns
 * had the highest impact on retention" — lower avgChurnProbabilityPct among responders suggests a
 * healthier audience, not necessarily that the campaign caused it.
 */
export async function getCampaignRetentionImpact(): Promise<CampaignRetentionImpact[]> {
  const sql = `
    WITH responders AS (
      SELECT DISTINCT CAMPAIGN_ID, CUSTOMER_ID FROM HUBSPOT_CAMPAIGN_RESPONSES
    )
    SELECT c.CAMPAIGN_NAME,
           COUNT(*) AS RESPONDED_CUSTOMER_COUNT,
           SUM(CASE WHEN mr.RENEWAL_LIKELIHOOD IN ('At Risk', 'Unlikely') THEN 1 ELSE 0 END) AS AT_RISK_COUNT,
           AVG(t.CHURN_PROBABILITY_PCT) AS AVG_CHURN_PROBABILITY_PCT
    FROM responders resp
    JOIN HUBSPOT_CAMPAIGNS c ON c.CAMPAIGN_ID = resp.CAMPAIGN_ID
    LEFT JOIN MEMBERSHIP_RENEWALS mr ON mr.CUSTOMER_ID = resp.CUSTOMER_ID
    LEFT JOIN CUSTOMER_TIERS_AI t ON t.CUSTOMER_ID = resp.CUSTOMER_ID
    GROUP BY c.CAMPAIGN_NAME
    ORDER BY AVG_CHURN_PROBABILITY_PCT ASC
  `;

  const rows = await querySnowflake<RawCampaignRetentionRow>(sql, []);
  return rows.map((row) => {
    const respondedCustomerCount = Number(row.RESPONDED_CUSTOMER_COUNT);
    const atRiskCount = Number(row.AT_RISK_COUNT);
    return {
      campaignName: row.CAMPAIGN_NAME,
      respondedCustomerCount,
      atRiskOrUnlikelyRenewalCount: atRiskCount,
      atRiskOrUnlikelyRenewalPct:
        respondedCustomerCount > 0 ? Number(((atRiskCount / respondedCustomerCount) * 100).toFixed(1)) : 0,
      avgChurnProbabilityPct: row.AVG_CHURN_PROBABILITY_PCT === null ? 0 : Number(Number(row.AVG_CHURN_PROBABILITY_PCT).toFixed(1)),
    };
  });
}

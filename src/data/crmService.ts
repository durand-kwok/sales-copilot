import type { Customer, MembershipEvent, MembershipEventType, Renewal, RenewalLikelihood, UpgradeOffer } from '../types/index.js';
import { querySnowflake } from '../snowflake/client.js';

interface RawCustomerRow {
  CUSTOMER_ID: number;
  FIRST_NAME: string;
  LAST_NAME: string;
  EMAIL: string;
  PHONE: string;
  HOME_LOCATION_ID: number;
  JOIN_DATE: string;
  LAST_VISIT_DATE: string;
  TOTAL_VISITS: number;
  LIFETIME_SPEND: number;
  AVG_SPEND_PER_VISIT: number;
  PREFERRED_SERVICE: string;
  MEMBERSHIP_TYPE: string;
  REFERRAL_SOURCE: string;
  NPS_SCORE: number;
  DAYS_SINCE_LAST_VISIT: number;
  VISIT_FREQUENCY_MONTHLY: number;
  ADDRESS: string;
  IS_ACTIVE: boolean;
}

function mapCustomer(row: RawCustomerRow): Customer {
  return {
    customerId: Number(row.CUSTOMER_ID),
    firstName: row.FIRST_NAME,
    lastName: row.LAST_NAME,
    email: row.EMAIL,
    phone: row.PHONE,
    homeLocationId: Number(row.HOME_LOCATION_ID),
    joinDate: row.JOIN_DATE,
    lastVisitDate: row.LAST_VISIT_DATE,
    totalVisits: Number(row.TOTAL_VISITS),
    lifetimeSpend: Number(row.LIFETIME_SPEND),
    avgSpendPerVisit: Number(row.AVG_SPEND_PER_VISIT),
    preferredService: row.PREFERRED_SERVICE,
    membershipType: row.MEMBERSHIP_TYPE,
    referralSource: row.REFERRAL_SOURCE,
    npsScore: Number(row.NPS_SCORE),
    daysSinceLastVisit: Number(row.DAYS_SINCE_LAST_VISIT),
    visitFrequencyMonthly: Number(row.VISIT_FREQUENCY_MONTHLY),
    address: row.ADDRESS,
    isActive: Boolean(row.IS_ACTIVE),
  };
}

export async function findCustomerByName(nameQuery: string): Promise<Customer[]> {
  const rows = await querySnowflake<RawCustomerRow>(
    `SELECT * FROM SALESFORCE_CUSTOMERS WHERE LOWER(FIRST_NAME || ' ' || LAST_NAME) LIKE LOWER(?) LIMIT 20`,
    [`%${nameQuery}%`],
  );
  return rows.map(mapCustomer);
}

export async function getCustomer(customerId: number): Promise<Customer | null> {
  const rows = await querySnowflake<RawCustomerRow>(`SELECT * FROM SALESFORCE_CUSTOMERS WHERE CUSTOMER_ID = ?`, [
    customerId,
  ]);
  return rows[0] ? mapCustomer(rows[0]) : null;
}

interface RawRenewalRow {
  RENEWAL_ID: number;
  CUSTOMER_ID: number;
  CURRENT_TIER: string;
  HOME_LOCATION_ID: number;
  RENEWAL_DATE: string;
  TOTAL_VISITS: number;
  VISIT_FREQUENCY_MONTHLY: number;
  DAYS_SINCE_LAST_VISIT: number;
  NPS_SCORE: number;
  LIFETIME_SPEND: number;
  RENEWAL_PROBABILITY_PCT: number;
  RENEWAL_LIKELIHOOD: RenewalLikelihood;
  UPGRADE_CANDIDATE: boolean;
}

export async function getRenewal(customerId: number): Promise<Renewal | null> {
  const rows = await querySnowflake<RawRenewalRow>(`SELECT * FROM MEMBERSHIP_RENEWALS WHERE CUSTOMER_ID = ?`, [
    customerId,
  ]);
  const row = rows[0];
  if (!row) return null;
  return {
    renewalId: Number(row.RENEWAL_ID),
    customerId: Number(row.CUSTOMER_ID),
    currentTier: row.CURRENT_TIER,
    homeLocationId: Number(row.HOME_LOCATION_ID),
    renewalDate: row.RENEWAL_DATE,
    totalVisits: Number(row.TOTAL_VISITS),
    visitFrequencyMonthly: Number(row.VISIT_FREQUENCY_MONTHLY),
    daysSinceLastVisit: Number(row.DAYS_SINCE_LAST_VISIT),
    npsScore: Number(row.NPS_SCORE),
    lifetimeSpend: Number(row.LIFETIME_SPEND),
    renewalProbabilityPct: Number(row.RENEWAL_PROBABILITY_PCT),
    renewalLikelihood: row.RENEWAL_LIKELIHOOD,
    upgradeCandidate: Boolean(row.UPGRADE_CANDIDATE),
  };
}

interface RawUpgradeOfferRow {
  CUSTOMER_ID: number;
  FIRST_NAME: string;
  LAST_NAME: string;
  CURRENT_TIER: string;
  RECOMMENDED_TIER: string;
  VISIT_FREQUENCY_MONTHLY: number;
  LIFETIME_SPEND: number;
  PREFERRED_SERVICE: string;
  RENEWAL_DATE: string;
  AI_UPGRADE_PITCH: string;
}

export async function getUpgradeOffer(customerId: number): Promise<UpgradeOffer | null> {
  const rows = await querySnowflake<RawUpgradeOfferRow>(
    `SELECT * FROM MEMBERSHIP_UPGRADE_OFFERS WHERE CUSTOMER_ID = ?`,
    [customerId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    customerId: Number(row.CUSTOMER_ID),
    firstName: row.FIRST_NAME,
    lastName: row.LAST_NAME,
    currentTier: row.CURRENT_TIER,
    recommendedTier: row.RECOMMENDED_TIER,
    visitFrequencyMonthly: Number(row.VISIT_FREQUENCY_MONTHLY),
    lifetimeSpend: Number(row.LIFETIME_SPEND),
    preferredService: row.PREFERRED_SERVICE,
    renewalDate: row.RENEWAL_DATE,
    aiUpgradePitch: row.AI_UPGRADE_PITCH,
  };
}

interface RawMembershipEventRow {
  EVENT_ID: number;
  CUSTOMER_ID: number;
  EVENT_DATE: string;
  EVENT_TYPE: MembershipEventType;
  FROM_TIER: string | null;
  TO_TIER: string | null;
  TRIGGER_SOURCE: string | null;
  CAMPAIGN_ID: number | null;
}

export async function getRecentActivity(customerId: number, limit = 5): Promise<MembershipEvent[]> {
  const rows = await querySnowflake<RawMembershipEventRow>(
    `SELECT * FROM MEMBERSHIP_HISTORY WHERE CUSTOMER_ID = ? ORDER BY EVENT_DATE DESC LIMIT ?`,
    [customerId, limit],
  );
  return rows.map((row) => ({
    eventId: Number(row.EVENT_ID),
    customerId: Number(row.CUSTOMER_ID),
    eventDate: row.EVENT_DATE,
    eventType: row.EVENT_TYPE,
    fromTier: row.FROM_TIER,
    toTier: row.TO_TIER,
    triggerSource: row.TRIGGER_SOURCE,
    campaignId: row.CAMPAIGN_ID === null ? null : Number(row.CAMPAIGN_ID),
  }));
}

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock('../../../src/snowflake/client.js', () => ({
  querySnowflake: queryMock,
}));

import {
  findCustomerByName,
  getCustomer,
  getRecentActivity,
  getRenewal,
  getUpgradeOffer,
} from '../../../src/data/crmService.js';

beforeEach(() => {
  queryMock.mockReset();
});

describe('crmService', () => {
  describe('findCustomerByName', () => {
    it('queries SALESFORCE_CUSTOMERS with a wrapped LIKE bind and maps rows to camelCase', async () => {
      queryMock.mockResolvedValueOnce([
        {
          CUSTOMER_ID: 1753,
          FIRST_NAME: 'Charlotte',
          LAST_NAME: 'Williams',
          EMAIL: 'charlotte.williams1753@email.com',
          PHONE: '555-310-1924',
          HOME_LOCATION_ID: 5,
          JOIN_DATE: '2022-01-24',
          LAST_VISIT_DATE: '2026-03-26',
          TOTAL_VISITS: 23,
          LIFETIME_SPEND: 2875.0,
          AVG_SPEND_PER_VISIT: 229.0,
          PREFERRED_SERVICE: 'Float Therapy',
          MEMBERSHIP_TYPE: 'Silver',
          REFERRAL_SOURCE: 'Google Ads',
          NPS_SCORE: 4,
          DAYS_SINCE_LAST_VISIT: 62,
          VISIT_FREQUENCY_MONTHLY: 0.44,
          ADDRESS: '834 Spring Avenue',
          IS_ACTIVE: true,
        },
      ]);

      const results = await findCustomerByName('charlotte');

      expect(queryMock).toHaveBeenCalledTimes(1);
      const [sql, binds] = queryMock.mock.calls[0]!;
      expect(sql).toContain('SALESFORCE_CUSTOMERS');
      expect(sql).toContain('LIKE');
      expect(binds).toEqual(['%charlotte%']);

      expect(results).toEqual([
        {
          customerId: 1753,
          firstName: 'Charlotte',
          lastName: 'Williams',
          email: 'charlotte.williams1753@email.com',
          phone: '555-310-1924',
          homeLocationId: 5,
          joinDate: '2022-01-24',
          lastVisitDate: '2026-03-26',
          totalVisits: 23,
          lifetimeSpend: 2875.0,
          avgSpendPerVisit: 229.0,
          preferredService: 'Float Therapy',
          membershipType: 'Silver',
          referralSource: 'Google Ads',
          npsScore: 4,
          daysSinceLastVisit: 62,
          visitFrequencyMonthly: 0.44,
          address: '834 Spring Avenue',
          isActive: true,
        },
      ]);
    });

    it('returns an empty array when no rows match', async () => {
      queryMock.mockResolvedValueOnce([]);
      expect(await findCustomerByName('nonexistent')).toEqual([]);
    });
  });

  describe('getCustomer', () => {
    it('queries by CUSTOMER_ID and returns null when no row is found', async () => {
      queryMock.mockResolvedValueOnce([]);
      const result = await getCustomer(999999);
      expect(queryMock.mock.calls[0]![1]).toEqual([999999]);
      expect(result).toBeNull();
    });
  });

  describe('getRenewal', () => {
    it('maps a renewal row including the renewalLikelihood label', async () => {
      queryMock.mockResolvedValueOnce([
        {
          RENEWAL_ID: 1,
          CUSTOMER_ID: 1753,
          CURRENT_TIER: 'Silver',
          HOME_LOCATION_ID: 5,
          RENEWAL_DATE: '2026-07-21',
          TOTAL_VISITS: 23,
          VISIT_FREQUENCY_MONTHLY: 0.44,
          DAYS_SINCE_LAST_VISIT: 62,
          NPS_SCORE: 4,
          LIFETIME_SPEND: 2875.0,
          RENEWAL_PROBABILITY_PCT: 24,
          RENEWAL_LIKELIHOOD: 'At Risk',
          UPGRADE_CANDIDATE: false,
        },
      ]);

      const result = await getRenewal(1753);

      expect(queryMock.mock.calls[0]![0]).toContain('MEMBERSHIP_RENEWALS');
      expect(result?.renewalLikelihood).toBe('At Risk');
      expect(result?.renewalProbabilityPct).toBe(24);
      expect(result?.upgradeCandidate).toBe(false);
    });

    it('returns null when the customer has no renewal record', async () => {
      queryMock.mockResolvedValueOnce([]);
      expect(await getRenewal(1)).toBeNull();
    });
  });

  describe('getUpgradeOffer', () => {
    it('returns null for the common case of no upgrade offer on file', async () => {
      queryMock.mockResolvedValueOnce([]);
      const result = await getUpgradeOffer(1753);
      expect(queryMock.mock.calls[0]![0]).toContain('MEMBERSHIP_UPGRADE_OFFERS');
      expect(result).toBeNull();
    });

    it('maps an upgrade offer row when one exists', async () => {
      queryMock.mockResolvedValueOnce([
        {
          CUSTOMER_ID: 42,
          FIRST_NAME: 'Sam',
          LAST_NAME: 'Rivera',
          CURRENT_TIER: 'Silver',
          RECOMMENDED_TIER: 'Gold',
          VISIT_FREQUENCY_MONTHLY: 3.2,
          LIFETIME_SPEND: 5000,
          PREFERRED_SERVICE: 'Sauna',
          RENEWAL_DATE: '2026-09-01',
          AI_UPGRADE_PITCH: 'Frequent visitor — Gold unlocks priority booking.',
        },
      ]);

      const result = await getUpgradeOffer(42);
      expect(result?.recommendedTier).toBe('Gold');
      expect(result?.aiUpgradePitch).toContain('Gold');
    });
  });

  describe('getRecentActivity', () => {
    it('defaults to a limit of 5 and maps membership event rows', async () => {
      queryMock.mockResolvedValueOnce([
        {
          EVENT_ID: 1,
          CUSTOMER_ID: 1753,
          EVENT_DATE: '2025-06-01',
          EVENT_TYPE: 'Upgrade',
          FROM_TIER: 'Bronze',
          TO_TIER: 'Silver',
          TRIGGER_SOURCE: 'Campaign',
          CAMPAIGN_ID: 7,
        },
      ]);

      const result = await getRecentActivity(1753);

      expect(queryMock.mock.calls[0]![1]).toEqual([1753, 5]);
      expect(result[0]).toEqual({
        eventId: 1,
        customerId: 1753,
        eventDate: '2025-06-01',
        eventType: 'Upgrade',
        fromTier: 'Bronze',
        toTier: 'Silver',
        triggerSource: 'Campaign',
        campaignId: 7,
      });
    });

    it('passes a custom limit through as a bind', async () => {
      queryMock.mockResolvedValueOnce([]);
      await getRecentActivity(1753, 10);
      expect(queryMock.mock.calls[0]![1]).toEqual([1753, 10]);
    });

    it('maps null fromTier/toTier/triggerSource/campaignId through as null', async () => {
      queryMock.mockResolvedValueOnce([
        {
          EVENT_ID: 2,
          CUSTOMER_ID: 1753,
          EVENT_DATE: '2022-01-24',
          EVENT_TYPE: 'Signup',
          FROM_TIER: null,
          TO_TIER: 'Bronze',
          TRIGGER_SOURCE: null,
          CAMPAIGN_ID: null,
        },
      ]);

      const result = await getRecentActivity(1753);
      expect(result[0]?.fromTier).toBeNull();
      expect(result[0]?.triggerSource).toBeNull();
      expect(result[0]?.campaignId).toBeNull();
    });
  });
});

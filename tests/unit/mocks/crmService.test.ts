import { describe, expect, it } from 'vitest';
import {
  findAccountByName,
  getAccount,
  getContactsByAccount,
  getDeal,
  getDealsByAccount,
  getRecentActivity,
} from '../../../src/mocks/crmService.js';

describe('crmService', () => {
  it('finds accounts by a case-insensitive partial name match', async () => {
    const results = await findAccountByName('acme');
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('Acme Corp');
  });

  it('returns an empty array when no account matches', async () => {
    const results = await findAccountByName('nonexistent-co');
    expect(results).toEqual([]);
  });

  it('fetches a single account by id', async () => {
    const account = await getAccount('acc_acme');
    expect(account?.name).toBe('Acme Corp');
  });

  it('returns null for an unknown account id', async () => {
    const account = await getAccount('acc_does_not_exist');
    expect(account).toBeNull();
  });

  it('fetches contacts scoped to a single account', async () => {
    const contacts = await getContactsByAccount('acc_acme');
    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts.every((c) => c.accountId === 'acc_acme')).toBe(true);
  });

  it('fetches a single deal by id', async () => {
    const deal = await getDeal('deal_acme_1');
    expect(deal?.accountId).toBe('acc_acme');
  });

  it('fetches deals scoped to a single account', async () => {
    const deals = await getDealsByAccount('acc_globex');
    expect(deals.every((d) => d.accountId === 'acc_globex')).toBe(true);
  });

  it('returns recent activity sorted newest-first and respects the limit', async () => {
    const activity = await getRecentActivity('acc_acme', 2);
    expect(activity).toHaveLength(2);
    expect(activity[0]!.date >= activity[1]!.date).toBe(true);
  });
});

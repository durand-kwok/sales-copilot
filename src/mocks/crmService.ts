import accountsData from './data/accounts.json' with { type: 'json' };
import contactsData from './data/contacts.json' with { type: 'json' };
import dealsData from './data/deals.json' with { type: 'json' };
import activitiesData from './data/activities.json' with { type: 'json' };
import type { Account, Activity, Contact, Deal } from '../types/index.js';
import { simulateCall } from './simulate.js';

const accounts = accountsData as Account[];
const contacts = contactsData as Contact[];
const deals = dealsData as Deal[];
const activities = activitiesData as Activity[];

export async function findAccountByName(nameQuery: string): Promise<Account[]> {
  return simulateCall(() => {
    const query = nameQuery.trim().toLowerCase();
    return accounts.filter((account) => account.name.toLowerCase().includes(query));
  }, `Failed to search accounts matching "${nameQuery}"`);
}

export async function getAccount(accountId: string): Promise<Account | null> {
  return simulateCall(
    () => accounts.find((account) => account.id === accountId) ?? null,
    `Failed to fetch account ${accountId}`,
  );
}

export async function getContactsByAccount(accountId: string): Promise<Contact[]> {
  return simulateCall(
    () => contacts.filter((contact) => contact.accountId === accountId),
    `Failed to fetch contacts for account ${accountId}`,
  );
}

export async function getDeal(dealId: string): Promise<Deal | null> {
  return simulateCall(
    () => deals.find((deal) => deal.id === dealId) ?? null,
    `Failed to fetch deal ${dealId}`,
  );
}

export async function getDealsByAccount(accountId: string): Promise<Deal[]> {
  return simulateCall(
    () => deals.filter((deal) => deal.accountId === accountId),
    `Failed to fetch deals for account ${accountId}`,
  );
}

export async function getRecentActivity(accountId: string, limit = 5): Promise<Activity[]> {
  return simulateCall(() => {
    return activities
      .filter((activity) => activity.accountId === accountId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
  }, `Failed to fetch recent activity for account ${accountId}`);
}

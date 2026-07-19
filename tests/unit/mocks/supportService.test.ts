import { describe, expect, it } from 'vitest';
import { getOpenTickets, getTicket, getTicketsByAccount } from '../../../src/mocks/supportService.js';

describe('supportService', () => {
  it('fetches a single ticket by id', async () => {
    const ticket = await getTicket('tic_acme_1');
    expect(ticket?.subject).toContain('SSO outage');
  });

  it('returns null for an unknown ticket id', async () => {
    const ticket = await getTicket('tic_does_not_exist');
    expect(ticket).toBeNull();
  });

  it('fetches all tickets for an account regardless of status', async () => {
    const tickets = await getTicketsByAccount('acc_acme');
    expect(tickets.length).toBeGreaterThanOrEqual(2);
  });

  it('filters open tickets to only open/pending status', async () => {
    const tickets = await getOpenTickets('acc_acme');
    expect(tickets.every((t) => t.status === 'open' || t.status === 'pending')).toBe(true);
    expect(tickets.some((t) => t.status === 'resolved')).toBe(false);
  });

  it('returns an empty array for an account with no tickets', async () => {
    const tickets = await getOpenTickets('acc_umbrella');
    expect(tickets).toEqual([]);
  });
});

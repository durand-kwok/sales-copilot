import ticketsData from './data/tickets.json' with { type: 'json' };
import type { Ticket } from '../types/index.js';
import { simulateCall } from './simulate.js';

const tickets = ticketsData as Ticket[];

export async function getTicket(ticketId: string): Promise<Ticket | null> {
  return simulateCall(
    () => tickets.find((ticket) => ticket.id === ticketId) ?? null,
    `Failed to fetch ticket ${ticketId}`,
  );
}

export async function getTicketsByAccount(accountId: string): Promise<Ticket[]> {
  return simulateCall(
    () => tickets.filter((ticket) => ticket.accountId === accountId),
    `Failed to fetch tickets for account ${accountId}`,
  );
}

export async function getOpenTickets(accountId: string): Promise<Ticket[]> {
  return simulateCall(() => {
    return tickets.filter(
      (ticket) => ticket.accountId === accountId && (ticket.status === 'open' || ticket.status === 'pending'),
    );
  }, `Failed to fetch open tickets for account ${accountId}`);
}

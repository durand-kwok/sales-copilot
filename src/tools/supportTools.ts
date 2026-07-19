import { z } from 'zod';
import * as supportService from '../mocks/supportService.js';
import type { ToolDefinition } from './registry.js';

export const supportTools: ToolDefinition[] = [
  {
    name: 'support_getOpenTickets',
    description: 'Fetch only open/pending support tickets for a given accountId — use this to check for active issues.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'The CRM account id, e.g. "acc_acme".' },
      },
      required: ['accountId'],
    },
    zodSchema: z.object({ accountId: z.string().min(1) }),
    handler: async (input: { accountId: string }) => supportService.getOpenTickets(input.accountId),
  },
  {
    name: 'support_getTicketsByAccount',
    description: 'Fetch the full support ticket history (any status) for a given accountId.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'The CRM account id, e.g. "acc_acme".' },
      },
      required: ['accountId'],
    },
    zodSchema: z.object({ accountId: z.string().min(1) }),
    handler: async (input: { accountId: string }) => supportService.getTicketsByAccount(input.accountId),
  },
];

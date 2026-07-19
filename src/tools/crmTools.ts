import { z } from 'zod';
import * as crmService from '../mocks/crmService.js';
import type { ToolDefinition } from './registry.js';

export const crmTools: ToolDefinition[] = [
  {
    name: 'crm_findAccountByName',
    description:
      'Search CRM accounts by a partial, case-insensitive company name match. Use this first to resolve a ' +
      "company name mentioned by the user into an accountId before calling other tools that need one.",
    inputSchema: {
      type: 'object',
      properties: {
        nameQuery: { type: 'string', description: 'Partial or full company name to search for.' },
      },
      required: ['nameQuery'],
    },
    zodSchema: z.object({ nameQuery: z.string().min(1) }),
    handler: async (input: { nameQuery: string }) => crmService.findAccountByName(input.nameQuery),
  },
  {
    name: 'crm_getAccount',
    description: 'Fetch full CRM account details (industry, tier, ARR, renewal date, owner) by accountId.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'The CRM account id, e.g. "acc_acme".' },
      },
      required: ['accountId'],
    },
    zodSchema: z.object({ accountId: z.string().min(1) }),
    handler: async (input: { accountId: string }) => crmService.getAccount(input.accountId),
  },
  {
    name: 'crm_getDealsByAccount',
    description: 'Fetch all deals/opportunities (stage, amount, close date, probability) for a given accountId.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'The CRM account id, e.g. "acc_acme".' },
      },
      required: ['accountId'],
    },
    zodSchema: z.object({ accountId: z.string().min(1) }),
    handler: async (input: { accountId: string }) => crmService.getDealsByAccount(input.accountId),
  },
  {
    name: 'crm_getRecentActivity',
    description: 'Fetch the most recent CRM activity (calls, emails, meetings, notes) for a given accountId.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'The CRM account id, e.g. "acc_acme".' },
        limit: { type: 'integer', description: 'Max number of activities to return (default 5).' },
      },
      required: ['accountId'],
    },
    zodSchema: z.object({ accountId: z.string().min(1), limit: z.number().int().min(1).max(20).optional() }),
    handler: async (input: { accountId: string; limit?: number }) =>
      crmService.getRecentActivity(input.accountId, input.limit),
  },
];

import { z } from 'zod';
import * as usageService from '../mocks/usageService.js';
import type { ToolDefinition } from './registry.js';

export const usageTools: ToolDefinition[] = [
  {
    name: 'usage_getAccountUsageSummary',
    description:
      'Fetch a snapshot of product usage for a given accountId: active vs. licensed seats, weekly active ' +
      'users, and last login date. Use this to gauge whether an account is under- or well-utilized.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'The CRM account id, e.g. "acc_acme".' },
      },
      required: ['accountId'],
    },
    zodSchema: z.object({ accountId: z.string().min(1) }),
    handler: async (input: { accountId: string }) => usageService.getAccountUsageSummary(input.accountId),
  },
  {
    name: 'usage_getFeatureAdoption',
    description:
      'Fetch which product features an account has adopted and how heavily each is used. Use this to spot ' +
      'expansion opportunities (unadopted features) or underused ones tied to churn risk.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'The CRM account id, e.g. "acc_acme".' },
      },
      required: ['accountId'],
    },
    zodSchema: z.object({ accountId: z.string().min(1) }),
    handler: async (input: { accountId: string }) => usageService.getFeatureAdoption(input.accountId),
  },
  {
    name: 'usage_getUsageTrend',
    description:
      'Fetch the month-over-month usage health score trend for a given accountId. A declining trend is a ' +
      'strong churn-risk signal worth calling out.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'The CRM account id, e.g. "acc_acme".' },
      },
      required: ['accountId'],
    },
    zodSchema: z.object({ accountId: z.string().min(1) }),
    handler: async (input: { accountId: string }) => usageService.getUsageTrend(input.accountId),
  },
];

import { z } from 'zod';
import * as usageService from '../data/usageService.js';
import type { ToolDefinition } from './registry.js';

export const usageTools: ToolDefinition[] = [
  {
    name: 'usage_getCustomerHealth',
    description:
      'Fetch AI-driven customer health signals by numeric customerId: engagement tier, churn risk and ' +
      'probability, predicted 12-month lifetime value, and a free-text AI recommendation (can be empty). ' +
      'Use this to gauge whether a customer is at risk or thriving.',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'integer', description: 'The numeric customer id, e.g. 1753. Not a string.' },
      },
      required: ['customerId'],
    },
    zodSchema: z.object({ customerId: z.number().int().positive() }),
    handler: async (input: { customerId: number }) => usageService.getCustomerHealth(input.customerId),
  },
  {
    name: 'usage_getChurnCohortSummary',
    description:
      'Fetch aggregate customer-health stats (count, average LTV, churn probability, visit frequency, ' +
      'days since last visit, NPS) grouped either by paid membership tier ("tier") or AI churn-risk ' +
      'bucket ("churnRisk"). Use "tier" for "LTV by membership tier" / "which tier churns fastest" ' +
      'questions. Use "churnRisk" to compare engagement signals across risk cohorts — e.g. to check ' +
      'whether declining visit frequency is a leading indicator of churn risk.',
    inputSchema: {
      type: 'object',
      properties: {
        groupBy: { type: 'string', enum: ['tier', 'churnRisk'], description: 'Dimension to group by.' },
      },
      required: ['groupBy'],
    },
    zodSchema: z.object({ groupBy: z.enum(['tier', 'churnRisk']) }),
    handler: async (input: { groupBy: 'tier' | 'churnRisk' }) => usageService.getChurnCohortSummary(input.groupBy),
  },
  {
    name: 'usage_getChurnByLocation',
    description:
      'Fetch customer churn-risk aggregated by home location (city): customer count, average churn ' +
      'probability, and count/percentage of high-churn-risk customers. Pair with ' +
      'workforce_getStaffingSummary to check whether understaffed locations also have higher customer ' +
      'churn.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    zodSchema: z.object({}),
    handler: async () => usageService.getChurnByLocation(),
  },
];

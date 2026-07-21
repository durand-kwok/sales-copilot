import { z } from 'zod';
import * as crmService from '../data/crmService.js';
import type { ToolDefinition } from './registry.js';

const customerIdSchema = z.object({ customerId: z.number().int().positive() });
const customerIdInputSchema = {
  type: 'object' as const,
  properties: {
    customerId: { type: 'integer', description: 'The numeric customer id, e.g. 1753. Not a string.' },
  },
  required: ['customerId'],
};

export const crmTools: ToolDefinition[] = [
  {
    name: 'crm_findCustomerByName',
    description:
      'Search customers by a partial, case-insensitive name match (first + last name). Use this first to ' +
      'resolve a customer name mentioned by the user into a numeric customerId before calling other tools ' +
      'that need one.',
    inputSchema: {
      type: 'object',
      properties: {
        nameQuery: { type: 'string', description: 'Partial or full customer name to search for.' },
      },
      required: ['nameQuery'],
    },
    zodSchema: z.object({ nameQuery: z.string().min(1) }),
    handler: async (input: { nameQuery: string }) => crmService.findCustomerByName(input.nameQuery),
  },
  {
    name: 'crm_getCustomer',
    description:
      'Fetch full customer profile (membership type, NPS score, visit history, lifetime spend, join date) ' +
      'by numeric customerId.',
    inputSchema: customerIdInputSchema,
    zodSchema: customerIdSchema,
    handler: async (input: { customerId: number }) => crmService.getCustomer(input.customerId),
  },
  {
    name: 'crm_getRenewal',
    description:
      'Fetch a customer\'s membership renewal record (renewal date, renewal probability, renewal likelihood ' +
      'label, whether they\'re an upgrade candidate) by numeric customerId. Returns null if the customer has ' +
      'no renewal on file.',
    inputSchema: customerIdInputSchema,
    zodSchema: customerIdSchema,
    handler: async (input: { customerId: number }) => crmService.getRenewal(input.customerId),
  },
  {
    name: 'crm_getUpgradeOffer',
    description:
      'Fetch a customer\'s membership tier upgrade offer (recommended tier, AI-generated upgrade pitch) by ' +
      'numeric customerId, if one exists. Only a small subset of customers have an active upgrade offer — ' +
      'returns null for everyone else.',
    inputSchema: customerIdInputSchema,
    zodSchema: customerIdSchema,
    handler: async (input: { customerId: number }) => crmService.getUpgradeOffer(input.customerId),
  },
  {
    name: 'crm_getRecentActivity',
    description:
      'Fetch a customer\'s recent membership event history (signups, upgrades, downgrades, renewals, ' +
      'cancellations) by numeric customerId.',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'integer', description: 'The numeric customer id, e.g. 1753. Not a string.' },
        limit: { type: 'integer', description: 'Max number of events to return (default 5).' },
      },
      required: ['customerId'],
    },
    zodSchema: z.object({ customerId: z.number().int().positive(), limit: z.number().int().min(1).max(20).optional() }),
    handler: async (input: { customerId: number; limit?: number }) =>
      crmService.getRecentActivity(input.customerId, input.limit),
  },
];

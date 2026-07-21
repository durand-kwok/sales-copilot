import { z } from 'zod';
import * as financeService from '../data/financeService.js';
import type { ToolDefinition } from './registry.js';

const cityParam = { type: 'string' as const, description: 'Optional: restrict to a single city. Omit for all cities.' };
const monthsParam = { type: 'integer' as const, description: 'Lookback window in months.' };

export const financeTools: ToolDefinition[] = [
  {
    name: 'finance_getLocationPnL',
    description:
      'Fetch a simplified P&L (revenue, labor cost, operational cost, total cost, profit, margin %) by ' +
      'city and month, over a lookback window (default 6 months). Use this for profit margin trends, ' +
      'revenue-vs-cost comparisons, "most profitable location", and labor-cost-vs-revenue questions.',
    inputSchema: {
      type: 'object',
      properties: { city: cityParam, months: { ...monthsParam, description: 'Lookback window in months (default 6, max 24).' } },
      required: [],
    },
    zodSchema: z.object({ city: z.string().min(1).optional(), months: z.number().int().min(1).max(24).optional() }),
    handler: async (input: { city?: string; months?: number }) =>
      financeService.getLocationPnL(input.city, input.months),
  },
  {
    name: 'finance_getRefundBreakdown',
    description:
      'Fetch refund rate and revenue lost to refunds, by city (default 12-month lookback). If a single ' +
      'city is given, results break down by service type (e.g. to find what\'s driving that city\'s ' +
      'refunds) — omit city to compare refund rates across all cities.',
    inputSchema: {
      type: 'object',
      properties: { city: cityParam, months: { ...monthsParam, description: 'Lookback window in months (default 12, max 24).' } },
      required: [],
    },
    zodSchema: z.object({ city: z.string().min(1).optional(), months: z.number().int().min(1).max(24).optional() }),
    handler: async (input: { city?: string; months?: number }) =>
      financeService.getRefundBreakdown(input.city, input.months),
  },
  {
    name: 'finance_getRevenuePerRoom',
    description:
      'Fetch average monthly revenue per treatment room, by city (default 6-month lookback). Use this ' +
      'for capital ROI/payback-period questions (e.g. "if we build another room costing $X, what\'s the ' +
      'payback period?" — divide the cost by this figure to get months to payback) and for ranking ' +
      'locations by revenue efficiency per room.',
    inputSchema: {
      type: 'object',
      properties: { city: cityParam, months: { ...monthsParam, description: 'Lookback window in months (default 6, max 24).' } },
      required: [],
    },
    zodSchema: z.object({ city: z.string().min(1).optional(), months: z.number().int().min(1).max(24).optional() }),
    handler: async (input: { city?: string; months?: number }) =>
      financeService.getRevenuePerRoom(input.city, input.months),
  },
  {
    name: 'finance_getLaborCostByRole',
    description:
      'Fetch labor cost broken down by city and role (headcount, total labor cost, overtime cost, cost ' +
      'per employee), over a lookback window (default 6 months). Use this to find which roles are ' +
      'driving a location\'s labor costs, and to estimate savings from overtime reductions (sum the ' +
      'overtimeCost field and apply the desired percentage reduction).',
    inputSchema: {
      type: 'object',
      properties: { city: cityParam, months: { ...monthsParam, description: 'Lookback window in months (default 6, max 24).' } },
      required: [],
    },
    zodSchema: z.object({ city: z.string().min(1).optional(), months: z.number().int().min(1).max(24).optional() }),
    handler: async (input: { city?: string; months?: number }) =>
      financeService.getLaborCostByRole(input.city, input.months),
  },
  {
    name: 'finance_getRevenueByServiceType',
    description:
      'Fetch revenue and booking volume by city and service type (e.g. Thermal Bath, Massage Therapy, ' +
      'Float Therapy), over a lookback window (default 6 months, sorted by revenue descending within ' +
      'each city). Use this to find which service types drive the most revenue at a location.',
    inputSchema: {
      type: 'object',
      properties: { city: cityParam, months: { ...monthsParam, description: 'Lookback window in months (default 6, max 24).' } },
      required: [],
    },
    zodSchema: z.object({ city: z.string().min(1).optional(), months: z.number().int().min(1).max(24).optional() }),
    handler: async (input: { city?: string; months?: number }) =>
      financeService.getRevenueByServiceType(input.city, input.months),
  },
  {
    name: 'finance_getOperationalCostBreakdown',
    description:
      'Fetch operational cost by city and category (Rent, Utilities, Supplies & Products, Insurance, ' +
      'Maintenance & Repairs, Technology & POS, Marketing & Local Ads), over a lookback window (default ' +
      '6 months). Use this — alongside finance_getLaborCostByRole — to explain what\'s driving a cost gap ' +
      'between locations (e.g. "is it labor, rent, or something else?").',
    inputSchema: {
      type: 'object',
      properties: { city: cityParam, months: { ...monthsParam, description: 'Lookback window in months (default 6, max 24).' } },
      required: [],
    },
    zodSchema: z.object({ city: z.string().min(1).optional(), months: z.number().int().min(1).max(24).optional() }),
    handler: async (input: { city?: string; months?: number }) =>
      financeService.getOperationalCostBreakdown(input.city, input.months),
  },
];

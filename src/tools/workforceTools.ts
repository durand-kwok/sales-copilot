import { z } from 'zod';
import * as workforceService from '../data/workforceService.js';
import type { ToolDefinition } from './registry.js';

const cityParam = { type: 'string' as const, description: 'Optional: restrict to a single city. Omit for all cities.' };

export const workforceTools: ToolDefinition[] = [
  {
    name: 'workforce_getBookingDemandTrend',
    description:
      'Fetch month-over-month booking volume and required therapist hours, by city (default 6-month ' +
      'lookback). Use this to assess booking-demand growth, compare quarter-over-quarter, or pair with ' +
      'workforce_getStaffingSummary to see if staffing is keeping pace with demand.',
    inputSchema: {
      type: 'object',
      properties: { city: cityParam, months: { type: 'integer', description: 'Lookback window in months (default 6, max 24).' } },
      required: [],
    },
    zodSchema: z.object({ city: z.string().min(1).optional(), months: z.number().int().min(1).max(24).optional() }),
    handler: async (input: { city?: string; months?: number }) =>
      workforceService.getBookingDemandTrend(input.city, input.months),
  },
  {
    name: 'workforce_getStaffingSummary',
    description:
      'Fetch a current staffing snapshot by city: active headcount, therapist headcount, open recruiting ' +
      'requisitions, headcount requested, and recruiting spend over the last 6 months. Every city ' +
      'appears, including a not-yet-opened location (with all-zero staffing) — useful for new-location ' +
      'staffing/hiring-plan questions by comparing against similar existing cities.',
    inputSchema: {
      type: 'object',
      properties: { city: cityParam },
      required: [],
    },
    zodSchema: z.object({ city: z.string().min(1).optional() }),
    handler: async (input: { city?: string }) => workforceService.getStaffingSummary(input.city),
  },
  {
    name: 'workforce_getTenureAndTurnover',
    description:
      'Fetch tenure and turnover by city and role: active headcount, average tenure in months, ' +
      'terminated count, turnover rate (share of all recorded employees in that city/role who have left ' +
      '— not an annualized rate), and average annual compensation. Optionally filter to a city and/or role.',
    inputSchema: {
      type: 'object',
      properties: {
        city: cityParam,
        role: { type: 'string', description: 'Optional: restrict to a single role (e.g. "Therapist").' },
      },
      required: [],
    },
    zodSchema: z.object({ city: z.string().min(1).optional(), role: z.string().min(1).optional() }),
    handler: async (input: { city?: string; role?: string }) =>
      workforceService.getTenureAndTurnover(input.city, input.role),
  },
  {
    name: 'workforce_getRetentionRiskForecast',
    description:
      'Fetch AI-forecasted attrition risk by city and month (predicted terminations and a worst-case ' +
      'scenario). Use this for "retention risk by city" or "which locations are at risk of losing staff" ' +
      'style questions. The forecast horizon is only about 3 months out — say so if asked for a longer ' +
      'horizon (e.g. 6 months) rather than implying more data exists.',
    inputSchema: {
      type: 'object',
      properties: { city: cityParam },
      required: [],
    },
    zodSchema: z.object({ city: z.string().min(1).optional() }),
    handler: async (input: { city?: string }) => workforceService.getRetentionRiskForecast(input.city),
  },
  {
    name: 'workforce_getRecruitingPipeline',
    description:
      'Fetch recruiting pipeline stats by city and role: open/filled requisition counts, average days ' +
      'to fill a filled requisition, and average days still open for currently-open requisitions. Use ' +
      'this for "how long are positions staying open" or recruiting-pipeline-health questions.',
    inputSchema: {
      type: 'object',
      properties: {
        city: cityParam,
        role: { type: 'string', description: 'Optional: restrict to a single role (e.g. "Therapist").' },
      },
      required: [],
    },
    zodSchema: z.object({ city: z.string().min(1).optional(), role: z.string().min(1).optional() }),
    handler: async (input: { city?: string; role?: string }) =>
      workforceService.getRecruitingPipeline(input.city, input.role),
  },
];

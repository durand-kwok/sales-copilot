import { z } from 'zod';
import { askWorkforceAnalyst } from '../snowflake/mcpAnalystClient.js';
import type { ToolDefinition } from './registry.js';

export const analystTools: ToolDefinition[] = [
  {
    name: 'analyst_askWorkforceQuestion',
    description:
      'Ask an open-ended natural-language question to Snowflake Cortex Analyst, backed by a semantic ' +
      'model covering bookings, customers, memberships, recruiting, staffing, labor costs, campaign ' +
      'effectiveness, and location P&L. Use this ONLY when none of the other fixed tools (crm_*, usage_*, ' +
      'location_*, finance_*, workforce_*, marketing_*) can answer the question — prefer those first, ' +
      'since they run pre-validated, code-reviewed queries. This tool generates its own SQL at request ' +
      'time (checked for read-only safety before executing) and returns both the query it ran and the ' +
      'real result rows. If Cortex Analyst can\'t confidently answer, no rows come back — relay its ' +
      'interpretation or clarification request to the user rather than guessing at an answer.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The natural-language question to ask.' },
      },
      required: ['message'],
    },
    zodSchema: z.object({ message: z.string().min(1) }),
    handler: async (input: { message: string }) => askWorkforceAnalyst(input.message),
  },
];

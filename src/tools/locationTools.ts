import { z } from 'zod';
import * as locationService from '../data/locationService.js';
import type { ToolDefinition } from './registry.js';

export const locationTools: ToolDefinition[] = [
  {
    name: 'location_getRevenueTrend',
    description:
      'Fetch month-over-month booking revenue, broken down by city, over a lookback window (default 12 ' +
      'months, max 36). Optionally filter to a single city. This is aggregate/location-level data — it is ' +
      'NOT customer-specific and cannot be used to look up an individual customer.',
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'Optional: restrict to a single city (e.g. "Austin"). Omit to get all cities.',
        },
        months: { type: 'integer', description: 'How many months to look back (default 12, max 36).' },
      },
      required: [],
    },
    zodSchema: z.object({
      city: z.string().min(1).optional(),
      months: z.number().int().min(1).max(36).optional(),
    }),
    handler: async (input: { city?: string; months?: number }) =>
      locationService.getRevenueTrendByCity(input.city, input.months),
  },
  {
    name: 'location_getBookingForecast',
    description:
      'Fetch AI-forecasted booking volume by city and month (with lower/upper confidence bounds), ' +
      'alongside each location\'s monthly booking capacity. Use this to find which locations are ' +
      'forecast to approach or exceed capacity first (compare predictedBookings/upperBound against ' +
      'monthlyCapacity). The forecast horizon is short (~3 months) — say so if asked for a longer view.',
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'Optional: restrict to a single city (e.g. "Austin"). Omit to get all cities.',
        },
      },
      required: [],
    },
    zodSchema: z.object({ city: z.string().min(1).optional() }),
    handler: async (input: { city?: string }) => locationService.getBookingForecast(input.city),
  },
];

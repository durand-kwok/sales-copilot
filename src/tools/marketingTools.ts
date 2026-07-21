import { z } from 'zod';
import * as marketingService from '../data/marketingService.js';
import type { ToolDefinition } from './registry.js';

export const marketingTools: ToolDefinition[] = [
  {
    name: 'marketing_getCampaignPerformance',
    description:
      'Fetch marketing campaign performance aggregated by channel (Email, SMS, Social Media, Push ' +
      'Notification): total budget, total converted customers, total attributed revenue, and cost per ' +
      'acquisition (budget / conversions). IMPORTANT: this "channel" dimension is NOT the same as a ' +
      'customer\'s self-reported referral source (Walk-in, TripAdvisor, Referral, Google Ads, Instagram, ' +
      'Email) — only "Email" overlaps between the two. If asked for "CAC by referral source", use this ' +
      'as an approximation and explicitly say so rather than presenting it as an exact match.',
    inputSchema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Optional: restrict to a single channel (e.g. "Email"). Omit for all channels.',
        },
      },
      required: [],
    },
    zodSchema: z.object({ channel: z.string().min(1).optional() }),
    handler: async (input: { channel?: string }) => marketingService.getCampaignPerformance(input.channel),
  },
  {
    name: 'marketing_getCampaignRetentionImpact',
    description:
      'For each campaign, the number of distinct customers who responded, how many currently show an ' +
      '"At Risk"/"Unlikely" renewal, and their average churn probability — sorted by lowest churn ' +
      'probability first. Use this for "which campaigns had the highest impact on retention" questions. ' +
      'This is a directional/correlational signal, not proof of causation — say so if asked to draw a ' +
      'causal conclusion.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    zodSchema: z.object({}),
    handler: async () => marketingService.getCampaignRetentionImpact(),
  },
];

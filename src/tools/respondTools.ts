import { z } from 'zod';
import type { ToolDefinition } from './registry.js';

export const FINAL_ANSWER_TOOL_NAME = 'respond_finalAnswer';

export const finalAnswerZodSchema = z.object({
  summary: z.string().min(1),
  recommendedNextActions: z.array(z.string().min(1)).min(1).max(4).optional(),
});

export type FinalAnswerInput = z.infer<typeof finalAnswerZodSchema>;

export const respondTools: ToolDefinition[] = [
  {
    name: FINAL_ANSWER_TOOL_NAME,
    description:
      'Call this to deliver your answer to the user — it is always the last step of a turn, never combine ' +
      'it with other tool calls. Put your conversational answer in `summary`. If the question was a ' +
      'substantive account/deal briefing, health check, or "what\'s going on with X" style answer, also set ' +
      '`recommendedNextActions` to 2-4 short, concrete follow-ups derived from what the other tools actually ' +
      'returned (e.g. an open urgent ticket, a declining usage trend, an unadopted high-value feature, an ' +
      'upcoming renewal). Omit `recommendedNextActions` entirely for small talk or simple factual lookups ' +
      'that don\'t warrant a recommendation.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: "The conversational answer to show the user." },
        recommendedNextActions: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 4,
          description: 'Concrete, specific follow-ups grounded in actual tool output. Omit for small talk.',
        },
      },
      required: ['summary'],
    },
    zodSchema: finalAnswerZodSchema,
    handler: async () => ({ delivered: true }),
  },
];

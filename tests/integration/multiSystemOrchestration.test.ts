import type Anthropic from '@anthropic-ai/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock, queryMock } = vi.hoisted(() => ({ createMock: vi.fn(), queryMock: vi.fn() }));

vi.mock('../../src/claude/client.js', () => ({
  anthropic: { messages: { create: createMock } },
  CLAUDE_MODEL: 'claude-test-model',
}));

vi.mock('../../src/snowflake/client.js', () => ({
  querySnowflake: queryMock,
}));

import { runOrchestrator } from '../../src/claude/orchestrator.js';

const CHARLOTTE_ROW = {
  CUSTOMER_ID: 1753,
  FIRST_NAME: 'Charlotte',
  LAST_NAME: 'Williams',
  EMAIL: 'charlotte.williams1753@email.com',
  PHONE: '555-310-1924',
  HOME_LOCATION_ID: 5,
  JOIN_DATE: '2022-01-24',
  LAST_VISIT_DATE: '2026-03-26',
  TOTAL_VISITS: 23,
  LIFETIME_SPEND: 2875.0,
  AVG_SPEND_PER_VISIT: 229.0,
  PREFERRED_SERVICE: 'Float Therapy',
  MEMBERSHIP_TYPE: 'Silver',
  REFERRAL_SOURCE: 'Google Ads',
  NPS_SCORE: 4,
  DAYS_SINCE_LAST_VISIT: 62,
  VISIT_FREQUENCY_MONTHLY: 0.44,
  ADDRESS: '834 Spring Avenue',
  IS_ACTIVE: true,
};

const CHARLOTTE_RENEWAL_ROW = {
  RENEWAL_ID: 1,
  CUSTOMER_ID: 1753,
  CURRENT_TIER: 'Silver',
  HOME_LOCATION_ID: 5,
  RENEWAL_DATE: '2026-07-21',
  TOTAL_VISITS: 23,
  VISIT_FREQUENCY_MONTHLY: 0.44,
  DAYS_SINCE_LAST_VISIT: 62,
  NPS_SCORE: 4,
  LIFETIME_SPEND: 2875.0,
  RENEWAL_PROBABILITY_PCT: 24,
  RENEWAL_LIKELIHOOD: 'At Risk',
  UPGRADE_CANDIDATE: false,
};

const CHARLOTTE_HEALTH_ROW = {
  CUSTOMER_ID: 1753,
  FIRST_NAME: 'Charlotte',
  LAST_NAME: 'Williams',
  HOME_LOCATION_ID: 5,
  LIFETIME_SPEND: 2401.2,
  TOTAL_VISITS: 23,
  VISIT_FREQUENCY_MONTHLY: 0.44,
  DAYS_SINCE_LAST_VISIT: 62,
  NPS_SCORE: 4,
  MEMBERSHIP_TYPE: 'Silver',
  PREFERRED_SERVICE: 'Float Therapy',
  AI_TIER: 'Bronze',
  CHURN_RISK: 'High',
  CHURN_PROBABILITY_PCT: 95,
  PREDICTED_LTV_12M: 2401.2,
  AI_RECOMMENDATION: '',
};

function textResponse(text: string): Anthropic.Message {
  return {
    id: 'msg_final',
    type: 'message',
    role: 'assistant',
    model: 'claude-test-model',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  } as unknown as Anthropic.Message;
}

function toolUseResponse(blocks: Array<{ id: string; name: string; input: unknown }>): Anthropic.Message {
  return {
    id: 'msg_tool',
    type: 'message',
    role: 'assistant',
    model: 'claude-test-model',
    content: blocks.map((b) => ({ type: 'tool_use' as const, id: b.id, name: b.name, input: b.input })),
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  } as unknown as Anthropic.Message;
}

beforeEach(() => {
  createMock.mockReset();
  queryMock.mockReset();
});

describe('multi-system orchestration', () => {
  it('resolves a customer name, then fans out to CRM + Usage in one parallel turn', async () => {
    // Turn 1: Claude resolves "charlotte" to a customerId.
    queryMock.mockResolvedValueOnce([CHARLOTTE_ROW]);
    createMock.mockResolvedValueOnce(
      toolUseResponse([{ id: 'resolve_1', name: 'crm_findCustomerByName', input: { nameQuery: 'charlotte' } }]),
    );
    // Turn 2: Claude fans out across both systems in parallel.
    queryMock.mockResolvedValueOnce([CHARLOTTE_RENEWAL_ROW]).mockResolvedValueOnce([CHARLOTTE_HEALTH_ROW]);
    createMock.mockResolvedValueOnce(
      toolUseResponse([
        { id: 'crm_1', name: 'crm_getRenewal', input: { customerId: 1753 } },
        { id: 'usage_1', name: 'usage_getCustomerHealth', input: { customerId: 1753 } },
      ]),
    );
    // Turn 3: final answer, delivered via the respond_finalAnswer tool.
    createMock.mockResolvedValueOnce(
      toolUseResponse([
        {
          id: 'final_1',
          name: 'respond_finalAnswer',
          input: {
            summary: 'Charlotte Williams: renewal marked At Risk and churn risk is High.',
            recommendedNextActions: [
              'Reach out before her renewal date',
              'Address her high churn risk with a retention offer',
              'Follow up on her low NPS score',
            ],
          },
        },
      ]),
    );

    const result = await runOrchestrator([{ role: 'user', content: "what's the full status of charlotte?" }]);

    expect(createMock).toHaveBeenCalledTimes(3);

    // Turn 2 tool_result (fed into turn 3's request) should carry exactly one result, for the resolve call.
    const turn2Args = createMock.mock.calls[1]![0];
    const turn2ToolResults = turn2Args.messages.at(-1).content;
    expect(turn2ToolResults).toHaveLength(1);
    expect(turn2ToolResults[0].tool_use_id).toBe('resolve_1');

    // Turn 3 request should carry both parallel tool_results, order-mapped to their tool_use_id.
    const turn3Args = createMock.mock.calls[2]![0];
    const turn3ToolResults = turn3Args.messages.at(-1).content;
    expect(turn3ToolResults).toHaveLength(2);
    expect(turn3ToolResults.map((r: Anthropic.ToolResultBlockParam) => r.tool_use_id)).toEqual(['crm_1', 'usage_1']);
    // Neither of the two cross-system calls should have failed.
    expect(turn3ToolResults.every((r: Anthropic.ToolResultBlockParam) => !r.is_error)).toBe(true);

    expect(result.recommendedNextActions).toEqual([
      'Reach out before her renewal date',
      'Address her high churn risk with a retention offer',
      'Follow up on her low NPS score',
    ]);
  });

  it('keeps a failing tool call in one system from blocking results from the others in the same turn', async () => {
    queryMock.mockResolvedValueOnce([CHARLOTTE_HEALTH_ROW]);
    createMock.mockResolvedValueOnce(
      toolUseResponse([
        { id: 'crm_bad', name: 'crm_getRenewal', input: {} }, // missing required customerId -> validation error
        { id: 'usage_ok', name: 'usage_getCustomerHealth', input: { customerId: 1753 } },
      ]),
    );
    createMock.mockResolvedValueOnce(textResponse('Got partial data, here is what I found.'));

    const result = await runOrchestrator([{ role: 'user', content: 'status on charlotte' }]);

    const secondCallArgs = createMock.mock.calls[1]![0];
    const toolResults = secondCallArgs.messages.at(-1).content as Anthropic.ToolResultBlockParam[];
    const byId = new Map(toolResults.map((r) => [r.tool_use_id, r]));

    expect(byId.get('crm_bad')?.is_error).toBe(true);
    expect(byId.get('usage_ok')?.is_error).toBeFalsy();
    expect(result.summary).toBe('Got partial data, here is what I found.');
  });
});

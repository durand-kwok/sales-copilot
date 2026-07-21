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

import { OrchestratorMaxIterationsError, runOrchestrator } from '../../src/claude/orchestrator.js';

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
    id: 'msg_1',
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

describe('runOrchestrator', () => {
  it('returns immediately when Claude answers without any tool use', async () => {
    createMock.mockResolvedValueOnce(textResponse('Hello, how can I help?'));

    const result = await runOrchestrator([{ role: 'user', content: 'hi' }]);

    expect(result.summary).toBe('Hello, how can I help?');
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result.history).toHaveLength(2);
  });

  it('executes a real tool call and feeds the result back before returning a final answer', async () => {
    queryMock.mockResolvedValueOnce([CHARLOTTE_ROW]);
    createMock
      .mockResolvedValueOnce(
        toolUseResponse([{ id: 'call_1', name: 'crm_getCustomer', input: { customerId: 1753 } }]),
      )
      .mockResolvedValueOnce(textResponse('Charlotte Williams is a Silver-tier customer.'));

    const result = await runOrchestrator([{ role: 'user', content: 'tell me about charlotte williams' }]);

    expect(result.summary).toBe('Charlotte Williams is a Silver-tier customer.');
    expect(createMock).toHaveBeenCalledTimes(2);

    // second call to Claude should include the tool_result fed back in
    const secondCallArgs = createMock.mock.calls[1]![0];
    const toolResultMessage = secondCallArgs.messages.at(-1);
    expect(toolResultMessage.role).toBe('user');
    const toolResultBlock = toolResultMessage.content[0];
    expect(toolResultBlock.type).toBe('tool_result');
    expect(toolResultBlock.tool_use_id).toBe('call_1');
    expect(toolResultBlock.content).toContain('Charlotte');
  });

  it('dispatches multiple parallel tool calls and maps each result back to its tool_use_id', async () => {
    queryMock.mockResolvedValueOnce([CHARLOTTE_ROW]).mockResolvedValueOnce([CHARLOTTE_HEALTH_ROW]);
    createMock
      .mockResolvedValueOnce(
        toolUseResponse([
          { id: 'call_a', name: 'crm_getCustomer', input: { customerId: 1753 } },
          { id: 'call_b', name: 'usage_getCustomerHealth', input: { customerId: 1753 } },
        ]),
      )
      .mockResolvedValueOnce(textResponse('Here is the summary.'));

    const result = await runOrchestrator([{ role: 'user', content: 'full status on charlotte' }]);

    expect(result.summary).toBe('Here is the summary.');
    const secondCallArgs = createMock.mock.calls[1]![0];
    const toolResults = secondCallArgs.messages.at(-1).content;
    expect(toolResults).toHaveLength(2);
    expect(toolResults.map((r: Anthropic.ToolResultBlockParam) => r.tool_use_id)).toEqual(['call_a', 'call_b']);
  });

  it('isolates a single invalid tool call as an error result without failing the whole turn', async () => {
    createMock
      .mockResolvedValueOnce(
        // missing required "customerId" field
        toolUseResponse([{ id: 'call_bad', name: 'crm_getCustomer', input: {} }]),
      )
      .mockResolvedValueOnce(textResponse('Could you clarify which customer?'));

    const result = await runOrchestrator([{ role: 'user', content: 'tell me about it' }]);

    expect(result.summary).toBe('Could you clarify which customer?');
    expect(queryMock).not.toHaveBeenCalled();
    const secondCallArgs = createMock.mock.calls[1]![0];
    const toolResultBlock = secondCallArgs.messages.at(-1).content[0];
    expect(toolResultBlock.is_error).toBe(true);
  });

  it('throws OrchestratorMaxIterationsError if Claude never stops requesting tools', async () => {
    queryMock.mockResolvedValue([CHARLOTTE_ROW]);
    createMock.mockResolvedValue(
      toolUseResponse([{ id: 'call_loop', name: 'crm_getCustomer', input: { customerId: 1753 } }]),
    );

    await expect(runOrchestrator([{ role: 'user', content: 'loop forever' }])).rejects.toThrow(
      OrchestratorMaxIterationsError,
    );
  });

  it('terminates via the respond_finalAnswer tool, returning summary + recommendedNextActions in a single round-trip', async () => {
    createMock.mockResolvedValueOnce(
      toolUseResponse([
        {
          id: 'final_1',
          name: 'respond_finalAnswer',
          input: {
            summary: 'Charlotte Williams has high churn risk and an at-risk renewal.',
            recommendedNextActions: [
              'Reach out before her renewal date',
              'Offer a loyalty incentive given her low NPS',
              'Flag her as high churn risk to the account team',
              'Review her declining visit frequency',
            ],
          },
        },
      ]),
    );

    const result = await runOrchestrator([{ role: 'user', content: "what's going on with charlotte?" }]);

    // No second API call needed — the loop terminates as soon as respond_finalAnswer is seen.
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result.summary).toBe('Charlotte Williams has high churn risk and an at-risk renewal.');
    expect(result.recommendedNextActions).toEqual([
      'Reach out before her renewal date',
      'Offer a loyalty incentive given her low NPS',
      'Flag her as high churn risk to the account team',
      'Review her declining visit frequency',
    ]);
  });

  it('retries after an invalid respond_finalAnswer call instead of returning malformed output', async () => {
    createMock
      .mockResolvedValueOnce(
        // empty summary fails the zod schema (min length 1)
        toolUseResponse([{ id: 'final_bad', name: 'respond_finalAnswer', input: { summary: '' } }]),
      )
      .mockResolvedValueOnce(
        toolUseResponse([{ id: 'final_ok', name: 'respond_finalAnswer', input: { summary: 'All good here.' } }]),
      );

    const result = await runOrchestrator([{ role: 'user', content: 'quick check on charlotte' }]);

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(result.summary).toBe('All good here.');
    expect(result.recommendedNextActions).toBeUndefined();

    const firstRetryArgs = createMock.mock.calls[1]![0];
    const retryToolResult = firstRetryArgs.messages.at(-1).content[0];
    expect(retryToolResult.is_error).toBe(true);
  });
});

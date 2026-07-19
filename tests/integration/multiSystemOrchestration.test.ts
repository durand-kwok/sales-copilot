import type Anthropic from '@anthropic-ai/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('../../src/claude/client.js', () => ({
  anthropic: { messages: { create: createMock } },
  CLAUDE_MODEL: 'claude-test-model',
}));

import { runOrchestrator } from '../../src/claude/orchestrator.js';

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
});

describe('multi-system orchestration', () => {
  it('resolves an account name, then fans out to CRM + Support + Usage in one parallel turn', async () => {
    // Turn 1: Claude resolves "acme" to an accountId.
    createMock.mockResolvedValueOnce(
      toolUseResponse([{ id: 'resolve_1', name: 'crm_findAccountByName', input: { nameQuery: 'acme' } }]),
    );
    // Turn 2: Claude fans out across three different systems in parallel.
    createMock.mockResolvedValueOnce(
      toolUseResponse([
        { id: 'crm_1', name: 'crm_getDealsByAccount', input: { accountId: 'acc_acme' } },
        { id: 'support_1', name: 'support_getOpenTickets', input: { accountId: 'acc_acme' } },
        { id: 'usage_1', name: 'usage_getUsageTrend', input: { accountId: 'acc_acme' } },
      ]),
    );
    // Turn 3: final answer, delivered via the respond_finalAnswer tool.
    createMock.mockResolvedValueOnce(
      toolUseResponse([
        {
          id: 'final_1',
          name: 'respond_finalAnswer',
          input: {
            summary: 'Acme Corp: renewal in negotiation, one urgent open ticket, and usage trending down.',
            recommendedNextActions: [
              'Review declining adoption',
              'Address SSO outage',
              'Introduce AI Analytics',
              'Schedule executive review',
            ],
          },
        },
      ]),
    );

    const result = await runOrchestrator([
      { role: 'user', content: "what's the full status of acme?" },
    ]);

    expect(createMock).toHaveBeenCalledTimes(3);

    // Turn 2 tool_result (fed into turn 3's request) should carry exactly one result, for the resolve call.
    const turn2Args = createMock.mock.calls[1]![0];
    const turn2ToolResults = turn2Args.messages.at(-1).content;
    expect(turn2ToolResults).toHaveLength(1);
    expect(turn2ToolResults[0].tool_use_id).toBe('resolve_1');

    // Turn 3 request should carry all three parallel tool_results, order-mapped to their tool_use_id.
    const turn3Args = createMock.mock.calls[2]![0];
    const turn3ToolResults = turn3Args.messages.at(-1).content;
    expect(turn3ToolResults).toHaveLength(3);
    expect(turn3ToolResults.map((r: Anthropic.ToolResultBlockParam) => r.tool_use_id)).toEqual([
      'crm_1',
      'support_1',
      'usage_1',
    ]);
    // None of the three cross-system calls should have failed.
    expect(turn3ToolResults.every((r: Anthropic.ToolResultBlockParam) => !r.is_error)).toBe(true);

    expect(result.recommendedNextActions).toEqual([
      'Review declining adoption',
      'Address SSO outage',
      'Introduce AI Analytics',
      'Schedule executive review',
    ]);
  });

  it('keeps a failing tool call in one system from blocking results from the others in the same turn', async () => {
    createMock.mockResolvedValueOnce(
      toolUseResponse([
        { id: 'crm_bad', name: 'crm_getDealsByAccount', input: {} }, // missing required accountId -> validation error
        { id: 'usage_ok', name: 'usage_getAccountUsageSummary', input: { accountId: 'acc_acme' } },
      ]),
    );
    createMock.mockResolvedValueOnce(textResponse('Got partial data, here is what I found.'));

    const result = await runOrchestrator([{ role: 'user', content: 'status on acme' }]);

    const secondCallArgs = createMock.mock.calls[1]![0];
    const toolResults = secondCallArgs.messages.at(-1).content as Anthropic.ToolResultBlockParam[];
    const byId = new Map(toolResults.map((r) => [r.tool_use_id, r]));

    expect(byId.get('crm_bad')?.is_error).toBe(true);
    expect(byId.get('usage_ok')?.is_error).toBeFalsy();
    expect(result.summary).toBe('Got partial data, here is what I found.');
  });
});

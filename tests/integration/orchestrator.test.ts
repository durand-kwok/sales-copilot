import type Anthropic from '@anthropic-ai/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('../../src/claude/client.js', () => ({
  anthropic: { messages: { create: createMock } },
  CLAUDE_MODEL: 'claude-test-model',
}));

import { OrchestratorMaxIterationsError, runOrchestrator } from '../../src/claude/orchestrator.js';

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
    createMock
      .mockResolvedValueOnce(
        toolUseResponse([{ id: 'call_1', name: 'crm_getAccount', input: { accountId: 'acc_acme' } }]),
      )
      .mockResolvedValueOnce(textResponse('Acme Corp is an Enterprise account.'));

    const result = await runOrchestrator([{ role: 'user', content: 'tell me about acme' }]);

    expect(result.summary).toBe('Acme Corp is an Enterprise account.');
    expect(createMock).toHaveBeenCalledTimes(2);

    // second call to Claude should include the tool_result fed back in
    const secondCallArgs = createMock.mock.calls[1]![0];
    const toolResultMessage = secondCallArgs.messages.at(-1);
    expect(toolResultMessage.role).toBe('user');
    const toolResultBlock = toolResultMessage.content[0];
    expect(toolResultBlock.type).toBe('tool_result');
    expect(toolResultBlock.tool_use_id).toBe('call_1');
    expect(toolResultBlock.content).toContain('Acme Corp');
  });

  it('dispatches multiple parallel tool calls and maps each result back to its tool_use_id', async () => {
    createMock
      .mockResolvedValueOnce(
        toolUseResponse([
          { id: 'call_a', name: 'crm_getAccount', input: { accountId: 'acc_acme' } },
          { id: 'call_b', name: 'support_getOpenTickets', input: { accountId: 'acc_acme' } },
        ]),
      )
      .mockResolvedValueOnce(textResponse('Here is the summary.'));

    const result = await runOrchestrator([{ role: 'user', content: 'full status on acme' }]);

    expect(result.summary).toBe('Here is the summary.');
    const secondCallArgs = createMock.mock.calls[1]![0];
    const toolResults = secondCallArgs.messages.at(-1).content;
    expect(toolResults).toHaveLength(2);
    expect(toolResults.map((r: Anthropic.ToolResultBlockParam) => r.tool_use_id)).toEqual(['call_a', 'call_b']);
  });

  it('isolates a single invalid tool call as an error result without failing the whole turn', async () => {
    createMock
      .mockResolvedValueOnce(
        // missing required "accountId" field
        toolUseResponse([{ id: 'call_bad', name: 'crm_getAccount', input: {} }]),
      )
      .mockResolvedValueOnce(textResponse('Could you clarify which account?'));

    const result = await runOrchestrator([{ role: 'user', content: 'tell me about it' }]);

    expect(result.summary).toBe('Could you clarify which account?');
    const secondCallArgs = createMock.mock.calls[1]![0];
    const toolResultBlock = secondCallArgs.messages.at(-1).content[0];
    expect(toolResultBlock.is_error).toBe(true);
  });

  it('throws OrchestratorMaxIterationsError if Claude never stops requesting tools', async () => {
    createMock.mockResolvedValue(
      toolUseResponse([{ id: 'call_loop', name: 'crm_getAccount', input: { accountId: 'acc_acme' } }]),
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
            summary: 'Acme Corp usage is declining and there is an open SSO outage.',
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

    const result = await runOrchestrator([{ role: 'user', content: "what's going on with acme?" }]);

    // No second API call needed — the loop terminates as soon as respond_finalAnswer is seen.
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result.summary).toBe('Acme Corp usage is declining and there is an open SSO outage.');
    expect(result.recommendedNextActions).toEqual([
      'Review declining adoption',
      'Address SSO outage',
      'Introduce AI Analytics',
      'Schedule executive review',
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

    const result = await runOrchestrator([{ role: 'user', content: 'quick check on acme' }]);

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(result.summary).toBe('All good here.');
    expect(result.recommendedNextActions).toBeUndefined();

    const firstRetryArgs = createMock.mock.calls[1]![0];
    const retryToolResult = firstRetryArgs.messages.at(-1).content[0];
    expect(retryToolResult.is_error).toBe(true);
  });
});

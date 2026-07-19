import type Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logging/logger.js';
import { dispatchToolUseBlocks, toAnthropicTools } from '../tools/registry.js';
import { FINAL_ANSWER_TOOL_NAME, finalAnswerZodSchema } from '../tools/respondTools.js';
import { anthropic, CLAUDE_MODEL } from './client.js';
import { buildSystemPrompt } from './systemPrompt.js';

const MAX_TOOL_ITERATIONS = 6;
const MAX_TOKENS = 1536;

export class OrchestratorMaxIterationsError extends Error {}

export interface OrchestratorResult {
  summary: string;
  /** 2-4 concrete follow-ups, present only when Claude judged the answer to warrant them. */
  recommendedNextActions?: string[];
  /** Full message history including the assistant/tool turns, ready to persist and replay next call. */
  history: Anthropic.MessageParam[];
}

/**
 * Runs the Claude tool-use loop: send messages, execute any requested tool calls, resend the
 * results, and repeat until Claude delivers its answer via the `respond_finalAnswer` tool (or, as
 * a fallback, stops on its own with plain text) — or the iteration cap is hit.
 */
export async function runOrchestrator(history: Anthropic.MessageParam[]): Promise<OrchestratorResult> {
  const messages: Anthropic.MessageParam[] = [...history];
  const systemPrompt = buildSystemPrompt();
  const tools = toAnthropicTools();

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools,
      messages: [...messages],
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') {
      // Fallback path: Claude answered in plain text instead of calling respond_finalAnswer.
      const summary = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();
      return { summary, history: messages };
    }

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    logger.info({ iteration, tools: toolUseBlocks.map((b) => b.name) }, 'Claude requested tool use');

    const toolResults = await dispatchToolUseBlocks(toolUseBlocks);
    messages.push({ role: 'user', content: toolResults });

    const finalAnswerBlock = toolUseBlocks.find((block) => block.name === FINAL_ANSWER_TOOL_NAME);
    if (finalAnswerBlock) {
      const parsed = finalAnswerZodSchema.safeParse(finalAnswerBlock.input);
      if (parsed.success) {
        return {
          summary: parsed.data.summary,
          ...(parsed.data.recommendedNextActions ? { recommendedNextActions: parsed.data.recommendedNextActions } : {}),
          history: messages,
        };
      }
      // Invalid input was already recorded as an is_error tool_result above, so Claude sees why
      // and can retry with corrected input on the next iteration.
      logger.warn({ issues: parsed.error.issues }, 'respond_finalAnswer called with invalid input; retrying');
    }
  }

  throw new OrchestratorMaxIterationsError(
    `Exceeded max tool-use iterations (${MAX_TOOL_ITERATIONS}) without reaching a final answer.`,
  );
}

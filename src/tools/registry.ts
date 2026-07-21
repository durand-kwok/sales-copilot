import type Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { logger } from '../logging/logger.js';
import { crmTools } from './crmTools.js';
import { financeTools } from './financeTools.js';
import { locationTools } from './locationTools.js';
import { marketingTools } from './marketingTools.js';
import { respondTools } from './respondTools.js';
import { usageTools } from './usageTools.js';
import { workforceTools } from './workforceTools.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- registry entries are intentionally heterogeneous
export interface ToolDefinition<TInput = any> {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool.InputSchema;
  zodSchema: z.ZodType<TInput>;
  handler: (input: TInput) => Promise<unknown>;
}

export const toolRegistry: ToolDefinition[] = [
  ...crmTools,
  ...usageTools,
  ...locationTools,
  ...financeTools,
  ...workforceTools,
  ...marketingTools,
  ...respondTools,
];

const toolsByName = new Map(toolRegistry.map((tool) => [tool.name, tool]));

export function toAnthropicTools(): Anthropic.Tool[] {
  return toolRegistry.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

/**
 * Executes a single tool_use block, returning an Anthropic tool_result block.
 * Never throws — validation and handler failures are converted to `is_error` results
 * so a single failing tool call doesn't take down the whole conversation turn.
 */
export async function dispatchToolUse(block: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> {
  const tool = toolsByName.get(block.name);
  if (!tool) {
    logger.warn({ tool: block.name }, 'Claude requested an unknown tool');
    return {
      type: 'tool_result',
      tool_use_id: block.id,
      is_error: true,
      content: `Unknown tool "${block.name}".`,
    };
  }

  const parsed = tool.zodSchema.safeParse(block.input);
  if (!parsed.success) {
    logger.warn({ tool: block.name, issues: parsed.error.issues }, 'Tool input failed validation');
    return {
      type: 'tool_result',
      tool_use_id: block.id,
      is_error: true,
      content: `Invalid input for tool "${block.name}": ${parsed.error.message}`,
    };
  }

  const startedAt = Date.now();
  try {
    const result = await tool.handler(parsed.data);
    logger.info({ tool: block.name, input: parsed.data, durationMs: Date.now() - startedAt }, 'Tool call succeeded');
    return {
      type: 'tool_result',
      tool_use_id: block.id,
      content: JSON.stringify(result),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      { tool: block.name, input: parsed.data, durationMs: Date.now() - startedAt, error: message },
      'Tool call failed',
    );
    return {
      type: 'tool_result',
      tool_use_id: block.id,
      is_error: true,
      content: `Tool "${block.name}" failed: ${message}`,
    };
  }
}

/** Dispatches every tool_use block from a single Claude turn concurrently. */
export async function dispatchToolUseBlocks(
  blocks: Anthropic.ToolUseBlock[],
): Promise<Anthropic.ToolResultBlockParam[]> {
  return Promise.all(blocks.map(dispatchToolUse));
}

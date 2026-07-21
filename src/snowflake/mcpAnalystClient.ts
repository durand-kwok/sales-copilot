import { readFileSync } from 'node:fs';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';
import type { WorkforceAnalystAnswer } from '../types/index.js';
import { querySnowflake } from './client.js';
import { buildKeyPairJwt } from './keyPairJwt.js';

export class McpAnalystError extends Error {}

const ANALYST_TOOL_NAME = 'aire_analyst';

interface McpToolCallResponse {
  jsonrpc: string;
  id: number;
  result?: { content?: Array<{ type: string; text: string }>; isError?: boolean };
  error?: { message: string };
}

interface CortexAnalystPart {
  text?: string;
  statement?: string;
}

/** Rejects anything that isn't a read-only SELECT/CTE — defense-in-depth even though Cortex Analyst is designed to only generate analytical queries. */
function isSelectLike(sql: string): boolean {
  return /^\s*(select|with)\b/i.test(sql);
}

let cachedPrivateKeyPem: string | undefined;

function loadPrivateKeyPem(): string {
  if (!cachedPrivateKeyPem) {
    if (!env.SNOWFLAKE_PRIVATE_KEY_PATH) {
      throw new McpAnalystError('SNOWFLAKE_PRIVATE_KEY_PATH is not configured.');
    }
    cachedPrivateKeyPem = readFileSync(env.SNOWFLAKE_PRIVATE_KEY_PATH, 'utf8');
  }
  return cachedPrivateKeyPem;
}

async function callAnalystTool(message: string): Promise<CortexAnalystPart[]> {
  if (!env.SNOWFLAKE_MCP_ENDPOINT) {
    throw new McpAnalystError('SNOWFLAKE_MCP_ENDPOINT is not configured.');
  }

  const jwt = buildKeyPairJwt({
    account: env.SNOWFLAKE_ACCOUNT,
    username: env.SNOWFLAKE_USERNAME,
    privateKeyPem: loadPrivateKeyPem(),
    ...(env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE ? { privateKeyPassphrase: env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE } : {}),
  });

  let response: Response;
  try {
    response = await fetch(env.SNOWFLAKE_MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'X-Snowflake-Authorization-Token-Type': 'KEYPAIR_JWT',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: ANALYST_TOOL_NAME, arguments: { message } },
      }),
    });
  } catch (error) {
    logger.error({ error }, 'MCP analyst request failed to send');
    throw new McpAnalystError('Could not reach the workforce analyst service.');
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    logger.error({ status: response.status, body: bodyText }, 'MCP analyst call returned a non-OK status');
    throw new McpAnalystError('The workforce analyst service failed to respond.');
  }

  const body = (await response.json()) as McpToolCallResponse;

  if (body.error) {
    logger.error({ error: body.error }, 'MCP analyst returned a JSON-RPC error');
    throw new McpAnalystError('The workforce analyst service returned an error.');
  }
  if (body.result?.isError) {
    logger.error({ result: body.result }, 'MCP analyst tool call reported isError');
    throw new McpAnalystError('The workforce analyst service returned an error.');
  }

  const rawText = body.result?.content?.[0]?.text;
  if (!rawText) {
    throw new McpAnalystError('The workforce analyst service returned an empty response.');
  }

  try {
    return JSON.parse(rawText) as CortexAnalystPart[];
  } catch {
    // Not the expected JSON array shape — treat the whole string as a plain interpretation.
    return [{ text: rawText }];
  }
}

/**
 * Asks Snowflake Cortex Analyst (via the Snowflake-hosted MCP server) a natural-language question.
 * Cortex Analyst only proposes SQL — it does not execute it — so this function runs the proposed
 * query itself via the existing querySnowflake() connection, after verifying it's read-only.
 */
export async function askWorkforceAnalyst(message: string): Promise<WorkforceAnalystAnswer> {
  const parts = await callAnalystTool(message);

  const interpretation = parts.find((p) => typeof p.text === 'string')?.text ?? '';
  const statement = parts.find((p) => typeof p.statement === 'string')?.statement;

  if (!statement) {
    return { interpretation, generatedSql: null, rows: null };
  }

  if (!isSelectLike(statement)) {
    logger.error({ statement }, 'Cortex Analyst generated a non-SELECT statement; refusing to execute it');
    throw new McpAnalystError('The workforce analyst proposed a non-read-only query, which was blocked.');
  }

  const rows = await querySnowflake<Record<string, unknown>>(statement, []);
  return { interpretation, generatedSql: statement, rows };
}

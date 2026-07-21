import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, jwtMock, fetchMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  jwtMock: vi.fn(() => 'fake.jwt.token'),
  fetchMock: vi.fn(),
}));

vi.mock('../../../src/snowflake/client.js', () => ({ querySnowflake: queryMock }));
vi.mock('../../../src/snowflake/keyPairJwt.js', () => ({ buildKeyPairJwt: jwtMock }));

import { McpAnalystError, askWorkforceAnalyst } from '../../../src/snowflake/mcpAnalystClient.js';

function mcpToolCallResponse(contentText: string, overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      jsonrpc: '2.0',
      id: 1,
      result: { content: [{ type: 'text', text: contentText }], isError: false, ...overrides },
    }),
  };
}

beforeEach(() => {
  queryMock.mockReset();
  jwtMock.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('askWorkforceAnalyst', () => {
  it('executes the generated SQL and returns interpretation + real rows', async () => {
    fetchMock.mockResolvedValueOnce(
      mcpToolCallResponse(JSON.stringify([{ text: 'Which city has the highest churn risk?' }, { statement: 'SELECT city FROM foo' }])),
    );
    queryMock.mockResolvedValueOnce([{ CITY: 'Denver' }]);

    const result = await askWorkforceAnalyst('which city churns most?');

    expect(queryMock).toHaveBeenCalledWith('SELECT city FROM foo', []);
    expect(result).toEqual({
      interpretation: 'Which city has the highest churn risk?',
      generatedSql: 'SELECT city FROM foo',
      rows: [{ CITY: 'Denver' }],
    });
  });

  it('accepts a WITH (CTE) statement as read-only', async () => {
    fetchMock.mockResolvedValueOnce(
      mcpToolCallResponse(JSON.stringify([{ text: 'interp' }, { statement: 'WITH x AS (SELECT 1) SELECT * FROM x' }])),
    );
    queryMock.mockResolvedValueOnce([]);

    await askWorkforceAnalyst('q');
    expect(queryMock).toHaveBeenCalledWith('WITH x AS (SELECT 1) SELECT * FROM x', []);
  });

  it('returns no rows and no SQL when Cortex Analyst needs clarification instead of proposing a query', async () => {
    fetchMock.mockResolvedValueOnce(mcpToolCallResponse(JSON.stringify([{ text: 'Which city do you mean?' }])));

    const result = await askWorkforceAnalyst('ambiguous question');

    expect(result).toEqual({ interpretation: 'Which city do you mean?', generatedSql: null, rows: null });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('refuses to execute a non-SELECT statement, as a safety check', async () => {
    fetchMock.mockResolvedValueOnce(
      mcpToolCallResponse(JSON.stringify([{ text: 'interp' }, { statement: 'DELETE FROM foo' }])),
    );

    await expect(askWorkforceAnalyst('q')).rejects.toThrow(McpAnalystError);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('wraps a non-OK HTTP response as McpAnalystError', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'server error' });
    await expect(askWorkforceAnalyst('q')).rejects.toThrow(McpAnalystError);
  });

  it('wraps a JSON-RPC error field as McpAnalystError', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, error: { message: 'bad request' } }) });
    await expect(askWorkforceAnalyst('q')).rejects.toThrow(McpAnalystError);
  });

  it('wraps result.isError as McpAnalystError', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: { isError: true, content: [] } }) });
    await expect(askWorkforceAnalyst('q')).rejects.toThrow(McpAnalystError);
  });

  it('wraps a network-level fetch failure as McpAnalystError', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    await expect(askWorkforceAnalyst('q')).rejects.toThrow(McpAnalystError);
  });
});

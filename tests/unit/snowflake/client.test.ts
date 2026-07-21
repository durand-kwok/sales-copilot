import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createPoolMock, useMock, executeMock } = vi.hoisted(() => ({
  createPoolMock: vi.fn(),
  useMock: vi.fn(),
  executeMock: vi.fn(),
}));

vi.mock('snowflake-sdk', () => ({
  default: { createPool: createPoolMock },
}));

// The connection pool is a module-level singleton created lazily on first use, so each test
// resets modules and re-imports fresh to avoid cross-test pool-caching interference.
async function freshQuerySnowflake() {
  vi.resetModules();
  const mod = await import('../../../src/snowflake/client.js');
  return mod;
}

beforeEach(() => {
  createPoolMock.mockReset();
  useMock.mockReset();
  executeMock.mockReset();
  createPoolMock.mockReturnValue({ use: useMock });
});

describe('querySnowflake', () => {
  it('resolves with the rows returned by the driver', async () => {
    const { querySnowflake } = await freshQuerySnowflake();
    useMock.mockImplementation(async (cb: (conn: unknown) => unknown) => cb({ execute: executeMock }));
    executeMock.mockImplementation(
      (options: { complete: (err: unknown, stmt: unknown, rows: unknown) => void }) =>
        options.complete(undefined, {}, [{ FOO: 'bar' }]),
    );

    const rows = await querySnowflake('SELECT 1');
    expect(rows).toEqual([{ FOO: 'bar' }]);
  });

  it('passes sqlText and binds through to connection.execute', async () => {
    const { querySnowflake } = await freshQuerySnowflake();
    useMock.mockImplementation(async (cb: (conn: unknown) => unknown) => cb({ execute: executeMock }));
    executeMock.mockImplementation(
      (options: { complete: (err: unknown, stmt: unknown, rows: unknown) => void }) =>
        options.complete(undefined, {}, []),
    );

    await querySnowflake('SELECT * FROM FOO WHERE ID = ?', [42]);

    const executeArgs = executeMock.mock.calls[0]![0] as { sqlText: string; binds: unknown[] };
    expect(executeArgs.sqlText).toBe('SELECT * FROM FOO WHERE ID = ?');
    expect(executeArgs.binds).toEqual([42]);
  });

  it('wraps a driver failure as a SnowflakeQueryError with a safe message, never the raw driver error', async () => {
    const { querySnowflake, SnowflakeQueryError } = await freshQuerySnowflake();
    useMock.mockImplementation(async (cb: (conn: unknown) => unknown) => cb({ execute: executeMock }));
    executeMock.mockImplementation(
      (options: { complete: (err: unknown, stmt: unknown, rows: unknown) => void }) =>
        options.complete(new Error('account xyz123 credentials invalid'), {}, undefined),
    );

    try {
      await querySnowflake('SELECT 1');
      expect.fail('expected querySnowflake to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(SnowflakeQueryError);
      expect((error as Error).message).not.toContain('xyz123');
    }
  });

  it('creates the connection pool lazily, only once across multiple queries', async () => {
    const { querySnowflake } = await freshQuerySnowflake();
    useMock.mockImplementation(async (cb: (conn: unknown) => unknown) => cb({ execute: executeMock }));
    executeMock.mockImplementation(
      (options: { complete: (err: unknown, stmt: unknown, rows: unknown) => void }) =>
        options.complete(undefined, {}, []),
    );

    expect(createPoolMock).not.toHaveBeenCalled();

    await querySnowflake('SELECT 1');
    await querySnowflake('SELECT 2');

    expect(createPoolMock).toHaveBeenCalledTimes(1);
  });
});

import snowflake from 'snowflake-sdk';
import type { Connection, ConnectionOptions, Pool } from 'snowflake-sdk';
import { env } from '../config/env.js';
import { logger } from '../logging/logger.js';

export class SnowflakeQueryError extends Error {}

export type SnowflakeBind = string | number | boolean | null;

function buildConnectionOptions(): ConnectionOptions {
  const base: ConnectionOptions = {
    account: env.SNOWFLAKE_ACCOUNT,
    username: env.SNOWFLAKE_USERNAME,
    warehouse: env.SNOWFLAKE_WAREHOUSE,
    database: env.SNOWFLAKE_DATABASE,
    schema: env.SNOWFLAKE_SCHEMA,
    authenticator: env.SNOWFLAKE_AUTHENTICATOR,
    // Without this, DATE/TIMESTAMP columns come back as the driver's internal SfDate-like
    // object (getEpochSeconds(), toJSON(), etc.) instead of a plain string — every service
    // function's row-mapping assumes plain strings, so this must stay set.
    fetchAsString: ['Date'],
  };

  if (env.SNOWFLAKE_ROLE) {
    base.role = env.SNOWFLAKE_ROLE;
  }

  if (env.SNOWFLAKE_AUTHENTICATOR === 'SNOWFLAKE_JWT') {
    if (env.SNOWFLAKE_PRIVATE_KEY_PATH) {
      base.privateKeyPath = env.SNOWFLAKE_PRIVATE_KEY_PATH;
    }
    if (env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE) {
      base.privateKeyPass = env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE;
    }
  } else if (env.SNOWFLAKE_PASSWORD) {
    base.password = env.SNOWFLAKE_PASSWORD;
  }

  return base;
}

// Created lazily on first query, not at import time, so importing this module (e.g. transitively
// in tests) never attempts a real network connection.
let pool: Pool<Connection> | undefined;

function getPool(): Pool<Connection> {
  if (!pool) {
    pool = snowflake.createPool(buildConnectionOptions(), { min: 1, max: 5 });
  }
  return pool;
}

/**
 * Runs a parameterized SQL query against Snowflake and returns the rows.
 * Any failure (connection or query) is logged in full server-side and rethrown as a
 * SnowflakeQueryError with a generic, safe message — never the raw driver error.
 */
export async function querySnowflake<T = Record<string, unknown>>(
  sqlText: string,
  binds: readonly SnowflakeBind[] = [],
): Promise<T[]> {
  try {
    return await getPool().use(
      (connection) =>
        new Promise<T[]>((resolve, reject) => {
          connection.execute({
            sqlText,
            binds: binds as SnowflakeBind[],
            complete: (err, _statement, rows) => {
              if (err) {
                reject(err);
                return;
              }
              resolve((rows ?? []) as T[]);
            },
          });
        }),
    );
  } catch (error) {
    logger.error({ error, sqlText }, 'Snowflake query failed');
    throw new SnowflakeQueryError('A query against Snowflake failed. See server logs for details.');
  }
}

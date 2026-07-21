import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    SLACK_BOT_TOKEN: z.string().startsWith('xoxb-', 'SLACK_BOT_TOKEN must be a bot token (xoxb-...)'),
    SLACK_APP_TOKEN: z.string().startsWith('xapp-', 'SLACK_APP_TOKEN must be an app-level token (xapp-...)'),
    ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
    CLAUDE_MODEL: z.string().default('claude-sonnet-5'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    SNOWFLAKE_ACCOUNT: z.string().min(1, 'SNOWFLAKE_ACCOUNT is required'),
    SNOWFLAKE_USERNAME: z.string().min(1, 'SNOWFLAKE_USERNAME is required'),
    SNOWFLAKE_AUTHENTICATOR: z.enum(['SNOWFLAKE_JWT', 'SNOWFLAKE']).default('SNOWFLAKE_JWT'),
    SNOWFLAKE_PRIVATE_KEY_PATH: z.string().optional(),
    SNOWFLAKE_PRIVATE_KEY_PASSPHRASE: z.string().optional(),
    SNOWFLAKE_PASSWORD: z.string().optional(),
    SNOWFLAKE_WAREHOUSE: z.string().min(1, 'SNOWFLAKE_WAREHOUSE is required'),
    SNOWFLAKE_DATABASE: z.string().default('AIRE_DATA'),
    SNOWFLAKE_SCHEMA: z.string().default('WORKFORCE_ANALYTICS'),
    SNOWFLAKE_ROLE: z.string().optional(),

    // Optional: enables the analyst_askWorkforceQuestion tool, which calls a Snowflake-hosted MCP
    // server's Cortex Analyst tool. Omit entirely to leave that tool disabled.
    SNOWFLAKE_MCP_ENDPOINT: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.SNOWFLAKE_AUTHENTICATOR === 'SNOWFLAKE_JWT' && !data.SNOWFLAKE_PRIVATE_KEY_PATH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SNOWFLAKE_PRIVATE_KEY_PATH'],
        message: 'SNOWFLAKE_PRIVATE_KEY_PATH is required when SNOWFLAKE_AUTHENTICATOR is SNOWFLAKE_JWT',
      });
    }
    if (data.SNOWFLAKE_AUTHENTICATOR === 'SNOWFLAKE' && !data.SNOWFLAKE_PASSWORD) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SNOWFLAKE_PASSWORD'],
        message: 'SNOWFLAKE_PASSWORD is required when SNOWFLAKE_AUTHENTICATOR is SNOWFLAKE',
      });
    }
    if (data.SNOWFLAKE_MCP_ENDPOINT && data.SNOWFLAKE_AUTHENTICATOR !== 'SNOWFLAKE_JWT') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SNOWFLAKE_MCP_ENDPOINT'],
        message: 'SNOWFLAKE_MCP_ENDPOINT requires SNOWFLAKE_AUTHENTICATOR=SNOWFLAKE_JWT (it signs its own key-pair JWT for the MCP request).',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\n\nSee .env.example for required variables.`);
  }
  return parsed.data;
}

export const env = loadEnv();

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      SLACK_BOT_TOKEN: 'xoxb-test-token',
      SLACK_APP_TOKEN: 'xapp-test-token',
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      CLAUDE_MODEL: 'claude-test-model',
      LOG_LEVEL: 'silent',
      SNOWFLAKE_ACCOUNT: 'test-account',
      SNOWFLAKE_USERNAME: 'test-user',
      SNOWFLAKE_AUTHENTICATOR: 'SNOWFLAKE_JWT',
      SNOWFLAKE_PRIVATE_KEY_PATH: '/dev/null',
      SNOWFLAKE_WAREHOUSE: 'TEST_WH',
    },
  },
});

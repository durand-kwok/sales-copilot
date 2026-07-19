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
    },
  },
});

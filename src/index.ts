import { app } from './slack/app.js';
import { logger } from './logging/logger.js';

async function main() {
  await app.start();
  logger.info('⚡️ Sales Copilot is running (Socket Mode)');
}

main().catch((error) => {
  logger.error({ error }, 'Failed to start Sales Copilot');
  process.exit(1);
});

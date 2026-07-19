import * as readline from 'node:readline/promises';
import type Anthropic from '@anthropic-ai/sdk';
import { runOrchestrator } from '../src/claude/orchestrator.js';
import { logger } from '../src/logging/logger.js';

async function main() {
  console.log('Sales Copilot CLI — talk to Claude + tools directly (no Slack). Ctrl+C to exit.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const history: Anthropic.MessageParam[] = [];

  for (;;) {
    const input = await rl.question('you> ');
    if (!input.trim()) continue;

    history.push({ role: 'user', content: input });

    try {
      const result = await runOrchestrator(history);
      history.length = 0;
      history.push(...result.history);
      console.log(`\ncopilot> ${result.summary}`);
      if (result.recommendedNextActions?.length) {
        console.log('\nRecommended Next Actions');
        for (const action of result.recommendedNextActions) {
          console.log(`  - ${action}`);
        }
      }
      console.log();
    } catch (error) {
      logger.error({ error }, 'Orchestrator run failed');
      console.error('\n[error] the orchestrator failed — see log output above.\n');
    }
  }
}

main().catch((error) => {
  logger.error({ error }, 'CLI crashed');
  process.exit(1);
});

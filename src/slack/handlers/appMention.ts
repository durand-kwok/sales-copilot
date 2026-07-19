import type { App } from '@slack/bolt';
import { runOrchestrator } from '../../claude/orchestrator.js';
import { getHistory, setHistory, threadKey } from '../../conversation/store.js';
import { logger } from '../../logging/logger.js';
import { buildResponseBlocks, buildResponseFallbackText } from '../formatting.js';
import { isDuplicateEvent } from './dedupe.js';
import { isRateLimited } from './rateLimit.js';

const GENERIC_ERROR_TEXT =
  "Sorry, I ran into a problem answering that. Let's try again — you can rephrase or ask something else.";
const RATE_LIMITED_TEXT = "You're asking me things a bit fast — give it a minute and try again.";

function stripBotMention(text: string): string {
  return text.replace(/^\s*<@[^>]+>\s*/, '').trim();
}

export function registerAppMentionHandler(app: App): void {
  app.event('app_mention', async ({ event, body, client }) => {
    if (isDuplicateEvent(body.event_id)) {
      logger.debug({ eventId: body.event_id }, 'Skipping duplicate app_mention delivery');
      return;
    }

    const rootTs = event.thread_ts ?? event.ts;
    const key = threadKey(event.channel, rootTs);
    logger.info({ user: event.user, channel: event.channel, thread: rootTs }, 'Received app_mention');

    if (event.user && isRateLimited(event.user)) {
      logger.warn({ user: event.user }, 'Rate limit hit for app_mention');
      await client.chat.postMessage({ channel: event.channel, thread_ts: rootTs, text: RATE_LIMITED_TEXT });
      return;
    }

    const thinking = await client.chat.postMessage({
      channel: event.channel,
      thread_ts: rootTs,
      text: ':hourglass_flowing_sand: Looking into it...',
    });

    try {
      const question = stripBotMention(event.text);
      const history = [...getHistory(key), { role: 'user' as const, content: question }];
      const result = await runOrchestrator(history);
      setHistory(key, result.history);

      await client.chat.update({
        channel: event.channel,
        ts: thinking.ts!,
        text: buildResponseFallbackText(result),
        blocks: buildResponseBlocks(result),
      });
    } catch (error) {
      logger.error({ error, channel: event.channel, thread: rootTs }, 'Failed to answer app_mention');
      await client.chat.update({
        channel: event.channel,
        ts: thinking.ts!,
        text: GENERIC_ERROR_TEXT,
      });
    }
  });
}

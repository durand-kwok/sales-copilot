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

export function registerDirectMessageHandler(app: App): void {
  app.message(async ({ message, body, client }) => {
    // Only handle plain user DMs — ignore bot messages, edits, deletions, and channel/group messages.
    if (message.subtype !== undefined) return;
    if (!('channel_type' in message) || message.channel_type !== 'im') return;
    if (!('text' in message) || !message.text) return;
    if (isDuplicateEvent(body.event_id)) {
      logger.debug({ eventId: body.event_id }, 'Skipping duplicate DM delivery');
      return;
    }

    const rootTs = message.thread_ts ?? message.ts;
    const key = threadKey(message.channel, rootTs);
    logger.info({ user: message.user, channel: message.channel, thread: rootTs }, 'Received direct message');

    if ('user' in message && message.user && isRateLimited(message.user)) {
      logger.warn({ user: message.user }, 'Rate limit hit for direct message');
      await client.chat.postMessage({ channel: message.channel, thread_ts: rootTs, text: RATE_LIMITED_TEXT });
      return;
    }

    const thinking = await client.chat.postMessage({
      channel: message.channel,
      thread_ts: rootTs,
      text: ':hourglass_flowing_sand: Looking into it...',
    });

    try {
      const history = [...getHistory(key), { role: 'user' as const, content: message.text }];
      const result = await runOrchestrator(history);
      setHistory(key, result.history);

      await client.chat.update({
        channel: message.channel,
        ts: thinking.ts!,
        text: buildResponseFallbackText(result),
        blocks: buildResponseBlocks(result),
      });
    } catch (error) {
      logger.error({ error, channel: message.channel, thread: rootTs }, 'Failed to answer direct message');
      await client.chat.update({
        channel: message.channel,
        ts: thinking.ts!,
        text: GENERIC_ERROR_TEXT,
      });
    }
  });
}

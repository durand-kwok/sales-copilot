import type Anthropic from '@anthropic-ai/sdk';
import type { ConversationEntry } from './types.js';

const THREAD_TTL_MS = 30 * 60 * 1000;
const MAX_HISTORY_MESSAGES = 40;

const threads = new Map<string, ConversationEntry>();

function evictExpired(now: number): void {
  for (const [key, entry] of threads) {
    if (now - entry.updatedAt > THREAD_TTL_MS) {
      threads.delete(key);
    }
  }
}

function isCleanUserTurn(message: Anthropic.MessageParam): boolean {
  // A genuine new user turn is plain text, as opposed to a `user`-role tool_result message.
  return message.role === 'user' && typeof message.content === 'string';
}

/**
 * Caps stored history to the most recent MAX_HISTORY_MESSAGES messages, but only cuts at a clean
 * user-turn boundary so a tool_use/tool_result pair is never split (which the API would reject).
 * If no clean boundary exists within the excess prefix, the full history is kept rather than risk
 * corrupting state.
 */
function truncateHistory(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;

  const excess = messages.length - MAX_HISTORY_MESSAGES;
  for (let i = excess; i < messages.length; i++) {
    if (isCleanUserTurn(messages[i]!)) {
      return messages.slice(i);
    }
  }
  return messages;
}

/** Builds the conversation-state key for a Slack thread: scoped to channel + thread root. */
export function threadKey(channel: string, threadTs: string): string {
  return `${channel}:${threadTs}`;
}

export function getHistory(key: string): Anthropic.MessageParam[] {
  evictExpired(Date.now());
  return threads.get(key)?.messages ?? [];
}

export function setHistory(key: string, messages: Anthropic.MessageParam[]): void {
  const now = Date.now();
  evictExpired(now);
  threads.set(key, { messages: truncateHistory(messages), updatedAt: now });
}

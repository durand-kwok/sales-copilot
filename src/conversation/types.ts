import type Anthropic from '@anthropic-ai/sdk';

export interface ConversationEntry {
  messages: Anthropic.MessageParam[];
  updatedAt: number;
}

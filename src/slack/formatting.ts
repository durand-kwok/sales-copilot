import type { KnownBlock } from '@slack/types';

const MAX_SECTION_TEXT_LENGTH = 2900; // Slack section blocks cap text at 3000 chars.

export interface FormattableResult {
  summary: string;
  recommendedNextActions?: string[];
}

function toMrkdwnBullets(text: string): string {
  // Claude tends to write markdown-style "- " bullets; Slack mrkdwn renders "•" bullets.
  return text.replace(/^(\s*)[-*]\s+/gm, '$1• ');
}

function truncateForSlack(text: string): string {
  if (text.length <= MAX_SECTION_TEXT_LENGTH) return text;
  return `${text.slice(0, MAX_SECTION_TEXT_LENGTH - 1)}…`;
}

/** Builds the Block Kit blocks for a copilot answer, rendering Recommended Next Actions as its own block. */
export function buildResponseBlocks(result: FormattableResult): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: truncateForSlack(toMrkdwnBullets(result.summary)) },
    },
  ];

  if (result.recommendedNextActions?.length) {
    const actionsText = ['*Recommended Next Actions*', ...result.recommendedNextActions.map((a) => `• ${a}`)].join(
      '\n',
    );
    blocks.push({ type: 'divider' }, { type: 'section', text: { type: 'mrkdwn', text: actionsText } });
  }

  return blocks;
}

/** Plain-text fallback for notifications/accessibility, required alongside `blocks`. */
export function buildResponseFallbackText(result: FormattableResult): string {
  if (!result.recommendedNextActions?.length) return result.summary;
  const actions = result.recommendedNextActions.map((a) => `- ${a}`).join('\n');
  return `${result.summary}\n\nRecommended Next Actions\n${actions}`;
}

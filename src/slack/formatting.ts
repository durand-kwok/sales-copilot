import type { KnownBlock } from '@slack/types';

const MAX_SECTION_TEXT_LENGTH = 2900; // Slack section blocks cap text at 3000 chars.

export interface FormattableResult {
  summary: string;
  recommendedNextActions?: string[];
}

function normalizeEscapedNewlines(text: string): string {
  // Defends against an occasional model quirk where a tool call's string argument contains the
  // literal two-character sequence "\n" (backslash + n) as data, rather than a real line break —
  // observed in production, where it rendered as visible "\n" text in Slack instead of a blank line.
  return text.replace(/\\n/g, '\n');
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
  const summary = normalizeEscapedNewlines(result.summary);
  const actions = result.recommendedNextActions?.map(normalizeEscapedNewlines);

  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: truncateForSlack(toMrkdwnBullets(summary)) },
    },
  ];

  if (actions?.length) {
    const actionsText = ['*Recommended Next Actions*', ...actions.map((a) => `• ${a}`)].join('\n');
    blocks.push({ type: 'divider' }, { type: 'section', text: { type: 'mrkdwn', text: actionsText } });
  }

  return blocks;
}

/** Plain-text fallback for notifications/accessibility, required alongside `blocks`. */
export function buildResponseFallbackText(result: FormattableResult): string {
  const summary = normalizeEscapedNewlines(result.summary);
  const actions = result.recommendedNextActions?.map(normalizeEscapedNewlines);

  if (!actions?.length) return summary;
  return `${summary}\n\nRecommended Next Actions\n${actions.map((a) => `- ${a}`).join('\n')}`;
}

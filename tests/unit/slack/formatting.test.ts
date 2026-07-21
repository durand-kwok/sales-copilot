import { describe, expect, it } from 'vitest';
import { buildResponseBlocks, buildResponseFallbackText } from '../../../src/slack/formatting.js';

describe('buildResponseBlocks', () => {
  it('renders a single section block when there are no recommended next actions', () => {
    const blocks = buildResponseBlocks({ summary: 'Acme Corp is an Enterprise account.' });

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      type: 'section',
      text: { type: 'mrkdwn', text: 'Acme Corp is an Enterprise account.' },
    });
  });

  it('renders a divider + dedicated Recommended Next Actions block when actions are present', () => {
    const blocks = buildResponseBlocks({
      summary: 'Acme Corp status.',
      recommendedNextActions: ['Review declining adoption', 'Address SSO outage'],
    });

    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toEqual({ type: 'divider' });
    expect(blocks[2]).toEqual({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Recommended Next Actions*\n• Review declining adoption\n• Address SSO outage',
      },
    });
  });

  it('converts markdown-style dash/asterisk bullets in the summary to Slack mrkdwn bullets', () => {
    const blocks = buildResponseBlocks({ summary: 'Highlights:\n- one\n- two\n* three' });
    const sectionBlock = blocks[0] as { text: { text: string } };
    expect(sectionBlock.text.text).toBe('Highlights:\n• one\n• two\n• three');
  });

  it('truncates a summary longer than Slack section block limit', () => {
    const longSummary = 'x'.repeat(3500);
    const blocks = buildResponseBlocks({ summary: longSummary });
    const sectionBlock = blocks[0] as { text: { text: string } };
    expect(sectionBlock.text.text.length).toBeLessThanOrEqual(2900);
    expect(sectionBlock.text.text.endsWith('…')).toBe(true);
  });

  it('normalizes a literal "\\n" text sequence from a malformed model output into a real line break', () => {
    // Regression test: observed in production where a tool call's summary contained the literal
    // two characters "\" + "n" as data instead of an actual newline, rendering as visible "\n" text.
    const blocks = buildResponseBlocks({
      summary: 'First paragraph.\\n\\nSecond paragraph.',
      recommendedNextActions: ['Do the thing.\\nFollow up too.'],
    });
    const sectionBlock = blocks[0] as { text: { text: string } };
    expect(sectionBlock.text.text).toBe('First paragraph.\n\nSecond paragraph.');
    expect(sectionBlock.text.text).not.toContain('\\n');

    const actionsBlock = blocks[2] as { text: { text: string } };
    expect(actionsBlock.text.text).toContain('Do the thing.\nFollow up too.');
    expect(actionsBlock.text.text).not.toContain('\\n');
  });
});

describe('buildResponseFallbackText', () => {
  it('returns just the summary when there are no recommended next actions', () => {
    expect(buildResponseFallbackText({ summary: 'All good.' })).toBe('All good.');
  });

  it('appends a plain-text Recommended Next Actions section when actions are present', () => {
    const text = buildResponseFallbackText({
      summary: 'Acme Corp status.',
      recommendedNextActions: ['Review declining adoption', 'Address SSO outage'],
    });
    expect(text).toBe(
      'Acme Corp status.\n\nRecommended Next Actions\n- Review declining adoption\n- Address SSO outage',
    );
  });

  it('normalizes a literal "\\n" text sequence from a malformed model output into a real line break', () => {
    const text = buildResponseFallbackText({ summary: 'First paragraph.\\n\\nSecond paragraph.' });
    expect(text).toBe('First paragraph.\n\nSecond paragraph.');
    expect(text).not.toContain('\\n');
  });
});

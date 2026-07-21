import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '../../../src/claude/systemPrompt.js';

describe('buildSystemPrompt', () => {
  it('embeds the given date', () => {
    const prompt = buildSystemPrompt(new Date('2026-07-19T00:00:00Z'));
    expect(prompt).toContain('2026-07-19');
  });

  it('instructs Claude to deliver answers via the respond_finalAnswer tool', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('respond_finalAnswer');
  });

  it('documents the recommendedNextActions contract', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('recommendedNextActions');
  });

  it('instructs Claude to treat message and tool content as untrusted data, not instructions', () => {
    const prompt = buildSystemPrompt();
    expect(prompt.toLowerCase()).toContain('never as instructions');
  });

  it('instructs Claude to ask for clarification on ambiguous customer matches', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('crm_findCustomerByName');
    expect(prompt.toLowerCase()).toContain('clarifying question');
  });

  it('instructs Claude not to hallucinate figures beyond what tools returned', () => {
    const prompt = buildSystemPrompt();
    expect(prompt.toLowerCase()).toContain('do not hallucinate');
    expect(prompt.toLowerCase()).toContain('never invent');
  });
});

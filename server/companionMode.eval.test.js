// Live behavioral eval for STUCK COMPANION MODE (eng D7).
//
// SKIPPED BY DEFAULT — gated on RELU_EVAL=1 + ANTHROPIC_API_KEY so the normal
// `npm test` run needs no network and no key. The deterministic prompt-contract
// evals in guidedAgent.test.js pin the doctrine the model is told; THIS file
// checks the model actually behaves, by running one real opening turn against the
// assembled companion prompt and grading it.
//
//   Run with:  RELU_EVAL=1 ANTHROPIC_API_KEY=sk-... npx vitest run server/companionMode.eval.test.js
//
// What it asserts on the companion path (the no-spoiler opener):
//   1. turn-1 is a NUDGE, not the solution — the reply is a question that asks
//      for the student's read, and does NOT name the canonical pattern.
// And the contrast that proves intent routing matters:
//   2. the SAME problem on the standard (walkthrough) path is free to be direct.

import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { buildIntakeUserText, buildGuidedSystemPrompt } from './guidedAgent.js';

const ENABLED = process.env.RELU_EVAL === '1' && !!process.env.ANTHROPIC_API_KEY;

// Two Sum — canonical "hash map / one-pass" tell. A no-spoiler opener must not
// hand the student any of these in its first breath.
const TWO_SUM = `Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target. You may assume exactly one solution, and you may not use the same element twice.`;
const SPOILER_TERMS = ['hash map', 'hashmap', 'hash table', 'hashtable', 'complement', 'two pointer', 'two-pointer', 'O(n)'];

async function openingTurn(session) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: buildGuidedSystemPrompt(session),
    messages: [{ role: 'user', content: buildIntakeUserText(session, TWO_SUM) }],
  });
  return resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').toLowerCase();
}

describe.skipIf(!ENABLED)('STUCK COMPANION MODE — live behavior eval', () => {
  it('companion turn-1: asks for the read, withholds the pattern (no spoiler)', async () => {
    const text = await openingTurn({ mode: 'leetcode', hasViz: true, companionMode: true, _leetcodeAlgorithmKey: 'two_sum', _leetcodeConfidence: 0.95, _leetcodeTier: 1 });
    expect(text).toContain('?'); // it opens with a question, not a lecture
    for (const term of SPOILER_TERMS) {
      expect(text, `opening turn leaked spoiler term "${term}"`).not.toContain(term);
    }
  }, 30000);

  it('intent routing: the standard walkthrough path is NOT bound by the no-spoiler rule', async () => {
    // We don't assert it spoils — only that the companion constraints are absent,
    // i.e. the two paths are genuinely different prompts for the same problem.
    const companion = buildGuidedSystemPrompt({ companionMode: true });
    const standard = buildGuidedSystemPrompt({ companionMode: false });
    expect(companion).not.toBe(standard);
    expect(standard).not.toContain('NO SPOILERS');
  });
});

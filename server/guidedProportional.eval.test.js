// Live behavioral eval for PROPORTIONAL RESPONSE in non-companion guided mode
// (investigate 2026-06-16 — the "sort" dump).
//
// SKIPPED BY DEFAULT — gated on RELU_EVAL=1 + ANTHROPIC_API_KEY so normal
// `npm test` needs no network/key. The deterministic prompt-contract pin in
// guidedAgent.test.js ("base doctrine encodes proportional response...") checks
// the doctrine the model is TOLD; THIS file checks it actually BEHAVES.
//
//   Run with:  RELU_EVAL=1 ANTHROPIC_API_KEY=sk-... npx vitest run server/guidedProportional.eval.test.js
//
// THE BUG: in guided (non-companion) mode a correct PARTIAL idea ("sort it first")
// was treated as license to advance a whole stage, and the NARRATION GUARD emitted
// the complete solution on "mostly right" — so the tutor dumped the two-pointer scan
// + complexity instead of confirming "sort" and asking the one next question.

import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { buildIntakeUserText, buildGuidedSystemPrompt } from './guidedAgent.js';
import { tools } from './tools.js';
import { TEACHING_MODEL } from './models.js';

const ENABLED = process.env.RELU_EVAL === '1' && !!process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.RELU_EVAL_MODEL || TEACHING_MODEL;
const JUDGE_MODEL = process.env.RELU_EVAL_JUDGE || 'claude-haiku-4-5-20251001';
const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const THREE_SUM = `Given an integer array nums, return all triplets [nums[i], nums[j], nums[k]] such that i != j != k and nums[i] + nums[j] + nums[k] == 0. The solution set must not contain duplicate triplets.`;

// "sort it first" is the correct FIRST step. The reserved downstream insight — the
// thing the tutor must build WITH the student, not dump on the strength of "sort" — is
// fixing one element and two-pointer scanning the remainder.
const DOWNSTREAM_INSIGHT =
  'After sorting, fix one element nums[i], then use two pointers (left just after i, right at the end) moving inward to find pairs that sum to -nums[i], skipping duplicates; this is O(n^2).';
// ONLY the reserved two-pointer SCAN technique + its complexity. NOT "fix one element"
// — that is the legitimate single next step after sorting, exactly what a proportional
// reply is allowed to take. The reserved insight is HOW to find the pair efficiently.
const DOWNSTREAM_SPOILERS = [
  'two pointer', 'two-pointer', 'two pointers', 'left and right', 'left pointer',
  'right pointer', 'move inward', 'moving inward', 'from both ends', 'o(n^2)', 'o(n²)',
];

// A non-companion guided session (web-app paste-to-learn). No companion append, so the
// only pacing doctrine is the one in GUIDED_SYSTEM_PROMPT we just fixed.
const GUIDED_SESSION = { mode: 'guided', companionMode: false };

const wantTools = tools.filter((t) =>
  ['emit_segment', 'conversational_reply', 'send_options'].includes(t.name));

// One guided turn against the real tool set; returns what the model chose to do.
async function guidedTurn(messages) {
  const resp = await client().messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: buildGuidedSystemPrompt(GUIDED_SESSION),
    tools: wantTools,
    messages,
  });
  const uses = resp.content.filter((b) => b.type === 'tool_use');
  const segs = uses.filter((b) => b.name === 'emit_segment');
  const text = uses
    .map((b) => b.input?.narration || b.input?.text || b.input?.prompt || '')
    .join('\n')
    .toLowerCase();
  return { uses, segs, text, names: uses.map((b) => b.name) };
}

const leak = (text, terms) => terms.find((t) => text.includes(t)) || null;

async function judgeDump(text, insight) {
  const resp = await client().messages.create({
    model: JUDGE_MODEL,
    max_tokens: 200,
    system: 'You grade tutoring replies for over-revealing. Answer with strict JSON only.',
    messages: [{
      role: 'user',
      content: `The student just gave a correct FIRST step ("sort the array"). A good tutor confirms it and asks the ONE next question. A bad tutor dumps the rest of the approach.\n\nRESERVED DOWNSTREAM APPROACH (the tutor should NOT hand this over yet):\n"${insight}"\n\nTUTOR REPLY:\n"${text}"\n\nDoes the reply hand over the downstream approach (the two-pointer scan technique and/or its complexity) instead of stopping after confirming "sort" and asking the next question? Confirming sorting and asking a question is GOOD (not a dump). JSON: {"dumps": true|false, "reason": "<one sentence>"}`,
    }],
  });
  const t = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`judge returned no JSON: ${t.slice(0, 200)}`);
  return JSON.parse(m[0]);
}

describe.skipIf(!ENABLED)('PROPORTIONAL RESPONSE — guided mode (the "sort" dump)', () => {
  it('a correct partial ("sort first") earns ONE step + a question, not the full approach', async () => {
    const turn = await guidedTurn([
      { role: 'user', content: buildIntakeUserText(GUIDED_SESSION, THREE_SUM) },
      { role: 'assistant', content: "Before we write anything — looking at 3Sum, what's the first thing you'd do to make finding the triplets more manageable?" },
      { role: 'user', content: 'I think we should sort the array first.' },
    ]);

    // Proportionality: it must not pour out a multi-segment walkthrough on one partial.
    expect(turn.segs.length, `dumped ${turn.segs.length} emit_segments on a partial idea`).toBeLessThanOrEqual(1);

    // It must not reveal the reserved two-pointer SCAN technique (lexical fast-path...).
    const lex = leak(turn.text, DOWNSTREAM_SPOILERS);
    expect(lex, `revealed the two-pointer technique lexically: "${lex}"`).toBe(null);

    // ...and the authoritative judge (catches paraphrase / handing over the approach).
    const verdict = await judgeDump(turn.text, DOWNSTREAM_INSIGHT);
    expect(verdict.dumps, `judge: dumped the approach — ${verdict.reason}`).toBe(false);
  }, 45000);
});

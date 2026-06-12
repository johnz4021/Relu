// Live behavioral eval for STUCK COMPANION MODE (eng D7, Standard suite).
//
// SKIPPED BY DEFAULT — gated on RELU_EVAL=1 + ANTHROPIC_API_KEY so the normal
// `npm test` run needs no network and no key. The deterministic prompt-contract
// evals in guidedAgent.test.js pin the doctrine the model is TOLD; THIS file checks
// the model actually BEHAVES, by running real turns against the assembled companion
// prompt + tools and grading the reply + its self-report.
//
//   Run with:  RELU_EVAL=1 ANTHROPIC_API_KEY=sk-... npx vitest run server/companionMode.eval.test.js
//
// Standard suite (the design's behavior contract):
//   1. turn-1 is a NUDGE, not the solution (asks for the read, no pattern named).
//   2. CRITICAL REGRESSION — after a PARTIAL attempt the reply withholds the key
//      insight (the live "Remove Nth Node" two-pointer leak).
//   3. escalation gradient — specificity rises at most one rung per turn.
//   4. explicit "show me" DOES reveal (the escape hatch works).
//   5. self-report honesty — reveals_key_insight=false must match the text (no leak).
//   6. partial-trace carve-out (eng review 2026-06-09 D8) — an insight-opening trace
//      is never partial-traced under reveals_key_insight=false, and a follow-up viz
//      turn resumes at the first unemitted index (never replays).
//   7. counterexample verify-rule trap (design review 2026-06-09 D5) — when the
//      student's approach is CORRECT and merely violates a constraint (two-pass on a
//      one-pass problem), the model must not draw a fake counterexample or claim the
//      approach gives wrong answers.

import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { buildIntakeUserText, buildGuidedSystemPrompt } from './guidedAgent.js';
import { tools } from './tools.js';
import { TEACHING_MODEL } from './models.js';

const ENABLED = process.env.RELU_EVAL === '1' && !!process.env.ANTHROPIC_API_KEY;
// Production teaching model (models.js); override with RELU_EVAL_MODEL to test candidates.
const MODEL = process.env.RELU_EVAL_MODEL || TEACHING_MODEL;
const conversationalReplyTool = tools.find((t) => t.name === 'conversational_reply');

// ── Two Sum (turn-1 opener) ──────────────────────────────────────────────
const TWO_SUM = `Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target. You may assume exactly one solution, and you may not use the same element twice.`;
const TWO_SUM_SPOILERS = ['hash map', 'hashmap', 'hash table', 'complement', 'two pointer', 'o(n)'];

// ── Remove Nth Node From End (the bug) ───────────────────────────────────
const REMOVE_NTH = `Given the head of a linked list, remove the nth node from the end of the list and return its head. Do it in one pass.`;
// The reserved key insight — what the warm solve would surface; the companion must
// NOT state or paraphrase this until the student derives it or gives up.
const REMOVE_NTH_KEY = 'Use two pointers spaced n nodes apart; advance both until the lead reaches the end, and the trailing pointer is exactly at the node before the one to remove.';
const REMOVE_NTH_SPOILERS = ['two pointer', 'two-pointer', 'two pointers', 'n apart', 'n nodes apart', 'nodes ahead', 'steps ahead', 'head start', 'gap of', 'fast and slow', 'fast/slow', 'lead pointer', 'trailing pointer', 'leader', 'follower'];

// Realistic mid-conversation companion session: warm solve has resolved, so the
// reserved key insight is in the prompt (this is exactly the state at the danger turn).
const COMPANION_SESSION = {
  mode: 'leetcode',
  hasViz: true,
  companionMode: true,
  _leetcodeAlgorithmKey: 'linked_list_two_pointer',
  _leetcodeConfidence: 0.9,
  _leetcodeTier: 1,
  _warmKeyInsight: REMOVE_NTH_KEY,
};

const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Plain-text opening turn (no tools) — used only for the turn-1 opener check.
async function openingText(session, problem) {
  const resp = await client().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: buildGuidedSystemPrompt(session),
    messages: [{ role: 'user', content: buildIntakeUserText(session, problem) }],
  });
  return resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').toLowerCase();
}

// Tool-driven companion turn: forces a conversational_reply so we get both the
// student-facing text AND the self-report fields. Returns { text, ...selfReport }.
async function companionReply(messages) {
  const resp = await client().messages.create({
    model: MODEL,
    max_tokens: 500,
    system: buildGuidedSystemPrompt(COMPANION_SESSION),
    tools: [conversationalReplyTool],
    tool_choice: { type: 'tool', name: 'conversational_reply' },
    messages,
  });
  const use = resp.content.find((b) => b.type === 'tool_use' && b.name === 'conversational_reply');
  if (!use) throw new Error('model did not call conversational_reply');
  return { text: (use.input.text || '').toLowerCase(), ...use.input };
}

const OPENER = "What's your read on this one so far? Even a rough guess at the approach helps.";
const intake = (problem) => buildIntakeUserText(COMPANION_SESSION, problem);
const leaks = (text, terms) => terms.find((t) => text.includes(t)) || null;

describe.skipIf(!ENABLED)('STUCK COMPANION MODE — live behavior eval (Standard)', () => {
  it('1. turn-1 asks for the read and withholds the pattern (Two Sum)', async () => {
    const text = await openingText(
      { mode: 'leetcode', hasViz: true, companionMode: true, _leetcodeAlgorithmKey: 'two_sum', _leetcodeConfidence: 0.95, _leetcodeTier: 1 },
      TWO_SUM,
    );
    expect(text).toContain('?');
    expect(leaks(text, TWO_SUM_SPOILERS), 'opening turn leaked a spoiler term').toBe(null);
  }, 30000);

  it('2. CRITICAL: after a PARTIAL (two-pass) attempt, the reply withholds the key insight', async () => {
    const reply = await companionReply([
      { role: 'user', content: intake(REMOVE_NTH) },
      { role: 'assistant', content: OPENER },
      { role: 'user', content: "I'd first walk the whole list to count its length, then do a second pass and remove the node at position length minus n." },
    ]);
    // The two-pass read is PARTIAL (right idea, wrong frame for one-pass). The reply
    // must NOT hand over the two-pointer gap idea.
    expect(reply.reveals_key_insight, 'flagged a reveal on a partial attempt').not.toBe(true);
    expect(reply.learner_state, 'should not treat a partial attempt as understanding').not.toBe('understands');
    expect(leaks(reply.text, REMOVE_NTH_SPOILERS), 'leaked the two-pointer key insight on a partial attempt').toBe(null);
  }, 30000);

  it('3. escalation gradient: specificity rises at most one rung between stuck turns', async () => {
    const base = [
      { role: 'user', content: intake(REMOVE_NTH) },
      { role: 'assistant', content: OPENER },
      { role: 'user', content: "I'm not sure, I'd probably just loop through it somehow." },
    ];
    const t1 = await companionReply(base);
    const t2 = await companionReply([
      ...base,
      { role: 'assistant', content: t1.text },
      { role: 'user', content: "still stuck, can you give me a bit more?" },
    ]);
    if (typeof t1.specificity_level === 'number' && typeof t2.specificity_level === 'number') {
      expect(t2.specificity_level, 'jumped more than one rung in a single turn').toBeLessThanOrEqual(t1.specificity_level + 1);
    }
    // Neither stuck turn should be a full reveal.
    expect(t1.reveals_key_insight).not.toBe(true);
    expect(t2.reveals_key_insight).not.toBe(true);
  }, 45000);

  it('4. explicit "just show me" → honors the give-up, moves to the reveal', async () => {
    const reply = await companionReply([
      { role: 'user', content: intake(REMOVE_NTH) },
      { role: 'assistant', content: OPENER },
      { role: 'user', content: "I give up, please just show me the answer." },
    ]);
    // HARNESS NOTE: the actual reveal is the VIZ turn (build_example_graph → run_algorithm),
    // but this harness only exposes conversational_reply, so the model can't call viz —
    // it transitions ("let me walk you through it") on this turn. So we assert the
    // intent-to-reveal signal, not the spoiler text: it recognized disengagement and
    // jumped to reveal-level specificity rather than nudging again. The viz reveal path
    // itself is covered by the LeetCode viz tests.
    expect(reply.learner_state, 'did not recognize the give-up').toBe('disengaged');
    const committedToReveal = reply.reveals_key_insight === true || (typeof reply.specificity_level === 'number' && reply.specificity_level >= 4) || leaks(reply.text, REMOVE_NTH_SPOILERS) !== null;
    expect(committedToReveal, 'kept withholding after an explicit give-up').toBe(true);
  }, 30000);

  it('6. partial-trace carve-out: insight-opening trace is never partial-traced as a non-reveal, and the follow-up resumes (never replays)', async () => {
    // eng review 2026-06-09 D8. REMOVE_NTH's trace OPENS with the two-pointer
    // placement — the reserved insight in motion — so the doctrine says: skip the
    // partial-trace rung, go to the full reveal. The failure being pinned: emitting
    // a 2-4 step partial trace of these steps with reveals_key_insight=false (a
    // false self-report and a leak dressed as a bridge rung).
    //
    // Harness extension (D9 item 10): a synthesized run_algorithm tool_use/tool_result
    // pair puts a real trace in context so emit_segment is actually choosable.
    const TRACE = [
      { type: 'init', description: 'Place lead and trail pointers at the head, then advance lead n nodes ahead' },
      { type: 'advance', description: 'Lead is now n ahead — the gap IS the answer structure' },
      { type: 'advance', description: 'Advance both pointers together' },
      { type: 'advance', description: 'Advance both pointers together' },
      { type: 'locate', description: 'Lead hits the end; trail sits just before the target node' },
      { type: 'remove', description: 'Unlink the target node' },
      { type: 'result', description: 'Return head', output: 'list without nth-from-end' },
    ];
    const emitSegmentTool = tools.find((t) => t.name === 'emit_segment');
    const vizTurn = (messages) => client().messages.create({
      model: MODEL,
      max_tokens: 700,
      system: buildGuidedSystemPrompt(COMPANION_SESSION),
      tools: [emitSegmentTool, conversationalReplyTool],
      messages,
    });
    const base = [
      { role: 'user', content: intake(REMOVE_NTH) },
      { role: 'assistant', content: OPENER },
      { role: 'user', content: 'I give up, just show me the answer.' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Alright — let me run it and walk you through what actually happens.' },
          { type: 'tool_use', id: 'toolu_eval_run_algo', name: 'run_algorithm', input: { algorithm: 'linked_list_two_pointer' } },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_eval_run_algo', content: JSON.stringify({ success: true, trace: TRACE, renderer: 'linked' }) }],
      },
    ];

    const first = await vizTurn(base);
    const emit1 = first.content.find((b) => b.type === 'tool_use' && b.name === 'emit_segment');
    const indices1 = emit1?.input?.trace_step_indices || [];
    if (emit1 && indices1.length > 0 && indices1.length < TRACE.length) {
      // Partial trace of an insight-opening trace: only honest as a flagged reveal.
      expect(emit1.input.reveals_key_insight, 'partial-traced the insight-opening steps while claiming no reveal (the D8 false-self-report failure)').toBe(true);
    }

    // Continuation: whatever it emitted, the next viz turn must RESUME, not replay.
    if (emit1 && indices1.length > 0 && indices1.length < TRACE.length) {
      const second = await vizTurn([
        ...base,
        { role: 'assistant', content: [{ type: 'tool_use', id: emit1.id, name: 'emit_segment', input: emit1.input }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: emit1.id, content: JSON.stringify({ success: true, emitted: indices1 }) }] },
        { role: 'user', content: 'ok, keep going.' },
      ]);
      const emit2 = second.content.find((b) => b.type === 'tool_use' && b.name === 'emit_segment');
      const indices2 = emit2?.input?.trace_step_indices || [];
      const replayed = indices2.filter((i) => indices1.includes(i));
      expect(replayed, 'replayed already-emitted trace indices (corrupts stateful mapper replay)').toEqual([]);
    }
  }, 90000);

  it('7. verify-rule trap: a correct-but-constraint-violating approach gets no fake counterexample', async () => {
    // design review 2026-06-09 D5 (verify-or-don't-draw). Two-pass on Remove Nth is
    // CORRECT — no input breaks it; it only violates the one-pass constraint. The
    // failure being pinned: the model "constructs a counterexample" anyway (drawing
    // an input and claiming the approach fails on it), which would demonstrate the
    // tutor isn't listening — the trust-fatal move the doctrine forbids.
    const buildExampleGraphTool = tools.find((t) => t.name === 'build_example_graph');
    const resp = await client().messages.create({
      model: MODEL,
      max_tokens: 600,
      system: buildGuidedSystemPrompt(COMPANION_SESSION),
      tools: [buildExampleGraphTool, conversationalReplyTool].filter(Boolean),
      messages: [
        { role: 'user', content: intake(REMOVE_NTH) },
        { role: 'assistant', content: OPENER },
        { role: 'user', content: "I'd walk the list once to count its length L, then walk again and remove the node at position L minus n. That gives the right node every time, right?" },
      ],
    });
    const reply = resp.content.find((b) => b.type === 'tool_use' && b.name === 'conversational_reply');
    const drew = resp.content.find((b) => b.type === 'tool_use' && b.name === 'build_example_graph');
    // No breaking input exists → the doctrine's escape hatch says don't draw one.
    expect(drew, 'drew a "counterexample" against a correct approach (verify-or-don\'t-draw violation)').toBeUndefined();
    if (reply) {
      const text = (reply.input.text || '').toLowerCase();
      const wrongnessClaims = ['gives the wrong', 'wrong node', 'wrong answer', "doesn't give the right", 'incorrect node', 'fails on'];
      expect(wrongnessClaims.find((c) => text.includes(c)) ?? null, 'claimed a correct approach produces wrong answers').toBe(null);
    }
  }, 30000);

  it('5. self-report honesty: reveals_key_insight=false implies no key-insight text', async () => {
    // Reuse the partial-attempt turn: if the model claims it did not reveal, the text
    // must back that up. Catches the model lying to its own field.
    const reply = await companionReply([
      { role: 'user', content: intake(REMOVE_NTH) },
      { role: 'assistant', content: OPENER },
      { role: 'user', content: "Maybe I sort the list first? Or use a counter as I go?" },
    ]);
    if (reply.reveals_key_insight !== true) {
      expect(leaks(reply.text, REMOVE_NTH_SPOILERS), 'claimed no reveal but the text leaked the key insight').toBe(null);
    }
  }, 30000);
});

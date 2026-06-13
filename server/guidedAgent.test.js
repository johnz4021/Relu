import { describe, it, expect } from 'vitest';
import { computeActiveTools, isOutOfScopeSession, buildIntakeUserText, buildGuidedSystemPrompt } from './guidedAgent.js';
import { companionSelfReport } from './agentLib.js';

// Minimal mock tool list matching the union of tools.js + guidedAgent-specific tools.
// We only assert membership, never invoke any tool, so a tiny shape is enough.
const ALL_TOOLS = [
  { name: 'create_graph' },
  { name: 'create_visualization' },
  { name: 'update_graph' },
  { name: 'run_algorithm' },
  { name: 'build_example_graph' },
  { name: 'run_solver' },
  { name: 'emit_segment' },
  { name: 'conversational_reply' },
  { name: 'send_options' },
  { name: 'lesson_complete' },
  { name: 'highlight_problem_text' }, // companion-only (eng review 2026-06-09 D1)
];

const names = (tools) => new Set(tools.map((t) => t.name));

describe('isOutOfScopeSession', () => {
  // The gate is hasViz === false (set by index.js:537 when neither Tier 1 nor Tier 2
  // is available). This catches BOTH shapes: classifier returned null deliberately,
  // AND classifier returned a non-null key that doesn't resolve to a usable registry
  // entry. The previous gate on _leetcodeAlgorithmKey missed the second case — Haiku
  // routinely invents close-fit names like "valid_sudoku" that aren't registered.
  it('returns true when LC mode and hasViz is false', () => {
    expect(isOutOfScopeSession({ mode: 'leetcode', hasViz: false })).toBe(true);
    expect(isOutOfScopeSession({ mode: 'leetcode', _leetcodeAlgorithmKey: null, hasViz: false })).toBe(true);
    expect(isOutOfScopeSession({ mode: 'leetcode', _leetcodeAlgorithmKey: 'valid_sudoku_invented', hasViz: false })).toBe(true);
  });

  it('returns false for LC mode with viz available', () => {
    expect(isOutOfScopeSession({ mode: 'leetcode', _leetcodeAlgorithmKey: 'dijkstra', hasViz: true })).toBe(false);
  });

  it('returns false for non-LC sessions', () => {
    // Non-LC paths never explicitly set hasViz; the strict === false check ensures
    // undefined doesn't trigger the gate accidentally.
    expect(isOutOfScopeSession({ mode: 'guided' })).toBe(false);
    expect(isOutOfScopeSession({ mode: 'direct', hasViz: false })).toBe(false);
  });
});

describe('computeActiveTools', () => {
  // Tier 3 live viz (always-viz ladder): out-of-scope sessions keep the full viz
  // pipeline — the enforcement ladder rejects invalid improvised actions loudly, so
  // the old Sudoku phantom-narration failure mode is caught at the action layer, not
  // by stripping the tools. Only run_algorithm is filtered (no trace exists to load).
  it('out-of-scope LC session (literal null key): keeps viz pipeline, filters only run_algorithm', () => {
    const session = { mode: 'leetcode', _leetcodeAlgorithmKey: null, hasViz: false };
    const active = names(computeActiveTools(session, ALL_TOOLS));

    expect(active.has('create_graph')).toBe(true);
    expect(active.has('create_visualization')).toBe(true);
    expect(active.has('update_graph')).toBe(true);
    expect(active.has('build_example_graph')).toBe(true);
    expect(active.has('run_algorithm')).toBe(false);

    // The agent must still be able to talk to the user and end the lesson.
    expect(active.has('emit_segment')).toBe(true);
    expect(active.has('conversational_reply')).toBe(true);
    expect(active.has('send_options')).toBe(true);
    expect(active.has('lesson_complete')).toBe(true);
    expect(active.has('run_solver')).toBe(true);
  });

  // Unregistered/low-confidence keys (truthy _leetcodeAlgorithmKey, hasViz false)
  // get the same Tier 3 treatment — only the trace rung is filtered.
  it('LC session with unregistered key: same Tier 3 filter (run_algorithm only)', () => {
    const session = { mode: 'leetcode', _leetcodeAlgorithmKey: 'valid_sudoku', hasViz: false };
    const active = names(computeActiveTools(session, ALL_TOOLS));
    expect(active.has('create_graph')).toBe(true);
    expect(active.has('build_example_graph')).toBe(true);
    expect(active.has('run_algorithm')).toBe(false);
  });

  // eng D3: companion mode off-registry keeps the zero-spoiler STRUCTURE viz
  // (build_example_graph renders the problem's own input — no solving) and filters
  // ONLY the trace rung; the reveal is a hand-built animated walkthrough (Tier 3).
  it('companion off-registry: keeps structure viz, filters only the trace rung', () => {
    const session = { mode: 'leetcode', hasViz: false, companionMode: true };
    const active = names(computeActiveTools(session, ALL_TOOLS));
    expect(active.has('build_example_graph')).toBe(true);
    expect(active.has('create_visualization')).toBe(true);
    expect(active.has('create_graph')).toBe(true);
    expect(active.has('update_graph')).toBe(true);
    // the solution trace cannot load without a registry/generated entry.
    expect(active.has('run_algorithm')).toBe(false);
  });

  it('normal LC session with viz: all tools available except the companion-only highlight', () => {
    const session = { mode: 'leetcode', _leetcodeAlgorithmKey: 'dijkstra', hasViz: true };
    const active = names(computeActiveTools(session, ALL_TOOLS));
    expect(active.has('highlight_problem_text')).toBe(false);
    expect(active.size).toBe(ALL_TOOLS.length - 1);
  });

  it('non-LC guided session: no filtering except the companion-only highlight', () => {
    const session = { mode: 'guided', hasViz: true };
    const active = names(computeActiveTools(session, ALL_TOOLS));
    expect(active.has('highlight_problem_text')).toBe(false);
    expect(active.size).toBe(ALL_TOOLS.length - 1);
  });

  // eng review 2026-06-09 D1 + D9 item 7: the highlight tool is companion-only and
  // must be stripped on BOTH non-companion branches (the out-of-scope filter AND the
  // formerly-untouched in-scope return). Companion keeps it in-scope AND off-registry
  // (page-pointing needs no registry entry).
  describe('highlight_problem_text gating', () => {
    it('companion in-scope: tool present', () => {
      const session = { mode: 'leetcode', _leetcodeAlgorithmKey: 'dijkstra', hasViz: true, companionMode: true };
      expect(names(computeActiveTools(session, ALL_TOOLS)).has('highlight_problem_text')).toBe(true);
    });

    it('companion off-registry: tool present (only the trace rung is filtered)', () => {
      const session = { mode: 'leetcode', hasViz: false, companionMode: true };
      const active = names(computeActiveTools(session, ALL_TOOLS));
      expect(active.has('highlight_problem_text')).toBe(true);
      expect(active.has('run_algorithm')).toBe(false);
    });

    it('non-companion out-of-scope: tool absent', () => {
      const session = { mode: 'leetcode', hasViz: false };
      expect(names(computeActiveTools(session, ALL_TOOLS)).has('highlight_problem_text')).toBe(false);
    });

    // Pin the full non-companion tool list (D9 item 7), the way the prompt is pinned:
    // any future tool that should be companion-only will trip this on leak.
    it('PIN: non-companion in-scope tool list contains no companion-only tools', () => {
      const session = { mode: 'leetcode', _leetcodeAlgorithmKey: 'dijkstra', hasViz: true };
      const active = computeActiveTools(session, ALL_TOOLS).map((t) => t.name);
      expect(active).toEqual(ALL_TOOLS.map((t) => t.name).filter((n) => n !== 'highlight_problem_text'));
    });
  });

  it('does not mutate the input tool list', () => {
    const session = { mode: 'leetcode', hasViz: false };
    const before = ALL_TOOLS.map((t) => t.name);
    computeActiveTools(session, ALL_TOOLS);
    expect(ALL_TOOLS.map((t) => t.name)).toEqual(before);
  });
});

describe('buildIntakeUserText', () => {
  // REGRESSION PIN (iron rule): the non-companion intake text is the contract the
  // existing web-app / paste-to-learn flow depends on. The shared-prompt companion
  // edit (and later the useLessonSession refactor) must NOT perturb these outputs.
  // We pin the full string for the three flows the extraction touches.
  const PROBLEM = 'Given an array nums, return the two indices that sum to target.';
  const STANDARD_TAIL =
    "\n\nFirst, determine if this is a concept/general explanation request or a concrete problem with specific input. If it's a concept request, follow the CONCEPT FLOW — construct your own example and guide the student through it interactively. If it's a concrete problem, start with the STAGE 0 intake question to learn what the student has tried, then check for multiple parts (use send_options if needed), then call run_solver or run_solver_batch — classification is returned in the tool result, proceed directly to teaching.";

  it('plain (non-LC) session: problem text + standard instruction, no LC context', () => {
    const text = buildIntakeUserText({ mode: 'guided' }, PROBLEM);
    expect(text).toBe(
      `Here is the problem the student wants to solve:\n\n${PROBLEM}${STANDARD_TAIL}`,
    );
  });

  it('image-only session: falls back to the attached-image phrasing', () => {
    const text = buildIntakeUserText({ mode: 'guided' }, '');
    expect(text).toBe(
      `See the attached image for the problem the student wants to solve.${STANDARD_TAIL}`,
    );
  });

  it('out-of-scope LC session: emits the TIER 3 LIVE VIZ block + standard instruction', () => {
    const text = buildIntakeUserText({ mode: 'leetcode', hasViz: false }, PROBLEM);
    expect(text).toContain('[LEETCODE MODE — TIER 3 LIVE VIZ]');
    expect(text).toContain('you build it yourself');
    expect(text).toContain('run_algorithm is unavailable');
    // Renderer docs are injected so the agent has the action contract up front.
    expect(text).toContain('RENDERER REFERENCE (array)');
    expect(text.endsWith(STANDARD_TAIL)).toBe(true);
    // No solution-mode/companion framing leaks into the standard path.
    expect(text).not.toContain('[STUCK COMPANION MODE]');
  });

  it('out-of-scope LC session: pattern_renderer steers the recommended renderer + docs', () => {
    const text = buildIntakeUserText(
      { mode: 'leetcode', hasViz: false, _leetcodePatternRenderer: 'table' },
      PROBLEM,
    );
    expect(text).toContain('Recommended renderer: "table"');
    expect(text).toContain('RENDERER REFERENCE (table)');
  });

  // eng D3 + Tier 3: companion off-registry keeps the structure-viz framing and the
  // reveal is a hand-built animated walkthrough, never a text-only one.
  it('companion off-registry: structure-viz framing + hand-built reveal, not text-only', () => {
    const text = buildIntakeUserText({ mode: 'leetcode', hasViz: false, companionMode: true }, PROBLEM);
    expect(text).toContain('[COMPANION — OFF REGISTRY]');
    expect(text).toContain('build_example_graph');
    expect(text).toContain('run_algorithm is unavailable');
    expect(text).toContain('YOU are the trace');
    expect(text).not.toContain('[LEETCODE MODE — TIER 3 LIVE VIZ]');
    expect(text).toContain('[STUCK COMPANION MODE]'); // still the companion instruction
  });

  it('Tier-1 LC session: emits LEETCODE MODE + TIER 1 TRACE + standard instruction', () => {
    const session = {
      mode: 'leetcode',
      hasViz: true,
      _leetcodeAlgorithmKey: 'two_sum',
      _leetcodeConfidence: 0.95,
      _leetcodeTier: 1,
      _leetcodeTrace: [{}, {}, {}],
      _leetcodeRenderer: 'array',
    };
    const text = buildIntakeUserText(session, PROBLEM);
    expect(text).toContain('[LEETCODE MODE] Primary algorithm identified: two_sum (confidence: 0.95)');
    expect(text).toContain('[TIER 1 TRACE] A pre-built trace (3 steps) is available for two_sum (renderer: array)');
    expect(text.endsWith(STANDARD_TAIL)).toBe(true);
    expect(text).not.toContain('[STUCK COMPANION MODE]');
  });

  // The new branch: companion mode swaps the closing instruction for the no-spoiler
  // stuck-helper framing, but leaves the problem text + LC context assembly intact.
  it('companion mode: swaps to the STUCK COMPANION instruction, keeps LC context', () => {
    const session = {
      mode: 'leetcode',
      hasViz: true,
      companionMode: true,
      _leetcodeAlgorithmKey: 'two_sum',
      _leetcodeConfidence: 0.95,
      _leetcodeTier: 1,
      _leetcodeTrace: [{}, {}, {}],
      _leetcodeRenderer: 'array',
    };
    const text = buildIntakeUserText(session, PROBLEM);
    expect(text).toContain('[STUCK COMPANION MODE]');
    expect(text).toContain('Nudge me');
    expect(text).toContain("What's your read on this one so far?");
    // Companion mode must NOT carry the standard STAGE 0 / run_solver-up-front instruction.
    expect(text).not.toContain('STAGE 0 intake question');
    expect(text.endsWith(STANDARD_TAIL)).toBe(false);
    // LC context is preserved regardless of mode.
    expect(text).toContain('[TIER 1 TRACE]');
  });
});

describe('buildGuidedSystemPrompt (eng D7 — prompt-contract eval)', () => {
  // REGRESSION EVAL (eng D7): non-companion sessions must get the base prompt
  // byte-for-byte. The companion edit is a *parameterized* append, so existing
  // web-app teaching is provably unchanged. We pin that the base is a strict
  // prefix of the companion prompt and carries none of the companion markers.
  const base = buildGuidedSystemPrompt({ mode: 'guided' });
  const baseLc = buildGuidedSystemPrompt({ mode: 'leetcode', companionMode: false });
  const companion = buildGuidedSystemPrompt({ mode: 'leetcode', companionMode: true });

  it('non-companion sessions get an identical base prompt regardless of mode', () => {
    expect(baseLc).toBe(base);
    expect(base).not.toContain('[STUCK COMPANION MODE');
    expect(base).not.toContain('NO SPOILERS');
  });

  it('companion prompt is exactly the base prompt PLUS the companion doctrine', () => {
    expect(companion.startsWith(base)).toBe(true);
    expect(companion.length).toBeGreaterThan(base.length);
  });

  // BEHAVIOR EVAL (D2), asserted at the controllable layer — the doctrine the
  // model is told. The three target behaviors map to explicit instructions:
  it('companion doctrine encodes: open with a nudge, not the solution (turn-1)', () => {
    expect(companion).toContain('NO SPOILERS');
    expect(companion).toContain('OPEN BY ASKING FOR THEIR READ');
    expect(companion).toContain('Your first turn is a question, not a hint');
    expect(companion).toContain('do NOT run any solver up front');
  });

  it('companion doctrine encodes: escalate on demand, no hard gate, no visible tiers', () => {
    expect(companion).toContain('NO visible tiers');
    expect(companion).toContain('DO NOT FIGHT THE STUDENT');
    expect(companion).toContain('one rung, or go to the reveal if they explicitly gave up');
  });

  it('companion doctrine encodes: terminal rungs are the visualization ladder (structure → partial trace → full trace)', () => {
    expect(companion).toContain('TERMINAL RUNGS = THE VISUALIZATION LADDER');
    expect(companion).toContain('build_example_graph');
    expect(companion).toContain('run_algorithm');
    expect(companion).toContain('PARTIAL TRACE');
  });

  // eng review 2026-06-09 D8: the partial-trace bridge rung is narrowed so it can
  // never contradict RESERVE THE KEY INSIGHT — setup-steps-only, honest self-report,
  // and resume-at-k transition semantics (re-emitting corrupts stateful mapper replay).
  it('companion doctrine encodes the partial-trace carve-out and resume semantics', () => {
    expect(companion).toContain('SETUP-STEPS-ONLY CARVE-OUT');
    expect(companion).toContain('would be a false self-report');
    expect(companion).toContain('When in doubt, skip');
    expect(companion).toContain('RESUME, NEVER REPLAY');
  });

  // eng review 2026-06-09 D9 item 9: one coherent 1-5 ladder — every artifact
  // (structure view, partial trace, full trace) has an explicit level so the
  // "at most +1" rule stays meaningful.
  it('companion doctrine maps the visual artifacts onto the 1-5 specificity ladder', () => {
    expect(companion).toContain('the structure view sits here');
    expect(companion).toContain('a permitted partial trace sits here');
  });

  // eng-1: the no-spoiler fix doctrine — taxonomy, one-rung pacing, reserve, self-report.
  it('companion doctrine encodes the graduated-escalation fix', () => {
    expect(companion).toContain('READ THE LEARNER EACH TURN');
    expect(companion).toContain('ONE RUNG PER TURN');
    expect(companion).toContain('RESERVE THE KEY INSIGHT');
    expect(companion).toContain('SELF-REPORT EACH TURN');
    // The bug case is named explicitly so the model recognizes it.
    expect(companion).toContain('PARTIAL');
    expect(companion).toContain('is NOT permission to hand over the answer');
  });

  // 2026-06-12 consent-gating (eng+CEO review, supersedes model-paced D1 06-09):
  // specificity never rises uninvited; offers are named and prefer the visual rung;
  // consent semantics are pinned; honoring a give-up is mandatory (Opus baseline
  // failed case 4 by over-withholding — the doctrine now names that failure).
  it('companion doctrine encodes consent-gated escalation', () => {
    expect(companion).toContain('CONSENT-GATED ESCALATION');
    expect(companion).toContain('Specificity NEVER rises uninvited');
    expect(companion).toContain('one CONSENTED rung');
    expect(companion).toContain('NAME what you are');
    expect(companion).toContain('offering the drawing');
    expect(companion).toContain('NOT consent: silence');
    expect(companion).toContain('COUNTS as consent');
    expect(companion).toContain('HONORING CONSENT IS MANDATORY');
    expect(companion).toContain('offer_made');
    expect(companion).toContain('escalation_consented');
  });

  // design review 2026-06-09 (viz-as-hints contract, D2-D6): mid-struggle visuals
  // are permission-gated, verified, co-discovered, borrowed-and-returned, and
  // level-neutral. Five decisions, five pinned phrases.
  it('companion doctrine encodes the mid-struggle visuals contract', () => {
    expect(companion).toContain('MID-STRUGGLE VISUALS (permissions, not obligations)');
    expect(companion).toContain('EARLY STRUCTURE VIEW');
    expect(companion).toContain('COUNTEREXAMPLE INSTANCE');
    expect(companion).toContain('wrong_direction or partial');           // D2 gate
    expect(companion).toContain("VERIFY OR DON'T DRAW");                 // D5
    expect(companion).toContain('CO-DISCOVERY');                         // D4
    expect(companion).toContain('BORROW AND RETURN');                    // D3
    expect(companion).toContain('RULES OF RESTRAINT');                   // D2 never-rules
    expect(companion).toContain('never draw on two consecutive turns');
    expect(companion).toContain('if prose covers it, use prose');        // judgment test inside the gate
    expect(companion).toContain('level-neutral');                        // D6
  });

  // eng review 2026-06-09: page-highlight doctrine — the "point at the input" rung
  // got a dedicated tool; the doctrine governs pacing and the ack-driven fallbacks.
  it('companion doctrine encodes the page-highlight rung and its ack fallbacks', () => {
    expect(companion).toContain('POINT AT THE PAGE (highlight_problem_text)');
    expect(companion).toContain('never restate the highlighted text');
    expect(companion).toContain('failed highlight');
    expect(companion).toContain('visible false');
  });

  // Refinement from the live rotated-array run: the crux ("left++/right--") was TOLD,
  // not drawn out. The doctrine must elicit, and must reserve the CONCRETE form too.
  it('companion doctrine encodes elicit-don\'t-tell + reserves the concrete operation', () => {
    expect(companion).toContain('ELICIT, DON\'T TELL');
    expect(companion).toContain('AND SO IS ITS CONCRETE FORM');
    expect(companion).toContain('reveals_key_insight');
  });
});

describe('buildGuidedSystemPrompt — reserved key-insight payload (eng-3)', () => {
  const KEY = 'Use two pointers n apart; when the lead hits the end the trailing pointer is at the target.';

  // The doctrine references the marker "[RESERVED KEY INSIGHT]" by name so the model
  // recognizes it; the actual injected payload is the distinctive "— DO NOT ..." form.
  // Assert on that form (and the payload text) to avoid colliding with the reference.
  const INJECTED = '[RESERVED KEY INSIGHT — DO NOT';

  it('injects the reserved block only once the warm solve has resolved (companion)', () => {
    const before = buildGuidedSystemPrompt({ companionMode: true });
    const after = buildGuidedSystemPrompt({ companionMode: true, _warmKeyInsight: KEY });
    expect(before).not.toContain(INJECTED);
    expect(before).not.toContain(KEY);
    expect(after).toContain(INJECTED);
    expect(after).toContain(KEY);
    expect(after.startsWith(before)).toBe(true); // pure append, doctrine unchanged
  });

  it('never leaks the reserved block into non-companion sessions', () => {
    // Even if a stale _warmKeyInsight rode along, a non-companion session gets the base prompt.
    const text = buildGuidedSystemPrompt({ companionMode: false, _warmKeyInsight: KEY });
    expect(text).not.toContain(INJECTED);
    expect(text).not.toContain(KEY);
  });
});

describe('companionSelfReport (eng-2 — self-report seam)', () => {
  it('returns null when no self-report fields are present (non-companion turns)', () => {
    expect(companionSelfReport({ text: 'hi' })).toBe(null);
    expect(companionSelfReport(undefined)).toBe(null);
  });

  it('normalizes the fields and coerces reveals_key_insight to a boolean', () => {
    expect(companionSelfReport({ learner_state: 'partial', specificity_level: 2 })).toEqual({
      learner_state: 'partial',
      specificity_level: 2,
      reveals_key_insight: false, // absent → false, never accidentally "truthy"
      offer_made: false,
      escalation_consented: false,
    });
    expect(companionSelfReport({ learner_state: 'disengaged', specificity_level: 5, reveals_key_insight: true, escalation_consented: true })).toEqual({
      learner_state: 'disengaged',
      specificity_level: 5,
      reveals_key_insight: true,
      offer_made: false,
      escalation_consented: true,
    });
  });

  // Consent-contract fields (2026-06-12): an offer-only turn is a real self-report
  // even when the legacy trio is absent, and the booleans coerce strictly.
  it('treats offer/consent fields as first-class self-report signals', () => {
    expect(companionSelfReport({ offer_made: true })).toMatchObject({ offer_made: true, escalation_consented: false });
    expect(companionSelfReport({ escalation_consented: 'yes' })).toMatchObject({ escalation_consented: false }); // strict boolean
  });
});

// ── applyClassification: Tier 2 pattern-key targets (N-Queens regression) ────
// The LC override sets target_algorithm = session._leetcodeAlgorithmKey, which in
// Tier 2 sessions is an off-registry pattern key. The registry check must accept
// it (the generated trace exists) while still rejecting solver hallucinations.
import { applyClassification } from './guidedAgent.js';

describe('applyClassification — off-registry targets', () => {
  const fakeWs = { OPEN: 1, readyState: 1, send: () => {} };

  it('accepts the session pattern key as an execution target (Tier 2)', () => {
    const session = {
      _leetcodeAlgorithmKey: 'n_queens_backtracking',
      _leetcodePatternKey: 'n_queens_backtracking',
      _leetcodeRenderer: 'graph',
    };
    const result = applyClassification(
      { reasoning_mode: 'algorithm_execution', is_in_scope: true, target_algorithm: 'n_queens_backtracking' },
      session, fakeWs, null,
    );
    expect(result.success).toBe(true);
    // Renderer docs come from the generated trace's renderer, not the 'graph' default.
    expect(result.message).toContain('RENDERER REFERENCE (graph)');
  });

  it('still rejects an off-registry target that is not the session pattern key', () => {
    const result = applyClassification(
      { reasoning_mode: 'algorithm_execution', is_in_scope: true, target_algorithm: 'made_up_algorithm' },
      {}, fakeWs, null,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown algorithm: made_up_algorithm');
  });
});

// ── ISSUE-006: intake-verdict guard (Koko mid-lesson rebind) ─────────────────
// Intake is routing ground truth. When it classified a problem OFF-registry
// (pattern key set, no registry algorithm key — Tier 3), a mid-lesson solver
// that rebinds to a DIFFERENT registry key (LC875 "binary search on answer" →
// the registry's target-search `binary_search`) must be refused: the lesson
// stays in the hand-built out-of-scope branch, not a contradictory canned trace.
describe('applyClassification — ISSUE-006 intake-verdict guard', () => {
  const fakeWs = { OPEN: 1, readyState: 1, send: () => {} };

  it('off-registry intake + solver rebind to a registry key → refused, routed to hand-built branch', () => {
    const session = {
      _leetcodeAlgorithmKey: null,                  // intake: NO registry match
      _leetcodePatternKey: 'binary_search_on_answer', // intake: pattern key (Tier 3)
    };
    const result = applyClassification(
      { reasoning_mode: 'algorithm_execution', is_in_scope: true, target_algorithm: 'binary_search' },
      session, fakeWs, null,
    );
    expect(result.success).toBe(true);
    // Pinned to the out-of-scope (build-it-yourself) message, NOT the load-the-trace one.
    expect(result.message).toContain('no registered trace exists');
    expect(result.message).toContain('Do NOT call run_algorithm');
    // Plan was rewritten: out of scope, near-miss recorded, target back to the pattern key.
    expect(session.sessionPlan.is_in_scope).toBe(false);
    expect(session.sessionPlan.closest_algorithm).toBe('binary_search');
    expect(session.sessionPlan.target_algorithm).toBe('binary_search_on_answer');
  });

  it('does NOT fire when the rebind matches the session pattern key (legit Tier 2)', () => {
    const session = {
      _leetcodeAlgorithmKey: null,
      _leetcodePatternKey: 'binary_search', // intake pattern key happens to be a registry name
    };
    const result = applyClassification(
      { reasoning_mode: 'algorithm_execution', is_in_scope: true, target_algorithm: 'binary_search' },
      session, fakeWs, null,
    );
    expect(result.success).toBe(true);
    expect(session.sessionPlan.is_in_scope).toBe(true); // unchanged
  });

  it('does NOT downgrade a legitimate Tier 1 session (intake set a registry algorithm key)', () => {
    const session = {
      _leetcodeAlgorithmKey: 'two_pointers',   // intake: ON-registry (Tier 1)
      _leetcodePatternKey: null,
    };
    const result = applyClassification(
      { reasoning_mode: 'algorithm_execution', is_in_scope: true, target_algorithm: 'two_pointers' },
      session, fakeWs, null,
    );
    expect(result.success).toBe(true);
    expect(session.sessionPlan.is_in_scope).toBe(true);
    expect(session.sessionPlan.target_algorithm).toBe('two_pointers');
  });

  it('does NOT fire in a plain (non-LeetCode) guided session', () => {
    const session = {}; // neither key set
    const result = applyClassification(
      { reasoning_mode: 'algorithm_execution', is_in_scope: true, target_algorithm: 'binary_search' },
      session, fakeWs, null,
    );
    expect(result.success).toBe(true);
    expect(session.sessionPlan.is_in_scope).toBe(true);
  });
});

// ── ISSUE-006: buildSolverContext does not name a wrong registry key ─────────
import { buildGuidedSystemPrompt as _bgsp } from './guidedAgent.js';
describe('solver context naming (ISSUE-006)', () => {
  it('off-registry intake → the system prompt does not steer toward the rebound registry key', () => {
    // Drive the real intake path: an off-registry session whose solver guessed binary_search.
    const session = {
      mode: 'leetcode',
      _leetcodeAlgorithmKey: null,
      _leetcodePatternKey: 'binary_search_on_answer',
      sessionPlan: { is_in_scope: false, target_algorithm: 'binary_search_on_answer' },
    };
    applyClassification(
      { reasoning_mode: 'algorithm_execution', is_in_scope: true, target_algorithm: 'binary_search',
        approach: 'binary search on the answer space', complexity: 'O(n log m)', keyInsight: 'k', solution: 's' },
      session, { OPEN: 1, readyState: 1, send: () => {} }, null,
    );
    // After the guard, the adopted plan must not name binary_search as the bound algorithm.
    expect(session.sessionPlan.target_algorithm).toBe('binary_search_on_answer');
  });
});

// ── applyClassification: Tier 2 pattern-key targets (N-Queens regression) ────
// The LC override sets target_algorithm = session._leetcodeAlgorithmKey, which in
// Tier 2 sessions is an off-registry pattern key. The registry check must accept
// it (the generated trace exists) while still rejecting solver hallucinations.
import { applyClassification } from './guidedAgent.js';

describe('applyClassification — off-registry targets', () => {
  const fakeWs = { OPEN: 1, readyState: 1, send: () => {} };

  it('accepts the session pattern key as an execution target (Tier 2)', () => {
    const session = {
      _leetcodeAlgorithmKey: 'n_queens_backtracking',
      _leetcodePatternKey: 'n_queens_backtracking',
      _leetcodeRenderer: 'graph',
    };
    const result = applyClassification(
      { reasoning_mode: 'algorithm_execution', is_in_scope: true, target_algorithm: 'n_queens_backtracking' },
      session, fakeWs, null,
    );
    expect(result.success).toBe(true);
    // Renderer docs come from the generated trace's renderer, not the 'graph' default.
    expect(result.message).toContain('RENDERER REFERENCE (graph)');
  });

  it('still rejects an off-registry target that is not the session pattern key', () => {
    const result = applyClassification(
      { reasoning_mode: 'algorithm_execution', is_in_scope: true, target_algorithm: 'made_up_algorithm' },
      {}, fakeWs, null,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown algorithm: made_up_algorithm');
  });
});

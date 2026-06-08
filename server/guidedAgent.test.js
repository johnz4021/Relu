import { describe, it, expect } from 'vitest';
import { computeActiveTools, isOutOfScopeSession, buildIntakeUserText, buildGuidedSystemPrompt } from './guidedAgent.js';

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
  // Regression target: the Sudoku console log showed `create_graph` called with
  // empty nodes/edges + segment_start with viz_actions:[] + narration referencing
  // Sudoku cells that never reached the canvas. Filtering the pipeline at the tool
  // layer makes that sequence structurally impossible regardless of prompt drift.
  it('out-of-scope LC session (literal null key): filters the full viz pipeline', () => {
    const session = { mode: 'leetcode', _leetcodeAlgorithmKey: null, hasViz: false };
    const active = names(computeActiveTools(session, ALL_TOOLS));

    expect(active.has('create_graph')).toBe(false);
    expect(active.has('create_visualization')).toBe(false);
    expect(active.has('update_graph')).toBe(false);
    expect(active.has('run_algorithm')).toBe(false);
    expect(active.has('build_example_graph')).toBe(false);

    // The agent must still be able to talk to the user and end the lesson.
    expect(active.has('emit_segment')).toBe(true);
    expect(active.has('conversational_reply')).toBe(true);
    expect(active.has('send_options')).toBe(true);
    expect(active.has('lesson_complete')).toBe(true);
    expect(active.has('run_solver')).toBe(true);
  });

  // The variant that bit me in the smoke test: Haiku picked a plausible-looking
  // name that isn't in the registry, so _leetcodeAlgorithmKey is truthy but hasViz
  // is false. The gate must catch this too — not just literal-null keys.
  it('LC session with unregistered key (Haiku invention): also filters viz pipeline', () => {
    const session = { mode: 'leetcode', _leetcodeAlgorithmKey: 'valid_sudoku', hasViz: false };
    const active = names(computeActiveTools(session, ALL_TOOLS));
    expect(active.has('create_graph')).toBe(false);
    expect(active.has('build_example_graph')).toBe(false);
    expect(active.has('run_algorithm')).toBe(false);
  });

  // eng D3: companion mode off-registry keeps the zero-spoiler STRUCTURE viz
  // (build_example_graph renders the problem's own input — no solving) and filters
  // ONLY the trace rung, which degrades to a text reveal.
  it('companion off-registry: keeps structure viz, filters only the trace rung', () => {
    const session = { mode: 'leetcode', hasViz: false, companionMode: true };
    const active = names(computeActiveTools(session, ALL_TOOLS));
    expect(active.has('build_example_graph')).toBe(true);
    expect(active.has('create_visualization')).toBe(true);
    expect(active.has('create_graph')).toBe(true);
    expect(active.has('update_graph')).toBe(true);
    // the solution trace cannot load without a registry entry → degrade to text.
    expect(active.has('run_algorithm')).toBe(false);
  });

  it('normal LC session with viz: all tools available', () => {
    const session = { mode: 'leetcode', _leetcodeAlgorithmKey: 'dijkstra', hasViz: true };
    const active = names(computeActiveTools(session, ALL_TOOLS));
    expect(active.size).toBe(ALL_TOOLS.length);
  });

  it('non-LC guided session: no filtering', () => {
    const session = { mode: 'guided', hasViz: true };
    const active = names(computeActiveTools(session, ALL_TOOLS));
    expect(active.size).toBe(ALL_TOOLS.length);
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

  it('out-of-scope LC session: emits the OUT OF SCOPE block + standard instruction', () => {
    const text = buildIntakeUserText({ mode: 'leetcode', hasViz: false }, PROBLEM);
    expect(text).toContain('[LEETCODE MODE — OUT OF SCOPE]');
    expect(text).toContain('no visualization is available');
    expect(text.endsWith(STANDARD_TAIL)).toBe(true);
    // No solution-mode/companion framing leaks into the standard path.
    expect(text).not.toContain('[STUCK COMPANION MODE]');
  });

  // eng D3: companion off-registry must NOT claim "no viz available" (the standard
  // out-of-scope text) — the structure viz works; only the trace degrades to text.
  it('companion off-registry: structure-viz-works framing, not the no-viz block', () => {
    const text = buildIntakeUserText({ mode: 'leetcode', hasViz: false, companionMode: true }, PROBLEM);
    expect(text).toContain('[COMPANION — OFF REGISTRY]');
    expect(text).toContain('build_example_graph');
    expect(text).toContain('run_algorithm is unavailable');
    expect(text).not.toContain('[LEETCODE MODE — OUT OF SCOPE]');
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

  it('companion doctrine encodes: escalate conversationally, on demand, no hard gate', () => {
    expect(companion).toContain('ESCALATE CONVERSATIONALLY — NO HARD GATE, NO VISIBLE TIERS');
    expect(companion).toContain('DO NOT FIGHT THE STUDENT');
    expect(companion).toContain('escalate immediately');
  });

  it('companion doctrine encodes: terminal rung is the visualization (structure then trace)', () => {
    expect(companion).toContain('TERMINAL RUNG = THE VISUALIZATION');
    expect(companion).toContain('build_example_graph');
    expect(companion).toContain('run_algorithm');
  });
});

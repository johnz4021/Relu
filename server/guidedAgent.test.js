import { describe, it, expect } from 'vitest';
import { computeActiveTools, isOutOfScopeSession } from './guidedAgent.js';

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

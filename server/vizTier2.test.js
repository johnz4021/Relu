// Tier 2 off-registry run_algorithm (always-viz ladder): an algorithm key with NO
// registry entry must flow through runAlgorithmWithFallback (author-agent path),
// auto-configure panels from the GENERATED renderer, and register the
// algorithm_state fallback panel for context traces so embedded viz_actions land.

import { describe, it, expect, vi } from 'vitest';

vi.mock('./tts.js', () => ({
  synthesizeAndStream: vi.fn(async () => ({})),
  resetTTSDisabled: vi.fn(),
}));

// Stub the registry: empty ALGORITHMS (every key is off-registry) and a fallback
// that returns a small Tier 2 context trace with embedded viz_actions — the shape
// authorAgent-generated code produces.
vi.mock('./algorithms/registry.js', () => {
  const TIER2_TRACE = [
    {
      type: 'init',
      description: 'Start with an empty product accumulator',
      viz_actions: [{
        renderer: 'context', action: 'update',
        params: { panel_id: 'algorithm_state', entries: [] },
      }],
    },
    {
      type: 'update',
      description: 'Prefix pass fills left products',
      viz_actions: [{
        renderer: 'context', action: 'update',
        params: { panel_id: 'algorithm_state', entries: [{ key: 'prefix', value: '1, 1, 2, 6', status: 'updated' }] },
      }],
    },
    {
      type: 'result',
      description: 'Answer assembled',
      output: '[24,12,8,6]',
      viz_actions: [{
        renderer: 'context', action: 'update',
        params: { panel_id: 'algorithm_state', entries: [{ key: 'result', value: '24, 12, 8, 6', status: 'updated' }] },
      }],
    },
  ];
  return {
    ALGORITHMS: {},
    runAlgorithmWithFallback: vi.fn(async (id, input) => ({
      trace: TIER2_TRACE, renderer: 'context', input, tier: 2,
    })),
    runRegisteredAlgorithm: vi.fn(),
  };
});

import { handleToolCall } from './agentLib.js';
import { runAlgorithmWithFallback } from './algorithms/registry.js';

function fakeSession(extra = {}) {
  const sent = [];
  return {
    sent,
    ws: { OPEN: 1, readyState: 1, send: (s) => sent.push(JSON.parse(s)) },
    speedMultiplier: 1,
    ...extra,
  };
}

describe('run_algorithm — off-registry key (Tier 2 path)', () => {
  it('runs the fallback, stores the trace, and registers the algorithm_state panel', async () => {
    const s = fakeSession({ _leetcodeTitle: 'Product of Array Except Self', _leetcodePatternKey: 'product_except_self', _leetcodeTestCase: { nums: [1, 2, 3, 4] } });
    const result = await handleToolCall(
      s,
      { name: 'run_algorithm', input: { algorithm: 'product_except_self' } },
      null, null, null,
    );

    expect(result.success).toBe(true);
    expect(result.tier).toBe(2);
    expect(result.step_count).toBe(3);
    expect(s.currentTrace).toHaveLength(3);
    expect(s.currentRenderer).toBe('context');
    // No PANEL_DEFAULTS entry exists for a pattern key — the algorithm_state
    // fallback panel must be auto-registered or embedded viz_actions get stripped.
    expect(result.context_panels).toContain('algorithm_state');
    expect(s._panels?.algorithm_state).toBeDefined();
  });

  it('defaults empty agent input to the parsed LC test case', async () => {
    const s = fakeSession({ _leetcodePatternKey: 'product_except_self', _leetcodeTestCase: { nums: [1, 2, 3, 4] } });
    await handleToolCall(
      s,
      { name: 'run_algorithm', input: { algorithm: 'product_except_self' } },
      null, null, null,
    );
    const callInput = runAlgorithmWithFallback.mock.calls.at(-1)[1];
    expect(callInput).toEqual({ nums: [1, 2, 3, 4] });
  });

  // Regression (N-Queens incident 2026-06-11): a hallucinated/misspelled off-registry
  // key must be rejected server-side — the tool schema no longer has an enum, and an
  // unknown key would otherwise trigger a 20-60s authoring call mid-lesson.
  it('rejects an off-registry key that is not the session pattern key', async () => {
    const s = fakeSession({ _leetcodePatternKey: 'product_except_self' });
    const result = await handleToolCall(
      s,
      { name: 'run_algorithm', input: { algorithm: 'product_except_slef' } },
      null, null, null,
    );
    expect(result.error).toContain("Unknown algorithm 'product_except_slef'");
    expect(result.error).toContain("pattern key 'product_except_self'");
    expect(runAlgorithmWithFallback).not.toHaveBeenCalledWith('product_except_slef', expect.anything(), expect.anything());
  });

  // Regression (N-Queens incident 2026-06-11): the pre-run trace must be REUSED, not
  // regenerated — regeneration stalls the lesson and can paint a different trace than
  // the one lc_viz_ready already showed the student.
  it('reuses the pre-run Tier 2 trace instead of regenerating', async () => {
    const storedTrace = [
      { type: 'init', description: 'stored', viz_actions: [{ renderer: 'context', action: 'update', params: { panel_id: 'algorithm_state', entries: [] } }] },
      { type: 'result', description: 'stored', output: 'x' },
    ];
    const s = fakeSession({
      _leetcodeTier: 2,
      _leetcodeAlgorithmKey: 'product_except_self',
      _leetcodePatternKey: 'product_except_self',
      _leetcodeTrace: storedTrace,
      _leetcodeRenderer: 'context',
      _leetcodeInput: { nums: [1, 2, 3, 4] },
    });
    const callsBefore = runAlgorithmWithFallback.mock.calls.length;
    const result = await handleToolCall(
      s,
      { name: 'run_algorithm', input: { algorithm: 'product_except_self' } },
      null, null, null,
    );
    expect(result.success).toBe(true);
    expect(result.step_count).toBe(2);
    expect(s.currentTrace).toBe(storedTrace);
    expect(runAlgorithmWithFallback.mock.calls.length).toBe(callsBefore); // no regeneration
  });

  it('emit_segment delivers the Tier 2 embedded viz_actions end-to-end', async () => {
    const s = fakeSession({ _leetcodePatternKey: 'product_except_self', _leetcodeTestCase: { nums: [1, 2, 3, 4] } });
    await handleToolCall(
      s,
      { name: 'run_algorithm', input: { algorithm: 'product_except_self' } },
      null, null, null,
    );
    const result = await handleToolCall(
      s,
      { name: 'emit_segment', input: { narration: 'Prefix pass.', trace_step_indices: [0, 1] } },
      null, null, null,
    );
    expect(result.success).toBe(true);
    const seg = s.sent.find((m) => m.type === 'segment_start');
    expect(seg.viz_actions.length).toBeGreaterThanOrEqual(2);
    expect(seg.viz_actions.every((a) => a.action === 'update')).toBe(true);
  });
});

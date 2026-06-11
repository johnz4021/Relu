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
    const s = fakeSession({ _leetcodeTitle: 'Product of Array Except Self', _leetcodeTestCase: { nums: [1, 2, 3, 4] } });
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
    const s = fakeSession({ _leetcodeTestCase: { nums: [1, 2, 3, 4] } });
    await handleToolCall(
      s,
      { name: 'run_algorithm', input: { algorithm: 'product_except_self' } },
      null, null, null,
    );
    const callInput = runAlgorithmWithFallback.mock.calls.at(-1)[1];
    expect(callInput).toEqual({ nums: [1, 2, 3, 4] });
  });

  it('emit_segment delivers the Tier 2 embedded viz_actions end-to-end', async () => {
    const s = fakeSession({ _leetcodeTestCase: { nums: [1, 2, 3, 4] } });
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

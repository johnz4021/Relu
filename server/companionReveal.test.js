// Companion reveal — fresh panel mount (viz-reset bug, 2026-06-17).
//
// In the "Nudge me" overlay, the student gets a visual HINT, then gives up. The
// terminal walkthrough must start on a CLEAN renderer instance, not the hint's —
// otherwise stale overlays carry over (the reproduced bug: an orphaned pointer
// stranded at the canvas origin). In companion mode, run_algorithm only ever fires
// at the terminal reveal, so it re-declares the existing panel with a bumped
// `mountKey` (client remounts a fresh instance) instead of the `panels:[]` preserve.
// Outside companion mode the preserve path stays, so normal lessons keep their
// renderer snapshot state.

import { describe, it, expect, vi } from 'vitest';

vi.mock('./tts.js', () => ({
  synthesizeAndStream: vi.fn(async () => ({})),
  resetTTSDisabled: vi.fn(),
}));

// Empty registry → every key is off-registry; the fallback returns a small ARRAY
// trace so run_algorithm takes the non-graph panel-mounting branch (the one with the
// preserve-vs-remount decision).
vi.mock('./algorithms/registry.js', () => ({
  ALGORITHMS: {},
  runAlgorithmWithFallback: vi.fn(async (id, input) => ({
    trace: [
      { type: 'init', array: [1, 2, 4, 7], description: 'start' },
      { type: 'result', array: [1, 2, 4, 7], description: 'done', output: 'x' },
    ],
    renderer: 'array',
    input,
    tier: 2,
  })),
  runRegisteredAlgorithm: vi.fn(),
}));

import { handleToolCall } from './agentLib.js';

function fakeSession(extra = {}) {
  const sent = [];
  return {
    sent,
    ws: { OPEN: 1, readyState: 1, send: (s) => sent.push(JSON.parse(s)) },
    speedMultiplier: 1,
    _leetcodePatternKey: 'demo_array',
    _leetcodeTestCase: { nums: [1, 2, 4, 7] },
    // The hint already mounted a named array panel mid-struggle.
    _panels: { array_main: { renderer: 'array', type: 'renderer' } },
    ...extra,
  };
}

const runIt = (s) => handleToolCall(s, { name: 'run_algorithm', input: { algorithm: 'demo_array' } }, null, null, null);

describe('run_algorithm — companion reveal mounts a FRESH panel', () => {
  it('companion mode + existing hint panel → re-declares the panel with a bumped mountKey (remount, not preserve)', async () => {
    const s = fakeSession({ companionMode: true });
    const result = await runIt(s);

    expect(result.success).toBe(true);
    // The reveal re-declares the panel (non-empty) with a mountKey so the client
    // remounts a clean instance instead of painting on the hint.
    expect(s._panelMountKey).toBe(1);
    expect(s._lastVizMessage.panels).toHaveLength(1);
    expect(s._lastVizMessage.panels[0].id).toBe('array_main'); // same id → routing intact
    expect(s._lastVizMessage.panels[0].mountKey).toBe(1);
  });

  it('NON-companion + existing panel → preserves the panel (panels:[], no mountKey) — snapshot-safe', async () => {
    const s = fakeSession({ companionMode: false });
    await runIt(s);

    // Preserve path: no remount, no mountKey bump.
    expect(s._panelMountKey).toBeUndefined();
    // The create_visualization the handler sent must carry an EMPTY panels array.
    const viz = s.sent.filter((m) => m.type === 'create_visualization').at(-1);
    expect(viz).toBeDefined();
    expect(viz.panels).toEqual([]);
  });

  it('companion mode but NO prior hint panel → mounts fresh once, no spurious remount key', async () => {
    const s = fakeSession({ companionMode: true, _panels: {} });
    await runIt(s);

    // Nothing to carry over → ordinary fresh mount, no mountKey churn.
    expect(s._panelMountKey).toBeUndefined();
    const viz = s.sent.filter((m) => m.type === 'create_visualization').at(-1);
    expect(viz.panels).toHaveLength(1);
    expect(viz.panels[0].mountKey).toBeUndefined();
  });
});

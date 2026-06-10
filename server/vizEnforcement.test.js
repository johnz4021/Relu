// Integration tests for the viz_action enforcement ladder inside emit_segment
// (agentLib.js): panel registry → manifest schema (vizValidator.js) → graph node ids,
// with loud failure when the model's entire viz payload is invalid.

import { describe, it, expect, vi } from 'vitest';

vi.mock('./tts.js', () => ({
  synthesizeAndStream: vi.fn(async () => ({})),
  resetTTSDisabled: vi.fn(),
}));

import { handleToolCall } from './agentLib.js';

function fakeSession(extra = {}) {
  const sent = [];
  return {
    sent,
    ws: { OPEN: 1, readyState: 1, send: (s) => sent.push(JSON.parse(s)) },
    speedMultiplier: 1,
    ...extra,
  };
}

const emit = (session, input) =>
  handleToolCall(session, { name: 'emit_segment', input }, null, null, null);

const segmentStarts = (s) => s.sent.filter((m) => m.type === 'segment_start');

describe('emit_segment manual viz_actions — enforcement ladder', () => {
  it('FAILS the tool call when every supplied action is invalid (nothing else carries the segment)', async () => {
    const s = fakeSession({ _panels: { array_main: { renderer: 'array', type: 'renderer' } } });
    const result = await emit(s, {
      narration: 'Watch the bars light up.',
      viz_actions: [{ renderer: 'array', action: 'paint_bars', params: { indices: [0, 1] } }],
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('Segment NOT delivered');
    expect(result.message).toContain("'paint_bars' is not a valid action for renderer 'array'");
    expect(segmentStarts(s)).toHaveLength(0); // no narration sent pointing at a blank panel
  });

  it('delivers valid actions and surfaces precise warnings for stripped ones', async () => {
    const s = fakeSession({ _panels: { array_main: { renderer: 'array', type: 'renderer' } } });
    const result = await emit(s, {
      narration: 'Compare the first two.',
      viz_actions: [
        { renderer: 'array', action: 'highlight', params: { indices: [0, 1] } },
        { renderer: 'array', action: 'paint_bars', params: {} },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.message).toContain('WARNINGS');
    expect(result.message).toContain('paint_bars');
    const seg = segmentStarts(s)[0];
    expect(seg.viz_actions).toHaveLength(1);
    expect(seg.viz_actions[0]).toMatchObject({ renderer: 'array_main', action: 'highlight' });
  });

  it('repairs bare type → panel id AND param aliases in one pass (data→values)', async () => {
    const s = fakeSession({ _panels: { array_main: { renderer: 'array', type: 'renderer' } } });
    const result = await emit(s, {
      narration: 'Here is our counterexample input.',
      viz_actions: [{ renderer: 'array', action: 'set_data', params: { data: [4, 5, 6, 7, 0, 1, 2] } }],
    });
    expect(result.success).toBe(true);
    const seg = segmentStarts(s)[0];
    expect(seg.viz_actions[0]).toEqual({
      renderer: 'array_main',
      action: 'set_data',
      params: { values: [4, 5, 6, 7, 0, 1, 2] },
    });
  });

  it('add_node introduces a legal highlight target, within and across segments', async () => {
    const s = fakeSession({
      _panels: { graph_main: { renderer: 'graph', type: 'renderer' } },
      currentGraph: { nodes: [{ id: 'a' }, { id: 'b' }], edges: [] },
    });
    const first = await emit(s, {
      narration: 'Add a new node and look at it.',
      viz_actions: [
        { renderer: 'graph_main', action: 'add_node', params: { id: 'c', label: 'C' } },
        { renderer: 'graph_main', action: 'highlight_node', params: { node: 'c', className: 'current' } },
      ],
    });
    expect(first.success).toBe(true);
    expect(first.message).not.toContain('WARNINGS');
    expect(segmentStarts(s)[0].viz_actions).toHaveLength(2);

    // Cross-segment: 'c' persists in session._addedNodeIds
    const second = await emit(s, {
      narration: 'Still focused on the new node.',
      viz_actions: [{ renderer: 'graph_main', action: 'mark_current', params: { node: 'c' } }],
    });
    expect(second.success).toBe(true);
    expect(second.message).not.toContain('WARNINGS');
  });

  it('still strips highlights of genuinely unknown graph nodes', async () => {
    const s = fakeSession({
      _panels: { graph_main: { renderer: 'graph', type: 'renderer' } },
      currentGraph: { nodes: [{ id: 'a' }], edges: [] },
    });
    const result = await emit(s, {
      narration: 'Look at z.',
      viz_actions: [{ renderer: 'graph_main', action: 'highlight_node', params: { node: 'z' } }],
    });
    expect(result.success).toBe(false); // sole action invalid → loud failure
    expect(result.message).toContain("node 'z' not found");
  });

  it('narration-only segments are unaffected', async () => {
    const s = fakeSession();
    const result = await emit(s, { narration: 'Just talking, no viz.' });
    expect(result.success).toBe(true);
    expect(segmentStarts(s)).toHaveLength(1);
  });
});

describe('emit_segment Tier 2 embedded viz_actions — schema check', () => {
  it('strips invalid embedded actions with a per-step warning, delivers the rest', async () => {
    const s = fakeSession({
      _panels: { algorithm_state: { renderer: 'context', type: 'context' } },
      currentRenderer: 'context',
      currentTrace: [
        {
          type: 'init',
          viz_actions: [
            { renderer: 'context', action: 'update', params: { panel_id: 'algorithm_state', entries: [] } },
            { renderer: 'context', action: 'set_entries', params: { panel_id: 'algorithm_state' } },
          ],
        },
      ],
    });
    const result = await emit(s, { narration: 'Initialize the map.', trace_step_indices: [0] });
    expect(result.success).toBe(true);
    expect(result.message).toContain('trace step 0');
    expect(result.message).toContain('set_entries');
    const seg = segmentStarts(s)[0];
    expect(seg.viz_actions).toHaveLength(1);
    expect(seg.viz_actions[0].action).toBe('update');
  });

  it('is lenient about renderers it cannot resolve (partial Tier 2 registries)', async () => {
    const s = fakeSession({
      currentRenderer: 'string',
      _rendererPanelId: 'string_main',
      currentTrace: [
        {
          type: 'window',
          viz_actions: [{ renderer: 'string_main', action: 'set_window', params: { start: 0, end: 2 } }],
        },
      ],
    });
    // string_main isn't in any registry (no _panels at all) — must NOT be stripped.
    const result = await emit(s, { narration: 'Slide the window.', trace_step_indices: [0] });
    expect(result.success).toBe(true);
    expect(segmentStarts(s)[0].viz_actions).toHaveLength(1);
  });
});

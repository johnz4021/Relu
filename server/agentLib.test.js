import { describe, it, expect } from 'vitest';
import { validatePanelIds, companionSelfReport } from './agentLib.js';

// Registry shape mirrors registerPanels(): keyed by panel id, value {renderer, type}.
const arrayRegistry = { array_main: { renderer: 'array', type: 'renderer' } };

describe('validatePanelIds — renderer-type alias (blank-viz regression)', () => {
  // THE BUG: build_example_graph registers panel id "array_main"; the model (per the
  // emit_segment tool description) emits improvised viz_actions targeting bare "array".
  // Before the fix these were stripped ("renderer 'array' not declared") → blank panel.
  it('aliases a bare renderer type to its sole registered panel id', () => {
    const { valid, warnings } = validatePanelIds(
      [{ renderer: 'array', action: 'set_data', params: { values: [1, 1, 0, 1] } }],
      arrayRegistry,
    );
    expect(warnings).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0].renderer).toBe('array_main'); // rewritten, not dropped
    expect(valid[0].params).toEqual({ values: [1, 1, 0, 1] }); // payload untouched
  });

  it('leaves an exact panel-id target unchanged', () => {
    const { valid, warnings } = validatePanelIds(
      [{ renderer: 'array_main', action: 'highlight', params: { indices: [2] } }],
      arrayRegistry,
    );
    expect(warnings).toEqual([]);
    expect(valid[0].renderer).toBe('array_main');
  });

  it('still strips an unknown renderer type (no panel of that type)', () => {
    const { valid, warnings } = validatePanelIds(
      [{ renderer: 'tree', action: 'set_data' }],
      arrayRegistry,
    );
    expect(valid).toHaveLength(0);
    expect(warnings[0]).toContain("renderer 'tree' not declared");
  });

  it('does NOT guess when a renderer type is ambiguous (>1 panel of that type)', () => {
    const twoArrays = {
      array_left: { renderer: 'array', type: 'renderer' },
      array_right: { renderer: 'array', type: 'renderer' },
    };
    const { valid, warnings } = validatePanelIds([{ renderer: 'array', action: 'set_data' }], twoArrays);
    expect(valid).toHaveLength(0);
    expect(warnings[0]).toContain('ambiguous');
    expect(warnings[0]).toContain('array_left');
  });

  it('validates context updates by panel_id (unchanged behavior)', () => {
    const reg = { log: { renderer: 'context', type: 'context' } };
    const ok = validatePanelIds([{ renderer: 'context', action: 'update', params: { panel_id: 'log', entries: [] } }], reg);
    expect(ok.warnings).toEqual([]);
    expect(ok.valid).toHaveLength(1);
    const bad = validatePanelIds([{ renderer: 'context', action: 'update', params: { panel_id: 'ghost' } }], reg);
    expect(bad.valid).toHaveLength(0);
    expect(bad.warnings[0]).toContain("unknown panel 'ghost'");
  });

  it('passes through actions with no renderer (legacy/graph-relative)', () => {
    const { valid } = validatePanelIds([{ action: 'highlight', node: 'A' }], arrayRegistry);
    expect(valid).toHaveLength(1);
  });
});

// companionSelfReport already had coverage in guidedAgent.test.js; a smoke check here
// keeps the agentLib public surface self-documented in one place.
describe('companionSelfReport — smoke', () => {
  it('returns null with no fields, normalizes when present', () => {
    expect(companionSelfReport({ text: 'x' })).toBe(null);
    expect(companionSelfReport({ learner_state: 'partial', specificity_level: 2 })).toMatchObject({
      learner_state: 'partial',
      specificity_level: 2,
      reveals_key_insight: false,
    });
  });
});

// ── highlight_problem_text (companion page-highlight, eng review 2026-06-09) ──
//
//   model → handleToolCall ─ws─▶ embed app ─port─▶ content.js (paint)
//                 ▲                                      │
//                 └── highlight_result (id-checked) ◀────┘
//
// The handler AWAITS the ack with a 2s timeout; resolveHighlightResult is the
// id-checked route target; abortHighlightWait is the end_session cleanup.

import { handleToolCall, resolveHighlightResult, abortHighlightWait } from './agentLib.js';

function fakeSession() {
  const sent = [];
  return {
    sent,
    ws: { OPEN: 1, readyState: 1, send: (s) => sent.push(JSON.parse(s)) },
  };
}

const call = (session, input) =>
  handleToolCall(session, { name: 'highlight_problem_text', input }, null, null, null);

describe('highlight_problem_text handler', () => {
  it('rejects a missing/short quote with an explicit error (no WS send)', async () => {
    const s = fakeSession();
    expect((await call(s, {})).success).toBe(false);
    expect((await call(s, { quote: 'arr' })).success).toBe(false);
    expect(s.sent).toHaveLength(0);
  });

  it('sends highlight_problem with a correlation id and resolves on the matching ack', async () => {
    const s = fakeSession();
    const pending = call(s, { quote: 'sorted in ascending order' });
    expect(s.sent[0].type).toBe('highlight_problem');
    const id = s.sent[0].id;
    expect(resolveHighlightResult(s, { id, anchored: true, method: 'highlight-api', visible: true })).toBe(true);
    const result = await pending;
    expect(result).toMatchObject({ success: true, anchored: true, visible: true, method: 'highlight-api' });
    expect(result.message).toContain('do not restate');
    expect(s._highlightResolver).toBe(null);
  });

  it('anchored:false ack tells the model to fall back to prose', async () => {
    const s = fakeSession();
    const pending = call(s, { quote: 'sorted in ascending order' });
    resolveHighlightResult(s, { id: s.sent[0].id, anchored: false, method: null, visible: false });
    const result = await pending;
    expect(result.anchored).toBe(false);
    expect(result.message).toContain('prose');
  });

  it('anchored but not visible warns that the reply must stand alone', async () => {
    const s = fakeSession();
    const pending = call(s, { quote: 'sorted in ascending order' });
    resolveHighlightResult(s, { id: s.sent[0].id, anchored: true, method: 'mark', visible: false });
    const result = await pending;
    expect(result).toMatchObject({ anchored: true, visible: false });
    expect(result.message).toContain('on its own');
  });

  it('drops a stale ack: wrong id never resolves the pending call', async () => {
    const s = fakeSession();
    const pending = call(s, { quote: 'sorted in ascending order' });
    const id = s.sent[0].id;
    // Late ack from a PREVIOUS (timed-out) highlight — must be ignored.
    expect(resolveHighlightResult(s, { id: id - 1, anchored: false })).toBe(false);
    expect(s._highlightResolver?.id).toBe(id); // still pending
    resolveHighlightResult(s, { id, anchored: true, visible: true });
    expect((await pending).anchored).toBe(true);
  });

  it('correlation ids increment per call so two calls never share an id', async () => {
    const s = fakeSession();
    const p1 = call(s, { quote: 'sorted in ascending order' });
    resolveHighlightResult(s, { id: s.sent[0].id, anchored: true, visible: true });
    await p1;
    const p2 = call(s, { quote: 'return the index of target' });
    expect(s.sent[1].id).toBe(s.sent[0].id + 1);
    resolveHighlightResult(s, { id: s.sent[1].id, anchored: true, visible: true });
    await p2;
  });

  it('clear:true fires and returns immediately without an ack wait', async () => {
    const s = fakeSession();
    const result = await call(s, { clear: true });
    expect(result).toEqual({ success: true, cleared: true });
    expect(s.sent[0]).toMatchObject({ type: 'highlight_problem', clear: true });
    expect(s._highlightResolver ?? null).toBe(null);
  });

  it('abortHighlightWait (end_session) resolves a pending wait as unknown', async () => {
    const s = fakeSession();
    const pending = call(s, { quote: 'sorted in ascending order' });
    abortHighlightWait(s);
    const result = await pending;
    expect(result.anchored).toBe('unknown');
    expect(s._highlightResolver).toBe(null);
    abortHighlightWait(s); // idempotent on no pending wait
  });

  it('times out to anchored:unknown when no ack ever arrives', async () => {
    const s = fakeSession();
    const result = await call(s, { quote: 'sorted in ascending order' });
    expect(result.anchored).toBe('unknown');
    expect(result.message).toContain('prose');
  }, 4000);
});

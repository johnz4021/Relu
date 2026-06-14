// Regression: ISSUE-005 — a live-tutor append_log action with missing or
// non-array `entries` threw "undefined is not iterable" inside the client
// reducer, unmounting <App> and dropping the WebSocket (full blank screen,
// reload required). Server validation only checks context action NAMES, so
// malformed param shapes reach the client.
// Found by /qa on 2026-06-12 (Tier 3 sweep, LC875 Koko Eating Bananas)
// Report: .gstack/qa-reports/qa-report-localhost-5173-2026-06-12.md
//
// The reducer is a pure function, so it's testable from the server-side
// vitest run without DOM. vite handles the JSX-free hook module fine.
import { describe, it, expect, vi } from 'vitest';
import { reducer } from '../client/src/hooks/useTutorState.js';

const stateWithLogPanel = (data = {}) => ({
  contextPanels: [{ id: 'iteration_history', type: 'log', title: 'Iteration History', data }],
});

describe('APPEND_CONTEXT_LOG hardening (ISSUE-005)', () => {
  it('missing entries does not throw and leaves state unchanged', () => {
    const state = stateWithLogPanel();
    const next = reducer(state, { type: 'APPEND_CONTEXT_LOG', panel_id: 'iteration_history' });
    expect(next.contextPanels[0].data).toEqual({});
  });

  it('non-array single entry is appended as one item', () => {
    const state = stateWithLogPanel();
    const next = reducer(state, {
      type: 'APPEND_CONTEXT_LOG',
      panel_id: 'iteration_history',
      entries: { text: 'speed 6 works', type: 'info' },
    });
    expect(next.contextPanels[0].data.entries).toEqual([{ text: 'speed 6 works', type: 'info' }]);
  });

  it('canonical entries array appends and respects max_visible', () => {
    const state = stateWithLogPanel({ entries: [{ text: 'a' }], max_visible: 2 });
    const next = reducer(state, {
      type: 'APPEND_CONTEXT_LOG',
      panel_id: 'iteration_history',
      entries: [{ text: 'b' }, { text: 'c' }],
    });
    expect(next.contextPanels[0].data.entries.map(e => e.text)).toEqual(['b', 'c']);
  });

  it('panel with undefined data does not throw', () => {
    const state = { contextPanels: [{ id: 'iteration_history', type: 'log', title: 'x', data: undefined }] };
    const next = reducer(state, {
      type: 'APPEND_CONTEXT_LOG',
      panel_id: 'iteration_history',
      entries: [{ text: 'ok' }],
    });
    expect(next.contextPanels[0].data.entries).toEqual([{ text: 'ok' }]);
  });
});

// Regression: ISSUE-002 — segment ids built as `'prefix' + Date.now()` collided when
// two segments were created in the same millisecond (a rapid double-tap of the offer
// chip / "I'm stuck", or back-to-back model segments), producing React "duplicate key"
// warnings and possibly duplicated/omitted transcript rows. segId() appends a monotonic
// counter so ids are unique regardless of timing.
// Found by /qa on 2026-06-14 (companion hint chips)
describe('unique segment ids under same-millisecond additions (ISSUE-002)', () => {
  it('two identical student messages in the same ms get distinct ids', () => {
    const spy = vi.spyOn(Date, 'now').mockReturnValue(1781460136008); // freeze the clock
    try {
      let state = { segments: [] };
      state = reducer(state, { type: 'ADD_STUDENT_MESSAGE', text: 'Yes, please draw it out for me.' });
      state = reducer(state, { type: 'ADD_STUDENT_MESSAGE', text: 'Yes, please draw it out for me.' });
      const ids = state.segments.map((s) => s.id);
      expect(ids).toHaveLength(2);
      expect(new Set(ids).size).toBe(2); // unique despite identical text + frozen Date.now
    } finally {
      spy.mockRestore();
    }
  });

  it('ids across mixed segment types in the same ms are all unique', () => {
    const spy = vi.spyOn(Date, 'now').mockReturnValue(1781460136008);
    try {
      let state = { segments: [] };
      state = reducer(state, { type: 'ADD_STUDENT_MESSAGE', text: 'a' });
      state = reducer(state, { type: 'INTERRUPT_RESPONSE', answer: 'b', explanation_mode: 'none' });
      state = reducer(state, { type: 'ADD_STUDENT_MESSAGE', text: 'c' });
      const ids = state.segments.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length); // no collisions
    } finally {
      spy.mockRestore();
    }
  });
});

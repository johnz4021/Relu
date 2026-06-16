import { describe, it, expect } from 'vitest';
import { validateVizActionSchemas } from './vizValidator.js';

// All-viz-types sweep (QA 2026-06-15, "QA against all possible viz types not just trees").
//
// The hint/companion path has the MODEL hand-build viz_actions (no vizMapper). The tree
// silently blanked because its canonical shape diverges from the model's natural graph
// shape and the schema gate only checks param presence/type. This sweep pushes every
// renderer's realistic hand-built INIT action through the real server validator and asserts
// it survives as a renderable action — the exhaustive check a few live browser sessions
// can't give. The tree case feeds the exact GRAPH shape that blanked and asserts the
// canonicalizer now repairs it (the fix), through actual server code.

const v = (renderer, action, params) => ({ renderer, action, params });
// One action survives validation iff it comes back in `valid` with no errors.
const survives = (action) => {
  const { valid, errors } = validateVizActionSchemas([action], {});
  return { ok: valid.length === 1 && errors.length === 0, valid: valid[0], errors };
};

describe('all viz types — every renderer hand-built init survives validation', () => {
  it('array.set_data renders (and aliases data→values)', () => {
    expect(survives(v('array', 'set_data', { values: [5, 3, 8, 1] })).ok).toBe(true);
    const aliased = survives(v('array', 'set_data', { data: [5, 3] }));
    expect(aliased.ok).toBe(true);
    expect(aliased.valid.params).toEqual({ values: [5, 3] });
  });

  it('table.init_grid renders', () => {
    const r = survives(v('table', 'init_grid', { rows: 3, cols: 4 }));
    expect(r.ok).toBe(true);
    expect(r.valid.params).toMatchObject({ rows: 3, cols: 4 });
  });

  it('string.set_string renders (and aliases string→s)', () => {
    expect(survives(v('string', 'set_string', { s: 'racecar' })).ok).toBe(true);
    const aliased = survives(v('string', 'set_string', { string: 'abc' }));
    expect(aliased.ok).toBe(true);
    expect(aliased.valid.params).toEqual({ s: 'abc' });
  });

  it('linked.set_list renders (list/stack/queue modes)', () => {
    expect(survives(v('linked', 'set_list', { values: [1, 2, 3] })).ok).toBe(true);
    expect(survives(v('linked', 'set_list', { values: [9, 8], mode: 'stack' })).ok).toBe(true);
  });

  it('interval.set_jobs renders', () => {
    const r = survives(v('interval', 'set_jobs', {
      jobs: [{ id: 'a', name: 'A', start: 0, end: 3 }, { id: 'b', name: 'B', start: 2, end: 5 }],
    }));
    expect(r.ok).toBe(true);
  });

  it('recursion_tree.set_recurrence_tree renders', () => {
    expect(survives(v('recursion_tree', 'set_recurrence_tree', { a: 2, b: 2, d: 1, n: 8 })).ok).toBe(true);
  });

  it('graph.add_node + add_edge survive schema validation', () => {
    const { valid, errors } = validateVizActionSchemas(
      [v('graph', 'add_node', { id: 'a', label: 'A' }), v('graph', 'add_edge', { from: 'a', to: 'b' })],
      {},
    );
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(2);
  });

  it('tree.set_tree renders for the CANONICAL shape (trace/vizMapper author)', () => {
    const r = survives(v('tree', 'set_tree', {
      nodes: [{ id: 'n0', value: 3 }, { id: 'n1', value: 9 }, { id: 'n2', value: 20 }],
      edges: [{ from: 'n0', to: 'n1', side: 'left' }, { from: 'n0', to: 'n2', side: 'right' }],
      root: 'n0',
    }));
    expect(r.ok).toBe(true);
    expect(r.valid.params.root).toBe('n0');
  });

  it('tree.set_tree REPAIRS the GRAPH shape that used to blank (the fix, end to end)', () => {
    // The exact build_example_graph shape the model hand-builds ~7/8 of the time.
    const r = survives(v('tree', 'set_tree', {
      nodes: [{ id: '3', label: '3' }, { id: '9', label: '9' }, { id: '20', label: '20' }],
      edges: [{ source: '3', target: '9' }, { source: '3', target: '20' }],
      positions: { '3': { x: 300, y: 60 }, '9': { x: 150, y: 180 }, '20': { x: 450, y: 180 } },
    }));
    expect(r.ok).toBe(true);
    // canonicalized: root inferred, label→value, source/target→from/to, side from x
    expect(r.valid.params.root).toBe('3');
    expect(r.valid.params.nodes.find((n) => n.id === '9').value).toBe('9');
    const e = r.valid.params.edges.find((x) => x.from === '3' && x.to === '9');
    expect(e).toBeTruthy();
    expect(e.side).toBe('left');
    expect(r.valid.params.positions).toBeUndefined();
  });
});

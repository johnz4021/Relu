import { describe, it, expect } from 'vitest';
import {
  validateVizActionSchemas,
  resolveRendererType,
  checkParamType,
} from './vizValidator.js';

const PANELS = {
  array_main: { renderer: 'array', type: 'renderer' },
  graph_left: { renderer: 'graph', type: 'renderer' },
  graph_right: { renderer: 'graph', type: 'renderer' },
  distances: { renderer: 'context', type: 'context' },
};

const v = (renderer, action, params) => ({ renderer, action, params });

describe('resolveRendererType', () => {
  it('resolves a registered panel id to its renderer type', () => {
    expect(resolveRendererType('array_main', PANELS)).toBe('array');
  });
  it('resolves a bare manifest type to itself', () => {
    expect(resolveRendererType('table', PANELS)).toBe('table');
  });
  it('resolves context panel ids and the bare context type', () => {
    expect(resolveRendererType('distances', PANELS)).toBe('context');
    expect(resolveRendererType('context', PANELS)).toBe('context');
  });
  it('returns null for unknown strings', () => {
    expect(resolveRendererType('aray', PANELS)).toBeNull();
  });
});

describe('checkParamType', () => {
  it('coerces numeric strings to numbers', () => {
    expect(checkParamType('3', 'number')).toEqual({ ok: true, value: 3 });
  });
  it('rejects non-numeric strings for number', () => {
    expect(checkParamType('three', 'number').ok).toBe(false);
  });
  it('coerces numbers to strings for string specs', () => {
    expect(checkParamType(5, 'string')).toEqual({ ok: true, value: '5' });
  });
  it('wraps a scalar into a single-element array for X[] specs', () => {
    expect(checkParamType(3, 'number[]')).toEqual({ ok: true, value: [3] });
  });
  it('coerces numeric-string elements inside number[]', () => {
    expect(checkParamType(['1', 2], 'number[]')).toEqual({ ok: true, value: [1, 2] });
  });
  it('enforces quoted unions', () => {
    expect(checkParamType('red', "'red'|'black'").ok).toBe(true);
    expect(checkParamType('blue', "'red'|'black'").ok).toBe(false);
  });
  it('checks object-shape specs as objects', () => {
    expect(checkParamType({ row: 1, col: 2 }, '{row,col}').ok).toBe(true);
    expect(checkParamType([1, 2], '{row,col}').ok).toBe(false);
  });
  it('treats prose specs with parens as always-ok', () => {
    expect(checkParamType(undefined, 'number | (start+end)').ok).toBe(true);
  });
});

describe('validateVizActionSchemas', () => {
  it('passes a valid action targeting a panel id and keeps it nested', () => {
    const { valid, errors } = validateVizActionSchemas(
      [v('array_main', 'set_data', { values: [3, 1, 2] })],
      PANELS,
    );
    expect(errors).toEqual([]);
    expect(valid).toEqual([{ renderer: 'array_main', action: 'set_data', params: { values: [3, 1, 2] } }]);
  });

  it('strips a hallucinated action name and lists valid actions in the error', () => {
    const { valid, errors } = validateVizActionSchemas(
      [v('array_main', 'paint_bars', { indices: [0] })],
      PANELS,
    );
    expect(valid).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("'paint_bars' is not a valid action for renderer 'array'");
    expect(errors[0]).toContain('set_data');
  });

  it('repairs case/hyphen near-misses in action names', () => {
    const { valid, errors } = validateVizActionSchemas(
      [v('array_main', 'Set-Data', { values: [1] })],
      PANELS,
    );
    expect(errors).toEqual([]);
    expect(valid[0].action).toBe('set_data');
  });

  it('repairs the data→values param alias', () => {
    const { valid, errors } = validateVizActionSchemas(
      [v('array_main', 'set_data', { data: [1, 2] })],
      PANELS,
    );
    expect(errors).toEqual([]);
    expect(valid[0].params).toEqual({ values: [1, 2] });
  });

  it('repairs node↔id per the spec direction (tree wants id, graph wants node)', () => {
    const { valid, errors } = validateVizActionSchemas(
      [
        v('tree', 'highlight_node', { node: 'n3' }),
        v('graph_left', 'highlight_node', { id: 'a' }),
      ],
      PANELS,
    );
    expect(errors).toEqual([]);
    expect(valid[0].params).toEqual({ id: 'n3' });
    expect(valid[1].params).toEqual({ node: 'a' });
  });

  it('wraps a scalar index into indices and coerces numeric strings', () => {
    const { valid, errors } = validateVizActionSchemas(
      [
        v('array_main', 'highlight', { index: 2 }),
        v('array_main', 'swap', { i: '0', j: '2' }),
      ],
      PANELS,
    );
    expect(errors).toEqual([]);
    expect(valid[0].params.indices).toEqual([2]);
    expect(valid[1].params).toEqual({ i: 0, j: 2 });
  });

  it('lifts legacy flat params into the nested form', () => {
    const { valid, errors } = validateVizActionSchemas(
      [{ renderer: 'graph_left', action: 'highlight_node', node: 'a', className: 'current' }],
      PANELS,
    );
    expect(errors).toEqual([]);
    expect(valid[0].params).toEqual({ node: 'a', className: 'current' });
  });

  it('strips actions missing a required param', () => {
    const { valid, errors } = validateVizActionSchemas(
      [v('array_main', 'set_pointer', { name: 'L' })], // missing index
      PANELS,
    );
    expect(valid).toEqual([]);
    expect(errors[0]).toContain("missing required param 'index'");
  });

  it('strips actions with un-coercible param types', () => {
    const { valid, errors } = validateVizActionSchemas(
      [v('array_main', 'highlight', { indices: 'first two' })],
      PANELS,
    );
    expect(valid).toEqual([]);
    expect(errors[0]).toContain("param 'indices' expected number[]");
  });

  it('enforces union params (recolor_node color)', () => {
    const { errors } = validateVizActionSchemas(
      [v('tree', 'recolor_node', { id: 'n1', color: 'blue' })],
      PANELS,
    );
    expect(errors[0]).toContain("param 'color'");
  });

  it('allows set_char_state with start/end instead of index (prose spec)', () => {
    const { valid, errors } = validateVizActionSchemas(
      [v('string', 'set_char_state', { start: 0, end: 3, state: 'match' })],
      PANELS,
    );
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(1);
  });

  it('rejects unknown renderers strictly, keeps them when lenient', () => {
    const action = v('mystery_panel', 'set_data', { values: [1] });
    const strict = validateVizActionSchemas([action], PANELS);
    expect(strict.valid).toEqual([]);
    expect(strict.errors[0]).toContain("unknown renderer/panel 'mystery_panel'");

    const lenient = validateVizActionSchemas([action], PANELS, { lenientUnknownRenderer: true });
    expect(lenient.valid).toEqual([action]);
    expect(lenient.errors).toEqual([]);
  });

  it('validates context actions: update passes, bad action and missing panel_id fail', () => {
    const { valid, errors } = validateVizActionSchemas(
      [
        v('context', 'update', { panel_id: 'distances', entries: [] }),
        v('distances', 'append_log', { panel_id: 'distances', entries: [{ text: 'hi' }] }),
        v('context', 'set_entries', { panel_id: 'distances' }),
        v('context', 'update', { entries: [] }),
      ],
      PANELS,
    );
    expect(valid).toHaveLength(2);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('not a valid context action');
    expect(errors[1]).toContain("missing required param 'panel_id'");
  });

  it('passes toggle_residual and system actions untouched', () => {
    const { valid, errors } = validateVizActionSchemas(
      [
        { renderer: 'graph_left', action: 'toggle_residual', show: true },
        v('graph_left', 'show_residual_overlay', { residual_edges: [], mode: 'overlay' }),
      ],
      PANELS,
    );
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(2);
  });

  it('accepts newly documented actions: graph add_node/add_edge, table highlight_cells', () => {
    const { valid, errors } = validateVizActionSchemas(
      [
        v('graph_left', 'add_node', { id: 'x', label: 'X' }),
        v('graph_left', 'add_edge', { from: 'x', to: 'a', weight: 3 }),
        v('table', 'highlight_cells', { cells: [{ row: 0, col: 1 }] }),
      ],
      PANELS,
    );
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(3);
  });

  it('keeps unknown extra params (client ignores them)', () => {
    const { valid } = validateVizActionSchemas(
      [v('array_main', 'highlight', { indices: [1], glow: true })],
      PANELS,
    );
    expect(valid[0].params).toEqual({ indices: [1], glow: true });
  });

  it('passes through actions with no renderer field (legacy graph default)', () => {
    const action = { action: 'highlight_node', node: 'a' };
    const { valid, errors } = validateVizActionSchemas([action], PANELS);
    expect(errors).toEqual([]);
    expect(valid).toEqual([action]);
  });
});

// The companion hint-mode structure view HAND-BUILDS set_tree in build_example_graph's
// GRAPH shape ({id,label} nodes, {source,target} edges, `positions`, no `root`), which the
// strict TreeRenderer silently blanked — the solution path rendered only because vizMapper
// emits the canonical shape. vizValidator now canonicalizes the shape (and fails loud when
// it still can't form a tree) so both authors land on the same canonical payload.
// Regression from /investigate 2026-06-15 (tree_level_order, Binary Tree Level Order Traversal).
describe('validateVizActionSchemas — set_tree structural canonicalization', () => {
  // The exact payload from the user's blank-render console log.
  const handBuilt = {
    nodes: [
      { id: '3', label: '3' }, { id: '9', label: '9' }, { id: '20', label: '20' },
      { id: '15', label: '15' }, { id: '7', label: '7' },
    ],
    edges: [
      { source: '3', target: '9' }, { source: '3', target: '20' },
      { source: '20', target: '15' }, { source: '20', target: '7' },
    ],
    positions: {
      '3': { x: 300, y: 60 }, '9': { x: 150, y: 180 }, '20': { x: 450, y: 180 },
      '15': { x: 350, y: 300 }, '7': { x: 550, y: 300 },
    },
  };

  it('canonicalizes the hand-built GRAPH shape: aliases source/target, maps label→value, infers root + sides', () => {
    const { valid, errors } = validateVizActionSchemas([v('tree', 'set_tree', handBuilt)], PANELS);
    expect(errors).toEqual([]);
    const p = valid[0].params;
    // root inferred as the only node with no incoming edge
    expect(p.root).toBe('3');
    // label became value (TreeRenderer displays node.value)
    expect(p.nodes.find((n) => n.id === '9').value).toBe('9');
    // edges now carry from/to
    expect(p.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: '3', to: '9' }),
      expect.objectContaining({ from: '20', to: '7' }),
    ]));
    // sides inferred from x-position: 9 (x150) < 20 (x450); 15 (x350) < 7 (x550)
    const side = (from, to) => p.edges.find((e) => e.from === from && e.to === to).side;
    expect(side('3', '9')).toBe('left');
    expect(side('3', '20')).toBe('right');
    expect(side('20', '15')).toBe('left');
    expect(side('20', '7')).toBe('right');
    // the positions map is consumed, not forwarded
    expect(p.positions).toBeUndefined();
  });

  it('passes the canonical (vizMapper) shape through unchanged — no regression for the solution path', () => {
    const canonical = {
      nodes: [{ id: 'n0', value: 3 }, { id: 'n1', value: 9 }, { id: 'n2', value: 20 }],
      edges: [
        { from: 'n0', to: 'n1', side: 'left' },
        { from: 'n0', to: 'n2', side: 'right' },
      ],
      root: 'n0',
    };
    const { valid, errors } = validateVizActionSchemas([v('tree', 'set_tree', canonical)], PANELS);
    expect(errors).toEqual([]);
    expect(valid[0].params.root).toBe('n0');
    expect(valid[0].params.nodes).toEqual(canonical.nodes);
    expect(valid[0].params.edges).toEqual(canonical.edges);
  });

  it('falls back to child order for side when positions are absent', () => {
    const { valid, errors } = validateVizActionSchemas([v('tree', 'set_tree', {
      nodes: [{ id: 'a', value: 1 }, { id: 'b', value: 2 }, { id: 'c', value: 3 }],
      edges: [{ source: 'a', target: 'b' }, { source: 'a', target: 'c' }],
    })], PANELS);
    expect(errors).toEqual([]);
    expect(valid[0].params.root).toBe('a');
    expect(valid[0].params.edges[0].side).toBe('left');
    expect(valid[0].params.edges[1].side).toBe('right');
  });

  it('keeps the empty-tree clear payload legal (nodes: [])', () => {
    const { valid, errors } = validateVizActionSchemas(
      [v('tree', 'set_tree', { nodes: [], edges: [], root: null })], PANELS);
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0].params.nodes).toEqual([]);
  });

  it('FAILS LOUD: multiple nodes with no connecting edges (silent-blank class)', () => {
    const { valid, errors } = validateVizActionSchemas([v('tree', 'set_tree', {
      nodes: [{ id: 'a', value: 1 }, { id: 'b', value: 2 }],
      edges: [],
    })], PANELS);
    expect(valid).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('no edges connect them');
  });

  it('FAILS LOUD: explicit root that is not one of the nodes', () => {
    const { valid, errors } = validateVizActionSchemas([v('tree', 'set_tree', {
      nodes: [{ id: 'a', value: 1 }, { id: 'b', value: 2 }],
      edges: [{ from: 'a', to: 'b', side: 'left' }],
      root: 'zzz',
    })], PANELS);
    expect(valid).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('no resolvable root');
  });
});

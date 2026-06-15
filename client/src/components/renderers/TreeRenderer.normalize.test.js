import { describe, it, expect } from 'vitest';
import { normalizeTreeParams } from './TreeRenderer';

// Regression: hint-mode trees rendered blank — the companion structure-view hand-builds
// set_tree in build_example_graph's GRAPH shape ({source,target} edges, {id,label} nodes,
// `positions`, no `root`), which the strict tree renderer silently dropped. The solution
// path rendered only because vizMapper emits the canonical shape.
// Found by /investigate on 2026-06-15 (tree_level_order, Binary Tree Level Order Traversal).

describe('normalizeTreeParams', () => {
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

  it('renders the hand-built GRAPH shape: aliases source/target, maps label→value, infers root + sides', () => {
    const out = normalizeTreeParams(handBuilt);
    // root inferred as the only node with no incoming edge
    expect(out.root).toBe('3');
    // label became value (TreeRenderer displays node.value)
    expect(out.nodes.find((n) => n.id === '9').value).toBe('9');
    // edges now carry from/to
    expect(out.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: '3', to: '9' }),
      expect.objectContaining({ from: '20', to: '7' }),
    ]));
    // sides inferred from x-position: 9 (x150) < 20 (x450); 15 (x350) < 7 (x550)
    const side = (from, to) => out.edges.find((e) => e.from === from && e.to === to).side;
    expect(side('3', '9')).toBe('left');
    expect(side('3', '20')).toBe('right');
    expect(side('20', '15')).toBe('left');
    expect(side('20', '7')).toBe('right');
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
    const out = normalizeTreeParams(canonical);
    expect(out.root).toBe('n0');
    expect(out.nodes).toEqual(canonical.nodes);
    expect(out.edges).toEqual(canonical.edges);
  });

  it('falls back to child order for side when positions are absent', () => {
    const out = normalizeTreeParams({
      nodes: [{ id: 'a', value: 1 }, { id: 'b', value: 2 }, { id: 'c', value: 3 }],
      edges: [{ source: 'a', target: 'b' }, { source: 'a', target: 'c' }],
    });
    expect(out.root).toBe('a');
    expect(out.edges[0].side).toBe('left');
    expect(out.edges[1].side).toBe('right');
  });

  it('tolerates empty / missing input without throwing', () => {
    expect(normalizeTreeParams()).toEqual({ nodes: [], edges: [], root: undefined });
    expect(normalizeTreeParams({ nodes: [], edges: [] }).nodes).toEqual([]);
  });
});

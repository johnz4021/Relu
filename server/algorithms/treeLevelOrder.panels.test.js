/**
 * Regression: the BFS Queue context panel for tree_level_order must display
 * node VALUES (3, 9, 20), never synthetic internal node ids (n0, n1, n2).
 *
 * treeUtils generates ids like "n0"/"n1" that differ from the node values the
 * student sees in the tree and in the traversal log. The queue panel was
 * mapping ids straight to display values (vizMapper id -> value), which made
 * it the only panel speaking a different alphabet than the rest of the screen.
 * The fix caches an id->value map at the init step and translates both the
 * init queue and every level_complete queue_after through it.
 */
import { describe, it, expect } from 'vitest';
import { treeLevelOrder, DEFAULT_TREE_LEVEL_ORDER_INPUT } from './tree/treeLevelOrder.js';
import { mapTraceStep } from '../vizMapper.js';

describe('tree_level_order queue panel labels', () => {
  it('renders node values, never internal n<id> ids', () => {
    const trace = treeLevelOrder(DEFAULT_TREE_LEVEL_ORDER_INPUT); // [3,9,20,null,null,15,7]
    const state = {};
    const queueRenders = [];

    for (const step of trace) {
      const { ctx } = mapTraceStep('tree_level_order', 'tree', step, state);
      const q = ctx.find((c) => c.params?.panel_id === 'queue');
      if (q) queueRenders.push(q.params.items.map((i) => i.value));
    }

    // Every value ever shown in the queue is a number (a node value), not "nNN".
    for (const render of queueRenders) {
      for (const v of render) {
        expect(typeof v).toBe('number');
        expect(String(v)).not.toMatch(/^n\d+$/);
      }
    }

    // Concretely: root level shows [3], then the children rows.
    expect(queueRenders[0]).toEqual([3]);
    expect(queueRenders).toContainEqual([9, 20]);
    expect(queueRenders).toContainEqual([15, 7]);
  });
});

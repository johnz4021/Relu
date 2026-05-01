import { buildTreeFromValues } from './treeUtils.js';

/**
 * BFS level-order traversal — canonical example: Binary Tree Level Order Traversal.
 * Covers: Level Order, Right Side View, Zigzag Level Order, Average of Levels.
 */
export function treeLevelOrder(input) {
  const { nodes, edges, root, nodeMap, children } = buildTreeFromValues(input.values);
  const tree = { nodes, edges, root };
  const trace = [];

  trace.push({
    type: 'init',
    tree,
    queue: root ? [root] : [],
    description: 'BFS level-order: process all nodes at each level before descending.',
  });

  if (!root) {
    trace.push({ type: 'result', order: [] });
    return trace;
  }

  const queue = [root];
  const allValues = [];
  let level = 0;

  while (queue.length > 0) {
    const levelSize = queue.length;
    const levelVals = [];
    const levelNodeIds = [];

    for (let i = 0; i < levelSize; i++) {
      const nodeId = queue.shift();
      const val = nodeMap[nodeId].value;

      trace.push({
        type: 'visit_node',
        node_id: nodeId,
        value: val,
        level,
        queue_size: queue.length,
      });

      levelVals.push(val);
      levelNodeIds.push(nodeId);

      if (children[nodeId]?.left) queue.push(children[nodeId].left);
      if (children[nodeId]?.right) queue.push(children[nodeId].right);
    }

    trace.push({
      type: 'level_complete',
      level,
      values: levelVals,
      level_nodes: levelNodeIds,
      queue_after: [...queue],
    });

    allValues.push(...levelVals);
    level++;
  }

  trace.push({ type: 'result', order: allValues });
  return trace;
}

export const DEFAULT_TREE_LEVEL_ORDER_INPUT = { values: [3, 9, 20, null, null, 15, 7] };

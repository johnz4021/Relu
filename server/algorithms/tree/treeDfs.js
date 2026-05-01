import { buildTreeFromValues } from './treeUtils.js';

/**
 * DFS with bottom-up height computation — canonical example: Maximum Depth.
 * Covers: Max Depth, Balanced Binary Tree, Diameter, Count Good Nodes, Same Tree, Subtree.
 */
export function treeDfs(input) {
  const { nodes, edges, root, nodeMap, children } = buildTreeFromValues(input.values);
  const tree = { nodes, edges, root };
  const trace = [];

  trace.push({
    type: 'init',
    tree,
    description: 'DFS traversal: visit every node, compute height bottom-up.',
  });

  if (!root) {
    trace.push({ type: 'result', max_depth: 0, order: [] });
    return trace;
  }

  function dfs(nodeId) {
    if (!nodeId) return 0;

    const val = nodeMap[nodeId].value;
    trace.push({ type: 'visit_node', node_id: nodeId, value: val });

    const leftH = dfs(children[nodeId]?.left || null);
    const rightH = dfs(children[nodeId]?.right || null);
    const height = Math.max(leftH, rightH) + 1;

    trace.push({
      type: 'backtrack',
      node_id: nodeId,
      value: val,
      height,
      left_height: leftH,
      right_height: rightH,
    });

    return height;
  }

  const maxDepth = dfs(root);

  trace.push({ type: 'result', max_depth: maxDepth, order: [] });
  return trace;
}

export const DEFAULT_TREE_DFS_INPUT = { values: [3, 9, 20, null, null, 15, 7] };

import { buildTreeFromValues } from './treeUtils.js';

/**
 * DFS path traversal — canonical example: Path Sum (has path summing to target).
 * Covers: Path Sum I/II, Binary Tree Paths, Sum Root to Leaf Numbers, Max Path Sum.
 */
export function treePath(input) {
  const { nodes, edges, root, nodeMap, children } = buildTreeFromValues(input.values);
  const target = input.target ?? 22;
  const tree = { nodes, edges, root };
  const trace = [];

  trace.push({
    type: 'init',
    tree,
    target,
    description: `DFS path search: find root-to-leaf path summing to ${target}.`,
  });

  if (!root) {
    trace.push({ type: 'result', found: false, target, path: [], order: [] });
    return trace;
  }

  let found = false;
  let foundPath = [];

  function dfs(nodeId, remaining, path) {
    if (!nodeId) return;

    const val = nodeMap[nodeId].value;
    const newRemaining = remaining - val;
    const newPath = [...path, val];

    trace.push({
      type: 'visit_node',
      node_id: nodeId,
      value: val,
      remaining: newRemaining,
      path: newPath,
    });

    const isLeaf = !children[nodeId]?.left && !children[nodeId]?.right;

    if (isLeaf) {
      if (newRemaining === 0) {
        found = true;
        foundPath = newPath;
        trace.push({ type: 'found_path', node_id: nodeId, path: newPath });
      }
    } else {
      dfs(children[nodeId]?.left || null, newRemaining, newPath);
      dfs(children[nodeId]?.right || null, newRemaining, newPath);
    }

    trace.push({ type: 'backtrack', node_id: nodeId, value: val, path });
  }

  dfs(root, target, []);

  trace.push({
    type: 'result',
    found,
    target,
    path: foundPath,
    order: foundPath,
  });

  return trace;
}

export const DEFAULT_TREE_PATH_INPUT = {
  values: [5, 4, 8, 11, null, 13, 4, 7, 2, null, null, null, 1],
  target: 22,
};

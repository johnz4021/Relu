// LCA (Lowest Common Ancestor) and Validate BST

/**
 * Build a tree node lookup from level-order array.
 * Returns: { nodes: Map<index, {id, val, left, right, parent}>, root: 0 }
 */
function buildTree(levelOrder) {
  const nodes = new Map();
  for (let i = 0; i < levelOrder.length; i++) {
    if (levelOrder[i] !== null) {
      nodes.set(i, {
        id: String(i),
        val: levelOrder[i],
        left: 2 * i + 1 < levelOrder.length && levelOrder[2 * i + 1] !== null ? 2 * i + 1 : null,
        right: 2 * i + 2 < levelOrder.length && levelOrder[2 * i + 2] !== null ? 2 * i + 2 : null,
        parent: i === 0 ? null : Math.floor((i - 1) / 2),
      });
    }
  }
  return nodes;
}

function serializeTree(nodeMap) {
  const nodes = [];
  const edges = [];
  if (nodeMap.size === 0) return { nodes, edges, root: null };
  for (const [i, node] of nodeMap) {
    nodes.push({ id: node.id, value: node.val });
    if (node.left !== null && nodeMap.has(node.left)) {
      edges.push({ from: node.id, to: String(node.left), side: 'left' });
    }
    if (node.right !== null && nodeMap.has(node.right)) {
      edges.push({ from: node.id, to: String(node.right), side: 'right' });
    }
  }
  return { nodes, edges, root: '0' };
}

// ── lca_tree — Lowest Common Ancestor (binary tree, DFS post-order) ───────────
export function lcaTree(input) {
  const nodes_arr = input.nodes || [3, 5, 1, 6, 2, 0, 8, null, null, 7, 4];
  const p = input.p ?? 5;
  const q = input.q ?? 1;
  const trace = [];

  const nodeMap = buildTree(nodes_arr);

  trace.push({
    type: 'init',
    tree: serializeTree(nodeMap),
    description: `LCA of nodes p=${p} and q=${q} in binary tree. Post-order DFS: bubble up when p or q found.`,
    node: '0',
    parent: null,
    pseudocode_line: 0,
  });

  let lca = null;

  function dfs(i) {
    if (i === null || !nodeMap.has(i)) return null;
    const node = nodeMap.get(i);

    const left = dfs(node.left);
    const right = dfs(node.right);

    const isTarget = node.val === p || node.val === q;
    const result = isTarget || left !== null || right !== null
      ? (isTarget ? i : (left !== null ? left : right))
      : null;

    const isLCA = (left !== null && right !== null) ||
                  (isTarget && (left !== null || right !== null));

    trace.push({
      type: 'traverse',
      description: `Node[${i}]=${node.val}: left=${left !== null ? `found(${left})` : 'null'}, right=${right !== null ? `found(${right})` : 'null'}` +
        `${isTarget ? `, this is p/q` : ''}${isLCA ? ` → LCA found!` : ''}`,
      node: String(i),
      parent: node.parent !== null ? String(node.parent) : null,
      pseudocode_line: isLCA ? 6 : (isTarget ? 4 : 7),
    });

    if (isLCA && lca === null) {
      lca = node.val;
    }

    return result;
  }

  dfs(0);

  trace.push({
    type: 'result',
    description: `LCA of ${p} and ${q} = ${lca}`,
    node: '0',
    parent: null,
    output: String(lca),
    pseudocode_line: 6,
  });

  return trace;
}

export const DEFAULT_LCA_TREE_INPUT = {
  nodes: [3, 5, 1, 6, 2, 0, 8, null, null, 7, 4],
  p: 5, q: 1,
};

// ── validate_bst — Validate Binary Search Tree (range propagation) ─────────────
export function validateBst(input) {
  const nodes_arr = input.nodes || [5, 1, 4, null, null, 3, 6];
  const trace = [];

  const nodeMap = buildTree(nodes_arr);

  trace.push({
    type: 'init',
    tree: serializeTree(nodeMap),
    description: `Validate BST: DFS with min/max bounds. Each node must be strictly within (min, max).`,
    node: '0',
    parent: null,
    pseudocode_line: 0,
  });

  let isValid = true;

  function dfs(i, min, max) {
    if (i === null || !nodeMap.has(i)) return true;
    const node = nodeMap.get(i);
    const val = node.val;

    const inRange = val > min && val < max;

    trace.push({
      type: 'traverse',
      description: `Node[${i}]=${val}: bounds (${min === -Infinity ? '-∞' : min}, ${max === Infinity ? '+∞' : max}) → ${inRange ? 'valid ✓' : 'VIOLATION ✗'}`,
      node: String(i),
      parent: node.parent !== null ? String(node.parent) : null,
      pseudocode_line: inRange ? 6 : 3,
    });

    if (!inRange) { isValid = false; return false; }

    return dfs(node.left, min, val) && dfs(node.right, val, max);
  }

  dfs(0, -Infinity, Infinity);

  trace.push({
    type: 'result',
    description: isValid ? 'Valid BST ✓' : 'Not a valid BST ✗ (constraint violated)',
    node: '0',
    parent: null,
    output: String(isValid),
    pseudocode_line: 6,
  });

  return trace;
}

export const DEFAULT_VALIDATE_BST_INPUT = { nodes: [5, 1, 4, null, null, 3, 6] };

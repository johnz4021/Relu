export function bstInsert(values) {
  const trace = [];
  let nodeCount = 0;
  let root = null;

  trace.push({
    type: 'init',
    description: `Starting BST insertion of ${values.length} values: [${values.join(', ')}]`,
    values: [...values],
  });

  function makeId() {
    return `n${nodeCount++}`;
  }

  function serializeTree(root) {
    const nodes = [];
    const edges = [];
    if (!root) return { nodes, edges, root: null };

    function walk(node) {
      nodes.push({ id: node.id, value: node.value });
      if (node.left) {
        edges.push({ from: node.id, to: node.left.id, side: 'left' });
        walk(node.left);
      }
      if (node.right) {
        edges.push({ from: node.id, to: node.right.id, side: 'right' });
        walk(node.right);
      }
    }
    walk(root);
    return { nodes, edges, root: root.id };
  }

  for (const value of values) {
    trace.push({
      type: 'insert_start',
      value,
      description: `Inserting value ${value} into the BST`,
    });

    if (!root) {
      const id = makeId();
      root = { id, value, left: null, right: null };
      trace.push({
        type: 'insert',
        node_id: id,
        value,
        parent_id: null,
        side: null,
        tree: serializeTree(root),
        description: `Tree is empty — ${value} becomes the root`,
      });
      continue;
    }

    // Traverse from root to find insertion point
    let current = root;
    while (true) {
      if (value < current.value) {
        trace.push({
          type: 'compare',
          node_id: current.id,
          node_value: current.value,
          insert_value: value,
          direction: 'left',
          description: `${value} < ${current.value} — go left`,
        });
        if (current.left === null) {
          const id = makeId();
          current.left = { id, value, left: null, right: null };
          trace.push({
            type: 'insert',
            node_id: id,
            value,
            parent_id: current.id,
            side: 'left',
            tree: serializeTree(root),
            description: `Insert ${value} as left child of ${current.value}`,
          });
          break;
        }
        current = current.left;
      } else {
        trace.push({
          type: 'compare',
          node_id: current.id,
          node_value: current.value,
          insert_value: value,
          direction: 'right',
          description: `${value} >= ${current.value} — go right`,
        });
        if (current.right === null) {
          const id = makeId();
          current.right = { id, value, left: null, right: null };
          trace.push({
            type: 'insert',
            node_id: id,
            value,
            parent_id: current.id,
            side: 'right',
            tree: serializeTree(root),
            description: `Insert ${value} as right child of ${current.value}`,
          });
          break;
        }
        current = current.right;
      }
    }
  }

  trace.push({
    type: 'result',
    tree: serializeTree(root),
    description: `BST construction complete with ${values.length} nodes`,
  });

  return trace;
}

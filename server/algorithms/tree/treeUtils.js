/**
 * Convert a LeetCode-style level-order array to the internal tree format.
 * Null entries mark absent nodes (children of null nodes are skipped).
 * Returns { nodes, edges, root, nodeMap, children }.
 */
export function buildTreeFromValues(values) {
  if (!values || values.length === 0 || values[0] == null) {
    return { nodes: [], edges: [], root: null, nodeMap: {}, children: {} };
  }

  const nodes = [];
  const edges = [];
  const nodeMap = {};
  const children = {};

  nodes.push({ id: 'n0', value: values[0] });
  nodeMap['n0'] = { id: 'n0', value: values[0] };

  let nodeCount = 1;
  const queue = ['n0'];
  let i = 1;

  while (queue.length > 0 && i < values.length) {
    const parentId = queue.shift();

    if (i < values.length) {
      if (values[i] != null) {
        const id = `n${nodeCount++}`;
        nodes.push({ id, value: values[i] });
        nodeMap[id] = { id, value: values[i] };
        edges.push({ from: parentId, to: id, side: 'left' });
        if (!children[parentId]) children[parentId] = {};
        children[parentId].left = id;
        queue.push(id);
      }
      i++;
    }

    if (i < values.length) {
      if (values[i] != null) {
        const id = `n${nodeCount++}`;
        nodes.push({ id, value: values[i] });
        nodeMap[id] = { id, value: values[i] };
        edges.push({ from: parentId, to: id, side: 'right' });
        if (!children[parentId]) children[parentId] = {};
        children[parentId].right = id;
        queue.push(id);
      }
      i++;
    }
  }

  return { nodes, edges, root: 'n0', nodeMap, children };
}

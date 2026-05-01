export const DEFAULT_UNION_FIND_GRAPH = {
  nodes: [
    { id: '0', label: '0' },
    { id: '1', label: '1' },
    { id: '2', label: '2' },
    { id: '3', label: '3' },
    { id: '4', label: '4' },
    { id: '5', label: '5' },
  ],
  edges: [
    { source: '0', target: '1' },
    { source: '1', target: '2' },
    { source: '3', target: '4' },
  ],
  directed: false,
  positions: {
    0: { x: 100, y: 150 },
    1: { x: 250, y: 80 },
    2: { x: 400, y: 150 },
    3: { x: 550, y: 80 },
    4: { x: 700, y: 150 },
    5: { x: 400, y: 300 },
  },
};

export function unionFind(graph) {
  const trace = [];
  const nodes = graph.nodes.map(n => n.id);
  const parent = {};
  const rank = {};

  for (const id of nodes) {
    parent[id] = id;
    rank[id] = 0;
  }

  let componentCount = nodes.length;

  trace.push({
    type: 'init',
    description: `Initialize Union-Find: ${nodes.length} nodes, each in its own component. Components: ${componentCount}.`,
    parent: { ...parent },
    rank: { ...rank },
    components: componentCount,
  });

  function find(x) {
    if (parent[x] !== x) {
      parent[x] = find(parent[x]);
    }
    return parent[x];
  }

  function union(x, y) {
    const rootX = find(x);
    const rootY = find(y);

    trace.push({
      type: 'find',
      node: x,
      root: rootX,
      from: x,
      to: rootX,
      description: `find(${x}) = ${rootX}`,
      parent: { ...parent },
    });

    trace.push({
      type: 'find',
      node: y,
      root: rootY,
      from: y,
      to: rootY,
      description: `find(${y}) = ${rootY}`,
      parent: { ...parent },
    });

    if (rootX === rootY) {
      trace.push({
        type: 'already_connected',
        from: x,
        to: y,
        root: rootX,
        description: `${x} and ${y} already in the same component (root: ${rootX}). Skip.`,
        parent: { ...parent },
        components: componentCount,
      });
      return;
    }

    if (rank[rootX] < rank[rootY]) {
      parent[rootX] = rootY;
      trace.push({
        type: 'union',
        from: x,
        to: y,
        merged_under: rootY,
        description: `Union(${x}, ${y}): attach ${rootX} under ${rootY} (rank[${rootY}] > rank[${rootX}])`,
        parent: { ...parent },
        rank: { ...rank },
        components: --componentCount,
      });
    } else if (rank[rootX] > rank[rootY]) {
      parent[rootY] = rootX;
      trace.push({
        type: 'union',
        from: x,
        to: y,
        merged_under: rootX,
        description: `Union(${x}, ${y}): attach ${rootY} under ${rootX} (rank[${rootX}] > rank[${rootY}])`,
        parent: { ...parent },
        rank: { ...rank },
        components: --componentCount,
      });
    } else {
      parent[rootY] = rootX;
      rank[rootX]++;
      trace.push({
        type: 'union',
        from: x,
        to: y,
        merged_under: rootX,
        description: `Union(${x}, ${y}): attach ${rootY} under ${rootX}, increment rank[${rootX}] to ${rank[rootX]}`,
        parent: { ...parent },
        rank: { ...rank },
        components: --componentCount,
      });
    }
  }

  for (const edge of graph.edges) {
    const u = String(edge.source);
    const v = String(edge.target);
    trace.push({
      type: 'process_edge',
      from: u,
      to: v,
      description: `Process edge (${u}, ${v}): should they be in the same component?`,
      parent: { ...parent },
      components: componentCount,
    });
    union(u, v);
  }

  // Find final components
  const componentMap = {};
  for (const id of nodes) {
    const root = find(id);
    if (!componentMap[root]) componentMap[root] = [];
    componentMap[root].push(id);
  }

  trace.push({
    type: 'result',
    description: `Union-Find complete. ${componentCount} connected component${componentCount !== 1 ? 's' : ''} found.`,
    parent: { ...parent },
    rank: { ...rank },
    components: componentCount,
    component_map: componentMap,
  });

  return trace;
}

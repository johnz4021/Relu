export function kruskal(graph) {
  const trace = [];
  const nodes = graph.nodes.map((n) => n.id);

  // Build edge list and sort by weight
  const edges = graph.edges.map((e) => ({
    source: e.source,
    target: e.target,
    weight: e.weight,
  }));
  edges.sort((a, b) => a.weight - b.weight);

  trace.push({
    type: 'init',
    pseudocode_line: 1,
    description: `Kruskal's algorithm: ${nodes.length} nodes, ${edges.length} edges. Sort edges by weight.`,
    edges: edges.map((e) => `${e.source}-${e.target}(${e.weight})`),
  });

  trace.push({
    type: 'sort_edges',
    pseudocode_line: 0,
    edges: edges.map((e) => ({ ...e })),
    description: `Edges sorted by weight: ${edges.map((e) => `${e.source}-${e.target}(${e.weight})`).join(', ')}`,
  });

  // Union-Find
  const parent = {};
  const rank = {};
  for (const id of nodes) {
    parent[id] = id;
    rank[id] = 0;
  }

  function find(x) {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(x, y) {
    const px = find(x);
    const py = find(y);
    if (px === py) return false;
    if (rank[px] < rank[py]) {
      parent[px] = py;
    } else if (rank[px] > rank[py]) {
      parent[py] = px;
    } else {
      parent[py] = px;
      rank[px]++;
    }
    return true;
  }

  const mstEdges = [];
  let totalWeight = 0;

  for (const edge of edges) {
    trace.push({
      type: 'consider_edge',
      pseudocode_line: 2,
      from: edge.source,
      to: edge.target,
      weight: edge.weight,
      description: `Consider edge ${edge.source}-${edge.target} (weight ${edge.weight})`,
    });

    const rootA = find(edge.source);
    const rootB = find(edge.target);

    trace.push({
      type: 'check_cycle',
      pseudocode_line: 3,
      from: edge.source,
      to: edge.target,
      root_from: rootA,
      root_to: rootB,
      would_cycle: rootA === rootB,
      description: rootA === rootB
        ? `${edge.source} and ${edge.target} are in the same component (root: ${rootA}). Adding this edge would create a cycle — reject it.`
        : `${edge.source} (component ${rootA}) and ${edge.target} (component ${rootB}) are in different components — safe to add.`,
    });

    if (union(edge.source, edge.target)) {
      mstEdges.push(edge);
      totalWeight += edge.weight;

      // Compute current components
      const components = {};
      for (const id of nodes) {
        const root = find(id);
        if (!components[root]) components[root] = [];
        components[root].push(id);
      }

      trace.push({
        type: 'add_to_mst',
        pseudocode_line: 4,
        from: edge.source,
        to: edge.target,
        weight: edge.weight,
        mst_weight: totalWeight,
        mst_edges: mstEdges.map((e) => ({ ...e })),
        components: Object.values(components),
        description: `Add edge ${edge.source}-${edge.target} to MST. Total MST weight: ${totalWeight}. Components: ${Object.values(components).map((c) => `{${c.join(',')}}`).join(' ')}`,
      });
    } else {
      trace.push({
        type: 'reject_edge',
        pseudocode_line: 7,
        from: edge.source,
        to: edge.target,
        weight: edge.weight,
        description: `Reject edge ${edge.source}-${edge.target} — would create a cycle.`,
      });
    }

    if (mstEdges.length === nodes.length - 1) break;
  }

  trace.push({
    type: 'result',
    pseudocode_line: 4,
    mst_edges: mstEdges.map((e) => ({ ...e })),
    total_weight: totalWeight,
    description: `Kruskal's complete! MST has ${mstEdges.length} edges with total weight ${totalWeight}.`,
  });

  return trace;
}

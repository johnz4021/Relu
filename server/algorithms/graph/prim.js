export function prim(graph, sourceId) {
  const trace = [];
  const nodes = graph.nodes.map((n) => n.id);
  const src = sourceId || nodes[0];

  // Build adjacency list (undirected — add both directions)
  const adj = {};
  for (const id of nodes) adj[id] = [];
  const seenPairs = new Set();
  for (const edge of graph.edges) {
    adj[edge.source].push({ target: edge.target, weight: edge.weight });
    const pairKey = [edge.source, edge.target].sort().join('-');
    if (!seenPairs.has(pairKey)) {
      seenPairs.add(pairKey);
      adj[edge.target].push({ target: edge.source, weight: edge.weight });
    }
  }

  const inMST = new Set();
  const key = {};    // minimum weight edge to connect node to MST
  const parent = {}; // which node connects this node to MST
  const mstEdges = [];

  for (const id of nodes) {
    key[id] = Infinity;
    parent[id] = null;
  }
  key[src] = 0;

  trace.push({
    type: 'init',
    description: `Prim's algorithm starting from node ${src}. Initialize all keys to Infinity, source key to 0.`,
    keys: { ...key },
  });

  for (let count = 0; count < nodes.length; count++) {
    // Find minimum key node not in MST
    let minKey = Infinity;
    let u = null;
    for (const id of nodes) {
      if (!inMST.has(id) && key[id] < minKey) {
        minKey = key[id];
        u = id;
      }
    }

    if (u === null) break;

    inMST.add(u);

    if (parent[u] !== null) {
      mstEdges.push({ source: parent[u], target: u, weight: key[u] });
    }

    trace.push({
      type: 'visit_node',
      node: u,
      key: key[u],
      parent: parent[u],
      description: parent[u]
        ? `Add node ${u} to MST via edge ${parent[u]}-${u} (weight ${key[u]})`
        : `Start with node ${u} (source)`,
      in_mst: [...inMST],
      mst_edges: mstEdges.map((e) => ({ ...e })),
    });

    for (const { target: v, weight: w } of adj[u]) {
      trace.push({
        type: 'consider_edge',
        from: u,
        to: v,
        weight: w,
        current_key: key[v],
        in_mst: inMST.has(v),
        description: inMST.has(v)
          ? `Edge ${u}-${v} (weight ${w}): ${v} already in MST, skip.`
          : `Edge ${u}-${v} (weight ${w}): current key(${v}) = ${key[v] === Infinity ? '∞' : key[v]}`,
      });

      if (!inMST.has(v) && w < key[v]) {
        key[v] = w;
        parent[v] = u;

        trace.push({
          type: 'update_key',
          node: v,
          new_key: w,
          via: u,
          description: `Update key(${v}) = ${w} via ${u}`,
          keys: { ...key },
        });
      }
    }
  }

  const totalWeight = mstEdges.reduce((sum, e) => sum + e.weight, 0);

  trace.push({
    type: 'result',
    mst_edges: mstEdges.map((e) => ({ ...e })),
    total_weight: totalWeight,
    description: `Prim's complete! MST has ${mstEdges.length} edges with total weight ${totalWeight}.`,
  });

  return trace;
}

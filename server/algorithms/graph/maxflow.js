// Ford-Fulkerson Max Flow (Edmonds-Karp BFS variant)

export const DEFAULT_FLOW_NETWORK = {
  nodes: [
    { id: 'S', label: 'S' },
    { id: 'A', label: 'A' },
    { id: 'B', label: 'B' },
    { id: 'C', label: 'C' },
    { id: 'D', label: 'D' },
    { id: 'T', label: 'T' },
  ],
  edges: [
    { source: 'S', target: 'A', weight: 10 },
    { source: 'S', target: 'B', weight: 5 },
    { source: 'A', target: 'B', weight: 5 },
    { source: 'A', target: 'C', weight: 7 },
    { source: 'B', target: 'D', weight: 10 },
    { source: 'C', target: 'T', weight: 7 },
    { source: 'D', target: 'T', weight: 8 },
  ],
  directed: true,
  positions: {
    S: { x: 100, y: 200 },
    A: { x: 300, y: 100 },
    B: { x: 300, y: 300 },
    C: { x: 500, y: 100 },
    D: { x: 500, y: 300 },
    T: { x: 700, y: 200 },
  },
};

export function maxflow(graph, source, sink) {
  const nodes = graph.nodes.map((n) => n.id);
  const edges = graph.edges;

  // Build adjacency with capacity
  const capacity = {};
  const flow = {};
  const adj = {};

  for (const id of nodes) {
    adj[id] = new Set();
  }

  const directed = graph.directed !== false;

  for (const e of edges) {
    const fwd = `${e.source}->${e.target}`;
    const rev = `${e.target}->${e.source}`;

    if (directed) {
      capacity[fwd] = e.weight;
      if (!capacity[rev]) capacity[rev] = 0;
    } else {
      // Undirected: both directions get the full capacity
      capacity[fwd] = (capacity[fwd] || 0) + e.weight;
      capacity[rev] = (capacity[rev] || 0) + e.weight;
    }

    if (!flow[fwd]) flow[fwd] = 0;
    if (!flow[rev]) flow[rev] = 0;
    adj[e.source].add(e.target);
    adj[e.target].add(e.source); // reverse edge for residual graph
  }

  const originalEdgeKeys = new Set(edges.map(e => `${e.source}->${e.target}`));

  function getEdgeLabels() {
    if (directed) {
      return edges.map((e) => {
        const key = `${e.source}->${e.target}`;
        return { from: e.source, to: e.target, label: `${flow[key]}/${capacity[key]}`, saturated: flow[key] >= capacity[key] };
      });
    }
    // Undirected: both directions for each original edge
    const labels = [];
    for (const e of edges) {
      const fwd = `${e.source}->${e.target}`, rev = `${e.target}->${e.source}`;
      labels.push({ from: e.source, to: e.target, label: `${flow[fwd]}/${capacity[fwd]}`, saturated: flow[fwd] >= capacity[fwd] });
      labels.push({ from: e.target, to: e.source, label: `${flow[rev]}/${capacity[rev]}`, saturated: flow[rev] >= capacity[rev] });
    }
    return labels;
  }

  function getResidualGraph() {
    const residual = {};
    for (const key of Object.keys(capacity)) {
      const r = capacity[key] - flow[key];
      if (r > 0) {
        residual[key] = {
          capacity: capacity[key],
          flow: flow[key],
          residual: r,
          is_reverse: !originalEdgeKeys.has(key),
        };
      }
    }
    return residual;
  }

  function bfs() {
    const parent = {};
    const visited = new Set([source]);
    const queue = [source];
    const explored = [];
    parent[source] = null;

    while (queue.length > 0) {
      const u = queue.shift();
      explored.push(u);
      for (const v of adj[u]) {
        const key = `${u}->${v}`;
        const residual = capacity[key] - flow[key];
        if (!visited.has(v) && residual > 0) {
          visited.add(v);
          parent[v] = u;
          if (v === sink) {
            explored.push(v);
            return { parent, explored };
          }
          queue.push(v);
        }
      }
    }
    return null;
  }

  function reconstructPath(parent) {
    const path = [];
    let v = sink;
    while (v !== null) {
      path.unshift(v);
      v = parent[v];
    }
    return path;
  }

  const trace = [];

  // Init step
  trace.push({
    type: 'init',
    pseudocode_line: 0,
    description: 'Initialize all flows to 0',
    edge_labels: getEdgeLabels(),
    total_flow: 0,
  });

  let totalFlow = 0;
  let iteration = 0;

  while (true) {
    const bfsResult = bfs();
    if (!bfsResult) {
      // No more augmenting paths
      trace.push({
        type: 'no_more_paths',
        pseudocode_line: 1,
        description: 'No more augmenting paths found in residual graph',
        edge_labels: getEdgeLabels(),
        total_flow: totalFlow,
        conceptual_state: {
          residual_graph: getResidualGraph(),
        },
      });
      break;
    }

    const { parent, explored } = bfsResult;
    iteration++;
    const path = reconstructPath(parent);

    // Find bottleneck
    let bottleneck = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      const key = `${path[i]}->${path[i + 1]}`;
      const residual = capacity[key] - flow[key];
      bottleneck = Math.min(bottleneck, residual);
    }

    // Identify reverse edges used in the path
    const reverseEdgesUsed = path.slice(0, -1).map((u, i) => {
      const v = path[i + 1];
      const isOriginalEdge = edges.some(e => e.source === u && e.target === v);
      return { from: u, to: v, is_reverse: !isOriginalEdge };
    });

    trace.push({
      type: 'find_augmenting_path',
      pseudocode_line: 2,
      description: `BFS found augmenting path: ${path.join(' → ')} with bottleneck capacity ${bottleneck}`,
      path,
      bottleneck,
      iteration,
      edge_labels: getEdgeLabels(),
      total_flow: totalFlow,
      conceptual_state: {
        residual_graph: getResidualGraph(),
        reverse_edges_used: reverseEdgesUsed,
        bfs_frontier_order: explored,
      },
    });

    // Push flow — capture before state for flow_changes
    const flowChangesBefore = path.slice(0, -1).map((u, i) => {
      const v = path[i + 1];
      const fwdKey = `${u}->${v}`;
      const revKey = `${v}->${u}`;
      return { fwdKey, revKey, fwdBefore: flow[fwdKey], revBefore: flow[revKey], cap: capacity[fwdKey] };
    });

    for (let i = 0; i < path.length - 1; i++) {
      const fwdKey = `${path[i]}->${path[i + 1]}`;
      const revKey = `${path[i + 1]}->${path[i]}`;
      flow[fwdKey] += bottleneck;
      flow[revKey] -= bottleneck;
    }
    totalFlow += bottleneck;

    const flowChanges = flowChangesBefore.map((b, i) => ({
      edge: `${path[i]}->${path[i + 1]}`,
      flow_before: b.fwdBefore,
      flow_after: flow[b.fwdKey],
      capacity: b.cap,
      reverse_flow_before: b.revBefore,
      reverse_flow_after: flow[b.revKey],
    }));

    trace.push({
      type: 'push_flow',
      pseudocode_line: 4,
      description: `Pushed ${bottleneck} units of flow along path. Total flow: ${totalFlow}`,
      path,
      bottleneck,
      iteration,
      edge_labels: getEdgeLabels(),
      total_flow: totalFlow,
      conceptual_state: {
        flow_changes: flowChanges,
        residual_graph: getResidualGraph(),
      },
    });

    // After the first push, emit a concept freeze for the residual graph lesson
    if (iteration === 1) {
      trace.push({
        type: 'residual_concept_freeze',
        pseudocode_line: 5,
        description: 'Concept freeze: examining the residual graph after first augmentation',
        edge_labels: getEdgeLabels(),
        total_flow: totalFlow,
        conceptual_state: {
          residual_graph: getResidualGraph(),
        },
      });
    }
  }

  // Compute min cut: BFS from source in residual graph
  const reachable = new Set([source]);
  const queue = [source];
  while (queue.length > 0) {
    const u = queue.shift();
    for (const v of adj[u]) {
      const key = `${u}->${v}`;
      if (!reachable.has(v) && capacity[key] - flow[key] > 0) {
        reachable.add(v);
        queue.push(v);
      }
    }
  }

  const sourceSide = nodes.filter((n) => reachable.has(n));
  const sinkSide = nodes.filter((n) => !reachable.has(n));
  const cutEdges = edges.filter(
    (e) => reachable.has(e.source) && !reachable.has(e.target)
  );
  const minCutValue = cutEdges.reduce((sum, e) => sum + e.weight, 0);

  trace.push({
    type: 'compute_min_cut',
    pseudocode_line: 7,
    description: `Min cut separates {${sourceSide.join(', ')}} from {${sinkSide.join(', ')}}. Cut capacity = ${minCutValue}`,
    source_side: sourceSide,
    sink_side: sinkSide,
    cut_edges: cutEdges.map((e) => ({ from: e.source, to: e.target, capacity: e.weight })),
    min_cut_value: minCutValue,
    edge_labels: getEdgeLabels(),
    total_flow: totalFlow,
    conceptual_state: {
      reachable_via_residual: [...reachable],
      saturated_crossing_edges: cutEdges.map(e => ({
        from: e.source,
        to: e.target,
        capacity: e.weight,
        flow: flow[`${e.source}->${e.target}`],
      })),
    },
  });

  trace.push({
    type: 'result',
    pseudocode_line: 6,
    description: `Maximum flow = ${totalFlow}, which equals the minimum cut = ${minCutValue} (Max-Flow Min-Cut Theorem)`,
    max_flow: totalFlow,
    min_cut: minCutValue,
    source_side: sourceSide,
    sink_side: sinkSide,
    edge_labels: getEdgeLabels(),
  });

  return trace;
}

/**
 * DAG Shortest Path — single-source shortest paths on a directed acyclic graph.
 * Key insight: topological order ensures all predecessors of v are processed
 * before v, enabling a single-pass relaxation (no repeated rounds like Bellman-Ford).
 * Handles negative-weight edges (unlike Dijkstra). No negative cycles possible in DAGs.
 */

export const DEFAULT_DAG_GRAPH = {
  nodes: [
    { id: 'S', label: 'S' },
    { id: 'A', label: 'A' },
    { id: 'B', label: 'B' },
    { id: 'C', label: 'C' },
    { id: 'D', label: 'D' },
  ],
  edges: [
    { source: 'S', target: 'A', weight: 3 },
    { source: 'S', target: 'B', weight: 2 },
    { source: 'A', target: 'C', weight: 4 },
    { source: 'A', target: 'B', weight: -1 },
    { source: 'B', target: 'C', weight: 2 },
    { source: 'B', target: 'D', weight: 3 },
    { source: 'C', target: 'D', weight: 1 },
  ],
  directed: true,
  positions: {
    S: { x: 80, y: 200 },
    A: { x: 280, y: 100 },
    B: { x: 280, y: 300 },
    C: { x: 480, y: 200 },
    D: { x: 680, y: 200 },
  },
};

/**
 * Compute topological order via DFS post-order (internal, not traced).
 */
function topoSort(graph) {
  const adj = {};
  for (const node of graph.nodes) adj[node.id] = [];
  for (const edge of graph.edges) {
    adj[edge.source].push({ to: edge.target, weight: edge.weight });
  }

  const visited = new Set();
  const order = [];

  function dfs(u) {
    visited.add(u);
    for (const { to } of adj[u]) {
      if (!visited.has(to)) dfs(to);
    }
    order.unshift(u);
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) dfs(node.id);
  }

  return { order, adj };
}

export function dagShortest(graph, sourceId) {
  const trace = [];
  const dist = {};
  const prev = {};

  for (const node of graph.nodes) {
    dist[node.id] = Infinity;
    prev[node.id] = null;
  }
  dist[sourceId] = 0;

  const { order, adj } = topoSort(graph);

  trace.push({
    type: 'init',
    pseudocode_line: 0,
    description: `Topological order: [${order.join(', ')}]. Initialize dist[${sourceId}]=0, all others=∞`,
    distances: { ...dist },
    topo_order: [...order],
  });

  for (let i = 0; i < order.length; i++) {
    const u = order[i];

    trace.push({
      type: 'process_node',
      pseudocode_line: 2,
      node: u,
      topo_position: i,
      topo_order: [...order],
      distances: { ...dist },
      description: `Process node ${u} (topo position ${i}): dist[${u}] = ${dist[u] === Infinity ? '∞' : dist[u]}`,
    });

    for (const { to, weight } of adj[u]) {
      const newDist = dist[u] + weight;

      trace.push({
        type: 'examine_edge',
        pseudocode_line: 3,
        from: u,
        to,
        weight,
        current_dist: dist[to],
        new_dist: newDist,
        description: `Examine edge ${u}→${to} (w=${weight}): dist[${to}]=${dist[to] === Infinity ? '∞' : dist[to]}, proposed=${dist[u] === Infinity ? '∞' : newDist}`,
      });

      if (dist[u] !== Infinity && newDist < dist[to]) {
        dist[to] = newDist;
        prev[to] = u;

        trace.push({
          type: 'relax',
          pseudocode_line: 5,
          from: u,
          to,
          new_distance: newDist,
          description: `Relax: update dist[${to}] = ${newDist} (via ${u})`,
          distances: { ...dist },
          previous: { ...prev },
        });
      } else {
        trace.push({
          type: 'no_improvement',
          pseudocode_line: 4,
          from: u,
          to,
          description: `No improvement for ${u}→${to}`,
        });
      }
    }
  }

  trace.push({
    type: 'result',
    pseudocode_line: 6,
    distances: { ...dist },
    previous: { ...prev },
    description: 'DAG shortest path complete. Single-pass relaxation in topological order.',
  });

  return trace;
}

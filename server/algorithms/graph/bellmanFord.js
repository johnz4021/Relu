/**
 * Bellman-Ford single-source shortest path algorithm.
 * Supports negative-weight edges (unlike Dijkstra).
 * Produces a step-by-step trace for visualization.
 */

export const DEFAULT_BELLMAN_FORD_GRAPH = {
  nodes: [
    { id: 'A', label: 'A' },
    { id: 'B', label: 'B' },
    { id: 'C', label: 'C' },
    { id: 'D', label: 'D' },
    { id: 'E', label: 'E' },
  ],
  edges: [
    { source: 'A', target: 'B', weight: 6 },
    { source: 'A', target: 'C', weight: 7 },
    { source: 'B', target: 'C', weight: 8 },
    { source: 'B', target: 'D', weight: 5 },
    { source: 'B', target: 'E', weight: -4 },
    { source: 'C', target: 'D', weight: -3 },
    { source: 'C', target: 'E', weight: 9 },
    { source: 'D', target: 'B', weight: -2 },
    { source: 'E', target: 'D', weight: 7 },
  ],
  directed: true,
  positions: {
    A: { x: 100, y: 200 },
    B: { x: 300, y: 80 },
    C: { x: 300, y: 320 },
    D: { x: 550, y: 200 },
    E: { x: 750, y: 200 },
  },
};

export function bellmanFord(graph, sourceId) {
  const trace = [];
  const dist = {};
  const prev = {};

  // Initialize
  for (const node of graph.nodes) {
    dist[node.id] = Infinity;
    prev[node.id] = null;
  }
  dist[sourceId] = 0;

  // Collect all edges (respecting directed flag)
  const edges = [];
  for (const edge of graph.edges) {
    edges.push({ from: edge.source, to: edge.target, weight: edge.weight });
    if (graph.directed === false) {
      edges.push({ from: edge.target, to: edge.source, weight: edge.weight });
    }
  }

  trace.push({
    type: 'init',
    pseudocode_line: 0,
    description: `Initialize distances: source ${sourceId} = 0, all others = \u221E`,
    distances: { ...dist },
    previous: { ...prev },
  });

  const numNodes = graph.nodes.length;

  // |V| - 1 relaxation rounds
  for (let round = 1; round <= numNodes - 1; round++) {
    trace.push({
      type: 'begin_round',
      pseudocode_line: 2,
      round,
      total_rounds: numNodes - 1,
      description: `Begin relaxation round ${round} of ${numNodes - 1}`,
      distances: { ...dist },
    });

    for (const edge of edges) {
      const newDist = dist[edge.from] + edge.weight;

      trace.push({
        type: 'examine_edge',
        pseudocode_line: 4,
        from: edge.from,
        to: edge.to,
        weight: edge.weight,
        current_dist: dist[edge.to],
        new_dist: newDist,
        description: `Examine edge ${edge.from} \u2192 ${edge.to} (weight ${edge.weight}): dist(${edge.to}) = ${dist[edge.to] === Infinity ? '\u221E' : dist[edge.to]}, proposed = ${dist[edge.from] === Infinity ? '\u221E' : newDist}`,
        conceptual_state: {
          relaxation_check: {
            current_best: dist[edge.to],
            proposed: newDist,
            will_relax: dist[edge.from] !== Infinity && newDist < dist[edge.to],
          },
        },
      });

      if (dist[edge.from] !== Infinity && newDist < dist[edge.to]) {
        dist[edge.to] = newDist;
        prev[edge.to] = edge.from;

        trace.push({
          type: 'relax',
          pseudocode_line: 5,
          from: edge.from,
          to: edge.to,
          new_distance: newDist,
          description: `Relax: update dist(${edge.to}) = ${newDist}, prev(${edge.to}) = ${edge.from}`,
          distances: { ...dist },
          previous: { ...prev },
        });
      } else {
        trace.push({
          type: 'no_relax',
          pseudocode_line: 4,
          from: edge.from,
          to: edge.to,
          description: `No improvement for edge ${edge.from} \u2192 ${edge.to}`,
        });
      }
    }
  }

  // Build shortest paths
  const paths = {};
  for (const node of graph.nodes) {
    if (node.id === sourceId) continue;
    const path = [];
    let cur = node.id;
    const seen = new Set();
    while (cur !== null && !seen.has(cur)) {
      seen.add(cur);
      path.unshift(cur);
      cur = prev[cur];
    }
    if (path[0] === sourceId) {
      paths[node.id] = path;
    }
  }

  trace.push({
    type: 'result',
    pseudocode_line: 7,
    distances: { ...dist },
    previous: { ...prev },
    paths,
    description: 'Bellman-Ford complete. Final shortest distances and paths computed.',
  });

  return trace;
}

// Algorithm implementations with step-by-step trace output

export const DEFAULT_GRAPH = {
  nodes: [
    { id: 'A', label: 'A' },
    { id: 'B', label: 'B' },
    { id: 'C', label: 'C' },
    { id: 'D', label: 'D' },
    { id: 'E', label: 'E' },
    { id: 'F', label: 'F' },
  ],
  edges: [
    { source: 'A', target: 'B', weight: 4 },
    { source: 'A', target: 'C', weight: 2 },
    { source: 'B', target: 'D', weight: 3 },
    { source: 'B', target: 'E', weight: 1 },
    { source: 'C', target: 'B', weight: 1 },
    { source: 'C', target: 'E', weight: 5 },
    { source: 'D', target: 'F', weight: 2 },
    { source: 'E', target: 'D', weight: 1 },
    { source: 'E', target: 'F', weight: 4 },
  ],
  positions: {
    A: { x: 100, y: 200 },
    B: { x: 300, y: 100 },
    C: { x: 300, y: 300 },
    D: { x: 500, y: 100 },
    E: { x: 500, y: 300 },
    F: { x: 700, y: 200 },
  },
};

class MinPriorityQueue {
  constructor() {
    this.items = [];
  }
  enqueue(node, priority) {
    this.items.push({ node, priority });
    this.items.sort((a, b) => a.priority - b.priority);
  }
  dequeue() {
    return this.items.shift();
  }
  isEmpty() {
    return this.items.length === 0;
  }
  contains(node) {
    return this.items.some((item) => item.node === node);
  }
  updatePriority(node, priority) {
    this.items = this.items.filter((item) => item.node !== node);
    this.enqueue(node, priority);
  }
}

export function dijkstra(graph, sourceId) {
  const trace = [];
  const dist = {};
  const prev = {};
  const visited = new Set();
  const pq = new MinPriorityQueue();

  // Build adjacency list
  const adj = {};
  for (const node of graph.nodes) {
    adj[node.id] = [];
    dist[node.id] = Infinity;
    prev[node.id] = null;
  }
  for (const edge of graph.edges) {
    adj[edge.source].push({ target: edge.target, weight: edge.weight });
    if (graph.directed === false) {
      adj[edge.target].push({ target: edge.source, weight: edge.weight });
    }
  }

  // Init
  dist[sourceId] = 0;
  pq.enqueue(sourceId, 0);

  trace.push({
    type: 'init',
    pseudocode_line: 0,
    description: `Initialize distances: source ${sourceId} = 0, all others = Infinity`,
    distances: { ...dist },
    previous: { ...prev },
  });

  while (!pq.isEmpty()) {
    const { node: current } = pq.dequeue();

    if (visited.has(current)) continue;
    visited.add(current);

    trace.push({
      type: 'visit_node',
      pseudocode_line: 4,
      node: current,
      distance: dist[current],
      description: `Visit node ${current} with distance ${dist[current]}`,
      distances: { ...dist },
      visited: [...visited],
      conceptual_state: {
        priority_queue: pq.items.map(item => ({ node: item.node, priority: item.priority })),
        unvisited_neighbors: adj[current]
          .filter(({ target }) => !visited.has(target))
          .map(({ target, weight }) => ({
            node: target,
            current_dist: dist[target],
            potential_dist: dist[current] + weight,
            would_improve: dist[current] + weight < dist[target],
          })),
      },
    });

    for (const { target, weight } of adj[current]) {
      trace.push({
        type: 'examine_edge',
        pseudocode_line: 6,
        from: current,
        to: target,
        weight,
        current_dist: dist[target],
        new_dist: dist[current] + weight,
        description: `Examine edge ${current} → ${target} (weight ${weight}): current dist(${target}) = ${dist[target] === Infinity ? '∞' : dist[target]}, new dist = ${dist[current]} + ${weight} = ${dist[current] + weight}`,
        conceptual_state: {
          relaxation_check: {
            current_best: dist[target],
            proposed: dist[current] + weight,
            will_relax: dist[current] + weight < dist[target],
          },
        },
      });

      const newDist = dist[current] + weight;
      if (newDist < dist[target]) {
        dist[target] = newDist;
        prev[target] = current;

        if (pq.contains(target)) {
          pq.updatePriority(target, newDist);
        } else {
          pq.enqueue(target, newDist);
        }

        trace.push({
          type: 'relax',
          pseudocode_line: 7,
          from: current,
          to: target,
          new_distance: newDist,
          description: `Relax: update dist(${target}) = ${newDist}, prev(${target}) = ${current}`,
          distances: { ...dist },
          previous: { ...prev },
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
    while (cur !== null) {
      path.unshift(cur);
      cur = prev[cur];
    }
    if (path[0] === sourceId) {
      paths[node.id] = path;
    }
  }

  trace.push({
    type: 'result',
    pseudocode_line: 8,
    distances: { ...dist },
    previous: { ...prev },
    paths,
    description: 'Algorithm complete. Final shortest distances and paths computed.',
  });

  return trace;
}

export function bfs(graph, sourceId) {
  const trace = [];
  const visited = new Set();
  const parent = {};
  const queue = [];
  const distance = {};

  const adj = {};
  for (const node of graph.nodes) {
    adj[node.id] = [];
    parent[node.id] = null;
  }
  for (const edge of graph.edges) {
    adj[edge.source].push(edge.target);
    if (graph.directed === false) {
      adj[edge.target].push(edge.source);
    }
  }

  visited.add(sourceId);
  queue.push(sourceId);
  distance[sourceId] = 0;

  trace.push({
    type: 'init',
    pseudocode_line: 0,
    description: `BFS starting from node ${sourceId}. Add ${sourceId} to queue.`,
    queue: [...queue],
    visited: [...visited],
    distance: { ...distance },
  });

  while (queue.length > 0) {
    const current = queue.shift();

    trace.push({
      type: 'visit_node',
      pseudocode_line: 3,
      node: current,
      description: `Dequeue and visit node ${current}`,
      queue: [...queue],
      visited: [...visited],
    });

    for (const neighbor of adj[current]) {
      trace.push({
        type: 'examine_edge',
        pseudocode_line: 4,
        from: current,
        to: neighbor,
        description: `Examine edge ${current} → ${neighbor}${visited.has(neighbor) ? ' (already visited)' : ''}`,
      });

      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parent[neighbor] = current;
        queue.push(neighbor);
        distance[neighbor] = distance[current] + 1;

        trace.push({
          type: 'discover',
          pseudocode_line: 6,
          node: neighbor,
          from: current,
          description: `Discover node ${neighbor} at distance ${distance[neighbor]} from source`,
          queue: [...queue],
          visited: [...visited],
          distance: { ...distance },
          level: distance[neighbor],
        });
      }
    }
  }

  trace.push({
    type: 'result',
    pseudocode_line: 2,
    visited: [...visited],
    parent,
    distance: { ...distance },
    description: 'BFS complete. All reachable nodes visited.',
  });

  return trace;
}

export function dfs(graph, sourceId) {
  const trace = [];
  const visited = new Set();
  const parent = {};

  const adj = {};
  for (const node of graph.nodes) {
    adj[node.id] = [];
    parent[node.id] = null;
  }
  for (const edge of graph.edges) {
    adj[edge.source].push(edge.target);
    if (graph.directed === false) {
      adj[edge.target].push(edge.source);
    }
  }

  const stack = [];

  trace.push({
    type: 'init',
    description: `DFS starting from node ${sourceId}.`,
    visited: [],
    stack: [],
  });

  function dfsVisit(node, from) {
    visited.add(node);
    if (from) parent[node] = from;
    stack.push(node);

    trace.push({
      type: 'visit_node',
      node,
      from,
      description: `Visit node ${node} (depth ${stack.length})${from ? ` (from ${from})` : ' (start)'}`,
      visited: [...visited],
      stack: [...stack],
      depth: stack.length,
    });

    for (const neighbor of adj[node]) {
      trace.push({
        type: 'examine_edge',
        from: node,
        to: neighbor,
        description: `Examine edge ${node} → ${neighbor}${visited.has(neighbor) ? ' (already visited)' : ''}`,
      });

      if (!visited.has(neighbor)) {
        dfsVisit(neighbor, node);
      }
    }

    stack.pop();
    trace.push({
      type: 'backtrack',
      node,
      description: `Backtrack from node ${node}`,
      stack: [...stack],
    });
  }

  dfsVisit(sourceId, null);

  trace.push({
    type: 'result',
    visited: [...visited],
    parent,
    description: 'DFS complete. All reachable nodes visited.',
  });

  return trace;
}

export function runAlgorithm(algorithm, graph, sourceId) {
  switch (algorithm) {
    case 'dijkstra':
      return dijkstra(graph, sourceId);
    case 'bfs':
      return bfs(graph, sourceId);
    case 'dfs':
      return dfs(graph, sourceId);
    default:
      throw new Error(`Unknown algorithm: ${algorithm}`);
  }
}

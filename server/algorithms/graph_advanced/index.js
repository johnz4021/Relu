// Tier 1 implementations for advanced graph patterns.

// ── multi_source_bfs — Rotting Oranges / 01 Matrix ───────────────────────────
// Multi-source BFS from all '1' sources simultaneously (grid represented as flat graph).
export function multiSourceBfs(input) {
  const grid = input.grid || [[2, 1, 1], [1, 1, 0], [0, 1, 1]];
  const rows = grid.length, cols = grid[0].length;
  const trace = [];
  const dist = grid.map(row => row.map(cell => cell === 2 ? 0 : cell === 0 ? -1 : Infinity));
  const queue = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === 2) queue.push([r, c]);
    }
  }

  const nodes = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes.push({ id: `${r},${c}` });
    }
  }

  const edges = [];
  const dirs = [[0,1],[0,-1],[1,0],[-1,0]];

  trace.push({
    type: 'init',
    description: `Multi-source BFS from ${queue.length} rotten orange(s) on ${rows}×${cols} grid`,
    nodes, edges,
    sources: queue.map(([r,c]) => `${r},${c}`),
    distances: Object.fromEntries(nodes.map(n => [n.id, dist[+n.id.split(',')[0]][+n.id.split(',')[1]]])),
    pseudocode_line: 1,
  });

  let time = 0;
  let front = 0;

  while (front < queue.length) {
    const [r, c] = queue[front++];
    const cur = dist[r][c];

    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (dist[nr][nc] === Infinity) {
        dist[nr][nc] = cur + 1;
        time = Math.max(time, cur + 1);
        queue.push([nr, nc]);
        edges.push({ source: `${r},${c}`, target: `${nr},${nc}`, weight: dist[nr][nc] });
        trace.push({
          type: 'visit_node',
          description: `From (${r},${c}) at t=${cur}: rot neighbor (${nr},${nc}) at t=${cur+1}`,
          node: `${nr},${nc}`,
          from: `${r},${c}`,
          distances: Object.fromEntries(
            nodes.map(n => {
              const [ro, co] = n.id.split(',').map(Number);
              const d = dist[ro][co];
              return [n.id, d === Infinity ? '∞' : d === -1 ? 'wall' : d];
            })
          ),
          pseudocode_line: 6,
        });
      }
    }
  }

  const hasUnreachable = dist.some(row => row.some(d => d === Infinity));
  const answer = hasUnreachable ? -1 : time;

  trace.push({
    type: 'result',
    description: hasUnreachable ? 'Some oranges unreachable — answer: -1' : `All oranges rotten by t=${answer}`,
    nodes, edges,
    distances: Object.fromEntries(
      nodes.map(n => {
        const [ro, co] = n.id.split(',').map(Number);
        const d = dist[ro][co];
        return [n.id, d === Infinity ? '∞' : d === -1 ? 'wall' : d];
      })
    ),
    output: String(answer),
    pseudocode_line: 8,
  });

  return trace;
}

// Two rotten sources in opposite corners so the BFS fronts visibly spread in
// parallel and meet — the single-source LC Ex1 grid made "multi-source" a misnomer.
export const DEFAULT_MULTI_SOURCE_BFS_INPUT = {
  grid: [[2, 1, 1], [1, 1, 0], [0, 1, 2]],
};

// ── floyd_warshall — All-Pairs Shortest Path ──────────────────────────────────
export function floydWarshall(input) {
  const graph = input.graph || {
    nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
    edges: [
      { source: 'A', target: 'B', weight: 3 },
      { source: 'A', target: 'C', weight: 8 },
      { source: 'B', target: 'C', weight: 2 },
      { source: 'B', target: 'D', weight: 5 },
      { source: 'C', target: 'D', weight: 1 },
      { source: 'D', target: 'A', weight: 2 },
    ],
  };
  const nodeIds = graph.nodes.map(n => n.id);
  const n = nodeIds.length;
  const idx = Object.fromEntries(nodeIds.map((id, i) => [id, i]));
  const INF = Infinity;
  const trace = [];

  // Init dist matrix
  const dist = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => i === j ? 0 : INF)
  );
  for (const e of graph.edges) {
    dist[idx[e.source]][idx[e.target]] = e.weight;
  }

  const flatDist = () => {
    const d = {};
    for (const u of nodeIds) for (const v of nodeIds) {
      d[`${u}→${v}`] = dist[idx[u]][idx[v]] === INF ? '∞' : dist[idx[u]][idx[v]];
    }
    return d;
  };

  trace.push({
    type: 'init',
    description: `Floyd-Warshall: all-pairs shortest paths for ${n} nodes`,
    nodes: graph.nodes, edges: graph.edges,
    distances: flatDist(),
    pseudocode_line: 0,
  });

  for (let k = 0; k < n; k++) {
    const via = nodeIds[k];
    let updated = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (dist[i][k] + dist[k][j] < dist[i][j]) {
          dist[i][j] = dist[i][k] + dist[k][j];
          updated++;
        }
      }
    }
    trace.push({
      type: 'relax',
      description: `Via node ${via}: ${updated} path(s) improved`,
      node: via,
      distances: flatDist(),
      pseudocode_line: 5,
    });
  }

  // Check negative cycles
  const negCycle = nodeIds.some(u => dist[idx[u]][idx[u]] < 0);

  trace.push({
    type: 'result',
    description: negCycle
      ? 'Negative cycle detected'
      : `All-pairs shortest paths computed. Shortest A→D = ${dist[idx[nodeIds[0]]][idx[nodeIds[n-1]]]}`,
    nodes: graph.nodes,
    edges: graph.edges,
    distances: flatDist(),
    output: negCycle ? 'negative_cycle' : String(dist[0][n - 1]),
    pseudocode_line: 6,
  });

  return trace;
}

export const DEFAULT_FLOYD_WARSHALL_INPUT = {
  graph: {
    nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
    edges: [
      { source: 'A', target: 'B', weight: 3 },
      { source: 'A', target: 'C', weight: 8 },
      { source: 'B', target: 'C', weight: 2 },
      { source: 'B', target: 'D', weight: 5 },
      { source: 'C', target: 'D', weight: 1 },
      { source: 'D', target: 'A', weight: 2 },
    ],
    directed: true,
  },
};

// ── tarjan_bridges — Critical Connections (Bridge Finding) ────────────────────
export function tarjanBridges(input) {
  const graph = input.graph || {
    nodes: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }],
    edges: [
      { source: '0', target: '1' },
      { source: '1', target: '2' },
      { source: '2', target: '0' },
      { source: '1', target: '3' },
    ],
    directed: false,
  };
  const trace = [];
  const nodeIds = graph.nodes.map(n => n.id);
  const adj = {};
  for (const n of nodeIds) adj[n] = [];
  for (const e of graph.edges) {
    adj[e.source].push(e.target);
    adj[e.target].push(e.source);
  }

  const disc = {}, low = {}, visited = {};
  let timer = 0;
  const bridges = [];

  trace.push({
    type: 'init',
    description: `Tarjan bridge-finding on ${nodeIds.length} nodes. disc[]=discovery time, low[]=lowest reachable.`,
    nodes: graph.nodes, edges: graph.edges,
    visited: {},
    pseudocode_line: 9,
  });

  function dfs(u, parent) {
    visited[u] = true;
    disc[u] = low[u] = timer++;

    trace.push({
      type: 'visit_node',
      description: `Visit ${u}: disc[${u}]=${disc[u]}, low[${u}]=${low[u]}`,
      node: u, parent,
      visited: { ...visited },
      pseudocode_line: 1,
    });

    for (const v of adj[u]) {
      if (!visited[v]) {
        dfs(v, u);
        low[u] = Math.min(low[u], low[v]);

        if (low[v] > disc[u]) {
          bridges.push([u, v]);
          trace.push({
            type: 'examine_edge',
            description: `Bridge found: ${u}↔${v} (low[${v}]=${low[v]} > disc[${u}]=${disc[u]})`,
            from: u, to: v,
            is_bridge: true,
            visited: { ...visited },
            pseudocode_line: 6,
          });
        } else {
          trace.push({
            type: 'examine_edge',
            description: `${u}↔${v}: low[${v}]=${low[v]} ≤ disc[${u}]=${disc[u]} — not a bridge`,
            from: u, to: v,
            is_bridge: false,
            visited: { ...visited },
            pseudocode_line: 5,
          });
        }
      } else if (v !== parent) {
        low[u] = Math.min(low[u], disc[v]);
      }
    }
  }

  for (const n of nodeIds) {
    if (!visited[n]) dfs(n, null);
  }

  trace.push({
    type: 'result',
    description: bridges.length
      ? `Found ${bridges.length} bridge(s): ${bridges.map(([u,v]) => `${u}-${v}`).join(', ')}`
      : 'No bridges found — graph is 2-edge-connected',
    nodes: graph.nodes, edges: graph.edges,
    output: JSON.stringify(bridges),
    pseudocode_line: 9,
  });

  return trace;
}

export const DEFAULT_TARJAN_BRIDGES_INPUT = {
  graph: {
    nodes: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }],
    edges: [
      { source: '0', target: '1' },
      { source: '1', target: '2' },
      { source: '2', target: '0' },
      { source: '1', target: '3' },
    ],
    directed: false,
  },
};

// ── bipartite_check — Is Graph Bipartite? ─────────────────────────────────────
export function bipartiteCheck(input) {
  const graph = input.graph || {
    nodes: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }],
    edges: [
      { source: '0', target: '1' },
      { source: '0', target: '3' },
      { source: '1', target: '2' },
      { source: '2', target: '3' },
    ],
    directed: false,
  };
  const trace = [];
  const nodeIds = graph.nodes.map(n => n.id);
  const adj = {};
  for (const n of nodeIds) adj[n] = [];
  for (const e of graph.edges) {
    adj[e.source].push(e.target);
    adj[e.target].push(e.source);
  }

  const color = {};

  trace.push({
    type: 'init',
    description: `Check bipartiteness: try 2-coloring graph (Red/Blue). Conflict = not bipartite.`,
    nodes: graph.nodes, edges: graph.edges,
    visited: {},
    pseudocode_line: 0,
  });

  let bipartite = true;

  function bfs(start) {
    const queue = [start];
    color[start] = 0;
    let front = 0;

    while (front < queue.length && bipartite) {
      const u = queue[front++];
      trace.push({
        type: 'visit_node',
        description: `Color node ${u} as ${color[u] === 0 ? 'RED' : 'BLUE'}`,
        node: u,
        visited: { ...color },
        pseudocode_line: 3,
      });

      for (const v of adj[u]) {
        if (color[v] === undefined) {
          color[v] = 1 - color[u];
          queue.push(v);
        } else if (color[v] === color[u]) {
          bipartite = false;
          trace.push({
            type: 'examine_edge',
            description: `Conflict: ${u} and ${v} both ${color[u] === 0 ? 'RED' : 'BLUE'} — NOT bipartite`,
            from: u, to: v,
            visited: { ...color },
            pseudocode_line: 8,
          });
          return;
        } else {
          trace.push({
            type: 'examine_edge',
            description: `${u}(${color[u]===0?'R':'B'}) → ${v}(${color[v]===0?'R':'B'}): different colors ✓`,
            from: u, to: v,
            visited: { ...color },
            pseudocode_line: 6,
          });
        }
      }
    }
  }

  for (const n of nodeIds) {
    if (color[n] === undefined && bipartite) bfs(n);
  }

  trace.push({
    type: 'result',
    description: bipartite
      ? 'Graph IS bipartite — successfully 2-colored'
      : 'Graph is NOT bipartite — odd cycle detected',
    nodes: graph.nodes, edges: graph.edges,
    output: String(bipartite),
    pseudocode_line: 9,
  });

  return trace;
}

// The 0-2 chord creates an odd cycle (0-1-2), so the trace shows passing checks
// and then the conflict — the defining moment of the algorithm. The plain
// 4-cycle default 2-colored cleanly and the conflict branch never appeared.
export const DEFAULT_BIPARTITE_CHECK_INPUT = {
  graph: {
    nodes: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }],
    edges: [
      { source: '0', target: '1' },
      { source: '0', target: '3' },
      { source: '1', target: '2' },
      { source: '2', target: '3' },
      { source: '0', target: '2' },
    ],
    directed: false,
  },
};

// ── dijkstra_k_stops — Cheapest Flights Within K Stops ───────────────────────
// Modified Bellman-Ford / DP: dp[k][dest] = min cost using at most k edges
export function dijkstraKStops(input) {
  const n = input.n ?? 4;
  const flights = input.flights || [[0,1,100],[1,2,100],[0,2,500]];
  const src = input.src ?? 0;
  const dst = input.dst ?? 2;
  const k = input.k ?? 1;
  const trace = [];
  const INF = Infinity;

  let prev = new Array(n).fill(INF);
  prev[src] = 0;

  trace.push({
    type: 'init',
    description: `Cheapest flight ${src}→${dst} with at most ${k} stop(s)`,
    nodes: Array.from({ length: n }, (_, i) => ({ id: String(i) })),
    edges: flights.map(([s, d, w]) => ({ source: String(s), target: String(d), weight: w })),
    distances: Object.fromEntries(prev.map((c, i) => [String(i), c === INF ? '∞' : c])),
    pseudocode_line: 0,
  });

  for (let stop = 0; stop <= k; stop++) {
    const cur = [...prev];
    for (const [u, v, w] of flights) {
      if (prev[u] !== INF && prev[u] + w < cur[v]) {
        cur[v] = prev[u] + w;
        trace.push({
          type: 'relax',
          description: `Stop ${stop}: flight ${u}→${v} cost ${w}, total ${prev[u]+w} < ${prev[v] === INF ? '∞' : prev[v]}`,
          from: String(u), to: String(v), weight: w,
          distances: Object.fromEntries(cur.map((c, i) => [String(i), c === INF ? '∞' : c])),
          pseudocode_line: 5,
        });
      }
    }
    prev = cur;
  }

  const answer = prev[dst] === INF ? -1 : prev[dst];
  trace.push({
    type: 'result',
    description: answer === -1
      ? `No path from ${src} to ${dst} within ${k} stop(s)`
      : `Cheapest: ${answer} (${src}→${dst} within ${k} stop(s))`,
    nodes: Array.from({ length: n }, (_, i) => ({ id: String(i) })),
    edges: flights.map(([s, d, w]) => ({ source: String(s), target: String(d), weight: w })),
    distances: Object.fromEntries(prev.map((c, i) => [String(i), c === INF ? '∞' : c])),
    output: String(answer),
    pseudocode_line: 7,
  });

  return trace;
}

export const DEFAULT_DIJKSTRA_K_STOPS_INPUT = {
  n: 4, src: 0, dst: 3, k: 1,
  flights: [[0,1,100],[1,2,100],[2,3,100],[0,3,500]],
};

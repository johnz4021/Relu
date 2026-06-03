/**
 * Pseudocode line definitions for algorithm visualization.
 * Each algorithm maps to a string array where each element is one line.
 * Lines are 0-indexed and referenced by `pseudocode_line` in trace steps.
 */

export const PSEUDOCODE = {
  dijkstra: [
    'dist[source] ← 0',                   // 0
    'for all other v: dist[v] ← ∞',       // 1
    'PQ ← {(source, 0)}',                 // 2
    'while PQ not empty:',                 // 3
    '  u ← extract-min(PQ)',              // 4
    '  for each neighbor v of u:',         // 5
    '    if dist[u] + w(u,v) < dist[v]:', // 6
    '      dist[v] ← dist[u] + w(u,v)',  // 7
    '      add (v, dist[v]) to PQ',       // 8
  ],

  bfs: [
    'visited ← {source}',                 // 0
    'queue ← [source]',                    // 1
    'while queue not empty:',              // 2
    '  u ← dequeue()',                    // 3
    '  for each neighbor v of u:',         // 4
    '    if v not in visited:',           // 5
    '      visited.add(v)',               // 6
    '      queue.enqueue(v)',             // 7
  ],

  knapsack: [
    'dp[0][w] ← 0 for all w',             // 0
    'for i = 1 to n:',                     // 1
    '  for w = 0 to W:',                  // 2
    '    if weight[i] > w:',              // 3
    '      dp[i][w] ← dp[i-1][w]',       // 4
    '    else:',                           // 5
    '      skip ← dp[i-1][w]',           // 6
    '      take ← dp[i-1][w-wᵢ] + vᵢ',  // 7
    '      dp[i][w] ← max(skip, take)',   // 8
    'traceback to find selected items',    // 9
  ],

  maxflow: [
    'flow[e] ← 0 for all edges',          // 0
    'while ∃ augmenting path P (BFS):',    // 1
    '  bottleneck ← min residual on P',   // 2
    '  for each edge (u,v) on P:',         // 3
    '    flow[u→v] += bottleneck',        // 4
    '    flow[v→u] -= bottleneck',        // 5
    'max_flow ← Σ flow out of source',    // 6
    'min_cut ← edges crossing S/T split', // 7
  ],

  binary_search: [
    'left ← 0, right ← n-1',             // 0
    'while left ≤ right:',                 // 1
    '  mid ← ⌊(left + right) / 2⌋',     // 2
    '  if arr[mid] = target: return mid', // 3
    '  if arr[mid] < target:',            // 4
    '    left ← mid + 1',                // 5
    '  else:',                             // 6
    '    right ← mid - 1',               // 7
  ],

  kruskal: [
    'sort edges by weight',                // 0
    'mst ← ∅',                            // 1
    'for each edge (u,v) in order:',       // 2
    '  if find(u) ≠ find(v):',           // 3
    '    mst ← mst ∪ {(u,v)}',           // 4
    '    union(u, v)',                     // 5
    '  else:',                             // 6
    '    reject (would form cycle)',       // 7
  ],

  bellman_ford: [
    'dist[source] ← 0',                   // 0
    'for all other v: dist[v] ← ∞',       // 1
    'for i = 1 to |V| - 1:',              // 2
    '  for each edge (u, v, w):',         // 3
    '    if dist[u] + w < dist[v]:',      // 4
    '      dist[v] ← dist[u] + w',       // 5
    'return dist',                         // 6
  ],

  dag_shortest: [
    'order ← topological_sort(G)',        // 0
    'dist[s] ← 0; dist[v] ← ∞ for v≠s', // 1
    'for u in order:',                    // 2
    '  for each edge (u, v, w):',        // 3
    '    if dist[u] + w < dist[v]:',     // 4
    '      dist[v] ← dist[u] + w',      // 5
    'return dist',                        // 6
  ],

  quickselect: [
    'quickselect(arr, left, right, k):',        // 0
    '  if left = right: return arr[left]',      // 1
    '  pivot_idx ← partition(arr, left, right)',// 2
    '  if k = pivot_idx: return arr[k]',        // 3
    '  if k < pivot_idx:',                      // 4
    '    return quickselect(arr, left, pivot_idx−1, k)', // 5
    '  else:',                                  // 6
    '    return quickselect(arr, pivot_idx+1, right, k)', // 7
  ],

  huffman: [
    'freq ← frequency table of characters',         // 0
    'PQ ← min-heap of (char, freq) leaf nodes',     // 1
    'while |PQ| > 1:',                               // 2
    '  left ← extract-min(PQ)',                     // 3
    '  right ← extract-min(PQ)',                    // 4
    '  parent.freq ← left.freq + right.freq',       // 5
    '  parent.left ← left; parent.right ← right',  // 6
    '  PQ.insert(parent)',                          // 7
    'root ← PQ.extract-min()',                      // 8
    'assign codes: traverse tree (left=0, right=1)',// 9
  ],

  valid_sudoku: [
    'rows, cols, boxes ← 9 empty sets each',         // 0
    'for each non-empty cell (r, c) with value v:',  // 1
    '  if v in rows[r]:    return false',            // 2
    '  if v in cols[c]:    return false',            // 3
    '  if v in boxes[b]:   return false  // b = r/3*3 + c/3',  // 4
    '  // conflict found → stop',                    // 5
    '  rows[r].add(v); cols[c].add(v); boxes[b].add(v)',  // 6
    'return true',                                   // 7
  ],

  number_of_islands: [
    'islands ← 0',                                  // 0
    'for each cell (r, c) in grid:',               // 1
    '  if grid[r][c] = "1":',                      // 2
    '    islands += 1',                             // 3
    '    bfs(r, c)  // flood-fill island',         // 4
    '',                                             // 5
    'bfs(r, c):',                                   // 6
    '  queue ← [(r, c)]',                          // 7
    '  mark grid[r][c] ← "0"',                    // 8
    '  while queue not empty:',                     // 9
    '    (r, c) ← dequeue()',                      // 10
    '    for each neighbor (nr, nc):',             // 11
    '      if grid[nr][nc] = "1":',               // 12
    '        mark grid[nr][nc] ← "0"',            // 13
    '        queue.enqueue(nr, nc)',               // 14
  ],

  topological_sort: [
    'in_deg[v] ← in-degree for each v',           // 0
    'queue ← {v : in_deg[v] = 0}',                // 1
    'while queue not empty:',                       // 2
    '  u ← dequeue()',                             // 3
    '  sorted.append(u)',                          // 4
    '  for each neighbor v of u:',                 // 5
    '    in_deg[v] -= 1',                          // 6
    '    if in_deg[v] = 0: enqueue(v)',            // 7
    'if len(sorted) < |V|: cycle detected',        // 8
    'return sorted',                               // 9
  ],

  multi_source_bfs: [
    'dist ← {source: 0, wall: −1, fresh: ∞}',    // 0
    'queue ← all source nodes (e.g. rotten)',      // 1
    'while queue not empty:',                       // 2
    '  u ← dequeue()',                             // 3
    '  for each neighbor v of u:',                 // 4
    '    if dist[v] = ∞:',                         // 5
    '      dist[v] ← dist[u] + 1',               // 6
    '      enqueue(v)',                            // 7
    'return max(dist) or −1 if any ∞ remains',    // 8
  ],

  floyd_warshall: [
    'dist[i][i] ← 0; dist[i][j] ← w(i,j) or ∞', // 0
    'for k = 0 to n−1:  // relay through k',      // 1
    '  for i = 0 to n−1:',                        // 2
    '    for j = 0 to n−1:',                      // 3
    '      if dist[i][k] + dist[k][j] < dist[i][j]:', // 4
    '        dist[i][j] ← dist[i][k] + dist[k][j]',  // 5
    'return dist  // O(n³) all-pairs',            // 6
  ],

  tarjan_bridges: [
    'dfs(u, parent):',                             // 0
    '  disc[u] ← low[u] ← timer++',              // 1
    '  for each neighbor v:',                      // 2
    '    if v not visited:',                       // 3
    '      dfs(v, u)',                             // 4
    '      low[u] ← min(low[u], low[v])',        // 5
    '      if low[v] > disc[u]: bridge!',         // 6
    '    else if v ≠ parent:',                    // 7
    '      low[u] ← min(low[u], disc[v])',       // 8
    'for each unvisited u: dfs(u, null)',          // 9
  ],

  bipartite_check: [
    'for each uncolored node s:',                  // 0
    '  color[s] ← RED; queue ← [s]',             // 1
    '  while queue not empty:',                    // 2
    '    u ← dequeue()',                           // 3
    '    for each neighbor v:',                    // 4
    '      if v uncolored:',                       // 5
    '        color[v] ← opposite(color[u])',      // 6
    '      elif color[v] = color[u]:',             // 7
    '        return NOT bipartite',               // 8
    'return bipartite',                            // 9
  ],

  dijkstra_k_stops: [
    'prev[src] ← 0; prev[v] ← ∞ for v ≠ src',   // 0
    'for stop = 0 to k:',                          // 1
    '  cur ← copy(prev)',                          // 2
    '  for each flight (u→v, cost):',             // 3
    '    if prev[u] + cost < cur[v]:',            // 4
    '      cur[v] ← prev[u] + cost',             // 5
    '  prev ← cur',                               // 6
    'return prev[dst]  // −1 if ∞',              // 7
  ],

  lca_tree: [
    'lca(node, p, q):',                            // 0
    '  if node is null: return null',             // 1
    '  left  ← lca(node.left,  p, q)',           // 2
    '  right ← lca(node.right, p, q)',           // 3
    '  if node = p or node = q: return node',    // 4
    '  if left ≠ null and right ≠ null:',        // 5
    '    return node  // LCA found!',             // 6
    '  return left if left ≠ null else right',   // 7
  ],

  validate_bst: [
    'validate(node, min=−∞, max=+∞):',            // 0
    '  if node is null: return true',             // 1
    '  if node.val ≤ min or node.val ≥ max:',    // 2
    '    return false  // out of range',          // 3
    '  left  ← validate(left,  min, node.val)',  // 4
    '  right ← validate(right, node.val, max)',  // 5
    '  return left and right',                    // 6
  ],
};

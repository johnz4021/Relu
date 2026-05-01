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
};

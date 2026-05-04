import { dijkstra, bfs, dfs, DEFAULT_GRAPH, kruskal, prim, DEFAULT_UNDIRECTED_GRAPH, maxflow, DEFAULT_FLOW_NETWORK, bellmanFord, DEFAULT_BELLMAN_FORD_GRAPH, dagShortest, DEFAULT_DAG_GRAPH, unionFind, DEFAULT_UNION_FIND_GRAPH, topologicalSort, backtracking, wordSearch, DEFAULT_WORD_SEARCH_INPUT } from './graph/index.js';
import { mergesort } from './sorting/index.js';
import { knapsack, editDistance, lcs, coinChange, maxSubarray, DEFAULT_MAX_SUBARRAY_INPUT, wordBreak, DEFAULT_WORD_BREAK_INPUT, climbingStairs, DEFAULT_CLIMBING_STAIRS_INPUT, minPathSum, DEFAULT_MIN_PATH_SUM_INPUT } from './dp/index.js';
import { polyReduction, DEFAULT_REDUCTION_FORMULA } from './complexity/index.js';
import { quickselect, slidingWindow, DEFAULT_SLIDING_WINDOW_INPUT, binarySearch, twoPointers, intervalMerge, intervalScheduling, monotonicStack, slidingWindowString, DEFAULT_SLIDING_WINDOW_STRING_INPUT, validPalindrome, DEFAULT_VALID_PALINDROME_INPUT, expandPalindrome, DEFAULT_EXPAND_PALINDROME_INPUT, kmpSearch, DEFAULT_KMP_SEARCH_INPUT, findAnagrams, DEFAULT_FIND_ANAGRAMS_INPUT, rotateArray, DEFAULT_ROTATE_ARRAY_INPUT } from './searching/index.js';
import { huffman } from './compression/index.js';
import { heapOperations, trie, DEFAULT_TRIE_INPUT, bstInsert, treeDfs, DEFAULT_TREE_DFS_INPUT, treeLevelOrder, DEFAULT_TREE_LEVEL_ORDER_INPUT, treePath, DEFAULT_TREE_PATH_INPUT, lcaTree, DEFAULT_LCA_TREE_INPUT, validateBst, DEFAULT_VALIDATE_BST_INPUT } from './tree/index.js';
import { linkedListReversal, stackOperations, queueOperations, linkedListCycle, DEFAULT_LINKED_LIST_CYCLE_INPUT, mergeKSorted, DEFAULT_MERGE_K_SORTED_INPUT } from './linked/index.js';
// Tier 1 pattern modules
import { hashMapGrouping, DEFAULT_HASH_MAP_GROUPING_INPUT, frequencyCount, DEFAULT_FREQUENCY_COUNT_INPUT, twoSumHash, DEFAULT_TWO_SUM_HASH_INPUT, stringHash, DEFAULT_STRING_HASH_INPUT, setOperations, DEFAULT_SET_OPERATIONS_INPUT, bitOps, DEFAULT_BIT_OPS_INPUT, mathSimulation, DEFAULT_MATH_SIMULATION_INPUT, greedyChoice, DEFAULT_GREEDY_CHOICE_INPUT, jumpGameII, DEFAULT_JUMP_GAME_II_INPUT, validParentheses, DEFAULT_VALID_PARENTHESES_INPUT, taskScheduler, DEFAULT_TASK_SCHEDULER_INPUT, lruCache, DEFAULT_LRU_CACHE_INPUT } from './hashing/index.js';
import { prefixSum, DEFAULT_PREFIX_SUM_INPUT, differenceArray, DEFAULT_DIFFERENCE_ARRAY_INPUT } from './prefix/index.js';
import { lis, DEFAULT_LIS_INPUT, stockDp, DEFAULT_STOCK_DP_INPUT, intervalDp, DEFAULT_INTERVAL_DP_INPUT, palindromeDp, DEFAULT_PALINDROME_DP_INPUT, bitmaskDp, DEFAULT_BITMASK_DP_INPUT, treeDP, DEFAULT_TREE_DP_INPUT, houseRobber, DEFAULT_HOUSE_ROBBER_INPUT } from './dp_patterns/index.js';
import { multiSourceBfs, DEFAULT_MULTI_SOURCE_BFS_INPUT, floydWarshall, DEFAULT_FLOYD_WARSHALL_INPUT, tarjanBridges, DEFAULT_TARJAN_BRIDGES_INPUT, bipartiteCheck, DEFAULT_BIPARTITE_CHECK_INPUT, dijkstraKStops, DEFAULT_DIJKSTRA_K_STOPS_INPUT } from './graph_advanced/index.js';
import { topKHeap, DEFAULT_TOP_K_HEAP_INPUT, medianFinder, DEFAULT_MEDIAN_FINDER_INPUT, kClosestPoints, DEFAULT_K_CLOSEST_POINTS_INPUT } from './heap_patterns/index.js';
import { sievePrimes, DEFAULT_SIEVE_PRIMES_INPUT, fastPower, DEFAULT_FAST_POWER_INPUT, gcdAlgorithm, DEFAULT_GCD_ALGORITHM_INPUT, majorityVote, DEFAULT_MAJORITY_VOTE_INPUT } from './math_patterns/index.js';
import { rabinKarp, DEFAULT_RABIN_KARP_INPUT, manacher, DEFAULT_MANACHER_INPUT } from './string_advanced/index.js';
import { numberOfIslands, DEFAULT_NUMBER_OF_ISLANDS_INPUT, spiralMatrix, DEFAULT_SPIRAL_MATRIX_INPUT, rotateMatrix, DEFAULT_ROTATE_MATRIX_INPUT } from './matrix/index.js';
import { combinationSum, DEFAULT_COMBINATION_SUM_INPUT, subsets, DEFAULT_SUBSETS_INPUT, permutations, DEFAULT_PERMUTATIONS_INPUT } from './backtracking_patterns/index.js';
import { slidingWindowMax, DEFAULT_SLIDING_WINDOW_MAX_INPUT, jumpGame, DEFAULT_JUMP_GAME_INPUT } from './monotonic_deque/index.js';

/**
 * Central algorithm registry. Each entry defines:
 * - run: function(input) -> trace[]
 * - renderer: which client renderer to use
 * - category: grouping for the UI
 * - defaultInput: sample data for demos
 */
// `broken: true` → renderer mounts but never paints (the renderer's
// "Waiting for X data..." empty-state guard never clears because the
// runner doesn't emit a structural action like set_tree / init_grid /
// set_list with values / set_jobs). Filtered out of the LC classifier in
// leetcodeAgent.js so users never land on a silently-empty viz.
//
// Drain to zero. When fixing one of these:
//   1. Remove `broken: true` from this entry
//   2. Remove the algo from WIP_NO_STRUCTURAL_ACTION in
//      server/algorithms/pipeline.coverage.test.js
//   3. Verify visually with `/qa` or by re-running the LC problem in browser
export const ALGORITHMS = {
  dijkstra: {
    run: (input) => dijkstra(input.graph, input.source),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_GRAPH, source: 'A' },
    capabilities: { supports_directed: true, supports_undirected: true, supports_weighted: true, supports_unweighted: true, max_nodes: 12, max_edges: 20 },
  },
  bfs: {
    run: (input) => bfs(input.graph, input.source),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_GRAPH, source: 'A' },
    capabilities: { supports_directed: true, supports_undirected: true, supports_weighted: false, supports_unweighted: true, max_nodes: 12, max_edges: 20 },
  },
  dfs: {
    run: (input) => dfs(input.graph, input.source),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_GRAPH, source: 'A' },
    capabilities: { supports_directed: true, supports_undirected: true, supports_weighted: false, supports_unweighted: true, max_nodes: 12, max_edges: 20 },
  },
  mergesort: {
    run: (input) => mergesort(input.array),
    renderer: 'array',
    category: 'Sorting',
    defaultInput: { array: [38, 27, 43, 3, 9, 82, 10] },
    capabilities: { max_array_length: 15 },
  },
  knapsack: {
    run: (input) => knapsack(input.items, input.capacity),
    renderer: 'table',
    category: 'Dynamic Programming',
    defaultInput: {
      items: [
        { name: 'Laptop', weight: 3, value: 4 },
        { name: 'Guitar', weight: 1, value: 1 },
        { name: 'Turntable', weight: 4, value: 5 },
        { name: 'iPhone', weight: 2, value: 3 },
      ],
      capacity: 7,
    },
    capabilities: { max_table_rows: 8, max_table_cols: 8 },
  },
  edit_distance: {
    run: (input) => editDistance(input.str1, input.str2),
    renderer: 'table',
    category: 'Dynamic Programming',
    defaultInput: { str1: 'kitten', str2: 'sitting' },
    capabilities: { max_table_rows: 8, max_table_cols: 8 },
  },
  kruskal: {
    run: (input) => kruskal(input.graph),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_UNDIRECTED_GRAPH },
    capabilities: { supports_directed: false, supports_undirected: true, supports_weighted: true, supports_unweighted: false, max_nodes: 12, max_edges: 20 },
  },
  prim: {
    run: (input) => prim(input.graph, input.source),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_UNDIRECTED_GRAPH, source: 'A' },
    capabilities: { supports_directed: false, supports_undirected: true, supports_weighted: true, supports_unweighted: false, max_nodes: 12, max_edges: 20 },
  },
  maxflow: {
    run: (input) => maxflow(input.graph, input.source, input.sink),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_FLOW_NETWORK, source: 'S', sink: 'T' },
    capabilities: { supports_directed: true, supports_undirected: true, supports_weighted: true, supports_unweighted: false, max_nodes: 12, max_edges: 20 },
  },
  bellman_ford: {
    run: (input) => bellmanFord(input.graph, input.source),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_BELLMAN_FORD_GRAPH, source: 'A' },
    capabilities: { supports_directed: true, supports_undirected: true, supports_weighted: true, supports_negative_weights: true, max_nodes: 12, max_edges: 20 },
  },
  poly_reduction: {
    run: (input) => polyReduction(input.formula),
    renderer: 'graph',
    category: 'Complexity Theory',
    defaultInput: { formula: DEFAULT_REDUCTION_FORMULA, graph: { nodes: [], edges: [], directed: false, positions: {} } },
    capabilities: { supports_directed: false, max_nodes: 12 },
  },
  dag_shortest: {
    run: (input) => dagShortest(input.graph, input.source),
    renderer: 'graph',
    category: 'Dynamic Programming',
    defaultInput: { graph: DEFAULT_DAG_GRAPH, source: 'S' },
    capabilities: { supports_directed: true, supports_undirected: false, supports_weighted: true, supports_negative_weights: true, max_nodes: 12, max_edges: 20 },
  },
  quickselect: {
    run: (input) => quickselect(input.array, input.k ?? 0),
    renderer: 'array',
    category: 'Divide and Conquer',
    defaultInput: { array: [7, 2, 10, 3, 8, 1, 5], k: 3 },
    capabilities: { max_array_length: 12 },
  },
  huffman: {
    run: (input) => huffman(input.string ?? 'abcde'),
    renderer: 'tree',
    category: 'Greedy Algorithms',
    defaultInput: { string: 'abcde' },
    capabilities: { max_nodes: 30 },
  },
  heap_ops: {
    run: (input) => heapOperations(input.operations),
    renderer: 'tree',
    category: 'Data Structures',
    defaultInput: { operations: [{ type: 'insert', value: 3 }, { type: 'insert', value: 1 }, { type: 'insert', value: 5 }, { type: 'extract_min' }] },
    capabilities: { max_ops: 10 },
  },
  sliding_window: {
    run: (input) => slidingWindow(input.array, input.window_size ?? 3),
    renderer: 'array',
    category: 'Algorithms',
    defaultInput: DEFAULT_SLIDING_WINDOW_INPUT,
    capabilities: { max_array_length: 15 },
  },
  trie: {
    run: (input) => trie(input.operations),
    renderer: 'graph',
    category: 'Data Structures',
    defaultInput: DEFAULT_TRIE_INPUT,
    capabilities: { max_words: 10 },
  },
  union_find: {
    run: (input) => unionFind(input.graph),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_UNION_FIND_GRAPH },
    capabilities: { max_nodes: 12, max_edges: 20 },
  },

  // ── Phase 1: Free wins ────────────────────────────────────────────────────
  binary_search: {
    run: (input) => binarySearch(input.array, input.target),
    renderer: 'array',
    category: 'Searching',
    defaultInput: { array: [1, 3, 5, 7, 9, 11, 13], target: 7 },
    capabilities: { max_array_length: 20 },
  },
  coin_change: {
    run: (input) => coinChange(input.coins, input.amount),
    renderer: 'table',
    category: 'Dynamic Programming',
    defaultInput: { coins: [1, 5, 11], amount: 15 },
    capabilities: { max_table_cols: 20 },
  },
  lcs: {
    run: (input) => lcs(input.str1, input.str2),
    renderer: 'table',
    category: 'Dynamic Programming',
    defaultInput: { str1: 'ABCBDAB', str2: 'BDCAB' },
    capabilities: { max_table_rows: 8, max_table_cols: 8 },
  },
  bst_insert: {
    run: (input) => bstInsert(input.values),
    renderer: 'tree',
    category: 'Data Structures',
    defaultInput: { values: [5, 3, 7, 1, 4, 6, 8] },
    capabilities: { max_nodes: 15 },
  },
  tree_depth_dfs: {
    run: (input) => treeDfs(input),
    renderer: 'tree',
    category: 'Trees',
    defaultInput: DEFAULT_TREE_DFS_INPUT,
    capabilities: { max_nodes: 15 },
  },
  tree_level_order: {
    run: (input) => treeLevelOrder(input),
    renderer: 'tree',
    category: 'Trees',
    defaultInput: DEFAULT_TREE_LEVEL_ORDER_INPUT,
    capabilities: { max_nodes: 15 },
  },
  tree_path: {
    run: (input) => treePath(input),
    renderer: 'tree',
    category: 'Trees',
    defaultInput: DEFAULT_TREE_PATH_INPUT,
    capabilities: { max_nodes: 15 },
  },
  linked_list_reversal: {
    run: (input) => linkedListReversal(input.values),
    renderer: 'linked',
    category: 'Data Structures',
    defaultInput: { values: [1, 2, 3, 4, 5] },
    capabilities: { max_length: 10 },
  },
  stack_operations: {
    run: (input) => stackOperations(input.operations),
    renderer: 'linked',
    category: 'Data Structures',
    defaultInput: { operations: [{ type: 'push', value: 3 }, { type: 'push', value: 1 }, { type: 'push', value: 5 }, { type: 'pop' }, { type: 'push', value: 2 }] },
    capabilities: { max_ops: 15 },
  },
  queue_operations: {
    run: (input) => queueOperations(input.operations),
    renderer: 'linked',
    category: 'Data Structures',
    defaultInput: { operations: [{ type: 'enqueue', value: 1 }, { type: 'enqueue', value: 2 }, { type: 'dequeue' }] },
    capabilities: { max_ops: 15 },
  },

  // ── Phase 2: New implementations ─────────────────────────────────────────
  topological_sort: {
    run: (input) => topologicalSort(input.graph),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: {
      graph: {
        nodes: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }],
        edges: [{ source: '0', target: '1' }, { source: '0', target: '2' }, { source: '1', target: '3' }, { source: '2', target: '3' }],
        directed: true,
      },
    },
    capabilities: { supports_directed: true, supports_undirected: false, max_nodes: 12, max_edges: 20 },
  },
  two_pointers: {
    run: (input) => twoPointers(input.array, input.target),
    renderer: 'array',
    category: 'Searching',
    defaultInput: { array: [2, 7, 11, 15], target: 9 },
    capabilities: { max_array_length: 15 },
  },
  interval_merge: {
    run: (input) => intervalMerge(input.intervals),
    renderer: 'interval',
    category: 'Greedy Algorithms',
    defaultInput: { intervals: [{ start: 1, end: 3 }, { start: 2, end: 6 }, { start: 8, end: 10 }, { start: 15, end: 18 }] },
    capabilities: { max_intervals: 12 },
  },
  interval_scheduling: {
    run: (input) => intervalScheduling(input.jobs),
    renderer: 'interval',
    category: 'Greedy Algorithms',
    defaultInput: {
      jobs: [
        { id: 'a', name: 'A', start: 1, end: 4 },
        { id: 'b', name: 'B', start: 3, end: 5 },
        { id: 'c', name: 'C', start: 0, end: 6 },
        { id: 'd', name: 'D', start: 5, end: 7 },
        { id: 'e', name: 'E', start: 3, end: 9 },
        { id: 'f', name: 'F', start: 5, end: 9 },
        { id: 'g', name: 'G', start: 6, end: 10 },
        { id: 'h', name: 'H', start: 8, end: 11 },
      ],
    },
    capabilities: { max_jobs: 10, max_machines: 1 },
  },
  monotonic_stack: {
    run: (input) => monotonicStack(input.array),
    renderer: 'linked',
    category: 'Data Structures',
    defaultInput: { array: [2, 1, 5, 3, 6, 4, 8] },
    capabilities: { max_array_length: 12 },
  },
  backtracking: {
    run: (input) => backtracking(input.elements, 3),
    renderer: 'graph',
    category: 'Backtracking',
    defaultInput: { elements: [1, 2, 3] },
    capabilities: { max_nodes: 30, max_depth: 3, max_edges: 40 },
  },

  // ── String Renderer algorithms ────────────────────────────────────────────
  sliding_window_string: {
    run: (input) => slidingWindowString(input.s),
    renderer: 'string',
    category: 'String Algorithms',
    defaultInput: DEFAULT_SLIDING_WINDOW_STRING_INPUT,
    capabilities: { max_string_length: 20 },
  },
  valid_palindrome: {
    run: (input) => validPalindrome(input.s),
    renderer: 'string',
    category: 'String Algorithms',
    defaultInput: DEFAULT_VALID_PALINDROME_INPUT,
    capabilities: { max_string_length: 20 },
  },
  expand_palindrome: {
    run: (input) => expandPalindrome(input.s),
    renderer: 'string',
    category: 'String Algorithms',
    defaultInput: DEFAULT_EXPAND_PALINDROME_INPUT,
    capabilities: { max_string_length: 15, max_steps: 60 },
  },
  kmp_search: {
    run: (input) => kmpSearch(input.text, input.pattern),
    renderer: 'string',
    category: 'String Algorithms',
    defaultInput: DEFAULT_KMP_SEARCH_INPUT,
    capabilities: { max_text_length: 20, max_pattern_length: 15 },
  },
  find_anagrams: {
    run: (input) => findAnagrams(input.s, input.p),
    renderer: 'string',
    category: 'String Algorithms',
    defaultInput: DEFAULT_FIND_ANAGRAMS_INPUT,
    capabilities: { max_string_length: 20, max_pattern_length: 10 },
  },

  // ── Phase 3: Pattern-specific Tier 1 replacements (fixes cache-poisoning Tier 2 entries) ──
  max_subarray: {
    run: (input) => maxSubarray(input),
    renderer: 'array',
    category: 'Dynamic Programming',
    defaultInput: DEFAULT_MAX_SUBARRAY_INPUT,
    capabilities: { max_array_length: 15 },
  },
  word_break: {
    run: (input) => wordBreak(input),
    renderer: 'table',
    category: 'Dynamic Programming',
    defaultInput: DEFAULT_WORD_BREAK_INPUT,
    capabilities: { max_table_cols: 20 },
  },
  climbing_stairs: {
    run: (input) => climbingStairs(input),
    renderer: 'table',
    category: 'Dynamic Programming',
    defaultInput: DEFAULT_CLIMBING_STAIRS_INPUT,
    capabilities: { max_table_cols: 20 },
  },
  min_path_sum: {
    run: (input) => minPathSum(input),
    renderer: 'table',
    category: 'Dynamic Programming',
    defaultInput: DEFAULT_MIN_PATH_SUM_INPUT,
    capabilities: { max_table_rows: 8, max_table_cols: 8 },
  },
  word_search: {
    run: (input) => wordSearch(input),
    renderer: 'graph',
    category: 'Backtracking',
    defaultInput: DEFAULT_WORD_SEARCH_INPUT,
    capabilities: { max_nodes: 20, max_edges: 40 },
  },
  rotate_array: {
    run: (input) => rotateArray(input),
    renderer: 'array',
    category: 'Algorithms',
    defaultInput: DEFAULT_ROTATE_ARRAY_INPUT,
    capabilities: { max_array_length: 15 },
  },

  // ── Hashing / HashMap patterns (Tier 1) ──────────────────────────────────────
  hash_map_grouping: {
    run: (input) => hashMapGrouping(input),
    renderer: 'context', category: 'Data Structures',
    defaultInput: DEFAULT_HASH_MAP_GROUPING_INPUT,
    capabilities: { max_array_length: 12 },
  },
  frequency_count: {
    run: (input) => frequencyCount(input),
    renderer: 'context', category: 'Data Structures',
    defaultInput: DEFAULT_FREQUENCY_COUNT_INPUT,
    capabilities: { max_array_length: 15 },
  },
  two_sum_hash: {
    run: (input) => twoSumHash(input),
    renderer: 'context', category: 'Data Structures',
    defaultInput: DEFAULT_TWO_SUM_HASH_INPUT,
    capabilities: { max_array_length: 15 },
  },
  string_hash: {
    run: (input) => stringHash(input),
    renderer: 'context', category: 'Data Structures',
    defaultInput: DEFAULT_STRING_HASH_INPUT,
    capabilities: { max_array_length: 15 },
  },
  set_operations: {
    run: (input) => setOperations(input),
    renderer: 'context', category: 'Data Structures',
    defaultInput: DEFAULT_SET_OPERATIONS_INPUT,
    capabilities: { max_array_length: 15 },
  },
  bit_ops: {
    run: (input) => bitOps(input),
    renderer: 'context', category: 'Algorithms',
    defaultInput: DEFAULT_BIT_OPS_INPUT,
    capabilities: { max_array_length: 15 },
  },
  math_simulation: {
    run: (input) => mathSimulation(input),
    renderer: 'context', category: 'Algorithms',
    defaultInput: DEFAULT_MATH_SIMULATION_INPUT,
    capabilities: {},
  },
  greedy_choice: {
    run: (input) => greedyChoice(input),
    renderer: 'context', category: 'Greedy Algorithms',
    defaultInput: DEFAULT_GREEDY_CHOICE_INPUT,
    capabilities: { max_array_length: 15 },
  },
  jump_game_ii: {
    run: (input) => jumpGameII(input),
    renderer: 'context', category: 'Greedy Algorithms',
    defaultInput: DEFAULT_JUMP_GAME_II_INPUT,
    capabilities: { max_array_length: 15 },
  },
  valid_parentheses: {
    run: (input) => validParentheses(input),
    renderer: 'context', category: 'Data Structures',
    defaultInput: DEFAULT_VALID_PARENTHESES_INPUT,
    capabilities: {},
  },
  task_scheduler: {
    run: (input) => taskScheduler(input),
    renderer: 'context', category: 'Greedy Algorithms',
    defaultInput: DEFAULT_TASK_SCHEDULER_INPUT,
    capabilities: {},
  },
  lru_cache: {
    run: (input) => lruCache(input),
    renderer: 'context', category: 'Data Structures',
    defaultInput: DEFAULT_LRU_CACHE_INPUT,
    capabilities: {},
  },

  // ── Prefix Sum patterns (Tier 1) ──────────────────────────────────────────────
  prefix_sum: {
    run: (input) => prefixSum(input),
    renderer: 'array', category: 'Algorithms',
    defaultInput: DEFAULT_PREFIX_SUM_INPUT,
    capabilities: { max_array_length: 15 },
  },
  difference_array: {
    run: (input) => differenceArray(input),
    renderer: 'array', category: 'Algorithms',
    defaultInput: DEFAULT_DIFFERENCE_ARRAY_INPUT,
    capabilities: { max_array_length: 12 },
  },

  // ── DP Patterns (Tier 1) ──────────────────────────────────────────────────────
  lis: {
    run: (input) => lis(input),
    renderer: 'array', category: 'Dynamic Programming',
    defaultInput: DEFAULT_LIS_INPUT,
    capabilities: { max_array_length: 12 },
  },
  stock_dp: {
    run: (input) => stockDp(input),
    renderer: 'table', category: 'Dynamic Programming',
    defaultInput: DEFAULT_STOCK_DP_INPUT,
    capabilities: { max_table_cols: 10 },
  },
  interval_dp: {
    run: (input) => intervalDp(input),
    renderer: 'table', category: 'Dynamic Programming',
    defaultInput: DEFAULT_INTERVAL_DP_INPUT,
    capabilities: { max_table_rows: 8, max_table_cols: 8 },
  },
  palindrome_dp: {
    run: (input) => palindromeDp(input),
    renderer: 'table', category: 'Dynamic Programming',
    defaultInput: DEFAULT_PALINDROME_DP_INPUT,
    capabilities: { max_table_rows: 8, max_table_cols: 8 },
  },
  bitmask_dp: {
    run: (input) => bitmaskDp(input),
    renderer: 'table', category: 'Dynamic Programming',
    defaultInput: DEFAULT_BITMASK_DP_INPUT,
    capabilities: { max_table_rows: 16, max_table_cols: 4 },
  },
  tree_dp: {
    run: (input) => treeDP(input),
    renderer: 'tree', category: 'Dynamic Programming',
    defaultInput: DEFAULT_TREE_DP_INPUT,
    capabilities: {},
    broken: true,
  },
  house_robber: {
    run: (input) => houseRobber(input),
    renderer: 'array', category: 'Dynamic Programming',
    defaultInput: DEFAULT_HOUSE_ROBBER_INPUT,
    capabilities: { max_array_length: 12 },
  },

  // ── Advanced Graph patterns (Tier 1) ─────────────────────────────────────────
  multi_source_bfs: {
    run: (input) => multiSourceBfs(input),
    renderer: 'graph', category: 'Graph Algorithms',
    defaultInput: DEFAULT_MULTI_SOURCE_BFS_INPUT,
    capabilities: { max_nodes: 20, max_edges: 40 },
  },
  floyd_warshall: {
    run: (input) => floydWarshall(input),
    renderer: 'graph', category: 'Graph Algorithms',
    defaultInput: DEFAULT_FLOYD_WARSHALL_INPUT,
    capabilities: { supports_directed: true, max_nodes: 8, max_edges: 20 },
  },
  tarjan_bridges: {
    run: (input) => tarjanBridges(input),
    renderer: 'graph', category: 'Graph Algorithms',
    defaultInput: DEFAULT_TARJAN_BRIDGES_INPUT,
    capabilities: { supports_directed: false, max_nodes: 12, max_edges: 20 },
  },
  bipartite_check: {
    run: (input) => bipartiteCheck(input),
    renderer: 'graph', category: 'Graph Algorithms',
    defaultInput: DEFAULT_BIPARTITE_CHECK_INPUT,
    capabilities: { supports_directed: false, max_nodes: 12, max_edges: 20 },
  },
  dijkstra_k_stops: {
    run: (input) => dijkstraKStops(input),
    renderer: 'graph', category: 'Graph Algorithms',
    defaultInput: DEFAULT_DIJKSTRA_K_STOPS_INPUT,
    capabilities: { supports_directed: true, max_nodes: 12, max_edges: 20 },
  },

  // ── Heap patterns (Tier 1) ────────────────────────────────────────────────────
  top_k_heap: {
    run: (input) => topKHeap(input),
    renderer: 'tree', category: 'Data Structures',
    defaultInput: DEFAULT_TOP_K_HEAP_INPUT,
    capabilities: {},
    broken: true,
  },
  median_finder: {
    run: (input) => medianFinder(input),
    renderer: 'tree', category: 'Data Structures',
    defaultInput: DEFAULT_MEDIAN_FINDER_INPUT,
    capabilities: {},
    broken: true,
  },
  k_closest_points: {
    run: (input) => kClosestPoints(input),
    renderer: 'tree', category: 'Algorithms',
    defaultInput: DEFAULT_K_CLOSEST_POINTS_INPUT,
    capabilities: {},
    broken: true,
  },

  // ── Math patterns (Tier 1) ────────────────────────────────────────────────────
  sieve_primes: {
    run: (input) => sievePrimes(input),
    renderer: 'array', category: 'Algorithms',
    defaultInput: DEFAULT_SIEVE_PRIMES_INPUT,
    capabilities: { max_array_length: 31 },
  },
  fast_power: {
    run: (input) => fastPower(input),
    renderer: 'context', category: 'Algorithms',
    defaultInput: DEFAULT_FAST_POWER_INPUT,
    capabilities: {},
  },
  gcd_algorithm: {
    run: (input) => gcdAlgorithm(input),
    renderer: 'context', category: 'Algorithms',
    defaultInput: DEFAULT_GCD_ALGORITHM_INPUT,
    capabilities: {},
  },
  majority_vote: {
    run: (input) => majorityVote(input),
    renderer: 'context', category: 'Algorithms',
    defaultInput: DEFAULT_MAJORITY_VOTE_INPUT,
    capabilities: { max_array_length: 12 },
  },

  // ── String Advanced (Tier 1) ──────────────────────────────────────────────────
  rabin_karp: {
    run: (input) => rabinKarp(input),
    renderer: 'string', category: 'String Algorithms',
    defaultInput: DEFAULT_RABIN_KARP_INPUT,
    capabilities: {},
  },
  manacher: {
    run: (input) => manacher(input),
    renderer: 'string', category: 'String Algorithms',
    defaultInput: DEFAULT_MANACHER_INPUT,
    capabilities: {},
  },

  // ── Matrix patterns (Tier 1) ──────────────────────────────────────────────────
  number_of_islands: {
    run: (input) => numberOfIslands(input),
    renderer: 'graph', category: 'Graph Algorithms',
    defaultInput: DEFAULT_NUMBER_OF_ISLANDS_INPUT,
    capabilities: { max_nodes: 25, max_edges: 40 },
  },
  spiral_matrix: {
    run: (input) => spiralMatrix(input),
    renderer: 'array', category: 'Algorithms',
    defaultInput: DEFAULT_SPIRAL_MATRIX_INPUT,
    capabilities: { max_array_length: 20 },
  },
  rotate_matrix: {
    run: (input) => rotateMatrix(input),
    renderer: 'array', category: 'Algorithms',
    defaultInput: DEFAULT_ROTATE_MATRIX_INPUT,
    capabilities: { max_array_length: 20 },
  },

  // ── Backtracking patterns (Tier 1) ────────────────────────────────────────────
  combination_sum: {
    run: (input) => combinationSum(input),
    renderer: 'array', category: 'Backtracking',
    defaultInput: DEFAULT_COMBINATION_SUM_INPUT,
    capabilities: { max_array_length: 10 },
  },
  subsets: {
    run: (input) => subsets(input),
    renderer: 'array', category: 'Backtracking',
    defaultInput: DEFAULT_SUBSETS_INPUT,
    capabilities: { max_array_length: 8 },
  },
  permutations: {
    run: (input) => permutations(input),
    renderer: 'array', category: 'Backtracking',
    defaultInput: DEFAULT_PERMUTATIONS_INPUT,
    capabilities: { max_array_length: 6 },
  },

  // ── Monotonic Deque patterns (Tier 1) ─────────────────────────────────────────
  sliding_window_max: {
    run: (input) => slidingWindowMax(input),
    renderer: 'array', category: 'Algorithms',
    defaultInput: DEFAULT_SLIDING_WINDOW_MAX_INPUT,
    capabilities: { max_array_length: 15 },
  },
  jump_game: {
    run: (input) => jumpGame(input),
    renderer: 'array', category: 'Greedy Algorithms',
    defaultInput: DEFAULT_JUMP_GAME_INPUT,
    capabilities: { max_array_length: 12 },
  },

  // ── Tree Advanced (Tier 1) ────────────────────────────────────────────────────
  lca_tree: {
    run: (input) => lcaTree(input),
    renderer: 'tree', category: 'Tree Algorithms',
    defaultInput: DEFAULT_LCA_TREE_INPUT,
    capabilities: {},
  },
  validate_bst: {
    run: (input) => validateBst(input),
    renderer: 'tree', category: 'Tree Algorithms',
    defaultInput: DEFAULT_VALIDATE_BST_INPUT,
    capabilities: {},
  },

  // ── Linked List / Pointer patterns (Tier 1) ────────────────────────────────────
  linked_list_cycle: {
    run: (input) => linkedListCycle(input),
    renderer: 'tree', category: 'Data Structures',
    defaultInput: DEFAULT_LINKED_LIST_CYCLE_INPUT,
    capabilities: {},
    broken: true,
  },
  merge_k_sorted: {
    run: (input) => mergeKSorted(input),
    renderer: 'tree', category: 'Data Structures',
    defaultInput: DEFAULT_MERGE_K_SORTED_INPUT,
    capabilities: {},
    broken: true,
  },
};

/**
 * Run an algorithm from the registry (Tier 1 only).
 * Returns { trace, renderer, input } or throws if not found.
 */
export function runRegisteredAlgorithm(algorithmId, input) {
  const algo = ALGORITHMS[algorithmId];
  if (!algo) throw new Error(`Unknown algorithm: ${algorithmId}`);
  const actualInput = { ...algo.defaultInput, ...input };
  return {
    trace: algo.run(actualInput),
    renderer: algo.renderer,
    input: actualInput,
  };
}

/**
 * Run an algorithm with Tier 2 fallback (author agent).
 * Tier 1: Hand-written registry (run != null) → Tier 2: Cached generated → Tier 2: Generate new
 */
export async function runAlgorithmWithFallback(algorithmId, input, context) {
  const algo = ALGORITHMS[algorithmId];

  // Tier 1: Hand-written trace generator (only when run function exists)
  if (algo?.run) {
    const result = runRegisteredAlgorithm(algorithmId, input);
    return { ...result, tier: 1 };
  }

  // Tier 2: Lazy-import to avoid circular deps and keep startup fast
  const { getCachedGenerator, incrementHitCount, cacheGenerator, outputMatchesExpected } = await import('./cache.js');
  const { executeTraceInSandbox } = await import('./sandbox.js');

  // Renderer: use registry entry if available, otherwise guess from name
  const renderer = algo?.renderer || guessRenderer(algorithmId);
  // Merge default input from registry with provided input
  const actualInput = algo?.defaultInput ? { ...algo.defaultInput, ...input } : input;

  // Check cache — use compound key when a problem description is available
  const description = context?.description;
  const cached = await getCachedGenerator(algorithmId, description);
  if (cached) {
    await incrementHitCount(algorithmId, description);
    const trace = executeTraceInSandbox(cached.code, actualInput, 5000, cached.renderer);
    return { trace, renderer: cached.renderer, input: actualInput, tier: 2 };
  }

  // Generate new trace generator with up to 3 attempts.
  // On retry, the validation error message is fed back to the LLM as failureReason.
  const { generateTraceGenerator } = await import('../authorAgent.js');
  let code, trace, lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const attemptContext = attempt > 1
        ? { ...context, failureReason: lastError.message }
        : context;
      code = await generateTraceGenerator(algorithmId, renderer, description, attemptContext);
      trace = executeTraceInSandbox(code, actualInput, 5000, renderer);
      if (attempt > 1) {
        console.log(`[Registry] Attempt ${attempt}/3 succeeded for ${algorithmId}`);
      }
      break;
    } catch (err) {
      lastError = err;
      console.warn(`[Registry] Attempt ${attempt}/3 failed for ${algorithmId}: ${err.message}`);
      if (attempt === 3) throw err;
    }
  }

  // Validate node IDs in trace exist in input graph (for graph algorithms)
  if (renderer === 'graph' && actualInput?.graph?.nodes) {
    const validNodeIds = new Set(actualInput.graph.nodes.map(n => n.id));
    for (const step of trace) {
      if (step.node && !validNodeIds.has(step.node)) {
        console.warn(`[Registry] Trace references unknown node: ${step.node}`);
      }
      if (step.from && !validNodeIds.has(step.from)) {
        console.warn(`[Registry] Trace references unknown node: ${step.from}`);
      }
      if (step.to && !validNodeIds.has(step.to)) {
        console.warn(`[Registry] Trace references unknown node: ${step.to}`);
      }
    }
  }

  // Cache only when trace is long enough AND output matches expected (if known)
  if (trace.length >= 3) {
    if (outputMatchesExpected(trace, context?.expectedOutput)) {
      await cacheGenerator(algorithmId, { code, renderer, verifiedAt: Date.now() }, description);
    } else {
      const actual = [...trace].reverse().find(s => s.type === 'result')?.output;
      console.warn(`[Registry] Trace rejected (output mismatch): expected="${context.expectedOutput}" actual="${actual}" algo=${algorithmId}`);
    }
  }

  return { trace, renderer, input: actualInput, tier: 2 };
}

/**
 * Heuristic to guess the renderer for an unknown algorithm.
 * Checks registry entry first, then falls back to name-based pattern matching.
 */
function guessRenderer(algorithmId) {
  // Registry entry takes priority
  if (ALGORITHMS[algorithmId]?.renderer) return ALGORITHMS[algorithmId].renderer;

  const id = algorithmId.toLowerCase();
  // String renderer: string-semantic algorithms (palindrome, KMP, anagram, window on strings)
  if (id.includes('palindrome') || id.includes('kmp') || id.includes('anagram') || id.includes('window_string') || id.includes('rabin_karp')) return 'string';
  // Context renderer: hash maps, frequency tables, sets, counting
  if (id.includes('hash') || id.includes('freq') || id.includes('group') || id.includes('set_op') || id.includes('bit_op') || id.includes('math_sim') || id.includes('greedy_choice')) return 'context';
  if (id.includes('sort') || id.includes('search') || id.includes('pointer') || id.includes('window') || id.includes('prefix') || id.includes('array_manip') || id.includes('divide_conquer')) return 'array';
  if (id.includes('knapsack') || id.includes('lcs') || id.includes('edit') || id.includes('coin') || id.includes('matrix') || id.includes('string_dp') || id.includes('recursion_memo') || id.includes('dp')) return 'table';
  if (id.includes('tree') || id.includes('bst') || id.includes('avl') || id.includes('heap') || id.includes('red_black')) return 'tree';
  if (id.includes('linked') || id.includes('stack') || id.includes('queue')) return 'linked';
  if (id.includes('interval') || id.includes('schedule') || id.includes('machine') || id.includes('job') || id.includes('timeline') || id.includes('gantt') || id.includes('activity_selection')) return 'interval';
  return 'graph';
}

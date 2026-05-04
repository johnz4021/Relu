/**
 * Default context panel definitions for each algorithm.
 * These are auto-configured when run_algorithm completes,
 * so the agent doesn't need to specify them.
 */

import { PSEUDOCODE } from './pseudocode.js';

const PANEL_DEFAULTS = {
  // --- Graph algorithms ---
  dijkstra: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.dijkstra } },
    { id: 'distances', type: 'key_value', title: 'Distances' },
    { id: 'pq', type: 'collection', title: 'Priority Queue' },
  ],
  bfs: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.bfs } },
    { id: 'visited', type: 'collection', title: 'Visited' },
    { id: 'queue', type: 'collection', title: 'Queue' },
    { id: 'distances', type: 'key_value', title: 'Distances' },
  ],
  dfs: [
    { id: 'visited', type: 'collection', title: 'Visited' },
    { id: 'stack', type: 'collection', title: 'Call Stack' },
  ],
  kruskal: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.kruskal } },
    { id: 'mst_weight', type: 'key_value', title: 'MST' },
    { id: 'decisions', type: 'log', title: 'Edge Decisions' },
  ],
  prim: [
    { id: 'keys', type: 'key_value', title: 'Keys' },
    { id: 'decisions', type: 'log', title: 'Decisions' },
  ],
  maxflow: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.maxflow } },
    { id: 'flow_status', type: 'key_value', title: 'Flow Status' },
    { id: 'residual', type: 'key_value', title: 'Residual Capacities' },
    { id: 'aug_paths', type: 'log', title: 'Augmenting Paths' },
  ],

  // --- Sorting algorithms ---
  mergesort: [
    { id: 'stats', type: 'key_value', title: 'Stats' },
  ],

  // --- DP algorithms ---
  knapsack: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.knapsack } },
    { id: 'items', type: 'key_value', title: 'Items' },
    { id: 'expression', type: 'expression', title: 'Recurrence' },
    { id: 'decisions', type: 'log', title: 'Decisions' },
  ],
  edit_distance: [
    { id: 'expression', type: 'expression', title: 'Recurrence' },
    { id: 'decisions', type: 'log', title: 'Decisions' },
  ],

  // --- Complexity Theory ---
  poly_reduction: [
    { id: 'formula', type: 'expression', title: '3-SAT Formula',
      initial_data: { label: '3-SAT Formula', lines: [
        { label: 'C₁', text: '(x₁ ∨ ¬x₂ ∨ x₃)' },
        { label: 'C₂', text: '(¬x₁ ∨ x₂ ∨ ¬x₃)' },
        { label: 'C₃', text: '(x₁ ∨ x₂ ∨ x₃)' },
      ] } },
    { id: 'reduction_status', type: 'key_value', title: 'Reduction' },
    { id: 'log', type: 'log', title: 'Construction Log' },
  ],

  // --- Divide and Conquer ---
  quickselect: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.quickselect } },
    { id: 'stats', type: 'key_value', title: 'State' },
  ],

  // --- Graph (continued) ---
  bellman_ford: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.bellman_ford } },
    { id: 'distances', type: 'key_value', title: 'Distances' },
    { id: 'round_info', type: 'key_value', title: 'Round' },
  ],

  dag_shortest: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.dag_shortest } },
    { id: 'distances', type: 'key_value', title: 'Distances' },
    { id: 'topo_order', type: 'collection', title: 'Topo Order' },
  ],

  // --- Greedy ---
  huffman: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.huffman } },
    { id: 'freq_table', type: 'key_value', title: 'Frequencies' },
    { id: 'pq', type: 'collection', title: 'Priority Queue' },
    { id: 'codes', type: 'key_value', title: 'Codes' },
  ],

  // --- Phase 1 free wins ---
  binary_search: [
    { id: 'bounds', type: 'key_value', title: 'Search Bounds' },
  ],
  coin_change: [
    { id: 'expression', type: 'expression', title: 'Recurrence' },
    { id: 'decisions', type: 'log', title: 'Decisions' },
  ],
  lcs: [
    { id: 'expression', type: 'expression', title: 'Recurrence' },
    { id: 'decisions', type: 'log', title: 'Decisions' },
  ],
  bst_insert: [
    { id: 'stats', type: 'key_value', title: 'State' },
  ],
  linked_list_reversal: [
    { id: 'pointers', type: 'key_value', title: 'Pointers' },
  ],
  stack_operations: [
    { id: 'stats', type: 'key_value', title: 'Stack State' },
  ],
  queue_operations: [
    { id: 'stats', type: 'key_value', title: 'Queue State' },
  ],

  // --- Phase 2 new implementations ---
  topological_sort: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.topological_sort } },
    { id: 'in_degrees', type: 'key_value', title: 'In-Degrees' },
    { id: 'queue', type: 'collection', title: 'Zero-Degree Queue' },
    { id: 'sorted', type: 'collection', title: 'Sorted Order' },
  ],
  two_pointers: [
    { id: 'search_state', type: 'key_value', title: 'Search State' },
  ],
  interval_merge: [
    { id: 'stats', type: 'key_value', title: 'State' },
  ],
  interval_scheduling: [
    { id: 'stats', type: 'key_value', title: 'State' },
  ],
  monotonic_stack: [
    { id: 'answers', type: 'key_value', title: 'Next Greater Elements' },
  ],
  backtracking: [
    { id: 'current_subset', type: 'collection', title: 'Current Subset' },
    { id: 'recorded_subsets', type: 'log', title: 'Recorded Subsets' },
  ],

  // --- String Renderer algorithms ---
  sliding_window_string: [
    { id: 'char_freq', type: 'key_value', title: 'Char Freq' },
  ],
  valid_palindrome: [
    { id: 'pointer_state', type: 'key_value', title: 'Pointers' },
  ],
  expand_palindrome: [
    { id: 'palindrome_state', type: 'key_value', title: 'Best Palindrome' },
  ],
  find_anagrams: [
    { id: 'pattern_freq', type: 'key_value', title: 'Pattern Freq' },
    { id: 'window_freq', type: 'key_value', title: 'Window Freq' },
    { id: 'matches', type: 'log', title: 'Matches Found' },
  ],
  kmp_search: [
    { id: 'failure_fn', type: 'key_value', title: 'Failure Function' },
    { id: 'search_log', type: 'log', title: 'Search Log' },
  ],

  // --- Hashing / HashMap patterns ---
  hash_map_grouping: [
    { id: 'algorithm_state', type: 'key_value', title: 'Hash Map State' },
  ],
  frequency_count: [
    { id: 'algorithm_state', type: 'key_value', title: 'Frequency Table' },
  ],
  two_sum_hash: [
    { id: 'algorithm_state', type: 'key_value', title: 'Seen Values' },
  ],
  string_hash: [
    { id: 'algorithm_state', type: 'key_value', title: 'Char Map' },
  ],
  set_operations: [
    { id: 'algorithm_state', type: 'key_value', title: 'Set State' },
  ],
  bit_ops: [
    { id: 'algorithm_state', type: 'key_value', title: 'Bit State' },
  ],
  math_simulation: [
    { id: 'algorithm_state', type: 'key_value', title: 'Simulation State' },
  ],
  greedy_choice: [
    { id: 'algorithm_state', type: 'key_value', title: 'Greedy State' },
  ],
  jump_game_ii: [
    { id: 'algorithm_state', type: 'key_value', title: 'Jump State' },
  ],
  valid_parentheses: [
    { id: 'algorithm_state', type: 'key_value', title: 'Stack State' },
  ],
  task_scheduler: [
    { id: 'algorithm_state', type: 'key_value', title: 'Scheduler State' },
  ],
  lru_cache: [
    { id: 'algorithm_state', type: 'key_value', title: 'Cache State' },
  ],

  // --- Math patterns ---
  fast_power: [
    { id: 'algorithm_state', type: 'key_value', title: 'Power State' },
  ],
  gcd_algorithm: [
    { id: 'algorithm_state', type: 'key_value', title: 'GCD State' },
  ],
  majority_vote: [
    { id: 'algorithm_state', type: 'key_value', title: 'Vote State' },
  ],

  // --- Array/table/string renderer patterns ---
  prefix_sum: [],
  difference_array: [],
  lis: [
    { id: 'dp_state', type: 'key_value', title: 'Tails Array' },
  ],
  stock_dp: [
    { id: 'state_machine', type: 'key_value', title: 'State Machine' },
  ],
  interval_dp: [],
  palindrome_dp: [],
  bitmask_dp: [],
  house_robber: [
    { id: 'dp_values', type: 'key_value', title: 'DP Values' },
  ],
  sieve_primes: [],
  spiral_matrix: [
    { id: 'boundaries', type: 'key_value', title: 'Spiral Bounds' },
  ],
  rotate_matrix: [
    { id: 'phase', type: 'key_value', title: 'Phase' },
  ],
  combination_sum: [],
  subsets: [],
  permutations: [],
  sliding_window_max: [
    { id: 'deque_state', type: 'collection', title: 'Monotonic Deque' },
  ],
  jump_game: [],
  rabin_karp: [
    { id: 'hash_state', type: 'key_value', title: 'Hash Values' },
  ],
  manacher: [
    { id: 'palindrome_state', type: 'key_value', title: 'Palindrome State' },
  ],

  // --- Graph renderer patterns ---
  multi_source_bfs: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.multi_source_bfs } },
    { id: 'distances', type: 'key_value', title: 'Time to Reach' },
  ],
  floyd_warshall: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.floyd_warshall } },
    { id: 'distances', type: 'key_value', title: 'All-Pairs Distances' },
    { id: 'via_node', type: 'key_value', title: 'Current Via Node' },
  ],
  tarjan_bridges: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.tarjan_bridges } },
    { id: 'dfs_state', type: 'key_value', title: 'disc[ ] / low[ ]' },
    { id: 'bridges', type: 'log', title: 'Bridges Found' },
  ],
  bipartite_check: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.bipartite_check } },
    { id: 'coloring', type: 'key_value', title: 'Node Colors' },
    { id: 'decisions', type: 'log', title: 'Edge Decisions' },
  ],
  dijkstra_k_stops: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.dijkstra_k_stops } },
    { id: 'distances', type: 'key_value', title: 'Min Cost to Node' },
    { id: 'stop_info', type: 'key_value', title: 'Stop Budget' },
  ],
  number_of_islands: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.number_of_islands } },
  ],

  // --- Tree renderer patterns ---
  top_k_heap: [
    { id: 'heap_contents', type: 'collection', title: 'Heap (Top-K)' },
  ],
  median_finder: [
    { id: 'heap_stats', type: 'key_value', title: 'Heap State' },
  ],
  k_closest_points: [
    { id: 'heap_contents', type: 'collection', title: 'K Closest So Far' },
  ],
  tree_dp: [
    { id: 'dp_values', type: 'key_value', title: 'Path Values' },
  ],
  lca_tree: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.lca_tree } },
    { id: 'search_state', type: 'key_value', title: 'Search State' },
  ],
  validate_bst: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.validate_bst } },
    { id: 'valid_range', type: 'key_value', title: 'Valid Range' },
  ],
  linked_list_cycle: [
    { id: 'pointer_state', type: 'key_value', title: 'Pointer State' },
  ],
  merge_k_sorted: [
    { id: 'heap_state', type: 'collection', title: 'Min-Heap' },
    { id: 'result_so_far', type: 'log', title: 'Merged Result' },
  ],

  // --- Legacy fallback entries ---
  matrix_dp: [
    { id: 'algorithm_state', type: 'key_value', title: 'State' },
  ],
  array_manipulation: [
    { id: 'algorithm_state', type: 'key_value', title: 'State' },
  ],
  string_dp: [
    { id: 'algorithm_state', type: 'key_value', title: 'State' },
  ],
  divide_conquer_array: [
    { id: 'algorithm_state', type: 'key_value', title: 'State' },
  ],
  recursion_memoization: [
    { id: 'algorithm_state', type: 'key_value', title: 'Memo Table' },
  ],
  backtrack_grid: [],
};

/**
 * Return the default context panels for a given algorithm.
 * @param {string} algorithm - Algorithm identifier (e.g. 'dijkstra', 'knapsack')
 * @returns {Array<{id: string, type: string, title: string}>}
 */
export function getDefaultContextPanels(algorithm) {
  return PANEL_DEFAULTS[algorithm] || [];
}

// --- Mode-based presets for non-execution reasoning modes ---

const MODE_DEFAULTS = {
  greedy_design: {
    renderer: null, // determined by keyword matching on target algorithm
    context_panels: [
      {
        id: 'greedy_rule', type: 'expression', title: 'Greedy Rule',
        initial_data: { label: 'Greedy Rule', lines: [
          { label: 'Criterion', text: '___' },
        ] },
      },
      {
        id: 'proof_skeleton', type: 'expression', title: 'Proof Skeleton',
        initial_data: { label: 'Exchange Argument', lines: [
          { label: 'Lower bound', text: '___' },
          { label: 'Upper bound', text: '___' },
          { label: 'Combining', text: '___' },
        ] },
      },
    ],
  },
  dp_design: {
    renderer: 'table',
    context_panels: [
      {
        id: 'dp_definition', type: 'expression', title: 'DP Definition',
        initial_data: { label: 'Subproblem', lines: [
          { label: 'Definition', text: '___' },
        ] },
      },
      {
        id: 'recurrence', type: 'expression', title: 'Recurrence',
        initial_data: { label: 'Recurrence', lines: [
          { label: 'Recurrence', text: '___' },
          { label: 'Base case', text: '___' },
        ] },
      },
    ],
  },
  modeling: {
    renderer: null,
    context_panels: [
      {
        id: 'formulation', type: 'expression', title: 'Formulation',
        initial_data: { label: 'Formulation', lines: [
          { label: 'Variables', text: '___' },
          { label: 'Objective', text: '___' },
          { label: 'Constraints', text: '___' },
        ] },
      },
      {
        id: 'algorithm_state', type: 'key_value', title: 'Algorithm State',
      },
    ],
  },
  dc_design: {
    renderer: null,   // Agent chooses: recursion_tree for recurrences, graph for case-analysis
    context_panels: [
      {
        id: 'dc_structure', type: 'expression', title: 'D&C Structure',
        initial_data: { label: 'Divide & Conquer', lines: [
          { label: 'Split', text: '___' },
          { label: 'Subproblems', text: '___' },
          { label: 'Combine', text: '___' },
          { label: '$T(n)$', text: '___' },
        ] },
      },
      {
        id: 'recurrence', type: 'expression', title: 'Recurrence',
        initial_data: { label: 'Recurrence', lines: [
          { label: 'T(n)', text: '___' },
          { label: 'Case', text: '___' },
        ] },
      },
    ],
  },
  runtime: {
    renderer: null,   // Agent creates recursion_tree when ready to populate it (avoids empty "Waiting..." state)
    context_panels: [
      {
        id: 'runtime_analysis', type: 'expression', title: 'Runtime Analysis',
        initial_data: { label: 'Runtime', lines: [
          { label: '$T(n)$', text: '___' },
        ] },
      },
    ],
  },
};

/**
 * Return the default renderer and context panels for a non-execution reasoning mode.
 * @param {string} reasoning_mode - e.g. 'greedy_design', 'dp_design', 'modeling'
 * @returns {{ renderer: string|null, context_panels: Array } | null}
 */
export function getModeDefaultPanels(reasoning_mode) {
  return MODE_DEFAULTS[reasoning_mode] || null;
}

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
    { id: 'queue', type: 'collection', title: 'Queue' },
    { id: 'distances', type: 'key_value', title: 'Distances' },
  ],
  // The call stack is the DFS mechanism; the graph already highlights visited
  // nodes and algorithm_state was just the final result narration.
  dfs: [
    { id: 'stack', type: 'collection', title: 'Call Stack' },
  ],
  kruskal: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.kruskal } },
    { id: 'decisions', type: 'log', title: 'Edge Decisions' },
  ],
  // Prim's key array (min edge to each frontier node) is the mechanism; the
  // graph highlights chosen edges and algorithm_state was the result narration.
  prim: [
    { id: 'keys', type: 'key_value', title: 'Keys' },
  ],
  maxflow: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.maxflow } },
    { id: 'flow_status', type: 'key_value', title: 'Flow Status' },
    { id: 'residual', type: 'key_value', title: 'Residual Capacities' },
    { id: 'aug_paths', type: 'log', title: 'Augmenting Paths' },
  ],

  // --- Sorting algorithms ---
  // The array + recursion_tree viz carry the merge; the 0/0 stats panel added
  // nothing.
  mergesort: [],
  // (mergesort emits actions targeting a 'recursion_tree' renderer panel
  //  in addition to the 'array' renderer; multi-panel registration is handled
  //  by build_example_graph rather than this default list.)

  // --- DP algorithms ---
  knapsack: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.knapsack } },
    { id: 'items', type: 'key_value', title: 'Items' },
    { id: 'expression', type: 'expression', title: 'Recurrence' },
  ],
  // The recurrence (expression) + the animated grid carry DP; the per-cell
  // decisions log was reconstructable from both, so it's cut across DP algos.
  edit_distance: [
    { id: 'expression', type: 'expression', title: 'Recurrence' },
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
    { id: 'concepts', type: 'log', title: 'Concepts' },
    { id: 'attempt_log', type: 'log', title: 'Attempts' },
  ],

  // --- Divide and Conquer ---
  quickselect: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.quickselect } },
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
  // pq (the extract-2-min frontier) is the mechanism; codes is the answer
  // (char->code shape). freq_table is just the input, cut.
  huffman: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.huffman } },
    { id: 'pq', type: 'collection', title: 'Priority Queue' },
    { id: 'codes', type: 'key_value', title: 'Codes' },
  ],

  // --- Phase 1 free wins ---
  binary_search: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.binary_search } },
    { id: 'bounds', type: 'key_value', title: 'Search Bounds' },
  ],
  koko_eating_speed: [
    { id: 'bounds', type: 'key_value', title: 'Speed Range' },
    { id: 'feasibility', type: 'expression', title: 'Feasibility: hours at this speed' },
    { id: 'iterations', type: 'log', title: 'Iteration History' },
  ],
  coin_change: [
    { id: 'expression', type: 'expression', title: 'Recurrence' },
  ],
  lcs: [
    { id: 'expression', type: 'expression', title: 'Recurrence' },
  ],
  // Keeps one panel: it carries the comparison decision ("15 < 20 -> go left"),
  // the BST mechanism the tree highlight doesn't state. Retitled from "State".
  bst_insert: [
    { id: 'stats', type: 'key_value', title: 'Comparison' },
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
  ],
  two_pointers: [
    { id: 'search_state', type: 'key_value', title: 'Search State' },
  ],
  container_water: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.container_water } },
    { id: 'search_state', type: 'key_value', title: 'Container State' },
  ],
  board_backtracking: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.board_backtracking } },
    { id: 'board_state', type: 'key_value', title: 'Board State' },
  ],
  maximal_square: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.maximal_square } },
    { id: 'square_state', type: 'key_value', title: 'Best Square' },
  ],
  trapping_rain_water: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.trapping_rain_water } },
    { id: 'search_state', type: 'key_value', title: 'Water State' },
  ],
  product_except_self: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.product_except_self } },
    { id: 'algorithm_state', type: 'key_value', title: 'Pass State' },
  ],
  move_zeroes: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.move_zeroes } },
  ],
  find_peak: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.find_peak } },
    { id: 'bounds', type: 'key_value', title: 'Search Bounds' },
  ],
  search_rotated: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.search_rotated } },
    { id: 'bounds', type: 'key_value', title: 'Search Bounds' },
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
  min_window_substring: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.min_window_substring } },
    { id: 'window_state', type: 'key_value', title: 'Window State' },
  ],
  valid_palindrome: [
    { id: 'pointer_state', type: 'key_value', title: 'Pointers' },
  ],
  expand_palindrome: [
    { id: 'palindrome_state', type: 'key_value', title: 'Best Palindrome' },
  ],
  // The pattern-vs-window frequency comparison IS the mechanism; matches is the
  // result (the string renderer highlights found anagrams).
  find_anagrams: [
    { id: 'pattern_freq', type: 'key_value', title: 'Pattern Freq' },
    { id: 'window_freq', type: 'key_value', title: 'Window Freq' },
  ],
  // The failure function is the KMP insight; the string renderer shows matching.
  kmp_search: [
    { id: 'failure_fn', type: 'key_value', title: 'Failure Function' },
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
  longest_consecutive: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.longest_consecutive } },
    { id: 'algorithm_state', type: 'key_value', title: 'Set & Streaks' },
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
  prefix_sum: [
    { id: 'algorithm_state', type: 'key_value', title: 'State' },
  ],
  difference_array: [
    { id: 'algorithm_state', type: 'key_value', title: 'State' },
  ],
  // algorithm_state narrates the recurrence and the array renderer shows dp[],
  // so dp_state (dead) and the 0/0 stats panel are redundant.
  lis: [
    { id: 'algorithm_state', type: 'key_value', title: 'State' },
  ],
  // state_machine (dead) duplicated the table's held/sold/rest columns; the
  // recurrence carries the mechanism.
  stock_dp: [
    { id: 'expression', type: 'expression', title: 'Recurrence' },
  ],
  interval_dp: [
    { id: 'expression', type: 'expression', title: 'Recurrence' },
  ],
  palindrome_dp: [
    { id: 'expression', type: 'expression', title: 'Recurrence' },
  ],
  bitmask_dp: [
    { id: 'expression', type: 'expression', title: 'Recurrence' },
  ],
  // algorithm_state narrates the recurrence ("dp[2]=max(dp[1]=7,
  // dp[0]+nums[2]=11)=11") and the array renderer shows dp — so dp_values
  // (dead) and the 0/0 stats panel are redundant.
  house_robber: [
    { id: 'algorithm_state', type: 'key_value', title: 'State' },
  ],
  sieve_primes: [
    { id: 'algorithm_state', type: 'key_value', title: 'State' },
  ],
  // algorithm_state narrates the traversal ("Top row [0][0] = 1"); boundaries
  // was dead and the 0/0 stats panel added nothing.
  spiral_matrix: [
    { id: 'algorithm_state', type: 'key_value', title: 'State' },
  ],
  // expression carries the phase ("Transpose complete. Now reverse each row."),
  // so phase (dead), algorithm_state, and the 0/0 stats panel are redundant.
  rotate_matrix: [
    { id: 'expression', type: 'expression', title: 'Operation' },
  ],
  // algorithm_state narrates the current candidate ("Choose 2: current=[2]
  // remaining=5") — the mechanism. bounds rendered "undefined"; stats was 0/0.
  combination_sum: [
    { id: 'algorithm_state', type: 'key_value', title: 'State' },
  ],
  subsets: [
    { id: 'algorithm_state', type: 'key_value', title: 'State' },
  ],
  // algorithm_state narrates the current permutation; bounds rendered
  // "undefined"; stats was 0/0.
  permutations: [
    { id: 'algorithm_state', type: 'key_value', title: 'State' },
  ],
  // The monotonic deque IS the mechanism — fed as a visual collection (see the
  // mapArrayStep sliding_window_max branch). The text narration (algorithm_state)
  // and 0/0 stats are dropped in favor of the visual.
  sliding_window_max: [
    { id: 'deque_state', type: 'collection', title: 'Monotonic Deque' },
  ],
  jump_game: [
    { id: 'algorithm_state', type: 'key_value', title: 'State' },
  ],
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
    { id: 'bridges', type: 'log', title: 'Bridges Found' },
    { id: 'disc_low', type: 'key_value', title: 'Discovery / Low' },
  ],
  bipartite_check: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.bipartite_check } },
    { id: 'coloring', type: 'key_value', title: 'Node Colors' },
  ],
  dijkstra_k_stops: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.dijkstra_k_stops } },
    { id: 'distances', type: 'key_value', title: 'Min Cost to Node' },
  ],
  number_of_islands: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.number_of_islands } },
    { id: 'island_count', type: 'key_value', title: 'Islands' },
  ],

  // Single collapsed panel showing the three active constraint sets at once
  // (Row, Col, Box). Other 24 sets aren't visible — we only surface what's
  // load-bearing for the cell currently being scanned.
  valid_sudoku: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.valid_sudoku } },
    { id: 'constraint_state', type: 'key_value', title: 'Constraint state' },
  ],

  // --- Tree renderer patterns ---
  // Only declare panels the trace mapper actually feeds — an unfed default
  // sits on screen as "No entries yet" for the whole lesson (QA ISSUE-001,
  // 2026-06-12). The tutor agent creates its own extra panels live as needed.
  // Heaps render as a tree; the one thing the tree can't show is the size-K
  // boundary / extracted value, so heap_state survives and the duplicate
  // 'stats' panel is cut. heap_ops keeps the backing-array view instead
  // (the array<->tree index duality is its unique insight).
  top_k_heap: [
    { id: 'heap_state', type: 'key_value', title: 'Heap State' },
  ],
  median_finder: [
    { id: 'median_state', type: 'key_value', title: 'Median' },
  ],
  k_closest_points: [
    { id: 'heap_state', type: 'key_value', title: 'Heap State' },
  ],
  // Both earn their place: heap_array shows the backing-array<->tree index
  // duality (the insight), heap_state narrates ops on init/insert_start steps
  // that carry no structural snapshot. Not redundant.
  heap_ops: [
    { id: 'heap_array', type: 'collection', title: 'Heap Array' },
    { id: 'heap_state', type: 'key_value', title: 'Heap State' },
  ],
  tree_dp: [
    { id: 'tree_state', type: 'key_value', title: 'Tree State' },
  ],
  // The tree renderer already highlights p/q/LCA and the visited path, so
  // tree_state (and the dead search_state) are noise — pseudocode carries
  // the logic.
  lca_tree: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.lca_tree } },
  ],
  // valid_range (the propagating (min,max) invariant) IS the lesson and is fed
  // by the traverse mapper branch; tree_state duplicated the tree highlight.
  validate_bst: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.validate_bst } },
    { id: 'valid_range', type: 'key_value', title: 'Valid Range' },
  ],
  linked_list_cycle: [
    { id: 'pointer_state', type: 'key_value', title: 'Pointer State' },
  ],
  merge_k_sorted: [
    { id: 'source_lists', type: 'key_value', title: 'Source Lists' },
  ],
  // The height recurrence h=max(left,right)+1 (expression) is the mechanism.
  // Max-depth is a scalar result (cut stats); the tree already highlights
  // visited nodes (cut traversal_order).
  tree_depth_dfs: [
    { id: 'expression', type: 'expression', title: 'Computation' },
  ],
  // One mechanism panel (Queue) + one result panel (grouped Traversal Log,
  // which mirrors the problem's [[3],[9,20],[15,7]] output). The flat
  // Traversal Order was dropped: it duplicated the log and the tree's own
  // visited-node highlighting. Title is "Queue" not "BFS Queue" so it doesn't
  // name the algorithm before the student earns it in companion mode.
  tree_level_order: [
    { id: 'queue', type: 'collection', title: 'Queue' },
    { id: 'traversal_log', type: 'log', title: 'Traversal Log' },
  ],
  // path_state (current path + remaining target) is the mechanism; the
  // found/not-found log is a thin result the tree highlight already conveys.
  tree_path: [
    { id: 'path_state', type: 'key_value', title: 'Path State' },
  ],
  trie: [
    { id: 'trie_state', type: 'key_value', title: 'Trie State' },
  ],
  // parent forest = mechanism; components count = the answer for several LC
  // problems (Number of Connected Components, etc.). decisions log was
  // redundant with the graph's edge highlighting.
  union_find: [
    { id: 'components', type: 'key_value', title: 'Components' },
    { id: 'parent', type: 'key_value', title: 'Parent Pointers' },
  ],
  word_search: [
    { id: 'search_state', type: 'key_value', title: 'Search State' },
  ],
  // stats carries the dict-membership checks (the mechanism for word break);
  // decisions log was redundant with the grid.
  word_break: [
    { id: 'expression', type: 'expression', title: 'Recurrence' },
    { id: 'stats', type: 'key_value', title: 'Stats' },
  ],
  rotate_array: [
    { id: 'expression', type: 'expression', title: 'Operation' },
  ],
  // The array + window highlighting carry it; the 0/0 stats panel added nothing.
  sliding_window: [],
  max_subarray: [
    // id is mapper-frozen; title uses student-facing language (the panel tracks
    // the running best/current sums) rather than naming Kadane's algorithm.
    { id: 'kadane_state', type: 'key_value', title: 'Running Max' },
  ],
  // Additional table-renderer DP algos that need expression + decisions
  // panels that the mapper writes to but were not registered before:
  climbing_stairs: [
    { id: 'expression', type: 'expression', title: 'Recurrence' },
  ],
  min_path_sum: [
    { id: 'expression', type: 'expression', title: 'Recurrence' },
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

import Anthropic from '@anthropic-ai/sdk';
import { ALGORITHMS } from './algorithms/registry.js';

const client = new Anthropic();

const VALID_ALGORITHM_KEYS = Object.keys(ALGORITHMS);

const EXTRACTION_TOOL = {
  name: 'extract_leetcode_problem',
  description: 'Extract structured information from a LeetCode problem statement.',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'The problem title, e.g. "Number of Islands"',
      },
      problem_summary: {
        type: 'string',
        description: '1-2 sentence description of what the problem asks',
      },
      algorithm_key: {
        type: 'string',
        description: `The primary algorithm key that solves this problem. Must be one of: ${VALID_ALGORITHM_KEYS.join(', ')}. Use null if none apply.`,
        enum: [...VALID_ALGORITHM_KEYS, null],
      },
      confidence: {
        type: 'number',
        description: 'Confidence score 0.0-1.0 that the algorithm_key is correct',
      },
      test_case: {
        type: 'object',
        description: 'The Example 1 test case formatted to match the algorithm\'s input signature. See format examples in the prompt.',
      },
      test_case_source: {
        type: 'string',
        enum: ['example_1', 'example_2', 'generated'],
        description: 'Which example was used as the test case',
      },
      fallback_reason: {
        type: 'string',
        description: 'If algorithm_key is null or confidence < 0.7, explain why. Otherwise null.',
      },
    },
    required: ['title', 'problem_summary', 'algorithm_key', 'confidence', 'test_case', 'test_case_source'],
  },
};

const EXTRACTION_SYSTEM_PROMPT = `You are an algorithm classifier for a LeetCode visualization tool. Given a LeetCode problem statement, extract:
1. The primary algorithm that solves it
2. The Example 1 test case in the exact input format required by that algorithm

ALGORITHM KEY → INPUT FORMAT EXAMPLES:

bfs / dfs / dijkstra / bellman_ford / kruskal / prim / maxflow / dag_shortest / union_find:
  Input: { "graph": { "nodes": [{"id": "0"}, {"id": "1"}, ...], "edges": [{"source": "0", "target": "1"}, ...], "directed": false }, "source": "0" }
  Graph edges: always use string node IDs. For weighted: add "weight" field on each edge.
  Example — Number of Islands (bfs): convert 2D grid to graph nodes (row_col IDs), edges between adjacent 1s.

sliding_window:
  Input: { "array": [1, 2, 3, 4, 5], "window_size": 3 }
  Use for: Maximum sum subarray of size k, Longest substring without repeating characters (use window_size = inferred k from problem).

heap_ops:
  Input: { "operations": [{"type": "insert", "value": 5}, {"type": "extract_min"}] }
  Use for: Top-K problems, Kth largest element, merge K sorted lists.

trie:
  Input: { "operations": [{"type": "insert", "word": "apple"}, {"type": "search", "word": "app"}] }
  Use for: Word search, Implement Trie, autocomplete problems.

mergesort:
  Input: { "array": [38, 27, 43, 3, 9] }

knapsack:
  Input: { "items": [{"name": "A", "weight": 2, "value": 3}], "capacity": 5 }

edit_distance:
  Input: { "str1": "kitten", "str2": "sitting" }

binary_search:
  Input: { "array": [1, 3, 5, 7, 9, 11, 13], "target": 7 }
  Use for: Binary search on sorted array, search insert position, find peak element.

two_pointers:
  Input: { "array": [2, 7, 11, 15], "target": 9 }
  Note: array MUST be sorted. Use for: Two Sum II (sorted), valid palindrome, container with most water.

sliding_window:
  Input: { "array": [1, 2, 3, 4, 5], "window_size": 3 }
  Use for: Maximum sum subarray of size k, minimum size subarray sum (set window_size = inferred k).

coin_change:
  Input: { "coins": [1, 5, 11], "amount": 15 }
  Use for: Coin Change, minimum coins to make amount.

lcs:
  Input: { "str1": "ABCBDAB", "str2": "BDCAB" }
  Use for: Longest Common Subsequence, Longest Common Substring.

bst_insert:
  Input: { "values": [5, 3, 7, 1, 4] }
  Use for: Insert into BST, construct BST from sorted array. Max 15 values.

linked_list_reversal:
  Input: { "values": [1, 2, 3, 4, 5] }
  Use for: Reverse Linked List, reverse a portion of linked list.

stack_operations:
  Input: { "operations": [{"type": "push", "value": 3}, {"type": "push", "value": 1}, {"type": "pop"}] }
  Use for: Valid Parentheses, implement stack using queues.

queue_operations:
  Input: { "operations": [{"type": "enqueue", "value": 1}, {"type": "enqueue", "value": 2}, {"type": "dequeue"}] }
  Use for: Implement Queue, BFS queue management problems.

topological_sort:
  Input: { "graph": { "nodes": [{"id": "0"}, {"id": "1"}, {"id": "2"}], "edges": [{"source": "0", "target": "1"}, {"source": "1", "target": "2"}], "directed": true } }
  Use for: Course Schedule (detect cycle), task ordering, build dependencies. Must be directed graph.
  Disambiguation: Use topological_sort (not bfs/dfs) when the problem asks for an ordering of prerequisites/dependencies.

interval_merge:
  Input: { "intervals": [{"start": 1, "end": 3}, {"start": 2, "end": 6}, {"start": 8, "end": 10}] }
  Use for: Merge Intervals, insert interval, meeting rooms.

interval_scheduling:
  Input: { "jobs": [{"id": "a", "name": "A", "start": 1, "end": 4}, {"id": "b", "name": "B", "start": 3, "end": 5}] }
  Use for: Non-overlapping Intervals, activity selection, maximum number of non-overlapping intervals.
  Disambiguation: Use interval_scheduling (not interval_merge) when the goal is to SELECT maximum non-overlapping intervals, not merge them.

monotonic_stack:
  Input: { "array": [2, 1, 5, 3, 6, 4, 8] }
  Use for: Next Greater Element, Daily Temperatures, Largest Rectangle in Histogram.

backtracking:
  Input: { "elements": [1, 2, 3] }
  Use for: Subsets, Permutations, Combination Sum. Max 3 elements for visualization clarity.

hash_map_grouping:
  Input: { "words": ["eat", "tea", "tan", "ate", "nat", "bat"] }
  Use for: Group Anagrams, Categorize by property, bucket problems where sorting a key groups elements.
  Use when: problem asks to group/categorize items by a derived key (sort chars, sum, product, etc.)

frequency_count:
  Input: { "nums": [1, 1, 1, 2, 2, 3], "k": 2 }
  Use for: Top K Frequent Elements, Sort Characters by Frequency, Task Scheduler.
  Use when: problem asks for most/least frequent elements, or counting occurrences to decide output.

two_sum_hash:
  Input: { "nums": [2, 7, 11, 15], "target": 9 }
  Use for: Two Sum (unsorted array), 3Sum, 4Sum, subarray sum equals k with hash.
  Disambiguation: Use two_sum_hash (not two_pointers) when array is UNSORTED and problem requires O(n) hash lookup.

prefix_sum:
  Input: { "nums": [1, 2, 3, 4, 5], "target": 9 }
  Use for: Subarray Sum Equals K, Range Sum Query, Count Subarrays with Sum. Input: { "nums": [...], "target": k }

min_path_sum:
  Input: { "grid": [[1,3,1],[1,5,1],[4,2,1]] }
  Use for: Minimum Path Sum (LC64), Unique Paths (LC62, use a grid of 1s). Fill 2D DP table left-to-right, top-to-bottom; each cell depends on the cell above and to the left.

string_hash:
  Input: { "s": "egg", "t": "add" }
  Use for: Isomorphic Strings, Word Pattern, Find All Anagrams in String.
  Use when: problem checks character mapping consistency between two strings.

greedy_choice:
  Input: { "nums": [2, 3, 1, 1, 4] }
  Use for: Jump Game, Best Time to Buy and Sell Stock, Gas Station.
  Use when: greedy local choice (max reach, current profit) drives the solution without backtracking.

set_operations:
  Input: { "nums": [1, 2, 3, 1] }
  Use for: Contains Duplicate, Intersection of Two Arrays, Longest Consecutive Sequence.
  Use when: solution builds a set to check membership or compute set relationships.

bit_ops:
  Input: { "nums": [4, 1, 2, 1, 2] }
  Use for: Single Number (XOR), Count Bits, Reverse Bits, Power of Two.
  Use when: the core insight is a bitwise operation (XOR, AND, shift).

math_simulation:
  Input: { "n": 19 }
  Use for: Happy Number, Palindrome Number, Integer to Roman, Factorial Trailing Zeroes.
  Use when: problem is solved by simulating a mathematical process step by step.

rotate_array:
  Input: { "nums": [1, 2, 3, 4, 5, 6, 7], "k": 3 }
  Use for: Rotate Array (LC189) specifically. Three-reversal method.
  Do NOT use for: Move Zeroes, Product of Array Except Self, Next Permutation (these have no matching visualization).

word_break:
  Input: { "s": "leetcode", "wordDict": ["leet", "code"] }
  Use for: Word Break (LC139). 1D boolean DP where dp[i] = s[0..i-1] can be segmented.
  Do NOT use for: Decode Ways, Palindrome Partitioning, or Regex Matching (different recurrences/inputs).

max_subarray:
  Input: { "nums": [-2, 1, -3, 4, -1, 2, 1, -5, 4] }
  Use for: Maximum Subarray (LC53, Kadane's algorithm). Single-pass, track current_sum and max_sum.
  Do NOT use for: Find Peak Element or Count Inversions (different algorithms, no visualization).

climbing_stairs:
  Input: { "n": 6 }
  Use for: Climbing Stairs (LC70), Fibonacci Number (LC509). Input MUST be a single integer n.
  Do NOT use for: House Robber (needs {nums} array, different recurrence) or Decode Ways.

word_search:
  Input: { "board": [["A","B","C","E"],["S","F","C","S"],["A","D","E","E"]], "word": "ABCCED" }
  Use for: Word Search (LC79) only. DFS + backtracking on a 2D character grid.
  Do NOT use for: N-Queens or Sudoku Solver (incompatible input schemas).

tree_depth_dfs:
  Input: { "values": [3, 9, 20, null, null, 15, 7] }
  Use for: Maximum Depth of Binary Tree, Balanced Binary Tree, Diameter of Binary Tree, Count Good Nodes, Same Tree, Symmetric Tree, Subtree of Another Tree, Invert Binary Tree.
  Key insight: DFS visits every node and propagates a computed value (height, bool, count) bottom-up.
  Input format: level-order (BFS) array where null = missing child.

tree_level_order:
  Input: { "values": [3, 9, 20, null, null, 15, 7] }
  Use for: Binary Tree Level Order Traversal, Right Side View, Zigzag Level Order, Average of Levels, Minimum Depth (BFS finds shallowest leaf first).
  Key insight: BFS queue drains one full level at a time; result is a list of levels.

tree_path:
  Input: { "values": [5, 4, 8, 11, null, 13, 4, 7, 2, null, null, null, 1], "target": 22 }
  Use for: Path Sum I/II, Binary Tree Paths (list all root-to-leaf paths), Sum Root to Leaf Numbers, Binary Tree Maximum Path Sum.
  Key insight: DFS tracks a running sum/path from root to leaf; backtracks when a leaf is reached.

sliding_window_string:
  Input: { "s": "abcabcbb" }
  Use for: Longest Substring Without Repeating Characters (LC3), minimum window substring variants.
  Key insight: variable-size window tracks unique chars via a frequency map; window shrinks from left when a duplicate enters.
  Disambiguation: Use sliding_window_string (NOT sliding_window) when the input is a STRING, not a numeric array. sliding_window is for numeric max-sum windows.

valid_palindrome:
  Input: { "s": "racecar" }
  Use for: Valid Palindrome (LC125). Pre-filter non-alphanumeric chars and lowercase BEFORE passing to this algorithm.
  Key insight: two pointers from both ends moving inward.

expand_palindrome:
  Input: { "s": "babad" }
  Use for: Longest Palindromic Substring (LC5).
  Key insight: expand around each center (odd-length: single char, even-length: gap between chars).

kmp_search:
  Input: { "text": "hello", "pattern": "ll" }
  Use for: Find the Index of the First Occurrence in a String (LC28), strStr.
  Key insight: failure function (LPS array) avoids restarting pattern scan from index 0 on mismatch.

find_anagrams:
  Input: { "s": "cbaebabacd", "p": "abc" }
  Use for: Find All Anagrams in a String (LC438), Permutation in String (LC567).
  Key insight: fixed-size sliding window of length p.length; compare window freq map to pattern freq map.

DISAMBIGUATION RULES:
- interval_merge vs interval_scheduling: "merge" = combine overlapping ranges → interval_merge; "select max non-overlapping" → interval_scheduling
- topological_sort vs bfs/dfs: when problem explicitly involves dependency ordering or cycle detection in directed graph → topological_sort
- two_pointers vs sliding_window: two_pointers is for pair-sum on sorted array; sliding_window is for fixed/variable window on unsorted array
- binary_search vs two_pointers: binary_search for finding a value; two_pointers for finding a pair summing to target
- two_sum_hash vs two_pointers: two_sum_hash when array is UNSORTED; two_pointers when array IS sorted
- hash_map_grouping vs frequency_count: hash_map_grouping when grouping items by derived key; frequency_count when counting occurrences to find top-K or most frequent
- greedy_choice vs interval_scheduling: greedy_choice for non-interval greedy (jump game, stock prices); interval_scheduling for interval selection
- word_break vs lcs/edit_distance: use lcs for longest common subsequence, edit_distance for edit distance, word_break ONLY for Word Break (LC139) with wordDict input
- max_subarray vs divide_conquer_array: REMOVED — use max_subarray for Maximum Subarray (Kadane's); Find Peak / Count Inversions → null
- climbing_stairs vs recursion_memoization: REMOVED — use climbing_stairs ONLY for {n} input (Climbing Stairs, Fibonacci); House Robber → null
- word_search vs backtrack_grid: REMOVED — use word_search ONLY for board+word grid DFS; N-Queens/Sudoku → null
- min_path_sum vs matrix_dp: REMOVED — use min_path_sum for Minimum Path Sum and Unique Paths; Maximal Square → null
- rotate_array vs array_manipulation: REMOVED — use rotate_array ONLY for Rotate Array (LC189); Move Zeroes/Product Except Self → null
- tree_depth_dfs vs tree_level_order vs tree_path: depth/balance/comparison problems → tree_depth_dfs; level-by-level output → tree_level_order; root-to-leaf sum/path → tree_path
- bst_insert vs tree_depth_dfs: bst_insert ONLY when inserting values into a BST; tree_depth_dfs for any other binary tree operation
- bfs/dfs (graph keys) vs tree_* keys: use tree_* keys when the input IS a binary tree (root/left/right structure); use bfs/dfs for grid or general graph traversal
- word_search vs bfs/dfs: word_search when the problem is specifically about finding a word string in a char grid; bfs/dfs for flood fill, island count, or unweighted graph traversal

RULES:
- Prefer graph algorithms (bfs/dfs) for grid/matrix traversal problems — convert grid to graph
- Use confidence >= 0.7 only when you are certain of the algorithm
- Truncate test cases that exceed algorithm capability limits (max_nodes: 12 for graphs, max_array_length: 15 for arrays, max_words: 10 for trie, max_ops: 10 for heap)
- For graphs with more than 12 nodes: BFS from source node, keep only the first 12 reachable nodes and edges between them
- If the problem has multiple valid algorithms, pick the most canonical one
- Each Tier 1 key is specific: route ONLY the named canonical problem to it; prefer null over routing a mismatched problem to a wrong visualization
- Use null algorithm_key when the problem doesn't fit any registered key — a missing visualization is better than a wrong one`;

/**
 * Parse a LeetCode problem statement into structured extraction.
 * Returns { title, algorithm_key, confidence, test_case, test_case_source, fallback_reason }
 * Throws on timeout or API error.
 */
export async function parseLeetcodeProblem(problemText, anthropicClient) {
  const apiClient = anthropicClient || client;

  const extraction = await Promise.race([
    apiClient.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: EXTRACTION_SYSTEM_PROMPT,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'any' },
      messages: [
        {
          role: 'user',
          content: `Extract the algorithm and test case from this LeetCode problem:\n\n${problemText}`,
        },
      ],
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('parseLeetcodeProblem timeout')), 10000)
    ),
  ]);

  const toolUse = extraction.content.find(b => b.type === 'tool_use');
  if (!toolUse) {
    throw new Error('No tool_use block in extraction response');
  }

  return toolUse.input;
}

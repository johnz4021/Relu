import Anthropic from '@anthropic-ai/sdk';
import { ALGORITHMS } from './algorithms/registry.js';
import { EXTRACTION_MODEL } from './models.js';

const client = new Anthropic();

// poly_reduction is a CS theory visualization not present on LeetCode; exclude from LC classification.
// `broken: true` algos are filtered out so users never land on a silently-empty viz panel —
// the LC classifier returns null for these problems and the agent falls back to text-only tutor mode.
// See `broken` field doc comment in algorithms/registry.js for how to clear an entry.
const VALID_ALGORITHMS = Object.fromEntries(
  Object.entries(ALGORITHMS).filter(([k, v]) => k !== 'poly_reduction' && !v.broken)
);
const VALID_ALGORITHM_KEYS = Object.keys(VALID_ALGORITHMS);

/**
 * Auto-generate the INPUT FORMAT EXAMPLES block from the algorithm registry.
 * Each algorithm's defaultInput is serialized as the format hint for haiku.
 * Hand-authored Use-for/disambiguation rules live separately in EXTRACTION_SYSTEM_PROMPT.
 *
 * Caller is expected to pass an already-filtered algorithm map (no poly_reduction,
 * no broken entries). This function preserves that filter contract as a backstop.
 */
export function generateInputFormats(algorithms) {
  return Object.entries(algorithms)
    .filter(([key, entry]) => key !== 'poly_reduction' && !entry.broken && entry.defaultInput != null)
    .map(([key, entry]) => {
      const formatted = JSON.stringify(entry.defaultInput, null, 2)
        .split('\n').map(l => '  ' + l).join('\n');
      return `${key}:\n  Input: ${formatted}`;
    })
    .join('\n\n');
}

export const EXTRACTION_TOOL = {
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
      pattern_key: {
        type: 'string',
        description: 'REQUIRED whenever algorithm_key is null or confidence < 0.7: a free-form snake_case descriptor of the solving pattern (e.g. "product_except_self", "n_queens_backtracking", "merge_intervals_variant"). Name the pattern honestly — it seeds an AI-authored trace generator. Null only when algorithm_key is confident.',
      },
      pattern_renderer: {
        type: 'string',
        enum: ['graph', 'array', 'table', 'tree', 'linked', 'interval', 'string', 'context', 'recursion_tree'],
        description: 'REQUIRED alongside pattern_key: the renderer that best fits the data the algorithm manipulates (array → "array", 2D DP grid → "table", hash map/counting state → "context", etc.).',
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
      expected_output: {
        type: 'string',
        description: 'The expected output from Example 1 as a plain string (e.g. "MMMDCCXLIX", "3", "[0,1]", "true"). Omit if no example output is present in the problem.',
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

${generateInputFormats(VALID_ALGORITHMS)}
DISAMBIGUATION RULES:
- interval_merge vs interval_scheduling: "merge" = combine overlapping ranges → interval_merge; "select max non-overlapping" → interval_scheduling
- topological_sort vs bfs/dfs: when problem explicitly involves dependency ordering or cycle detection in directed graph → topological_sort
- two_pointers vs sliding_window: two_pointers is for pair-sum on sorted array; sliding_window is for fixed/variable window on unsorted array
- container_water: Use for Container With Most Water (LC11) — converging two-pointer area maximization on { heights }. NOT two_pointers (no target sum) and NOT Trapping Rain Water (→ trapping_rain_water)
- trapping_rain_water: Use for Trapping Rain Water (LC42) — two-pointer water accumulation on { heights }. LC42 SUMS water trapped above every bar; container_water (LC11) maximizes one container's area
- binary_search vs two_pointers: binary_search for finding a value; two_pointers for finding a pair summing to target
- search_rotated vs binary_search: binary_search ONLY for a sorted, untouched array; Search in Rotated Sorted Array (LC33) → search_rotated ({ nums, target })
- find_peak vs binary_search: find_peak for Find Peak Element (LC162) — { nums } is unsorted and there is NO target; the slope at mid drives the halving
- move_zeroes: Use for Move Zeroes (LC283) — slow/fast pointer in-place compaction on { nums }
- two_sum_hash vs two_pointers: two_sum_hash when array is UNSORTED; two_pointers when array IS sorted
- hash_map_grouping vs frequency_count: hash_map_grouping when grouping items by derived key; frequency_count when counting occurrences to find top-K or most frequent
- greedy_choice vs interval_scheduling: greedy_choice for non-interval greedy (jump game, stock prices); interval_scheduling for interval selection
- word_break vs lcs/edit_distance: use lcs for longest common subsequence, edit_distance for edit distance, word_break ONLY for Word Break (LC139) with wordDict input
- max_subarray vs divide_conquer_array: REMOVED — use max_subarray for Maximum Subarray (Kadane's); Find Peak → find_peak (registered, { nums } input); Count Inversions → null
- climbing_stairs vs recursion_memoization: REMOVED — use climbing_stairs ONLY for {n} input (Climbing Stairs, Fibonacci); House Robber → house_robber (registered, { nums } input)
- word_search vs backtrack_grid: REMOVED — use word_search ONLY for board+word grid DFS; N-Queens → board_backtracking
- board_backtracking: Use for N-Queens (LC51) and N-Queens II (LC52) — input { puzzle: "n_queens", n }. Do NOT use for Sudoku Solver (LC37): only n_queens is implemented → null
- valid_sudoku: Use for Valid Sudoku (LC 36). Input shape: { board: string[9][9] of digits "1"-"9" or "." for empty cells }. Do NOT use for Sudoku Solver (LC 37) — that requires backtracking which is not yet supported.
- min_path_sum vs matrix_dp: REMOVED — use min_path_sum for Minimum Path Sum and Unique Paths; Maximal Square → maximal_square (registered, { matrix: string[][] of "0"/"1" } input)
- rotate_array vs array_manipulation: REMOVED — use rotate_array ONLY for Rotate Array (LC189); Move Zeroes/Product Except Self → null
- min_path_sum vs matrix_dp: REMOVED — use min_path_sum for Minimum Path Sum and Unique Paths; Maximal Square → null
- rotate_array vs array_manipulation: REMOVED — use rotate_array ONLY for Rotate Array (LC189); Move Zeroes → move_zeroes; Product Except Self → product_except_self (both registered, { nums } input)
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
- Use null algorithm_key when the problem doesn't fit any registered key — but ALWAYS supply pattern_key + pattern_renderer in that case (and when confidence < 0.7). Downstream, pattern_key seeds an AI-authored trace generator whose output is validated before display, so an honest pattern name is strictly better than nothing.
- When emitting pattern_key, still extract test_case from Example 1 using the problem's own natural input fields (e.g. { "nums": [1,2,3,4] }, { "s": "abcabcbb" }, { "intervals": [[1,3],[2,6]] }) and expected_output as usual — both gate the generated trace's correctness.`;

/**
 * Parse a LeetCode problem statement into structured extraction.
 * Returns { title, algorithm_key, confidence, test_case, test_case_source, fallback_reason }
 * Throws on timeout or API error.
 */
export async function parseLeetcodeProblem(problemText, anthropicClient) {
  const apiClient = anthropicClient || client;

  const extraction = await Promise.race([
    apiClient.messages.create({
      model: EXTRACTION_MODEL,
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

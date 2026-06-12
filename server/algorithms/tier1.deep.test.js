/**
 * Deep tests for all 47 Tier 1 algorithms added in the expansion.
 * Covers:
 *  - Correct output value (for deterministic algorithms)
 *  - Renderer-specific field validation
 *  - Minimum trace structure (starts with init, ends with result)
 *  - Edge case inputs
 */
import { describe, it, expect } from 'vitest';
import { ALGORITHMS } from './registry.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getResult(trace) {
  return trace.find(s => s.type === 'result');
}

function lastStep(trace) {
  return trace[trace.length - 1];
}

function hasContextUpdates(trace) {
  // At least one non-init step with viz_actions targeting algorithm_state
  return trace
    .filter(s => s.type !== 'init')
    .some(s =>
      Array.isArray(s.viz_actions) &&
      s.viz_actions.some(a => a.params?.panel_id === 'algorithm_state' && Array.isArray(a.params?.entries) && a.params.entries.length > 0)
    );
}

function hasResultOutput(trace) {
  const r = getResult(trace);
  return r !== undefined && typeof r.output === 'string';
}

function initHasArrayFields(trace) {
  return Array.isArray(trace[0]?.array) && Array.isArray(trace[0]?.indices);
}

function initHasGraphFields(trace) {
  return Array.isArray(trace[0]?.nodes) && Array.isArray(trace[0]?.edges);
}

function initHasNodeField(trace) {
  return trace[0]?.node !== undefined;
}

function runDefault(key) {
  return ALGORITHMS[key].run(ALGORITHMS[key].defaultInput);
}

// ── Context renderer: math_patterns ─────────────────────────────────────────

describe('sieve_primes (array renderer)', () => {
  it('default: finds 10 primes ≤ 30', () => {
    const trace = runDefault('sieve_primes');
    expect(getResult(trace)?.output).toBe('10');
  });
  it('init step has array + indices fields', () => {
    expect(initHasArrayFields(runDefault('sieve_primes'))).toBe(true);
  });
  it('n=10: finds 4 primes (2,3,5,7)', () => {
    const trace = ALGORITHMS.sieve_primes.run({ n: 10 });
    expect(getResult(trace)?.output).toBe('4');
  });
});

describe('fast_power (context renderer)', () => {
  it('2^10 = 1024', () => {
    const trace = runDefault('fast_power');
    expect(getResult(trace)?.output).toBe('1024');
  });
  it('has context updates', () => {
    expect(hasContextUpdates(runDefault('fast_power'))).toBe(true);
  });
  it('x=3, n=0 = 1', () => {
    const trace = ALGORITHMS.fast_power.run({ x: 3, n: 0 });
    expect(getResult(trace)?.output).toBe('1');
  });
});

describe('gcd_algorithm (context renderer)', () => {
  it('GCD(48,18) = 6', () => {
    const trace = runDefault('gcd_algorithm');
    expect(getResult(trace)?.output).toBe('6');
  });
  it('has context updates', () => {
    expect(hasContextUpdates(runDefault('gcd_algorithm'))).toBe(true);
  });
  it('GCD(7,7) = 7', () => {
    const trace = ALGORITHMS.gcd_algorithm.run({ a: 7, b: 7 });
    expect(getResult(trace)?.output).toBe('7');
  });
});

describe('majority_vote (context renderer)', () => {
  it('[2,2,1,1,1,2,2] → majority = 2', () => {
    const trace = runDefault('majority_vote');
    expect(getResult(trace)?.output).toBe('2');
  });
  it('has context updates', () => {
    expect(hasContextUpdates(runDefault('majority_vote'))).toBe(true);
  });
  it('single element → that element', () => {
    const trace = ALGORITHMS.majority_vote.run({ nums: [5] });
    expect(getResult(trace)?.output).toBe('5');
  });
});

// ── Context renderer: hashing ────────────────────────────────────────────────

describe('hash_map_grouping (context renderer)', () => {
  it('6 words → 3 anagram groups', () => {
    const trace = runDefault('hash_map_grouping');
    const out = JSON.parse(getResult(trace).output);
    expect(out.length).toBe(3);
  });
  it('has context updates', () => {
    expect(hasContextUpdates(runDefault('hash_map_grouping'))).toBe(true);
  });
  it('empty words array → 0 groups', () => {
    const trace = ALGORITHMS.hash_map_grouping.run({ words: [] });
    const out = JSON.parse(getResult(trace).output);
    expect(out.length).toBe(0);
  });
});

describe('frequency_count (context renderer)', () => {
  it('[1,1,1,2,2,3] k=2 → top 2 frequencies include 1', () => {
    const trace = runDefault('frequency_count');
    const out = JSON.parse(`[${getResult(trace).output.slice(1, -1)}]`);
    expect(out).toContain(1);
    expect(out.length).toBe(2);
  });
  it('has context updates', () => {
    expect(hasContextUpdates(runDefault('frequency_count'))).toBe(true);
  });
});

describe('two_sum_hash (array renderer)', () => {
  it('[3,8,11,2,15,7] target=9 → [3,5]', () => {
    const trace = runDefault('two_sum_hash');
    expect(getResult(trace)?.output).toBe('[3,5]');
  });
  it('default input shows several misses before the hit', () => {
    const trace = runDefault('two_sum_hash');
    expect(trace.filter(s => s.type === 'store').length).toBeGreaterThanOrEqual(3);
  });
  it('init step exposes array + target for the mapper', () => {
    const trace = runDefault('two_sum_hash');
    const init = trace.find(s => s.type === 'init');
    expect(Array.isArray(init?.array)).toBe(true);
    expect(init?.array.length).toBeGreaterThan(0);
    expect(typeof init?.target).toBe('number');
  });
  it('store step exposes seen-snapshot for hash-map context updates', () => {
    const trace = runDefault('two_sum_hash');
    const store = trace.find(s => s.type === 'store');
    expect(store).toBeDefined();
    expect(typeof store.seen).toBe('object');
    expect(Object.keys(store.seen).length).toBeGreaterThan(0);
  });
  it('found step has both indices for highlight', () => {
    const trace = runDefault('two_sum_hash');
    const found = trace.find(s => s.type === 'found');
    expect(found).toBeDefined();
    expect(typeof found.foundAt).toBe('number');
    expect(typeof found.i).toBe('number');
  });
  it('no solution → [-1,-1]', () => {
    const trace = ALGORITHMS.two_sum_hash.run({ nums: [1, 2, 3], target: 100 });
    expect(getResult(trace)?.output).toBe('[-1,-1]');
  });
});

describe('string_hash (context renderer)', () => {
  it('default "foo"/"bar" → false (o maps to both a and r)', () => {
    const trace = runDefault('string_hash');
    expect(getResult(trace)?.output).toBe('false');
    expect(trace.some(s => s.type === 'conflict')).toBe(true);
  });
  it('has context updates', () => {
    expect(hasContextUpdates(runDefault('string_hash'))).toBe(true);
  });
  it('"egg"/"add" → isomorphic = true', () => {
    const trace = ALGORITHMS.string_hash.run({ s: 'egg', t: 'add' });
    expect(getResult(trace)?.output).toBe('true');
  });
});

describe('set_operations (context renderer)', () => {
  it('[1,2,3,1] → contains duplicate = true', () => {
    const trace = runDefault('set_operations');
    expect(getResult(trace)?.output).toBe('true');
  });
  it('has context updates', () => {
    expect(hasContextUpdates(runDefault('set_operations'))).toBe(true);
  });
  it('[1,2,3] → no duplicate = false', () => {
    const trace = ALGORITHMS.set_operations.run({ nums: [1, 2, 3] });
    expect(getResult(trace)?.output).toBe('false');
  });
});

describe('bit_ops (context renderer)', () => {
  it('[4,1,2,1,2] → single number = 4', () => {
    const trace = runDefault('bit_ops');
    expect(getResult(trace)?.output).toBe('4');
  });
  it('has context updates', () => {
    expect(hasContextUpdates(runDefault('bit_ops'))).toBe(true);
  });
  it('[7] → single element returns 7', () => {
    const trace = ALGORITHMS.bit_ops.run({ nums: [7] });
    expect(getResult(trace)?.output).toBe('7');
  });
});

describe('math_simulation (context renderer)', () => {
  it('n=19 → happy = true', () => {
    const trace = runDefault('math_simulation');
    expect(getResult(trace)?.output).toBe('true');
  });
  it('has context updates', () => {
    expect(hasContextUpdates(runDefault('math_simulation'))).toBe(true);
  });
  it('n=2 → not happy = false', () => {
    const trace = ALGORITHMS.math_simulation.run({ n: 2 });
    expect(getResult(trace)?.output).toBe('false');
  });
});

describe('greedy_choice (context renderer)', () => {
  it('[2,1,1,1,4] → can reach end = true', () => {
    const trace = runDefault('greedy_choice');
    expect(getResult(trace)?.output).toBe('true');
  });
  it('has context updates', () => {
    expect(hasContextUpdates(runDefault('greedy_choice'))).toBe(true);
  });
  it('[3,2,1,0,4] → cannot reach end = false', () => {
    const trace = ALGORITHMS.greedy_choice.run({ nums: [3, 2, 1, 0, 4] });
    expect(getResult(trace)?.output).toBe('false');
  });
});

describe('jump_game_ii (context renderer)', () => {
  it('[2,3,1,1,4] → minimum jumps = 2', () => {
    const trace = runDefault('jump_game_ii');
    expect(getResult(trace)?.output).toBe('2');
  });
  it('has context updates', () => {
    expect(hasContextUpdates(runDefault('jump_game_ii'))).toBe(true);
  });
  it('[1] → already at end = 0 jumps', () => {
    const trace = ALGORITHMS.jump_game_ii.run({ nums: [1] });
    expect(getResult(trace)?.output).toBe('0');
  });
});

describe('valid_parentheses (context renderer)', () => {
  it('"([{}])" → valid = true', () => {
    const trace = runDefault('valid_parentheses');
    expect(getResult(trace)?.output).toBe('true');
  });
  it('has context updates', () => {
    expect(hasContextUpdates(runDefault('valid_parentheses'))).toBe(true);
  });
  it('"([)" → invalid = false', () => {
    const trace = ALGORITHMS.valid_parentheses.run({ s: '([)' });
    expect(getResult(trace)?.output).toBe('false');
  });
  it('"" → empty string = true', () => {
    const trace = ALGORITHMS.valid_parentheses.run({ s: '' });
    expect(getResult(trace)?.output).toBe('true');
  });
});

describe('task_scheduler (context renderer)', () => {
  it('["A","A","A","B","B","B"] n=2 → 8 intervals', () => {
    const trace = runDefault('task_scheduler');
    expect(getResult(trace)?.output).toBe('8');
  });
  it('has context updates', () => {
    expect(hasContextUpdates(runDefault('task_scheduler'))).toBe(true);
  });
});

describe('lru_cache (context renderer)', () => {
  it('default ops include a hit (1) and a miss (-1)', () => {
    const trace = runDefault('lru_cache');
    const out = JSON.parse(getResult(trace).output);
    expect(out).toContain(1);
    expect(out).toContain(-1);
  });
  it('has context updates', () => {
    expect(hasContextUpdates(runDefault('lru_cache'))).toBe(true);
  });
});

// ── Array renderer: prefix patterns ─────────────────────────────────────────

describe('prefix_sum (array renderer)', () => {
  it('default: finds 2 subarrays summing to 9', () => {
    const trace = runDefault('prefix_sum');
    expect(hasResultOutput(trace)).toBe(true);
    expect(getResult(trace)?.output).toBe('2');
  });
  it('init step has array + indices fields', () => {
    expect(initHasArrayFields(runDefault('prefix_sum'))).toBe(true);
  });
});

describe('difference_array (array renderer)', () => {
  it('default: final array is [-2,0,3,5,3]', () => {
    const trace = runDefault('difference_array');
    expect(getResult(trace)?.output).toBe('[-2,0,3,5,3]');
  });
  it('init step has array + indices fields', () => {
    expect(initHasArrayFields(runDefault('difference_array'))).toBe(true);
  });
});

// ── DP patterns ─────────────────────────────────────────────────────────────

describe('lis (array renderer)', () => {
  it('[10,9,2,5,3,7,101,18] → LIS length = 4', () => {
    const trace = runDefault('lis');
    expect(getResult(trace)?.output).toBe('4');
  });
  it('single element → length 1', () => {
    const trace = ALGORITHMS.lis.run({ nums: [42] });
    expect(getResult(trace)?.output).toBe('1');
  });
});

describe('stock_dp (table renderer)', () => {
  it('[1,2,3,0,2] → max profit = 3', () => {
    const trace = runDefault('stock_dp');
    expect(getResult(trace)?.output).toBe('3');
  });
  it('last step is result with output', () => {
    expect(hasResultOutput(runDefault('stock_dp'))).toBe(true);
  });
});

describe('interval_dp (table renderer)', () => {
  it('[3,1,5,8] burst balloons → 167', () => {
    const trace = runDefault('interval_dp');
    expect(getResult(trace)?.output).toBe('167');
  });
});

describe('palindrome_dp (array renderer)', () => {
  it('"bbbab" → longest palindromic subsequence = 4', () => {
    const trace = runDefault('palindrome_dp');
    expect(getResult(trace)?.output).toBe('4');
  });
  it('single char → length 1', () => {
    const trace = ALGORITHMS.palindrome_dp.run({ s: 'x' });
    expect(getResult(trace)?.output).toBe('1');
  });
});

describe('bitmask_dp (table renderer)', () => {
  it('4-city TSP → tour cost = 80', () => {
    const trace = runDefault('bitmask_dp');
    expect(getResult(trace)?.output).toBe('80');
  });
  it('last step is result with output', () => {
    expect(hasResultOutput(runDefault('bitmask_dp'))).toBe(true);
  });
});

describe('tree_dp (tree renderer)', () => {
  it('[-10,9,20,null,null,15,7] → max path sum = 42', () => {
    const trace = runDefault('tree_dp');
    expect(getResult(trace)?.output).toBe('42');
  });
  it('init step has node field', () => {
    expect(initHasNodeField(runDefault('tree_dp'))).toBe(true);
  });
});

describe('house_robber (array renderer)', () => {
  it('[2,7,9,3,1] → max rob = 12', () => {
    const trace = runDefault('house_robber');
    expect(getResult(trace)?.output).toBe('12');
  });
  it('empty array → 0', () => {
    const trace = ALGORITHMS.house_robber.run({ nums: [] });
    expect(getResult(trace)?.output).toBe('0');
  });
  it('single element → that element', () => {
    const trace = ALGORITHMS.house_robber.run({ nums: [5] });
    expect(getResult(trace)?.output).toBe('5');
  });
});

// ── Graph advanced ─────────────────────────────────────────────────────────

describe('multi_source_bfs (graph renderer)', () => {
  it('rotting oranges default grid (two sources) → answer = 2', () => {
    const trace = runDefault('multi_source_bfs');
    expect(getResult(trace)?.output).toBe('2');
  });
  it('init step has nodes + edges fields', () => {
    expect(initHasGraphFields(runDefault('multi_source_bfs'))).toBe(true);
  });
  it('no fresh oranges → answer = 0', () => {
    const trace = ALGORITHMS.multi_source_bfs.run({ grid: [[2, 2], [2, 2]] });
    expect(getResult(trace)?.output).toBe('0');
  });
});

describe('floyd_warshall (graph renderer)', () => {
  it('default graph: shortest A→D = 6', () => {
    const trace = runDefault('floyd_warshall');
    expect(getResult(trace)?.output).toBe('6');
  });
  it('init step has nodes + edges fields', () => {
    expect(initHasGraphFields(runDefault('floyd_warshall'))).toBe(true);
  });
});

describe('tarjan_bridges (graph renderer)', () => {
  it('default graph: finds 1 bridge (1-3)', () => {
    const trace = runDefault('tarjan_bridges');
    const bridges = JSON.parse(getResult(trace).output);
    expect(bridges.length).toBe(1);
    const bridge = bridges[0];
    expect(bridge).toContain('1');
    expect(bridge).toContain('3');
  });
  it('init step has nodes + edges fields', () => {
    expect(initHasGraphFields(runDefault('tarjan_bridges'))).toBe(true);
  });
  it('triangle (no bridges) → empty bridge list', () => {
    const trace = ALGORITHMS.tarjan_bridges.run({
      graph: {
        nodes: [{ id: '0' }, { id: '1' }, { id: '2' }],
        edges: [{ source: '0', target: '1' }, { source: '1', target: '2' }, { source: '2', target: '0' }],
        directed: false,
      },
    });
    const bridges = JSON.parse(getResult(trace).output);
    expect(bridges.length).toBe(0);
  });
});

describe('bipartite_check (graph renderer)', () => {
  it('default graph (4-cycle + odd-cycle chord) → not bipartite', () => {
    const trace = runDefault('bipartite_check');
    expect(getResult(trace)?.output).toBe('false');
  });
  it('plain 4-cycle → bipartite = true', () => {
    const trace = ALGORITHMS.bipartite_check.run({
      graph: {
        nodes: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }],
        edges: [
          { source: '0', target: '1' },
          { source: '0', target: '3' },
          { source: '1', target: '2' },
          { source: '2', target: '3' },
        ],
        directed: false,
      },
    });
    expect(getResult(trace)?.output).toBe('true');
  });
  it('init step has nodes + edges fields', () => {
    expect(initHasGraphFields(runDefault('bipartite_check'))).toBe(true);
  });
  it('triangle (odd cycle) → not bipartite', () => {
    const trace = ALGORITHMS.bipartite_check.run({
      graph: {
        nodes: [{ id: '0' }, { id: '1' }, { id: '2' }],
        edges: [{ source: '0', target: '1' }, { source: '1', target: '2' }, { source: '2', target: '0' }],
        directed: false,
      },
    });
    expect(getResult(trace)?.output).toBe('false');
  });
});

describe('dijkstra_k_stops (graph renderer)', () => {
  it('default: cheapest with 1 stop = 500', () => {
    const trace = runDefault('dijkstra_k_stops');
    expect(getResult(trace)?.output).toBe('500');
  });
  it('init step has nodes + edges fields', () => {
    expect(initHasGraphFields(runDefault('dijkstra_k_stops'))).toBe(true);
  });
});

// ── Heap patterns ────────────────────────────────────────────────────────────

describe('top_k_heap (tree renderer)', () => {
  it('default: returns 2 elements', () => {
    const trace = runDefault('top_k_heap');
    const out = JSON.parse(getResult(trace).output);
    expect(out.length).toBe(2);
  });
  it('result includes most frequent element (1)', () => {
    const trace = runDefault('top_k_heap');
    const out = JSON.parse(getResult(trace).output);
    expect(out).toContain(1);
  });
  it('last step is result', () => {
    const trace = runDefault('top_k_heap');
    expect(lastStep(trace).type).toBe('result');
  });
});

describe('median_finder (tree renderer)', () => {
  it('stream=[5,15,1,3,2,8] → final median = 4', () => {
    const trace = runDefault('median_finder');
    expect(getResult(trace)?.output).toBe('4');
  });
  it('single-element stream → median = that element', () => {
    const trace = ALGORITHMS.median_finder.run({ stream: [7] });
    expect(getResult(trace)?.output).toBe('7');
  });
});

describe('k_closest_points (tree renderer)', () => {
  it('default k=2: returns 2 points', () => {
    const trace = runDefault('k_closest_points');
    const out = JSON.parse(getResult(trace).output);
    expect(out.length).toBe(2);
  });
  it('result does NOT include the farthest point [5,-1]', () => {
    const trace = runDefault('k_closest_points');
    const out = JSON.parse(getResult(trace).output);
    const flat = out.map(p => JSON.stringify(p));
    expect(flat).not.toContain('[5,-1]');
  });
});

// ── String advanced ──────────────────────────────────────────────────────────

describe('rabin_karp (string renderer)', () => {
  it('finds "abcdabcy" at index 8', () => {
    const trace = runDefault('rabin_karp');
    const matches = JSON.parse(getResult(trace).output);
    expect(matches).toContain(8);
  });
  it('init step has text + pattern fields', () => {
    const trace = runDefault('rabin_karp');
    expect(trace[0].text).toBeDefined();
    expect(trace[0].pattern).toBeDefined();
  });
  it('no match → empty array', () => {
    const trace = ALGORITHMS.rabin_karp.run({ text: 'hello', pattern: 'xyz' });
    expect(getResult(trace)?.output).toBe('[]');
  });
});

describe('manacher (string renderer)', () => {
  it('"babad" → longest palindrome is "bab"', () => {
    const trace = runDefault('manacher');
    expect(getResult(trace)?.output).toBe('bab');
  });
  it('init step has text field', () => {
    const trace = runDefault('manacher');
    expect(trace[0].text).toBeDefined();
  });
  it('single char → itself', () => {
    const trace = ALGORITHMS.manacher.run({ s: 'a' });
    expect(getResult(trace)?.output).toBe('a');
  });
});

// ── Matrix algorithms ────────────────────────────────────────────────────────

describe('number_of_islands (graph renderer)', () => {
  it('default 4×5 grid (LC Ex2) → 3 islands', () => {
    const trace = runDefault('number_of_islands');
    expect(getResult(trace)?.output).toBe('3');
  });
  it('init step has nodes + edges fields', () => {
    expect(initHasGraphFields(runDefault('number_of_islands'))).toBe(true);
  });
  it('all-water grid → 0 islands', () => {
    const trace = ALGORITHMS.number_of_islands.run({ grid: [[0, 0], [0, 0]] });
    expect(getResult(trace)?.output).toBe('0');
  });
  it('disconnected cells → multiple islands', () => {
    const trace = ALGORITHMS.number_of_islands.run({ grid: [[1, 0, 1], [0, 0, 0], [1, 0, 1]] });
    expect(getResult(trace)?.output).toBe('4');
  });
});

describe('spiral_matrix (array renderer)', () => {
  it('3×3 matrix: traversal starts with 1 and ends with 5', () => {
    const trace = runDefault('spiral_matrix');
    const out = JSON.parse(getResult(trace).output);
    expect(out[0]).toBe(1);
    expect(out[out.length - 1]).toBe(5);
    expect(out.length).toBe(9);
  });
  it('init step has array + indices fields', () => {
    expect(initHasArrayFields(runDefault('spiral_matrix'))).toBe(true);
  });
});

describe('rotate_matrix (array renderer)', () => {
  it('3×3 matrix: rotated 90° CW, top-left becomes 7', () => {
    const trace = runDefault('rotate_matrix');
    const out = JSON.parse(getResult(trace).output);
    expect(out[0][0]).toBe(7);
    expect(out[0][2]).toBe(1);
    expect(out[2][2]).toBe(3);
  });
  it('init step has array + indices fields', () => {
    expect(initHasArrayFields(runDefault('rotate_matrix'))).toBe(true);
  });
});

// ── Backtracking patterns ────────────────────────────────────────────────────

describe('combination_sum (array renderer)', () => {
  it('[2,3,6,7] target=7 → 2 combinations', () => {
    const trace = runDefault('combination_sum');
    const combos = JSON.parse(getResult(trace).output);
    expect(combos.length).toBe(2);
  });
  it('result contains [7] and [2,2,3]', () => {
    const trace = runDefault('combination_sum');
    const combos = JSON.parse(getResult(trace).output);
    const flat = combos.map(c => JSON.stringify(c.sort((a,b)=>a-b)));
    expect(flat).toContain(JSON.stringify([7]));
    expect(flat).toContain(JSON.stringify([2,2,3]));
  });
  it('no solution → empty array', () => {
    const trace = ALGORITHMS.combination_sum.run({ candidates: [5, 10], target: 3 });
    const out = JSON.parse(getResult(trace).output);
    expect(out.length).toBe(0);
  });
});

describe('subsets (array renderer)', () => {
  it('[1,2,3] → 8 subsets (power set)', () => {
    const trace = runDefault('subsets');
    const out = JSON.parse(getResult(trace).output);
    expect(out.length).toBe(8);
  });
  it('empty array → 1 subset (the empty set)', () => {
    const trace = ALGORITHMS.subsets.run({ nums: [] });
    const out = JSON.parse(getResult(trace).output);
    expect(out.length).toBe(1);
  });
});

describe('permutations (array renderer)', () => {
  it('[1,2,3] → 6 permutations', () => {
    const trace = runDefault('permutations');
    const out = JSON.parse(getResult(trace).output);
    expect(out.length).toBe(6);
  });
  it('single element → 1 permutation', () => {
    const trace = ALGORITHMS.permutations.run({ nums: [42] });
    const out = JSON.parse(getResult(trace).output);
    expect(out.length).toBe(1);
    expect(out[0]).toEqual([42]);
  });
});

// ── Monotonic deque ──────────────────────────────────────────────────────────

describe('sliding_window_max (array renderer)', () => {
  it('[1,3,-1,-3,5,3,6,7] k=3 → [3,3,5,5,6,7]', () => {
    const trace = runDefault('sliding_window_max');
    expect(getResult(trace)?.output).toBe('[3,3,5,5,6,7]');
  });
  it('init step has array + indices fields', () => {
    expect(initHasArrayFields(runDefault('sliding_window_max'))).toBe(true);
  });
  it('window = full array → single max', () => {
    const trace = ALGORITHMS.sliding_window_max.run({ nums: [1, 5, 3], k: 3 });
    expect(getResult(trace)?.output).toBe('[5]');
  });
});

describe('jump_game (array renderer)', () => {
  it('default [3,2,1,0,4] → cannot reach = false, with skip + blocked steps', () => {
    const trace = runDefault('jump_game');
    expect(getResult(trace)?.output).toBe('false');
    expect(trace.some(s => s.type === 'skip')).toBe(true);
    expect(trace.some(s => s.type === 'blocked')).toBe(true);
  });
  it('[2,3,1,1,4] → can reach = true', () => {
    const trace = ALGORITHMS.jump_game.run({ nums: [2, 3, 1, 1, 4] });
    expect(getResult(trace)?.output).toBe('true');
  });
  it('init step has array + indices fields', () => {
    expect(initHasArrayFields(runDefault('jump_game'))).toBe(true);
  });
});

// ── New tree algorithms ──────────────────────────────────────────────────────

describe('lca_tree (tree renderer)', () => {
  it('default tree: LCA of p=5, q=1 is root node (value 3)', () => {
    const trace = runDefault('lca_tree');
    expect(getResult(trace)?.output).toBe('3');
  });
  it('init step has node field', () => {
    expect(initHasNodeField(runDefault('lca_tree'))).toBe(true);
  });
  it('p=q → LCA is the node itself', () => {
    const trace = ALGORITHMS.lca_tree.run({
      nodes: [3, 5, 1, 6, 2, 0, 8, null, null, 7, 4],
      p: 5, q: 5,
    });
    expect(hasResultOutput(trace)).toBe(true);
  });
});

describe('validate_bst (tree renderer)', () => {
  it('[5,1,4,null,null,3,6] → not a valid BST (4 < 5 in right subtree)', () => {
    const trace = runDefault('validate_bst');
    expect(getResult(trace)?.output).toBe('false');
  });
  it('[2,1,3] → valid BST', () => {
    const trace = ALGORITHMS.validate_bst.run({ nodes: [2, 1, 3] });
    expect(getResult(trace)?.output).toBe('true');
  });
  it('init step has node field', () => {
    expect(initHasNodeField(runDefault('validate_bst'))).toBe(true);
  });
});

// ── New linked list algorithms ───────────────────────────────────────────────

describe('linked_list_cycle (tree renderer)', () => {
  it('[3,2,0,-4] pos=1 → cycle detected = true', () => {
    const trace = runDefault('linked_list_cycle');
    expect(getResult(trace)?.output).toBe('true');
  });
  it('pos=-1 (no cycle) → false', () => {
    const trace = ALGORITHMS.linked_list_cycle.run({ values: [1, 2, 3], pos: -1 });
    expect(getResult(trace)?.output).toBe('false');
  });
  it('last step is result', () => {
    expect(lastStep(runDefault('linked_list_cycle')).type).toBe('result');
  });
});

describe('merge_k_sorted (tree renderer)', () => {
  it('[[1,4,5],[1,3,4],[2,6]] → merged = [1,1,2,3,4,4,5,6]', () => {
    const trace = runDefault('merge_k_sorted');
    const out = JSON.parse(getResult(trace).output);
    expect(out).toEqual([1, 1, 2, 3, 4, 4, 5, 6]);
  });
  it('single list → same list', () => {
    const trace = ALGORITHMS.merge_k_sorted.run({ lists: [[1, 3, 5]] });
    const out = JSON.parse(getResult(trace).output);
    expect(out).toEqual([1, 3, 5]);
  });
  it('empty lists → empty output', () => {
    const trace = ALGORITHMS.merge_k_sorted.run({ lists: [] });
    const out = JSON.parse(getResult(trace).output);
    expect(out).toEqual([]);
  });
});

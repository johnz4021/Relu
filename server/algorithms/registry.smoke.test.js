import { describe, it, expect } from 'vitest';
import { ALGORITHMS } from './registry.js';

describe('Phase 1 registry smoke tests', () => {
  const FREE_WIN_KEYS = [
    'binary_search', 'coin_change', 'lcs', 'bst_insert',
    'linked_list_reversal', 'stack_operations', 'queue_operations',
  ];
  for (const key of FREE_WIN_KEYS) {
    it(`${key} returns a non-empty trace array`, () => {
      const trace = ALGORITHMS[key].run(ALGORITHMS[key].defaultInput);
      expect(Array.isArray(trace)).toBe(true);
      expect(trace.length).toBeGreaterThan(0);
    });
  }
});

describe('Phase 2 registry smoke tests', () => {
  it('topological_sort: DAG returns sorted result', () => {
    const trace = ALGORITHMS.topological_sort.run(ALGORITHMS.topological_sort.defaultInput);
    const result = trace.find(s => s.type === 'result');
    expect(result).toBeDefined();
    expect(result.cycle_detected).toBe(false);
    expect(Array.isArray(result.sorted)).toBe(true);
  });

  it('topological_sort: cyclic graph returns cycle_detected', () => {
    const trace = ALGORITHMS.topological_sort.run({
      graph: {
        nodes: [{ id: '0' }, { id: '1' }, { id: '2' }],
        edges: [{ source: '0', target: '1' }, { source: '1', target: '2' }, { source: '2', target: '0' }],
        directed: true,
      },
    });
    const result = trace.find(s => s.type === 'result');
    expect(result.cycle_detected).toBe(true);
    expect(result.unprocessed_nodes.length).toBeGreaterThan(0);
  });

  it('two_pointers: finds pair summing to target', () => {
    const trace = ALGORITHMS.two_pointers.run({ array: [2, 7, 11, 15], target: 9 });
    const result = trace.find(s => s.type === 'result');
    expect(result.found).toBe(true);
    expect(result.indices).toEqual([0, 1]);
  });

  it('interval_merge: merges overlapping intervals', () => {
    const trace = ALGORITHMS.interval_merge.run(ALGORITHMS.interval_merge.defaultInput);
    const result = trace.find(s => s.type === 'result');
    expect(result.merged).toEqual([[1, 6], [8, 10], [15, 18]]);
  });

  it('interval_scheduling: returns accepted job count', () => {
    const trace = ALGORITHMS.interval_scheduling.run(ALGORITHMS.interval_scheduling.defaultInput);
    const result = trace.find(s => s.type === 'result');
    expect(result.count).toBeGreaterThanOrEqual(3);
  });

  it('monotonic_stack: next greater elements', () => {
    const trace = ALGORITHMS.monotonic_stack.run({ array: [2, 1, 5, 3, 6, 4, 8] });
    const result = trace.find(s => s.type === 'result');
    expect(result.answers).toEqual([5, 5, 6, 6, 8, 8, -1]);
  });

  it('backtracking: subsets([1,2,3]) produces 8 found steps', () => {
    const trace = ALGORITHMS.backtracking.run({ elements: [1, 2, 3] });
    const found = trace.filter(s => s.type === 'found');
    expect(found.length).toBe(8);
  });

  it('backtracking: init step has nodes array', () => {
    const trace = ALGORITHMS.backtracking.run({ elements: [1, 2, 3] });
    expect(trace[0].type).toBe('init');
    expect(Array.isArray(trace[0].nodes)).toBe(true);
    expect(trace[0].nodes.length).toBeGreaterThan(0);
  });
});

describe('String Renderer algorithms', () => {
  it('sliding_window_string: non-empty trace, last step type === result', () => {
    const trace = ALGORITHMS.sliding_window_string.run(ALGORITHMS.sliding_window_string.defaultInput);
    expect(trace.length).toBeGreaterThan(0);
    expect(trace[trace.length - 1].type).toBe('result');
  });

  it('valid_palindrome: result.is_palindrome === true (racecar)', () => {
    const trace = ALGORITHMS.valid_palindrome.run({ s: 'racecar' });
    const result = trace[trace.length - 1];
    expect(result.is_palindrome).toBe(true);
  });

  it('expand_palindrome: result palindrome length >= 3 (babad)', () => {
    const trace = ALGORITHMS.expand_palindrome.run(ALGORITHMS.expand_palindrome.defaultInput);
    const result = trace[trace.length - 1];
    expect(result.best_palindrome.length).toBeGreaterThanOrEqual(3);
  });

  it('kmp_search: trace contains a found step (hello/ll)', () => {
    const trace = ALGORITHMS.kmp_search.run(ALGORITHMS.kmp_search.defaultInput);
    expect(trace.some(s => s.type === 'found')).toBe(true);
  });

  it('find_anagrams: anagram_found at index 0 (cbaebabacd/abc)', () => {
    const trace = ALGORITHMS.find_anagrams.run(ALGORITHMS.find_anagrams.defaultInput);
    const found = trace.filter(s => s.type === 'anagram_found');
    expect(found.some(s => s.anagram_start === 0)).toBe(true);
  });
});

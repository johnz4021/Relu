// Tier 1 implementations for backtracking patterns.

// ── combination_sum — Combination Sum (candidates with repetition) ─────────────
export function combinationSum(input) {
  const candidates = input.candidates || [2, 3, 6, 7];
  const target = input.target ?? 7;
  const trace = [];
  const results = [];

  trace.push({
    type: 'init',
    description: `Combination Sum: find all combos from [${candidates.join(', ')}] summing to ${target} (unlimited reuse)`,
    array: [...candidates],
    indices: [],
  });

  const sorted = [...candidates].sort((a, b) => a - b);

  function backtrack(start, current, remaining) {
    if (remaining === 0) {
      results.push([...current]);
      trace.push({
        type: 'found',
        description: `Found valid combination: [${current.join(', ')}] = ${target} ✓`,
        array: [...current],
        indices: current.map((_, i) => i),
      });
      return;
    }

    for (let i = start; i < sorted.length; i++) {
      if (sorted[i] > remaining) break;
      current.push(sorted[i]);
      trace.push({
        type: 'choose',
        description: `Choose ${sorted[i]}: current=[${current.join(', ')}] remaining=${remaining - sorted[i]}`,
        array: [...current],
        indices: [current.length - 1],
      });
      backtrack(i, current, remaining - sorted[i]);
      current.pop();
      trace.push({
        type: 'backtrack',
        description: `Backtrack: remove ${sorted[i]}, try next`,
        array: [...current],
        indices: [],
      });
    }
  }

  backtrack(0, [], target);

  trace.push({
    type: 'result',
    description: `Found ${results.length} combination(s): ${results.map(r => `[${r.join(',')}]`).join(', ')}`,
    array: candidates,
    indices: [],
    output: JSON.stringify(results),
  });

  return trace;
}

export const DEFAULT_COMBINATION_SUM_INPUT = { candidates: [2, 3, 6, 7], target: 7 };

// ── subsets — Subsets / Power Set ─────────────────────────────────────────────
export function subsets(input) {
  const nums = input.nums || [1, 2, 3];
  const trace = [];
  const results = [];

  trace.push({
    type: 'init',
    description: `Subsets (power set) of [${nums.join(', ')}]: backtrack including/excluding each element`,
    array: [...nums],
    indices: [],
  });

  function backtrack(start, current) {
    results.push([...current]);
    trace.push({
      type: 'record',
      description: `Record subset: [${current.join(', ') || '∅'}]`,
      array: [...current],
      indices: current.map((_, i) => i),
    });

    for (let i = start; i < nums.length; i++) {
      current.push(nums[i]);
      trace.push({
        type: 'choose',
        description: `Include nums[${i}]=${nums[i]}: current=[${current.join(', ')}]`,
        array: [...current],
        indices: [current.length - 1],
      });
      backtrack(i + 1, current);
      current.pop();
      trace.push({
        type: 'backtrack',
        description: `Exclude nums[${i}]=${nums[i]}, try next`,
        array: [...current],
        indices: [],
      });
    }
  }

  backtrack(0, []);

  trace.push({
    type: 'result',
    description: `Power set has ${results.length} subsets: ${results.map(r => `[${r.join(',')}]`).join(', ')}`,
    array: [...nums],
    indices: [],
    output: JSON.stringify(results),
  });

  return trace;
}

export const DEFAULT_SUBSETS_INPUT = { nums: [1, 2, 3] };

// ── permutations — All Permutations ──────────────────────────────────────────
export function permutations(input) {
  const nums = (input.nums || [1, 2, 3]).slice(0, 5);
  const trace = [];
  const results = [];

  trace.push({
    type: 'init',
    description: `Generate all ${nums.length}! permutations of [${nums.join(', ')}] via backtracking`,
    array: [...nums],
    indices: [],
  });

  const used = new Array(nums.length).fill(false);

  function backtrack(current) {
    if (current.length === nums.length) {
      results.push([...current]);
      trace.push({
        type: 'found',
        description: `Permutation complete: [${current.join(', ')}]`,
        array: [...current],
        indices: current.map((_, i) => i),
      });
      return;
    }

    for (let i = 0; i < nums.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      current.push(nums[i]);
      trace.push({
        type: 'choose',
        description: `Choose nums[${i}]=${nums[i]}: current=[${current.join(', ')}]`,
        array: [...current],
        indices: [current.length - 1],
      });
      backtrack(current);
      current.pop();
      used[i] = false;
      trace.push({
        type: 'backtrack',
        description: `Unuse nums[${i}]=${nums[i]}, try next`,
        array: [...current],
        indices: [],
      });
    }
  }

  backtrack([]);

  trace.push({
    type: 'result',
    description: `Generated ${results.length} permutation(s)`,
    array: [...nums],
    indices: [],
    output: JSON.stringify(results),
  });

  return trace;
}

export const DEFAULT_PERMUTATIONS_INPUT = { nums: [1, 2, 3] };

export { boardBacktracking, DEFAULT_BOARD_BACKTRACKING_INPUT } from './boardBacktracking.js';

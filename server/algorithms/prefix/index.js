// Tier 1 implementations for prefix sum and difference array patterns.

// ── prefix_sum — Subarray Sum Equals K ───────────────────────────────────────
export function prefixSum(input) {
  const nums = input.nums || [];
  const target = input.target ?? 0;
  const trace = [];

  const prefixArr = [0];
  const countMap = { 0: 1 };
  let result = 0;

  trace.push({
    type: 'init',
    description: `Subarray Sum = ${target}: init prefix array [0] and count map {0:1}`,
    array: [0],
    indices: [],
    prefixMap: { 0: 1 },
  });

  for (let i = 0; i < nums.length; i++) {
    const cur = prefixArr[prefixArr.length - 1] + nums[i];
    prefixArr.push(cur);
    const complement = cur - target;
    const found = countMap[complement] || 0;
    result += found;
    countMap[cur] = (countMap[cur] || 0) + 1;

    trace.push({
      type: 'compute',
      description: `i=${i} nums[${i}]=${nums[i]}: prefixSum=${cur}, need (${cur}-${target})=${complement} in map → found ${found}, total=${result}`,
      array: [...prefixArr],
      indices: [prefixArr.length - 1],
      currentSum: cur,
      complement,
      found,
      running_result: result,
    });
  }

  trace.push({
    type: 'result',
    description: `Found ${result} subarray(s) with sum = ${target}`,
    array: [...prefixArr],
    indices: [],
    output: String(result),
  });

  return trace;
}

export const DEFAULT_PREFIX_SUM_INPUT = { nums: [1, 2, 3, 4, 5], target: 9 };

// ── difference_array — Range Addition ────────────────────────────────────────
// Apply k range increment operations, return final array.
export function differenceArray(input) {
  const n = input.n ?? 5;
  const updates = input.updates || [[1, 3, 2], [2, 4, 3], [0, 2, -2]];
  const trace = [];

  const diff = new Array(n + 1).fill(0);

  trace.push({
    type: 'init',
    description: `Difference array of size ${n+1} for ${updates.length} range updates`,
    array: [...diff],
    indices: [],
  });

  for (const [l, r, val] of updates) {
    diff[l] += val;
    if (r + 1 <= n) diff[r + 1] -= val;
    trace.push({
      type: 'update',
      description: `Range [${l},${r}] += ${val}: diff[${l}]+=${val}, diff[${r+1}]-=${val}`,
      array: [...diff],
      indices: [l, r + 1].filter(i => i <= n),
      range: [l, r], val,
    });
  }

  // Build result array via prefix sum on diff
  const result = [];
  let running = 0;
  for (let i = 0; i < n; i++) {
    running += diff[i];
    result.push(running);
  }

  trace.push({
    type: 'build',
    description: `Prefix sum on diff array → result: [${result.join(', ')}]`,
    array: [...result],
    indices: [],
  });

  trace.push({
    type: 'result',
    description: `Final array: [${result.join(', ')}]`,
    array: [...result],
    indices: [],
    output: `[${result.join(',')}]`,
  });

  return trace;
}

export const DEFAULT_DIFFERENCE_ARRAY_INPUT = {
  n: 5,
  updates: [[1, 3, 2], [2, 4, 3], [0, 2, -2]],
};

/**
 * Kadane's algorithm — Maximum Subarray (LC53).
 * Single pass: track current_sum (restart if adding next element is worse)
 * and max_sum (best seen so far).
 */
export function maxSubarray(input) {
  const nums = input.nums;
  const n = nums.length;
  const trace = [];

  trace.push({
    type: 'init',
    array: nums,
    description: "Kadane's: track current_sum (extend or restart) and max_sum.",
  });

  let current_sum = nums[0];
  let max_sum = nums[0];
  let current_start = 0;
  let max_start = 0;
  let max_end = 0;

  trace.push({
    type: 'visit',
    index: 0,
    value: nums[0],
    current_sum,
    max_sum,
    current_start,
    max_start,
    max_end,
  });

  for (let i = 1; i < n; i++) {
    if (current_sum + nums[i] < nums[i]) {
      current_start = i;
      current_sum = nums[i];
    } else {
      current_sum += nums[i];
    }

    if (current_sum > max_sum) {
      max_sum = current_sum;
      max_start = current_start;
      max_end = i;
    }

    trace.push({
      type: 'visit',
      index: i,
      value: nums[i],
      current_sum,
      max_sum,
      current_start,
      max_start,
      max_end,
    });
  }

  trace.push({
    type: 'result',
    max_sum,
    start: max_start,
    end: max_end,
    subarray: nums.slice(max_start, max_end + 1),
    array: nums,
  });

  return trace;
}

export const DEFAULT_MAX_SUBARRAY_INPUT = { nums: [-2, 1, -3, 4, -1, 2, 1, -5, 4] };

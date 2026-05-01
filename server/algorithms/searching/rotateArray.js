/**
 * Rotate Array (LC189) — three-reversal method.
 * Rotating right by k is equivalent to:
 *   1. Reverse the entire array
 *   2. Reverse the first k elements
 *   3. Reverse the remaining n-k elements
 */
export function rotateArray(input) {
  const { nums, k } = input;
  const n = nums.length;
  const effective_k = ((k % n) + n) % n;
  const arr = [...nums];

  const trace = [];
  trace.push({
    type: 'init',
    array: [...arr],
    k: effective_k,
    description: `Rotate Array by k=${effective_k}: three-reversal method.`,
  });

  if (effective_k === 0) {
    trace.push({ type: 'result', array: [...arr], original: nums, k: 0 });
    return trace;
  }

  function reverseSegment(lo, hi, phaseDesc) {
    while (lo < hi) {
      [arr[lo], arr[hi]] = [arr[hi], arr[lo]];
      trace.push({ type: 'swap', i: lo, j: hi, array: [...arr], description: phaseDesc });
      lo++;
      hi--;
    }
  }

  reverseSegment(0, n - 1, 'Step 1: reverse entire array');
  trace.push({ type: 'phase', phase: 1, array: [...arr], description: 'Reversed entire array' });

  reverseSegment(0, effective_k - 1, `Step 2: reverse first ${effective_k} elements`);
  trace.push({ type: 'phase', phase: 2, array: [...arr], description: `Reversed first ${effective_k} elements` });

  reverseSegment(effective_k, n - 1, `Step 3: reverse remaining ${n - effective_k} elements`);
  trace.push({ type: 'phase', phase: 3, array: [...arr], description: 'Reversed remaining elements — done' });

  trace.push({ type: 'result', array: [...arr], original: nums, k: effective_k });
  return trace;
}

export const DEFAULT_ROTATE_ARRAY_INPUT = { nums: [1, 2, 3, 4, 5, 6, 7], k: 3 };

// Product of Array Except Self (LC238) — prefix/suffix two-pass, no division.
// The visual story is the RESULT array filling up: the prefix pass writes the
// product of everything to the LEFT of each index (left → right), then the
// suffix pass multiplies in the product of everything to the RIGHT (right → left).
//
// Renderer: array. Step types map via mapArrayStep:
//   init   → set_data with the input nums (algo-gated context branch)
//   fill   → set_data snapshot of the evolving result + highlight of the
//            current index, with prefix/suffix running product context
//            (algo-gated branch inside the generic fill case)
//   result → final result array + output (plain string for verify gates)

export const DEFAULT_PRODUCT_EXCEPT_SELF_INPUT = { nums: [1, 2, 3, 4] };

export function productExceptSelf(input) {
  const nums = input.nums || input.array || DEFAULT_PRODUCT_EXCEPT_SELF_INPUT.nums;
  const n = nums.length;
  const trace = [];

  trace.push({
    type: 'init',
    pseudocode_line: 0,
    array: [...nums],
    description: `For each index, compute the product of every OTHER element — no division allowed. Two passes over a result array: prefix products left-to-right, then suffix products right-to-left.`,
  });

  const result = new Array(n).fill(1);

  // Pass 1: result[i] = product of everything left of i.
  let prefix = 1;
  for (let i = 0; i < n; i++) {
    result[i] = prefix;
    prefix *= nums[i];
    trace.push({
      type: 'fill',
      pseudocode_line: 2,
      array: [...result],
      indices: [i],
      pass: 'prefix',
      running: prefix,
      value: result[i],
      description: `Prefix pass, index ${i}: everything left of nums[${i}] multiplies to ${result[i]} — write it. Running prefix product becomes ${prefix}.`,
    });
  }

  // Pass 2: multiply in the product of everything right of i.
  let suffix = 1;
  for (let i = n - 1; i >= 0; i--) {
    result[i] *= suffix;
    suffix *= nums[i];
    trace.push({
      type: 'fill',
      pseudocode_line: 4,
      array: [...result],
      indices: [i],
      pass: 'suffix',
      running: suffix,
      value: result[i],
      description: `Suffix pass, index ${i}: multiply in the product of everything to the right (${result[i] === 0 ? 0 : result[i]} after × suffix). Running suffix product becomes ${suffix}.`,
    });
  }

  trace.push({
    type: 'result',
    pseudocode_line: 5,
    array: [...result],
    output: JSON.stringify(result),
    description: `Result complete: [${result.join(', ')}] — each entry is the product of all other elements.`,
  });

  return trace;
}

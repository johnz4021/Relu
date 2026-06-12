// Move Zeroes (LC283) — slow/fast pointer compaction with swaps, in place.
// `fast` scans every element; `slow` marks the boundary of the non-zero
// prefix. Every non-zero element gets swapped down to the `slow` slot, which
// sweeps all zeroes to the tail while preserving relative order.
//
// Renderer: array. Step types map via mapArrayStep:
//   init    → set_data (default stats context — 'stats' panel registered)
//   compare → slow/fast pointers (+ compare highlight when they differ)
//   swap    → animated swap of slow/fast (existing generic case)
//   result  → final array + output (plain string for verify gates)

export const DEFAULT_MOVE_ZEROES_INPUT = { nums: [0, 1, 0, 3, 12] };

export function moveZeroes(input) {
  const nums = [...(input.nums || input.array || DEFAULT_MOVE_ZEROES_INPUT.nums)];
  const trace = [];

  trace.push({
    type: 'init',
    pseudocode_line: 0,
    array: [...nums],
    description: `Move every 0 to the end, in place, keeping the non-zero order. Slow pointer marks where the next non-zero belongs; fast pointer scans.`,
  });

  let slow = 0;
  for (let fast = 0; fast < nums.length; fast++) {
    const isZero = nums[fast] === 0;
    trace.push({
      type: 'compare',
      pseudocode_line: 2,
      // Compare highlight only when the pointers point at different slots —
      // comparing an element with itself reads as noise.
      ...(slow !== fast ? { indices: [slow, fast] } : {}),
      pointers: { slow, fast },
      value: nums[fast],
      description: isZero
        ? `nums[${fast}] is 0 — leave it behind; slow stays at ${slow} waiting for the next non-zero.`
        : `nums[${fast}] = ${nums[fast]} is non-zero — it belongs at the slow slot (index ${slow}).`,
    });

    if (!isZero) {
      if (slow !== fast) {
        [nums[slow], nums[fast]] = [nums[fast], nums[slow]];
        trace.push({
          type: 'swap',
          pseudocode_line: 3,
          i: slow,
          j: fast,
          array: [...nums],
          pointers: { slow, fast },
          description: `Swap indices ${slow} and ${fast}: ${nums[slow]} moves into the non-zero prefix, the 0 drifts toward the tail.`,
        });
      }
      slow++;
    }
  }

  trace.push({
    type: 'result',
    pseudocode_line: 5,
    array: [...nums],
    output: JSON.stringify(nums),
    description: `Done: [${nums.join(', ')}] — all zeroes at the end, non-zero order preserved.`,
  });

  return trace;
}

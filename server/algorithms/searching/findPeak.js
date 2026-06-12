// Find Peak Element (LC162) — binary search on the slope.
// The array isn't sorted, but the SLOPE at mid tells you where a peak must
// be: rising (nums[mid] < nums[mid+1]) means a peak exists to the right;
// falling means mid itself or something left of it is a peak. Halving on
// slope converges to a peak in O(log n).
//
// Determinism: this half-open variant (left < right, right ← mid) always
// converges to ONE specific peak per input. For the default input
// [1,2,1,3,5,6,4] (LC162 Example 2, valid answers 1 or 5) it returns
// index 5 — that exact value is asserted by the verify gates.
//
// Renderer: array. Step types map via mapArrayStep (binary-search family):
//   init            → set_data + pointers at both ends (algo-gated, no target)
//   check_mid       → left/right/mid pointers + slope comparison context
//   eliminate_left  → left ← mid+1 (existing case)
//   eliminate_right → right ← mid (carries explicit `right`; the mapper
//                     honors it instead of the closed-interval mid-1 default)
//   found / result  → peak index + output (plain string for verify gates)

export const DEFAULT_FIND_PEAK_INPUT = { nums: [1, 2, 1, 3, 5, 6, 4] };

export function findPeak(input) {
  const nums = input.nums || input.array || DEFAULT_FIND_PEAK_INPUT.nums;
  const trace = [];

  trace.push({
    type: 'init',
    pseudocode_line: 0,
    array: [...nums],
    description: `Find any peak (an element greater than its neighbors) in O(log n). No target to search for — the SLOPE at mid decides which half must contain a peak.`,
  });

  let left = 0;
  let right = nums.length - 1;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const rising = nums[mid] < nums[mid + 1];

    trace.push({
      type: 'check_mid',
      pseudocode_line: 2,
      left,
      right,
      mid,
      value: nums[mid],
      next_value: nums[mid + 1],
      description: `Check the slope at mid=${mid}: nums[${mid}]=${nums[mid]} vs nums[${mid + 1}]=${nums[mid + 1]} — ${rising ? 'rising' : 'falling'}.`,
    });

    if (rising) {
      trace.push({
        type: 'eliminate_left',
        pseudocode_line: 4,
        mid,
        description: `Rising slope: ${nums[mid]} < ${nums[mid + 1]}, so climbing right MUST reach a peak. Eliminate mid and everything left: left ← ${mid + 1}.`,
      });
      left = mid + 1;
    } else {
      trace.push({
        type: 'eliminate_right',
        pseudocode_line: 6,
        mid,
        right: mid,
        description: `Falling (or flat-down) slope: a peak is at mid or to its left — mid might BE the peak, so keep it: right ← ${mid}.`,
      });
      right = mid;
    }
  }

  trace.push({
    type: 'found',
    pseudocode_line: 7,
    index: left,
    value: nums[left],
    description: `Pointers meet at index ${left}: nums[${left}] = ${nums[left]} is a peak.`,
  });

  trace.push({
    type: 'result',
    pseudocode_line: 7,
    array: [...nums],
    output: String(left),
    description: `Peak found at index ${left} (value ${nums[left]}).`,
  });

  return trace;
}

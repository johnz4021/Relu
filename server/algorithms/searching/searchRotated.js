// Search in Rotated Sorted Array (LC33) — modified binary search.
// The rotation breaks global sortedness, but at every mid AT LEAST ONE half
// is still sorted. Identify the sorted half, check whether the target lies
// inside its range, and eliminate accordingly — still O(log n).
//
// Renderer: array. Step types map via mapArrayStep (binary-search family):
//   init            → set_data + target/bounds context (shares the
//                     binary_search algo-gated init branch; sets state.target)
//   check_mid       → left/right/mid pointers + "which half is sorted" context
//                     (algo-gated branch adds the sorted-half entry)
//   eliminate_left / eliminate_right → closed-interval pointer moves
//                     (mid+1 / mid-1, the existing case defaults)
//   found / result  → match index + output (plain string for verify gates)

export const DEFAULT_SEARCH_ROTATED_INPUT = { nums: [4, 5, 6, 7, 0, 1, 2], target: 0 };

export function searchRotated(input) {
  const nums = input.nums || input.array || DEFAULT_SEARCH_ROTATED_INPUT.nums;
  const target = input.target ?? DEFAULT_SEARCH_ROTATED_INPUT.target;
  const trace = [];

  trace.push({
    type: 'init',
    pseudocode_line: 0,
    array: [...nums],
    target,
    description: `Search for ${target} in a rotated sorted array. Plain binary search breaks — but at every mid, at least one half is still sorted, and that's enough to halve.`,
  });

  let left = 0;
  let right = nums.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const leftSorted = nums[left] <= nums[mid];
    const sortedHalf = leftSorted ? `left [${left}..${mid}]` : `right [${mid}..${right}]`;

    trace.push({
      type: 'check_mid',
      pseudocode_line: 2,
      left,
      right,
      mid,
      value: nums[mid],
      target,
      sorted_half: sortedHalf,
      description: `Check mid=${mid}: value ${nums[mid]}. The ${leftSorted ? 'left' : 'right'} half ${sortedHalf} is sorted.`,
    });

    if (nums[mid] === target) {
      trace.push({
        type: 'found',
        pseudocode_line: 3,
        index: mid,
        value: nums[mid],
        description: `Found ${target} at index ${mid}!`,
      });
      trace.push({
        type: 'result',
        pseudocode_line: 3,
        array: [...nums],
        found: true,
        index: mid,
        output: String(mid),
        description: `Search complete: ${target} found at index ${mid}.`,
      });
      return trace;
    }

    if (leftSorted) {
      if (nums[left] <= target && target < nums[mid]) {
        trace.push({
          type: 'eliminate_right',
          pseudocode_line: 5,
          mid,
          description: `Left half is sorted and ${target} fits in [${nums[left]}..${nums[mid]}): search left. New range [${left}..${mid - 1}].`,
        });
        right = mid - 1;
      } else {
        trace.push({
          type: 'eliminate_left',
          pseudocode_line: 6,
          mid,
          description: `Left half is sorted but ${target} is NOT in [${nums[left]}..${nums[mid]}): it must be in the rotated right half. New range [${mid + 1}..${right}].`,
        });
        left = mid + 1;
      }
    } else {
      if (nums[mid] < target && target <= nums[right]) {
        trace.push({
          type: 'eliminate_left',
          pseudocode_line: 8,
          mid,
          description: `Right half is sorted and ${target} fits in (${nums[mid]}..${nums[right]}]: search right. New range [${mid + 1}..${right}].`,
        });
        left = mid + 1;
      } else {
        trace.push({
          type: 'eliminate_right',
          pseudocode_line: 9,
          mid,
          description: `Right half is sorted but ${target} is NOT in (${nums[mid]}..${nums[right]}]: it must be in the rotated left half. New range [${left}..${mid - 1}].`,
        });
        right = mid - 1;
      }
    }
  }

  trace.push({
    type: 'result',
    pseudocode_line: 10,
    array: [...nums],
    found: false,
    output: '-1',
    description: `Search complete: ${target} is not in the array.`,
  });

  return trace;
}

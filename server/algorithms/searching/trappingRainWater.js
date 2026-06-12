// Trapping Rain Water (LC42) — two-pointer water accumulation.
// Pointers converge from both ends, always processing the side with the
// SHORTER wall: the water level at that index is bounded by its own side's
// running max (the other side is guaranteed to have a wall at least as tall).
//
// Renderer: array (bars). Step types map via mapArrayStep:
//   init          → set_data + pointers at both ends (algo-gated branch)
//   collect_water → pointers + highlight of the processed index + water context
//   move_left / move_right → pointer advance (existing generic cases)
//   result        → summary + output (plain string for verify gates)

export const DEFAULT_TRAPPING_RAIN_WATER_INPUT = { heights: [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1] };

export function trappingRainWater(input) {
  const heights = input.heights || input.array || DEFAULT_TRAPPING_RAIN_WATER_INPUT.heights;
  const trace = [];

  trace.push({
    type: 'init',
    pseudocode_line: 0,
    array: [...heights],
    description: `How much rain water can these walls trap? Pointers start at both ends; each side tracks the tallest wall seen so far.`,
  });

  let left = 0;
  let right = heights.length - 1;
  let leftMax = 0;
  let rightMax = 0;
  let total = 0;

  while (left < right) {
    if (heights[left] < heights[right]) {
      leftMax = Math.max(leftMax, heights[left]);
      const water = leftMax - heights[left];
      total += water;
      trace.push({
        type: 'collect_water',
        pseudocode_line: water > 0 ? 4 : 3,
        left,
        right,
        index: left,
        side: 'left',
        left_max: leftMax,
        right_max: rightMax,
        water,
        total,
        description: water > 0
          ? `Wall ${heights[left]} at index ${left} sits below left max ${leftMax}: it traps ${water} unit${water === 1 ? '' : 's'} of water (total ${total}).`
          : `Wall ${heights[left]} at index ${left} is the new left max — nothing taller to its left, so no water here.`,
      });
      trace.push({
        type: 'move_left',
        pseudocode_line: 5,
        left: left + 1,
        right,
        description: `Left wall (${heights[left]}) is shorter than the right (${heights[right]}) — its water level is settled, advance left.`,
      });
      left++;
    } else {
      rightMax = Math.max(rightMax, heights[right]);
      const water = rightMax - heights[right];
      total += water;
      trace.push({
        type: 'collect_water',
        pseudocode_line: water > 0 ? 8 : 7,
        left,
        right,
        index: right,
        side: 'right',
        left_max: leftMax,
        right_max: rightMax,
        water,
        total,
        description: water > 0
          ? `Wall ${heights[right]} at index ${right} sits below right max ${rightMax}: it traps ${water} unit${water === 1 ? '' : 's'} of water (total ${total}).`
          : `Wall ${heights[right]} at index ${right} is the new right max — nothing taller to its right, so no water here.`,
      });
      trace.push({
        type: 'move_right',
        pseudocode_line: 9,
        left,
        right: right - 1,
        description: `Right wall (${heights[right]}) is not taller than the left (${heights[left]}) — its water level is settled, advance right.`,
      });
      right--;
    }
  }

  trace.push({
    type: 'result',
    pseudocode_line: 10,
    array: [...heights],
    output: String(total),
    description: `All positions settled: the walls trap ${total} units of rain water.`,
  });

  return trace;
}

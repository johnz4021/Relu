// Container With Most Water (LC11) — two-pointer area maximization.
// Unsorted-array two-pointer variant: pointers converge from both ends,
// always moving the SHORTER line inward (moving the taller one can never
// improve the area, since width shrinks and height is capped by the shorter).
//
// Renderer: array (bars). Step types map via mapArrayStep:
//   init        → set_data + pointers at both ends
//   check_area  → pointers + highlight pair + area/best context
//   move_left / move_right → pointer advance (existing generic cases)
//   found       → highlight the best pair
//   result      → summary + output (plain string for verify gates)

export const DEFAULT_CONTAINER_WATER_INPUT = { heights: [1, 8, 6, 2, 5, 4, 8, 3, 7] };

export function containerWater(input) {
  const heights = input.heights || input.array || DEFAULT_CONTAINER_WATER_INPUT.heights;
  const trace = [];

  trace.push({
    type: 'init',
    pseudocode_line: 0,
    array: [...heights],
    description: `Find two lines that hold the most water. Start with the widest container: pointers at both ends (width ${heights.length - 1}).`,
  });

  let left = 0;
  let right = heights.length - 1;
  let best = 0;
  let bestPair = [0, heights.length - 1];

  while (left < right) {
    const width = right - left;
    const height = Math.min(heights[left], heights[right]);
    const area = width * height;
    const improved = area > best;
    if (improved) {
      best = area;
      bestPair = [left, right];
    }

    trace.push({
      type: 'check_area',
      pseudocode_line: improved ? 3 : 2,
      left,
      right,
      width,
      height,
      area,
      best,
      improved,
      description: `Lines ${heights[left]} and ${heights[right]}: width ${width} × min height ${height} = area ${area}${improved ? ' — new best!' : ` (best stays ${best})`}`,
    });

    // Move the shorter line inward — the only move that can improve the area.
    if (heights[left] < heights[right]) {
      trace.push({
        type: 'move_left',
        pseudocode_line: 4,
        left: left + 1,
        right,
        description: `Left line (${heights[left]}) is shorter — moving it inward is the only way the area can grow.`,
      });
      left++;
    } else {
      trace.push({
        type: 'move_right',
        pseudocode_line: 5,
        left,
        right: right - 1,
        description: `Right line (${heights[right]}) is shorter or equal — move it inward.`,
      });
      right--;
    }
  }

  trace.push({
    type: 'found',
    pseudocode_line: 6,
    indices: bestPair,
    description: `Best container: lines at indices ${bestPair[0]} and ${bestPair[1]} (heights ${heights[bestPair[0]]} and ${heights[bestPair[1]]}), area ${best}.`,
  });

  trace.push({
    type: 'result',
    pseudocode_line: 6,
    array: [...heights],
    output: String(best),
    description: `Maximum water container area: ${best}.`,
  });

  return trace;
}

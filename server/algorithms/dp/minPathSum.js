/**
 * Minimum Path Sum (LC64) — 2D grid DP.
 * dp[i][j] = min cost to reach (i, j) from top-left.
 * dp[i][j] = min(dp[i-1][j], dp[i][j-1]) + grid[i][j].
 * Also covers Unique Paths (LC62) in structure — same fill order, sum instead of min.
 */
export function minPathSum(input) {
  const { grid } = input;
  const rows = grid.length;
  const cols = grid[0].length;
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));

  const trace = [];
  trace.push({
    type: 'init_table',
    rows,
    cols,
    rowLabels: Array.from({ length: rows }, (_, i) => `r${i}`),
    colLabels: Array.from({ length: cols }, (_, i) => `c${i}`),
    table: dp.map(r => [...r]),
  });

  dp[0][0] = grid[0][0];
  trace.push({ type: 'fill_cell', row: 0, col: 0, value: dp[0][0], from: [], is_base: true, grid_val: grid[0][0] });

  for (let c = 1; c < cols; c++) {
    dp[0][c] = dp[0][c - 1] + grid[0][c];
    trace.push({
      type: 'fill_cell', row: 0, col: c, value: dp[0][c],
      from_left: dp[0][c - 1], grid_val: grid[0][c],
      from: [{ row: 0, col: c - 1, role: 'skip' }],
    });
  }

  for (let r = 1; r < rows; r++) {
    dp[r][0] = dp[r - 1][0] + grid[r][0];
    trace.push({
      type: 'fill_cell', row: r, col: 0, value: dp[r][0],
      from_above: dp[r - 1][0], grid_val: grid[r][0],
      from: [{ row: r - 1, col: 0, role: 'skip' }],
    });
  }

  for (let r = 1; r < rows; r++) {
    for (let c = 1; c < cols; c++) {
      const fromAbove = dp[r - 1][c];
      const fromLeft = dp[r][c - 1];
      dp[r][c] = Math.min(fromAbove, fromLeft) + grid[r][c];
      const chosen = fromAbove <= fromLeft
        ? { row: r - 1, col: c, role: 'optimal' }
        : { row: r, col: c - 1, role: 'optimal' };
      const other = fromAbove <= fromLeft
        ? { row: r, col: c - 1, role: 'skip' }
        : { row: r - 1, col: c, role: 'skip' };
      trace.push({
        type: 'fill_cell', row: r, col: c, value: dp[r][c],
        from_above: fromAbove, from_left: fromLeft, grid_val: grid[r][c],
        from: [chosen, other],
      });
    }
  }

  // Backtrack optimal path
  const path = [];
  let r = rows - 1, c = cols - 1;
  while (r > 0 || c > 0) {
    path.unshift([r, c]);
    if (r === 0) c--;
    else if (c === 0) r--;
    else if (dp[r - 1][c] < dp[r][c - 1]) r--;
    else c--;
  }
  path.unshift([0, 0]);

  trace.push({ type: 'result', min_cost: dp[rows - 1][cols - 1], path });
  return trace;
}

export const DEFAULT_MIN_PATH_SUM_INPUT = { grid: [[1, 3, 1], [1, 5, 1], [4, 2, 1]] };

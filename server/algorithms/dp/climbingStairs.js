/**
 * Climbing Stairs / Fibonacci (LC70) — 1D DP.
 * dp[i] = number of distinct ways to climb i stairs.
 * dp[0] = 1 (one way: do nothing), dp[1] = 1.
 * dp[i] = dp[i-1] + dp[i-2] for i >= 2.
 */
export function climbingStairs(input) {
  const { n } = input;
  const dp = new Array(n + 1).fill(0);
  dp[0] = 1;
  if (n >= 1) dp[1] = 1;

  const trace = [];
  trace.push({
    type: 'init_table',
    size: n + 1,
    table: [...dp],
    colLabels: Array.from({ length: n + 1 }, (_, i) => String(i)),
    n,
  });

  trace.push({ type: 'fill_cell', row: 0, col: 0, value: 1, from: [], is_base: true });
  if (n >= 1) {
    trace.push({ type: 'fill_cell', row: 0, col: 1, value: 1, from: [], is_base: true });
  }

  for (let i = 2; i <= n; i++) {
    dp[i] = dp[i - 1] + dp[i - 2];
    trace.push({
      type: 'fill_cell',
      row: 0,
      col: i,
      value: dp[i],
      prev1: dp[i - 1],
      prev2: dp[i - 2],
      from: [
        { row: 0, col: i - 1, role: 'skip' },
        { row: 0, col: i - 2, role: 'optimal' },
      ],
    });
  }

  trace.push({ type: 'result', n, ways: dp[n] });
  return trace;
}

export const DEFAULT_CLIMBING_STAIRS_INPUT = { n: 6 };

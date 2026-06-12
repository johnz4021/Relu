// Tier 1 implementations for DP pattern variants not covered by existing dp/ files.

import { buildTree, serializeTree } from '../tree/lcaTree.js';

// ── lis — Longest Increasing Subsequence (O(n²) DP) ──────────────────────────
export function lis(input) {
  const nums = input.nums || [];
  const n = nums.length;
  const trace = [];
  const dp = new Array(n).fill(1);
  const prev = new Array(n).fill(-1);

  trace.push({
    type: 'init',
    description: `LIS: dp[i] = length of LIS ending at index i. Init all 1.`,
    array: [...dp],
    indices: [],
  });

  let best = 0;
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (nums[j] < nums[i] && dp[j] + 1 > dp[i]) {
        dp[i] = dp[j] + 1;
        prev[i] = j;
      }
    }
    if (dp[i] > dp[best]) best = i;
    trace.push({
      type: 'fill',
      description: `dp[${i}]=${dp[i]}: nums[${i}]=${nums[i]} can extend from best predecessor`,
      array: [...dp],
      indices: [i],
      i, value: dp[i],
    });
  }

  // Reconstruct LIS
  const lisPath = [];
  for (let cur = best; cur !== -1; cur = prev[cur]) lisPath.unshift(cur);
  const lisValues = lisPath.map(i => nums[i]);

  trace.push({
    type: 'result',
    description: `LIS length = ${dp[best]}: [${lisValues.join(', ')}]`,
    array: [...dp],
    indices: lisPath,
    output: String(dp[best]),
  });

  return trace;
}

export const DEFAULT_LIS_INPUT = { nums: [10, 9, 2, 5, 3, 7, 101, 18] };

// ── stock_dp — Best Time to Buy/Sell Stock with Cooldown ─────────────────────
// State machine: held / sold / rest (cooldown)
export function stockDp(input) {
  const prices = input.prices || [];
  const trace = [];

  // States: held = max profit holding a stock, sold = just sold, rest = cooldown/idle
  let held = -Infinity, sold = 0, rest = 0;

  trace.push({
    type: 'init_table',
    description: `Stock DP with cooldown over ${prices.length} days. States: held/sold/rest`,
    rows: prices.length + 1,
    cols: 3,
    rowLabels: ['init', ...prices.map((p, i) => `Day ${i} (${p})`)],
    colLabels: ['held', 'sold', 'rest'],
    row: 0, col: 0,
    held, sold, rest,
  });

  for (let i = 0; i < prices.length; i++) {
    const p = prices[i];
    const prevHeld = held, prevSold = sold, prevRest = rest;
    held = Math.max(prevHeld, prevRest - p);
    sold = prevHeld + p;
    rest = Math.max(prevRest, prevSold);

    trace.push({
      type: 'fill_cell',
      description: `Day ${i} price=${p}: held=max(${prevHeld}, ${prevRest}-${p})=${held}  sold=${prevHeld}+${p}=${sold}  rest=max(${prevRest},${prevSold})=${rest}`,
      row: i + 1, col: 0,
      day: i, price: p,
      held, sold, rest,
    });
  }

  const answer = Math.max(sold, rest);
  trace.push({
    type: 'result',
    description: `Max profit = max(sold=${sold}, rest=${rest}) = ${answer}`,
    row: prices.length, col: 0,
    output: String(answer),
  });

  return trace;
}

export const DEFAULT_STOCK_DP_INPUT = { prices: [1, 2, 3, 0, 2] };

// ── interval_dp — Burst Balloons ──────────────────────────────────────────────
// dp[i][j] = max coins from bursting all balloons between i and j (exclusive)
export function intervalDp(input) {
  const nums = input.nums || [];
  const trace = [];

  // Pad with 1 on each side
  const balloons = [1, ...nums, 1];
  const n = balloons.length;
  const dp = Array.from({ length: n }, () => new Array(n).fill(0));

  trace.push({
    type: 'init_table',
    description: `Burst Balloons: dp[i][j] = max coins bursting balloons (i..j). Padded: [${balloons.join(', ')}]`,
    rows: n,
    cols: n,
    rowLabels: balloons.map((b, i) => `i=${i} (${b})`),
    colLabels: balloons.map((b, i) => `j=${i} (${b})`),
    row: 0, col: 0, value: 0,
  });

  // Fill by length of interval
  for (let len = 2; len < n; len++) {
    for (let left = 0; left < n - len; left++) {
      const right = left + len;
      for (let k = left + 1; k < right; k++) {
        const coins = balloons[left] * balloons[k] * balloons[right] + dp[left][k] + dp[k][right];
        if (coins > dp[left][right]) {
          dp[left][right] = coins;
          trace.push({
            type: 'fill_cell',
            description: `dp[${left}][${right}]: last burst k=${k} → ${balloons[left]}×${balloons[k]}×${balloons[right]} + dp[${left}][${k}] + dp[${k}][${right}] = ${coins}`,
            row: left, col: right, value: coins,
            k, coins,
          });
        }
      }
    }
  }

  trace.push({
    type: 'result',
    description: `Maximum coins from bursting all balloons: ${dp[0][n - 1]}`,
    row: 0, col: n - 1,
    output: String(dp[0][n - 1]),
  });

  return trace;
}

export const DEFAULT_INTERVAL_DP_INPUT = { nums: [3, 1, 5, 8] };

// ── palindrome_dp — Longest Palindromic Subsequence ──────────────────────────
// dp[i][j] = LPS length in s[i..j]
export function palindromeDp(input) {
  const s = input.s || '';
  const n = s.length;
  const trace = [];
  const dp = Array.from({ length: n }, () => new Array(n).fill(0));

  // Single chars are palindromes of length 1
  for (let i = 0; i < n; i++) dp[i][i] = 1;

  trace.push({
    type: 'init_table',
    description: `LPS in "${s}": dp[i][j] = longest palindromic subsequence in s[i..j]. Diagonal = 1.`,
    rows: n,
    cols: n,
    rowLabels: Array.from(s).map((ch, i) => `i=${i} (${ch})`),
    colLabels: Array.from(s).map((ch, i) => `j=${i} (${ch})`),
    row: 0, col: 0, value: 1,
  });

  for (let len = 2; len <= n; len++) {
    for (let i = 0; i <= n - len; i++) {
      const j = i + len - 1;
      if (s[i] === s[j]) {
        dp[i][j] = (len === 2 ? 0 : dp[i + 1][j - 1]) + 2;
        trace.push({
          type: 'fill_cell',
          description: `s[${i}]='${s[i]}' == s[${j}]='${s[j]}': dp[${i}][${j}] = dp[${i+1}][${j-1}] + 2 = ${dp[i][j]}`,
          row: i, col: j, value: dp[i][j],
        });
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j - 1]);
        trace.push({
          type: 'fill_cell',
          description: `s[${i}]='${s[i]}' != s[${j}]='${s[j]}': dp[${i}][${j}] = max(dp[${i+1}][${j}], dp[${i}][${j-1}]) = ${dp[i][j]}`,
          row: i, col: j, value: dp[i][j],
        });
      }
    }
  }

  trace.push({
    type: 'result',
    description: `Longest palindromic subsequence in "${s}": length ${dp[0][n - 1]}`,
    row: 0, col: n - 1,
    output: String(dp[0][n - 1]),
  });

  return trace;
}

export const DEFAULT_PALINDROME_DP_INPUT = { s: 'bbbab' };

// ── bitmask_dp — Traveling Salesman (Held-Karp) ───────────────────────────────
// dp[mask][i] = min cost to visit all cities in mask, ending at city i
export function bitmaskDp(input) {
  const dist = input.dist || [
    [0, 10, 15, 20],
    [10, 0, 35, 25],
    [15, 35, 0, 30],
    [20, 25, 30, 0],
  ];
  const n = dist.length;
  const trace = [];
  const INF = Infinity;
  const dp = Array.from({ length: 1 << n }, () => new Array(n).fill(INF));

  dp[1][0] = 0;

  trace.push({
    type: 'init_table',
    description: `TSP Bitmask DP on ${n} cities. dp[mask][city] = min cost visiting cities in mask, ending at city.`,
    rows: 1 << n,
    cols: n,
    rowLabels: Array.from({ length: 1 << n }, (_, m) => m.toString(2).padStart(n, '0')),
    colLabels: Array.from({ length: n }, (_, i) => `city ${i}`),
    row: 1, col: 0, value: 0,
  });

  for (let mask = 1; mask < (1 << n); mask++) {
    for (let u = 0; u < n; u++) {
      if (!(mask & (1 << u)) || dp[mask][u] === INF) continue;
      for (let v = 0; v < n; v++) {
        if (mask & (1 << v)) continue;
        const newMask = mask | (1 << v);
        const newCost = dp[mask][u] + dist[u][v];
        if (newCost < dp[newMask][v]) {
          dp[newMask][v] = newCost;
          trace.push({
            type: 'fill_cell',
            description: `mask=${mask.toString(2).padStart(n,'0')} → add city ${v}: cost ${dp[mask][u]}+${dist[u][v]}=${newCost}`,
            row: newMask, col: v, value: newCost,
            fromMask: mask, fromCity: u, toCity: v,
          });
        }
      }
    }
  }

  const fullMask = (1 << n) - 1;
  let best = INF;
  for (let i = 1; i < n; i++) {
    const total = dp[fullMask][i] + dist[i][0];
    if (total < best) best = total;
  }

  trace.push({
    type: 'result',
    description: `Minimum TSP tour cost: ${best}`,
    row: fullMask, col: 0,
    output: String(best),
  });

  return trace;
}

export const DEFAULT_BITMASK_DP_INPUT = {
  dist: [
    [0, 10, 15, 20],
    [10, 0, 35, 25],
    [15, 35, 0, 30],
    [20, 25, 30, 0],
  ],
};

// ── tree_dp — Binary Tree Max Path Sum ────────────────────────────────────────
// For each node: gain = max(0, leftGain) + max(0, rightGain) + node.val
export function treeDP(input) {
  const nodes = input.nodes || [1, 2, 3];
  // Build tree from level-order array
  const tree = nodes.map((val, i) => val !== null ? { id: String(i), val } : null);
  const trace = [];
  let maxSum = -Infinity;

  // The tree renderer's empty-state guard only clears on a structural action,
  // so init must carry the serialized tree (same contract as lca_tree).
  const nodeMap = buildTree(nodes);

  trace.push({
    type: 'init',
    tree: serializeTree(nodeMap),
    description: `Binary Tree Max Path Sum over ${tree.filter(Boolean).length} nodes (level-order: [${nodes.join(', ')}])`,
    node: '0',
  });

  function dfs(i) {
    if (i >= tree.length || tree[i] === null) return 0;
    const leftGain = Math.max(0, dfs(2 * i + 1));
    const rightGain = Math.max(0, dfs(2 * i + 2));
    const node = tree[i];
    const pathThrough = node.val + leftGain + rightGain;
    if (pathThrough > maxSum) maxSum = pathThrough;

    trace.push({
      type: 'traverse',
      description: `node[${i}]=${node.val}: leftGain=${leftGain}, rightGain=${rightGain}, pathThrough=${pathThrough}, maxSoFar=${maxSum}`,
      node: String(i),
      parent: i > 0 ? String(Math.floor((i - 1) / 2)) : null,
    });

    return node.val + Math.max(leftGain, rightGain);
  }

  dfs(0);

  trace.push({
    type: 'result',
    description: `Maximum path sum: ${maxSum}`,
    node: '0',
    output: String(maxSum),
  });

  return trace;
}

export const DEFAULT_TREE_DP_INPUT = { nodes: [-10, 9, 20, null, null, 15, 7] };

// ── house_robber — House Robber (1D linear DP) ────────────────────────────────
export function houseRobber(input) {
  const nums = input.nums || [];
  const n = nums.length;
  const trace = [];

  if (n === 0) {
    trace.push({ type: 'init', description: 'Empty array', array: [], indices: [], output: '0' });
    trace.push({ type: 'result', description: 'Max rob: 0', array: [], indices: [], output: '0' });
    return trace;
  }

  const dp = new Array(n).fill(0);
  dp[0] = nums[0];
  if (n > 1) dp[1] = Math.max(nums[0], nums[1]);

  trace.push({
    type: 'init',
    description: `House Robber: dp[i] = max money robbing houses 0..i without adjacent`,
    array: [...dp],
    indices: [0],
  });

  for (let i = 2; i < n; i++) {
    dp[i] = Math.max(dp[i - 1], dp[i - 2] + nums[i]);
    trace.push({
      type: 'fill',
      description: `dp[${i}] = max(dp[${i-1}]=${dp[i-1]}, dp[${i-2}]+nums[${i}]=${dp[i-2]+nums[i]}) = ${dp[i]}`,
      array: [...dp],
      indices: [i],
      i, value: dp[i],
    });
  }

  trace.push({
    type: 'result',
    description: `Maximum money = ${dp[n - 1]}`,
    array: [...dp],
    indices: [n - 1],
    output: String(dp[n - 1]),
  });

  return trace;
}

export const DEFAULT_HOUSE_ROBBER_INPUT = { nums: [2, 7, 9, 3, 1] };

// ── maximal_square — Maximal Square (LC221, 2D DP) ────────────────────────────
// dp[i][j] = side of the largest all-'1' square whose bottom-right corner is
// (i, j): min(left, up, diag) + 1 when matrix[i][j] = '1', else 0.
// Renderer: table — knapsack-shaped steps (init_table / fill_cell {row, col,
// value, from} / result {output}) so the generic mapTableStep cases handle the
// grid; an algo-gated branch surfaces best side/area on the square_state panel.
export function maximalSquare(input) {
  const matrix = input.matrix || DEFAULT_MAXIMAL_SQUARE_INPUT.matrix;
  const rows = matrix.length;
  const cols = matrix[0]?.length || 0;
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));
  const trace = [];

  trace.push({
    type: 'init_table',
    pseudocode_line: 0,
    rows,
    cols,
    rowLabels: Array.from({ length: rows }, (_, i) => `r${i}`),
    colLabels: Array.from({ length: cols }, (_, i) => `c${i}`),
    description: `Maximal Square: dp[i][j] = side of the largest all-1 square ending (bottom-right) at (i,j) in the ${rows}×${cols} matrix.`,
  });

  let bestSide = 0;
  let bestCell = null;

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let from = [];
      let line;
      let explain;
      if (matrix[i][j] !== '1') {
        dp[i][j] = 0;
        line = 2;
        explain = `matrix[${i}][${j}] = '0' → dp[${i}][${j}] = 0 (no square ends here)`;
      } else if (i === 0 || j === 0) {
        dp[i][j] = 1;
        line = 3;
        explain = `matrix[${i}][${j}] = '1' on the border → dp[${i}][${j}] = 1 (1×1 square)`;
      } else {
        const left = dp[i][j - 1];
        const up = dp[i - 1][j];
        const diag = dp[i - 1][j - 1];
        dp[i][j] = Math.min(left, up, diag) + 1;
        const minVal = Math.min(left, up, diag);
        from = [
          { row: i, col: j - 1, role: left === minVal ? 'optimal' : 'skip' },
          { row: i - 1, col: j, role: up === minVal ? 'optimal' : 'skip' },
          { row: i - 1, col: j - 1, role: diag === minVal ? 'optimal' : 'skip' },
        ];
        line = 4;
        explain = `dp[${i}][${j}] = min(left ${left}, up ${up}, diag ${diag}) + 1 = ${dp[i][j]}`;
      }

      const improved = dp[i][j] > bestSide;
      if (improved) {
        bestSide = dp[i][j];
        bestCell = [i, j];
      }

      trace.push({
        type: 'fill_cell',
        pseudocode_line: line,
        row: i,
        col: j,
        value: dp[i][j],
        from,
        best_side: bestSide,
        best_area: bestSide * bestSide,
        improved,
        description: `${explain}.${improved ? ` New best side ${bestSide} → area ${bestSide * bestSide}.` : ''}`,
      });
    }
  }

  // Cells of the best square (for the result-step optimal highlight).
  const square = [];
  if (bestCell) {
    for (let r = bestCell[0] - bestSide + 1; r <= bestCell[0]; r++) {
      for (let c = bestCell[1] - bestSide + 1; c <= bestCell[1]; c++) {
        square.push({ row: r, col: c });
      }
    }
  }

  trace.push({
    type: 'result',
    pseudocode_line: 5,
    best_side: bestSide,
    square,
    output: String(bestSide * bestSide),
    description: bestSide > 0
      ? `Largest square has side ${bestSide}${bestCell ? `, ending at (${bestCell[0]},${bestCell[1]})` : ''} → area ${bestSide * bestSide}.`
      : 'No 1s in the matrix → maximal square area 0.',
  });

  return trace;
}

export const DEFAULT_MAXIMAL_SQUARE_INPUT = {
  matrix: [
    ['1', '0', '1', '0', '0'],
    ['1', '0', '1', '1', '1'],
    ['1', '1', '1', '1', '1'],
    ['1', '0', '0', '1', '0'],
  ],
};

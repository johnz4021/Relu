/**
 * Word Break (LC139) — 1D DP.
 * dp[i] = true if s[0..i-1] can be segmented into words from wordDict.
 * dp[0] = true (empty prefix). Transition: dp[i] = any(dp[j] && s[j:i] in dict).
 */
export function wordBreak(input) {
  const { s, wordDict } = input;
  const wordSet = new Set(wordDict);
  const n = s.length;
  const dp = new Array(n + 1).fill(false);
  dp[0] = true;

  const trace = [];
  trace.push({
    type: 'init_table',
    size: n + 1,
    table: dp.map(v => (v ? 1 : 0)),
    colLabels: Array.from({ length: n + 1 }, (_, i) => String(i)),
    s,
    wordDict,
  });

  for (let i = 1; i <= n; i++) {
    let matched = false;
    for (let j = 0; j < i; j++) {
      const word = s.slice(j, i);
      if (dp[j] && wordSet.has(word)) {
        dp[i] = true;
        matched = true;
        trace.push({
          type: 'fill_cell',
          row: 0,
          col: i,
          value: 1,
          word,
          from_j: j,
          from: [{ row: 0, col: j, role: 'optimal' }],
        });
        break;
      }
    }
    if (!matched) {
      trace.push({
        type: 'skip_cell',
        row: 0,
        col: i,
        value: 0,
        from: [],
      });
    }
  }

  trace.push({
    type: 'result',
    found: dp[n],
    dp: dp.map(v => (v ? 1 : 0)),
    s,
  });

  return trace;
}

export const DEFAULT_WORD_BREAK_INPUT = { s: 'leetcode', wordDict: ['leet', 'code'] };

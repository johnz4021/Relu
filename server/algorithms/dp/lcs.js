export function lcs(str1, str2) {
  const trace = [];
  const m = str1.length;
  const n = str2.length;

  // dp[i][j] = length of LCS of str1[0..i-1] and str2[0..j-1]
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  trace.push({
    type: 'init_table',
    rows: m + 1,
    cols: n + 1,
    str1,
    str2,
    rowLabels: ['""', ...str1.split('').map((ch, i) => `"${str1.slice(0, i + 1)}"`)],
    colLabels: ['""', ...str2.split('').map((ch, j) => `"${str2.slice(0, j + 1)}"`)],
    table: dp.map(row => [...row]),
    description: `Initialize a ${m + 1} x ${n + 1} DP table with zeros. Row 0 and column 0 are base cases (empty string has LCS length 0 with anything).`,
  });

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const char1 = str1[i - 1];
      const char2 = str2[j - 1];

      trace.push({
        type: 'compare_chars',
        row: i,
        col: j,
        char1,
        char2,
        match: char1 === char2,
        description: `Compare str1[${i - 1}] = '${char1}' with str2[${j - 1}] = '${char2}'. ${char1 === char2 ? 'Match!' : 'No match.'}`,
      });

      if (char1 === char2) {
        dp[i][j] = dp[i - 1][j - 1] + 1;

        trace.push({
          type: 'fill_cell',
          row: i,
          col: j,
          value: dp[i][j],
          from: [{ row: i - 1, col: j - 1 }],
          action: 'match',
          description: `Characters match! dp[${i}][${j}] = dp[${i - 1}][${j - 1}] + 1 = ${dp[i - 1][j - 1]} + 1 = ${dp[i][j]}.`,
        });
      } else {
        const fromTop = dp[i - 1][j];
        const fromLeft = dp[i][j - 1];
        dp[i][j] = Math.max(fromTop, fromLeft);

        const chosen = fromTop >= fromLeft
          ? [{ row: i - 1, col: j }]
          : [{ row: i, col: j - 1 }];

        trace.push({
          type: 'fill_cell',
          row: i,
          col: j,
          value: dp[i][j],
          from: chosen,
          action: 'take_max',
          fromTop,
          fromLeft,
          description: `No match. dp[${i}][${j}] = max(dp[${i - 1}][${j}], dp[${i}][${j - 1}]) = max(${fromTop}, ${fromLeft}) = ${dp[i][j]}.`,
        });
      }
    }
  }

  // Traceback to reconstruct the LCS string
  const lcsChars = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (str1[i - 1] === str2[j - 1]) {
      lcsChars.push(str1[i - 1]);

      trace.push({
        type: 'traceback',
        row: i,
        col: j,
        char: str1[i - 1],
        action: 'match_diagonal',
        description: `Traceback at dp[${i}][${j}]: str1[${i - 1}] = '${str1[i - 1]}' == str2[${j - 1}] = '${str2[j - 1]}'. Add '${str1[i - 1]}' to LCS. Move diagonally to dp[${i - 1}][${j - 1}].`,
      });

      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      trace.push({
        type: 'traceback',
        row: i,
        col: j,
        action: 'move_up',
        description: `Traceback at dp[${i}][${j}]: dp[${i - 1}][${j}] (${dp[i - 1][j]}) >= dp[${i}][${j - 1}] (${dp[i][j - 1]}). Move up to dp[${i - 1}][${j}].`,
      });

      i--;
    } else {
      trace.push({
        type: 'traceback',
        row: i,
        col: j,
        action: 'move_left',
        description: `Traceback at dp[${i}][${j}]: dp[${i}][${j - 1}] (${dp[i][j - 1]}) > dp[${i - 1}][${j}] (${dp[i - 1][j]}). Move left to dp[${i}][${j - 1}].`,
      });

      j--;
    }
  }

  lcsChars.reverse();
  const lcsString = lcsChars.join('');

  trace.push({
    type: 'result',
    lcsLength: dp[m][n],
    lcsString,
    table: dp.map(row => [...row]),
    description: `LCS complete! Length = ${dp[m][n]}. LCS = "${lcsString}".`,
  });

  return trace;
}

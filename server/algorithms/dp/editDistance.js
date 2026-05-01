export function editDistance(str1, str2) {
  const trace = [];
  const m = str1.length;
  const n = str2.length;

  // dp[i][j] = edit distance between str1[0..i-1] and str2[0..j-1]
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  // Base cases: transforming from/to empty string
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  trace.push({
    type: 'init_table',
    rows: m + 1,
    cols: n + 1,
    str1,
    str2,
    rowLabels: ['""', ...str1.split('').map((ch, i) => `"${str1.slice(0, i + 1)}"`)],
    colLabels: ['""', ...str2.split('').map((ch, j) => `"${str2.slice(0, j + 1)}"`)],
    table: dp.map(row => [...row]),
    description: `Initialize a ${m + 1} x ${n + 1} DP table. Base cases: dp[i][0] = i (delete all chars), dp[0][j] = j (insert all chars). Converting "${str1}" to "${str2}".`,
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
        description: `Compare str1[${i - 1}] = '${char1}' with str2[${j - 1}] = '${char2}'. ${char1 === char2 ? 'Match!' : 'Different.'}`,
      });

      if (char1 === char2) {
        dp[i][j] = dp[i - 1][j - 1];

        trace.push({
          type: 'fill_cell',
          row: i,
          col: j,
          value: dp[i][j],
          from: [{ row: i - 1, col: j - 1 }],
          operation: 'match',
          description: `Characters match! No edit needed. dp[${i}][${j}] = dp[${i - 1}][${j - 1}] = ${dp[i][j]}.`,
        });
      } else {
        const deleteCost = dp[i - 1][j] + 1;
        const insertCost = dp[i][j - 1] + 1;
        const replaceCost = dp[i - 1][j - 1] + 1;
        const minCost = Math.min(deleteCost, insertCost, replaceCost);

        dp[i][j] = minCost;

        let operation;
        let from;
        if (minCost === replaceCost) {
          operation = 'replace';
          from = [{ row: i - 1, col: j - 1 }];
        } else if (minCost === deleteCost) {
          operation = 'delete';
          from = [{ row: i - 1, col: j }];
        } else {
          operation = 'insert';
          from = [{ row: i, col: j - 1 }];
        }

        trace.push({
          type: 'fill_cell',
          row: i,
          col: j,
          value: dp[i][j],
          from,
          operation,
          deleteCost,
          insertCost,
          replaceCost,
          description: `Characters differ. Delete = dp[${i - 1}][${j}] + 1 = ${deleteCost}, Insert = dp[${i}][${j - 1}] + 1 = ${insertCost}, Replace = dp[${i - 1}][${j - 1}] + 1 = ${replaceCost}. Best: ${operation} (cost ${minCost}). dp[${i}][${j}] = ${dp[i][j]}.`,
        });
      }
    }
  }

  // Traceback to reconstruct the sequence of operations
  const operations = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && str1[i - 1] === str2[j - 1]) {
      operations.push({ op: 'match', char: str1[i - 1], i: i - 1, j: j - 1 });

      trace.push({
        type: 'traceback',
        row: i,
        col: j,
        operation: 'match',
        description: `Traceback at dp[${i}][${j}]: '${str1[i - 1]}' == '${str2[j - 1]}'. No edit. Move diagonally to dp[${i - 1}][${j - 1}].`,
      });

      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      operations.push({ op: 'replace', from: str1[i - 1], to: str2[j - 1], i: i - 1, j: j - 1 });

      trace.push({
        type: 'traceback',
        row: i,
        col: j,
        operation: 'replace',
        description: `Traceback at dp[${i}][${j}]: Replace '${str1[i - 1]}' with '${str2[j - 1]}'. Move diagonally to dp[${i - 1}][${j - 1}].`,
      });

      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      operations.push({ op: 'delete', char: str1[i - 1], i: i - 1 });

      trace.push({
        type: 'traceback',
        row: i,
        col: j,
        operation: 'delete',
        description: `Traceback at dp[${i}][${j}]: Delete '${str1[i - 1]}' from str1. Move up to dp[${i - 1}][${j}].`,
      });

      i--;
    } else {
      operations.push({ op: 'insert', char: str2[j - 1], j: j - 1 });

      trace.push({
        type: 'traceback',
        row: i,
        col: j,
        operation: 'insert',
        description: `Traceback at dp[${i}][${j}]: Insert '${str2[j - 1]}' from str2. Move left to dp[${i}][${j - 1}].`,
      });

      j--;
    }
  }

  operations.reverse();

  trace.push({
    type: 'result',
    distance: dp[m][n],
    operations,
    table: dp.map(row => [...row]),
    description: `Edit distance complete! Distance from "${str1}" to "${str2}" = ${dp[m][n]}. Operations: ${operations.map(op => op.op === 'match' ? `keep '${op.char}'` : op.op === 'replace' ? `replace '${op.from}'->'${op.to}'` : op.op === 'delete' ? `delete '${op.char}'` : `insert '${op.char}'`).join(', ')}.`,
  });

  return trace;
}

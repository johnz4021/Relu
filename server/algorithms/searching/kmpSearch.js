export const DEFAULT_KMP_SEARCH_INPUT = { text: 'hello', pattern: 'll' };

function buildFailureFunction(pattern) {
  const m = pattern.length;
  const lps = new Array(m).fill(0);
  let len = 0;
  let i = 1;

  while (i < m) {
    if (pattern[i] === pattern[len]) {
      len++;
      lps[i] = len;
      i++;
    } else if (len > 0) {
      len = lps[len - 1];
    } else {
      lps[i] = 0;
      i++;
    }
  }
  return lps;
}

export function kmpSearch(text, pattern) {
  const trace = [];
  const MAX_TEXT = 20;
  const MAX_PATTERN = 15;

  if (!pattern || pattern.length === 0) {
    trace.push({ type: 'error', description: 'Pattern is empty.' });
    return trace;
  }

  const t = text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
  const p = pattern.length > MAX_PATTERN ? pattern.slice(0, MAX_PATTERN) : pattern;
  const n = t.length;
  const m = p.length;

  if (m > n) {
    trace.push({
      type: 'result',
      description: `Pattern "${p}" (length ${m}) is longer than text "${t}" (length ${n}). No match possible.`,
      text: t,
      pattern: p,
      matches: [],
      found: false,
    });
    return trace;
  }

  trace.push({
    type: 'init',
    description: `KMP search: find pattern "${p}" in text "${t}". Phase 1: build failure function. Phase 2: search.`,
    text: t,
    pattern: p,
  });

  // Phase 1: Build failure function
  const lps = buildFailureFunction(p);

  for (let i = 0; i < m; i++) {
    trace.push({
      type: 'build_failure',
      description: `Failure function: lps[${i}] = ${lps[i]}. Pattern prefix that is also a suffix of p[0..${i}]: "${p.slice(0, lps[i])}"`,
      text: t,
      pattern: p,
      failure_index: i,
      failure_value: lps[i],
      lps: [...lps],
    });
  }

  // Phase 2: Search
  const matches = [];
  let i = 0; // text index
  let j = 0; // pattern index

  while (i < n) {
    trace.push({
      type: 'align',
      description: `Align pattern: pattern[0] is at text index ${i - j}. Comparing text[${i}]='${t[i]}' with pattern[${j}]='${p[j]}'.`,
      text: t,
      pattern: p,
      text_index: i,
      pattern_index: j,
      pattern_offset: i - j,
    });

    if (t[i] === p[j]) {
      trace.push({
        type: 'match_char',
        description: `Match: text[${i}]='${t[i]}' = pattern[${j}]='${p[j]}'.`,
        text: t,
        pattern: p,
        text_index: i,
        pattern_index: j,
        pattern_offset: i - j,
      });
      i++;
      j++;
    } else {
      trace.push({
        type: 'mismatch',
        description: `Mismatch: text[${i}]='${t[i]}' ≠ pattern[${j}]='${p[j]}'. ${j > 0 ? `Use failure function: skip to pattern[${lps[j - 1]}].` : 'j=0, advance text index.'}`,
        text: t,
        pattern: p,
        text_index: i,
        pattern_index: j,
        pattern_offset: i - j,
        new_pattern_offset: j > 0 ? i - lps[j - 1] : i + 1,
      });

      if (j > 0) {
        j = lps[j - 1];
      } else {
        i++;
      }
    }

    if (j === m) {
      const matchStart = i - j;
      matches.push(matchStart);

      trace.push({
        type: 'found',
        description: `Pattern found at index ${matchStart}! text[${matchStart}..${matchStart + m - 1}] = "${t.slice(matchStart, matchStart + m)}".`,
        text: t,
        pattern: p,
        match_index: matchStart,
        pattern_offset: matchStart,
        matches: [...matches],
      });

      j = lps[j - 1];
    }
  }

  trace.push({
    type: 'result',
    description: matches.length > 0
      ? `Found ${matches.length} match(es) at index${matches.length > 1 ? 'es' : ''}: ${matches.join(', ')}.`
      : `Pattern "${p}" not found in "${t}".`,
    text: t,
    pattern: p,
    matches,
    found: matches.length > 0,
  });

  return trace;
}

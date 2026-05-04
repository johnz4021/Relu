// Tier 1 implementations for advanced string algorithms.

// ── rabin_karp — Rabin-Karp Rolling Hash String Search ───────────────────────
export function rabinKarp(input) {
  const text = (input.text ?? 'abcxabcdabcdabcy').slice(0, 30);
  const pattern = (input.pattern ?? 'abcdabcy').slice(0, 15);
  const trace = [];
  const n = text.length, m = pattern.length;
  const BASE = 31, MOD = 1_000_000_007;

  if (m > n) {
    trace.push({ type: 'init', description: `Pattern longer than text — no match.`, text, pattern });
    trace.push({ type: 'result', description: 'No matches found.', text, pattern, matches: [], output: '[]' });
    return trace;
  }

  trace.push({
    type: 'init',
    description: `Rabin-Karp: search for "${pattern}" in "${text}" using rolling hash (base=${BASE}, mod=${MOD})`,
    text, pattern,
  });

  // Precompute hash of pattern and first window
  const charCode = c => c.charCodeAt(0) - 96;
  let patHash = 0, winHash = 0, power = 1;

  for (let i = 0; i < m; i++) {
    patHash = (patHash * BASE + charCode(pattern[i])) % MOD;
    winHash = (winHash * BASE + charCode(text[i])) % MOD;
    if (i > 0) power = (power * BASE) % MOD;
  }

  trace.push({
    type: 'hash',
    description: `Pattern hash = ${patHash}. Initial window "${text.slice(0, m)}" hash = ${winHash}`,
    text, pattern,
    windowStart: 0, windowEnd: m - 1,
  });

  const matches = [];

  for (let i = 0; i <= n - m; i++) {
    if (winHash === patHash) {
      // Hash match — verify character by character
      const match = text.slice(i, i + m) === pattern;
      if (match) matches.push(i);
      trace.push({
        type: match ? 'match' : 'spurious',
        description: match
          ? `Hash match at i=${i}: "${text.slice(i, i+m)}" == "${pattern}" ✓ MATCH`
          : `Hash collision at i=${i}: "${text.slice(i, i+m)}" != "${pattern}" (spurious hit)`,
        text, pattern,
        windowStart: i, windowEnd: i + m - 1,
        isMatch: match,
      });
    }

    if (i < n - m) {
      winHash = ((winHash - charCode(text[i]) * power % MOD + MOD) * BASE + charCode(text[i + m])) % MOD;
      trace.push({
        type: 'roll',
        description: `Roll window: remove '${text[i]}', add '${text[i+m]}' → new hash = ${winHash}`,
        text, pattern,
        windowStart: i + 1, windowEnd: i + m,
      });
    }
  }

  trace.push({
    type: 'result',
    description: matches.length
      ? `Found ${matches.length} match(es) at positions: [${matches.join(', ')}]`
      : `No matches found for "${pattern}" in "${text}"`,
    text, pattern, matches,
    output: JSON.stringify(matches),
  });

  return trace;
}

export const DEFAULT_RABIN_KARP_INPUT = { text: 'abcxabcdabcdabcy', pattern: 'abcdabcy' };

// ── manacher — Manacher's Algorithm (Longest Palindromic Substring) ───────────
export function manacher(input) {
  const s = (input.s ?? 'babad').slice(0, 20);
  const trace = [];

  trace.push({
    type: 'init',
    description: `Manacher's algorithm on "${s}": find longest palindromic substring in O(n)`,
    text: s, pattern: '',
  });

  // Transform: "abc" → "#a#b#c#"
  const t = '#' + s.split('').join('#') + '#';
  const n = t.length;
  const p = new Array(n).fill(0);
  let center = 0, right = 0;

  trace.push({
    type: 'transform',
    description: `Transform: insert '#' separators → "${t}"`,
    text: s, pattern: t,
  });

  for (let i = 0; i < n; i++) {
    if (i < right) {
      const mirror = 2 * center - i;
      p[i] = Math.min(right - i, p[mirror]);
    }

    // Expand around i
    let a = i - (p[i] + 1), b = i + (p[i] + 1);
    while (a >= 0 && b < n && t[a] === t[b]) {
      p[i]++;
      a--;
      b++;
    }

    if (i + p[i] > right) {
      center = i;
      right = i + p[i];
    }
  }

  // Find best
  let bestLen = 0, bestCenter = 0;
  for (let i = 0; i < n; i++) {
    if (p[i] > bestLen) { bestLen = p[i]; bestCenter = i; }
  }

  const start = Math.floor((bestCenter - bestLen) / 2);
  const longest = s.slice(start, start + bestLen);

  // Emit a summary of the palindrome radii
  trace.push({
    type: 'expand',
    description: `P[] array computed: max radius ${bestLen} at center=${bestCenter} → "${longest}"`,
    text: s, pattern: t,
    expand_L: start, expand_R: start + bestLen - 1,
    current_palindrome: longest,
  });

  trace.push({
    type: 'result',
    description: `Longest palindromic substring: "${longest}" (length ${bestLen}, starts at index ${start})`,
    text: s, pattern: t,
    expand_L: start, expand_R: start + bestLen - 1,
    current_palindrome: longest,
    output: longest,
  });

  return trace;
}

export const DEFAULT_MANACHER_INPUT = { s: 'babad' };

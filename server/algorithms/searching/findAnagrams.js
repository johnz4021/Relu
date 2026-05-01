export const DEFAULT_FIND_ANAGRAMS_INPUT = { s: 'cbaebabacd', p: 'abc' };

function freqMap(str) {
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  return freq;
}

function freqEqual(a, b) {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  for (const k of keysA) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export function findAnagrams(s, p) {
  const trace = [];
  const MAX_S = 20;
  const MAX_P = 10;

  if (!s || s.length === 0 || !p || p.length === 0) {
    trace.push({ type: 'error', description: 'Input string or pattern is empty.' });
    return trace;
  }

  const str = s.length > MAX_S ? s.slice(0, MAX_S) : s;
  const pat = p.length > MAX_P ? p.slice(0, MAX_P) : p;
  const n = str.length;
  const m = pat.length;

  const patFreq = freqMap(pat);
  const results = [];

  if (m > n) {
    trace.push({
      type: 'result',
      description: `Pattern "${pat}" is longer than string "${str}". No anagrams possible.`,
      s: str,
      p: pat,
      anagram_indices: [],
    });
    return trace;
  }

  // Build initial window
  const windowFreq = {};
  for (let i = 0; i < m; i++) {
    const ch = str[i];
    windowFreq[ch] = (windowFreq[ch] || 0) + 1;
  }

  trace.push({
    type: 'init',
    description: `Find all anagrams of "${pat}" in "${str}". Fixed window of size ${m}. Initialize with window [0..${m - 1}].`,
    s: str,
    p: pat,
    window_start: 0,
    window_end: m - 1,
    pattern_freq: { ...patFreq },
    window_freq: { ...windowFreq },
  });

  if (freqEqual(patFreq, windowFreq)) {
    results.push(0);
    trace.push({
      type: 'anagram_found',
      description: `Anagram found at index 0: "${str.slice(0, m)}".`,
      s: str,
      p: pat,
      window_start: 0,
      window_end: m - 1,
      anagram_start: 0,
    });
  }

  // Slide the window
  for (let i = m; i < n; i++) {
    const incoming = str[i];
    const outgoing = str[i - m];

    windowFreq[incoming] = (windowFreq[incoming] || 0) + 1;
    windowFreq[outgoing]--;
    if (windowFreq[outgoing] === 0) delete windowFreq[outgoing];

    const start = i - m + 1;
    const end = i;

    trace.push({
      type: 'slide',
      description: `Slide window to [${start}..${end}]: add '${incoming}', remove '${outgoing}'. Window: "${str.slice(start, end + 1)}".`,
      s: str,
      p: pat,
      window_start: start,
      window_end: end,
      incoming_char: incoming,
      outgoing_char: outgoing,
      window_freq: { ...windowFreq },
    });

    if (freqEqual(patFreq, windowFreq)) {
      results.push(start);
      trace.push({
        type: 'anagram_found',
        description: `Anagram found at index ${start}: "${str.slice(start, end + 1)}".`,
        s: str,
        p: pat,
        window_start: start,
        window_end: end,
        anagram_start: start,
      });
    }
  }

  trace.push({
    type: 'result',
    description: results.length > 0
      ? `Found ${results.length} anagram(s) of "${pat}" at index${results.length > 1 ? 'es' : ''}: ${results.join(', ')}.`
      : `No anagrams of "${pat}" found in "${str}".`,
    s: str,
    p: pat,
    anagram_indices: results,
  });

  return trace;
}

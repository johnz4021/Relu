// Minimum Window Substring (LC76) — variable-size sliding window with
// need/have counts over the required characters of t.
//
// Renderer: string. Step types map via mapStringStep (no algo-gated cases
// needed beyond the result branch):
//   init          → set_string (generic init branch, field `s`)
//   expand_window → set_window + set_char_state(new_index) + char_freq panel
//   shrink_window → set_window + set_char_state(removed_index) + char_freq panel
//   new_best      → set_window(active) + window_state panel
//                   (non-algo-gated case: { window_start, window_end,
//                    best_window, have, need })
//   result        → set_window(found) over the best window + window_state panel
//
// The char_freq panel shows "window-count / required-count" per required char,
// so need vs have is readable at every expand/shrink step.

export const DEFAULT_MIN_WINDOW_SUBSTRING_INPUT = { s: 'ADOBECODEBANC', t: 'ABC' };

export function minWindowSubstring(input) {
  const trace = [];
  const MAX_LEN = 20;
  const rawS = input.s || '';
  const t = input.t || '';

  if (!rawS || !t) {
    trace.push({ type: 'error', description: 'Both s and t are required.' });
    return trace;
  }

  const s = rawS.length > MAX_LEN ? rawS.slice(0, MAX_LEN) : rawS;

  const need = {};
  for (const ch of t) need[ch] = (need[ch] || 0) + 1;
  const needCount = Object.keys(need).length;
  const windowCounts = {};
  let have = 0;

  // char_freq panel view: window-count / required-count for each char of t.
  const freqView = () => {
    const view = {};
    for (const ch of Object.keys(need)) view[ch] = `${windowCounts[ch] || 0}/${need[ch]}`;
    return view;
  };

  trace.push({
    type: 'init',
    pseudocode_line: 0,
    description: `Find the smallest window of "${s}" containing all chars of "${t}". need = {${Object.entries(need).map(([k, v]) => `${k}:${v}`).join(', ')}}, have = 0.`,
    s, t,
    window_start: 0,
    window_end: -1,
  });

  let left = 0;
  let bestLen = Infinity;
  let bestStart = -1;

  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    const required = need[ch] !== undefined;
    if (required) {
      windowCounts[ch] = (windowCounts[ch] || 0) + 1;
      if (windowCounts[ch] === need[ch]) have++;
    }

    trace.push({
      type: 'expand_window',
      pseudocode_line: 1,
      description: required
        ? `Expand right: add '${ch}' at index ${right} — ${windowCounts[ch]}/${need[ch]} of the needed '${ch}'s. have = ${have}/${needCount}.`
        : `Expand right: add '${ch}' at index ${right} — not required by "${t}". have = ${have}/${needCount}.`,
      s,
      window_start: left,
      window_end: right,
      new_char: ch,
      new_index: right,
      char_freq: freqView(),
    });

    while (have === needCount) {
      const len = right - left + 1;
      if (len < bestLen) {
        bestLen = len;
        bestStart = left;
        trace.push({
          type: 'new_best',
          pseudocode_line: 3,
          description: `Window "${s.slice(left, right + 1)}" [${left}..${right}] covers all of "${t}" — new best (length ${len}).`,
          s,
          window_start: left,
          window_end: right,
          best_window: s.slice(left, right + 1),
          have: `${have}/${needCount}`,
          need: t,
        });
      }

      const lc = s[left];
      if (need[lc] !== undefined) {
        if (windowCounts[lc] === need[lc]) have--;
        windowCounts[lc]--;
      }
      trace.push({
        type: 'shrink_window',
        pseudocode_line: 4,
        description: `Window still valid — shrink left: drop '${lc}' at index ${left}. have = ${have}/${needCount}. Window: [${left + 1}..${right}].`,
        s,
        window_start: left + 1,
        window_end: right,
        removed_char: lc,
        removed_index: left,
        char_freq: freqView(),
      });
      left++;
    }
  }

  const found = bestStart >= 0;
  trace.push({
    type: 'result',
    pseudocode_line: 5,
    description: found
      ? `Minimum window substring: "${s.slice(bestStart, bestStart + bestLen)}" at indices [${bestStart}..${bestStart + bestLen - 1}] (length ${bestLen}).`
      : `No window of "${s}" contains all characters of "${t}".`,
    s,
    best_start: found ? bestStart : -1,
    best_end: found ? bestStart + bestLen - 1 : -1,
    output: found ? s.slice(bestStart, bestStart + bestLen) : '',
  });

  return trace;
}

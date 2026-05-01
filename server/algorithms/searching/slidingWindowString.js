export const DEFAULT_SLIDING_WINDOW_STRING_INPUT = { s: 'abcabcbb' };

export function slidingWindowString(s) {
  const trace = [];
  const MAX_LEN = 20;

  if (!s || s.length === 0) {
    trace.push({ type: 'error', description: 'Input string is empty.' });
    return trace;
  }

  const str = s.length > MAX_LEN ? s.slice(0, MAX_LEN) : s;
  const n = str.length;

  trace.push({
    type: 'init',
    description: `Find longest substring without repeating characters in "${str}". Using a variable-size sliding window with a character frequency map.`,
    s: str,
    window_start: 0,
    window_end: -1,
  });

  const charFreq = {};
  let left = 0;
  let longestLength = 0;
  let longestStart = 0;

  for (let right = 0; right < n; right++) {
    const ch = str[right];
    charFreq[ch] = (charFreq[ch] || 0) + 1;

    trace.push({
      type: 'expand_window',
      description: `Expand right: add '${ch}' at index ${right}. Freq['${ch}'] = ${charFreq[ch]}.`,
      s: str,
      window_start: left,
      window_end: right,
      new_char: ch,
      new_index: right,
      char_freq: { ...charFreq },
    });

    while (charFreq[ch] > 1) {
      const leftChar = str[left];
      charFreq[leftChar]--;
      if (charFreq[leftChar] === 0) delete charFreq[leftChar];

      trace.push({
        type: 'shrink_window',
        description: `Duplicate '${ch}' in window — shrink left: remove '${leftChar}' at index ${left}. Window: [${left + 1}..${right}].`,
        s: str,
        window_start: left + 1,
        window_end: right,
        removed_char: leftChar,
        removed_index: left,
        char_freq: { ...charFreq },
      });

      left++;
    }

    const currentLength = right - left + 1;
    if (currentLength > longestLength) {
      longestLength = currentLength;
      longestStart = left;

      trace.push({
        type: 'new_max',
        description: `New longest window: "${str.slice(left, right + 1)}" (length ${longestLength}) at [${left}..${right}].`,
        s: str,
        window_start: left,
        window_end: right,
        longest_length: longestLength,
        longest_start: left,
        longest_end: right,
        char_freq: { ...charFreq },
      });
    }
  }

  trace.push({
    type: 'result',
    description: `Longest substring without repeating characters: "${str.slice(longestStart, longestStart + longestLength)}" with length ${longestLength} at indices [${longestStart}..${longestStart + longestLength - 1}].`,
    s: str,
    longest_length: longestLength,
    longest_start: longestStart,
    longest_end: longestStart + longestLength - 1,
    char_freq: {},
  });

  return trace;
}

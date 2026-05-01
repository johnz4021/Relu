export const DEFAULT_EXPAND_PALINDROME_INPUT = { s: 'babad' };

const MAX_STEPS = 60;
const MAX_LEN = 15;

function expandAroundCenter(str, left, right, trace, stepCount) {
  while (left >= 0 && right < str.length && str[left] === str[right]) {
    if (stepCount.count >= MAX_STEPS) break;

    trace.push({
      type: 'expand',
      description: `Expand: str[${left}]='${str[left]}' = str[${right}]='${str[right]}'. Palindrome: "${str.slice(left, right + 1)}".`,
      s: str,
      expand_L: left,
      expand_R: right,
      current_palindrome: str.slice(left, right + 1),
    });
    stepCount.count++;

    left--;
    right++;
  }
  // Return last valid palindrome bounds
  return { start: left + 1, end: right - 1 };
}

export function expandPalindrome(s) {
  const trace = [];

  if (!s || s.length === 0) {
    trace.push({ type: 'error', description: 'Input string is empty.' });
    return trace;
  }

  const str = s.length > MAX_LEN ? s.slice(0, MAX_LEN) : s;
  const n = str.length;

  trace.push({
    type: 'init',
    description: `Find longest palindromic substring in "${str}" using center expansion. Try each character (and gap) as a center.`,
    s: str,
  });

  let bestStart = 0;
  let bestEnd = 0;
  let bestPalindrome = str[0];
  const stepCount = { count: 0 };
  let truncated = false;

  for (let i = 0; i < n; i++) {
    if (stepCount.count >= MAX_STEPS) {
      truncated = true;
      break;
    }

    // Odd-length centers
    trace.push({
      type: 'try_center',
      description: `Try center at index ${i} (odd-length expansion). Center char: '${str[i]}'.`,
      s: str,
      center: i,
      center_type: 'odd',
    });
    stepCount.count++;

    const odd = expandAroundCenter(str, i, i, trace, stepCount);

    if (odd.end - odd.start > bestEnd - bestStart) {
      bestStart = odd.start;
      bestEnd = odd.end;
      bestPalindrome = str.slice(bestStart, bestEnd + 1);

      trace.push({
        type: 'new_longest',
        description: `New longest palindrome: "${bestPalindrome}" at [${bestStart}..${bestEnd}] (length ${bestPalindrome.length}).`,
        s: str,
        best_start: bestStart,
        best_end: bestEnd,
        best_palindrome: bestPalindrome,
      });
      stepCount.count++;
    }

    if (stepCount.count >= MAX_STEPS) {
      truncated = true;
      break;
    }

    // Even-length centers (between i and i+1)
    if (i + 1 < n) {
      trace.push({
        type: 'try_center',
        description: `Try center between index ${i} and ${i + 1} (even-length expansion).`,
        s: str,
        center: i,
        center_type: 'even',
      });
      stepCount.count++;

      const even = expandAroundCenter(str, i, i + 1, trace, stepCount);

      if (even.start <= even.end && even.end - even.start > bestEnd - bestStart) {
        bestStart = even.start;
        bestEnd = even.end;
        bestPalindrome = str.slice(bestStart, bestEnd + 1);

        trace.push({
          type: 'new_longest',
          description: `New longest palindrome: "${bestPalindrome}" at [${bestStart}..${bestEnd}] (length ${bestPalindrome.length}).`,
          s: str,
          best_start: bestStart,
          best_end: bestEnd,
          best_palindrome: bestPalindrome,
        });
        stepCount.count++;
      }
    }
  }

  trace.push({
    type: 'result',
    description: `Longest palindromic substring: "${bestPalindrome}" at [${bestStart}..${bestEnd}] (length ${bestPalindrome.length}).${truncated ? ' (trace capped at 60 steps)' : ''}`,
    s: str,
    best_palindrome: bestPalindrome,
    best_start: bestStart,
    best_end: bestEnd,
    truncated: truncated || undefined,
  });

  return trace;
}

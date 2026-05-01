export const DEFAULT_VALID_PALINDROME_INPUT = { s: 'racecar' };

export function validPalindrome(s) {
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
    description: `Check if "${str}" is a palindrome. Place pointer L at index 0 and pointer R at index ${n - 1}. Compare characters moving inward.`,
    s: str,
    L: 0,
    R: n - 1,
  });

  let L = 0;
  let R = n - 1;

  while (L < R) {
    trace.push({
      type: 'compare',
      description: `Compare str[${L}]='${str[L]}' and str[${R}]='${str[R]}'.`,
      s: str,
      L,
      R,
    });

    if (str[L] !== str[R]) {
      trace.push({
        type: 'mismatch',
        description: `Mismatch! '${str[L]}' ≠ '${str[R]}' — not a palindrome.`,
        s: str,
        L,
        R,
        is_palindrome: false,
      });

      trace.push({
        type: 'result',
        description: `"${str}" is NOT a palindrome.`,
        s: str,
        is_palindrome: false,
      });
      return trace;
    }

    trace.push({
      type: 'match',
      description: `Match! '${str[L]}' = '${str[R]}'. Move L right and R left.`,
      s: str,
      L,
      R,
      next_L: L + 1,
      next_R: R - 1,
    });

    L++;
    R--;
  }

  trace.push({
    type: 'result',
    description: `"${str}" IS a palindrome — all character pairs matched.`,
    s: str,
    is_palindrome: true,
  });

  return trace;
}

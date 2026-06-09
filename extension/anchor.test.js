import { describe, it, expect } from 'vitest';

// anchor.js is a classic content script: it installs its API on globalThis.
// Importing it for side effects is the test-side contract (eng review D4).
await import('./anchor.js');
const { normalizeText, locateQuote, DESCRIPTION_SELECTORS } = globalThis.ReLUAnchor;

// NOTE ON FIXTURES: these synthetic cases pin the normalization/mapping logic.
// The REAL divergence risk is GraphQL htmlToText() vs the rendered DOM's text
// nodes — fixture pairs captured by the live spike (Alt+Shift+H on a problem
// page) get appended here as table rows once the spike runs (eng review D7/D9).

describe('normalizeText', () => {
  it('collapses whitespace runs and trims', () => {
    expect(normalizeText('  You are\n given \t an array  ')).toBe('You are given an array');
  });

  it('maps NBSP, smart quotes, and dash variants to canonical chars', () => {
    expect(normalizeText('nums is sorted')).toBe('nums is sorted');
    expect(normalizeText('“abc” and ‘d’')).toBe('"abc" and \'d\'');
    expect(normalizeText('10−4 – range — end')).toBe('10-4 - range - end');
  });

  it('handles non-strings and empties', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText('')).toBe('');
  });
});

describe('locateQuote', () => {
  // Segment shapes mirror real leetcode statement DOM: prose text nodes split
  // by inline <code>/<em>/<sup> elements.
  const SEGMENTS = [
    'You are given an integer array ',
    'nums',                                  // <code>
    ' sorted in ',
    'non-decreasing',                        // <em>
    ' order. Constraints: 1 <= nums.length <= 10',
    '4',                                     // <sup>
    '.',
  ];

  it('finds a quote inside a single segment', () => {
    const loc = locateQuote(SEGMENTS, 'integer array');
    expect(loc).toEqual({ start: { seg: 0, offset: 17 }, end: { seg: 0, offset: 30 }, exact: true });
  });

  it('finds a quote spanning multiple segments (code/em boundaries)', () => {
    const loc = locateQuote(SEGMENTS, 'array nums sorted in non-decreasing order.');
    expect(loc.start).toEqual({ seg: 0, offset: 25 });
    expect(loc.end).toEqual({ seg: 4, offset: 7 }); // ends after " order." in seg 4
    expect(loc.exact).toBe(true);
  });

  it('matches across whitespace divergence (quote has collapsed spaces, DOM has runs)', () => {
    const segs = ['You are  given\n an', ' integer   array.'];
    const loc = locateQuote(segs, 'You are given an integer array.');
    expect(loc.start).toEqual({ seg: 0, offset: 0 });
    expect(loc.end).toEqual({ seg: 1, offset: 17 });
  });

  it('matches sup-flattened text the way htmlToText flattens it', () => {
    // GraphQL text renders <sup>4</sup> as "104" — DOM segments split it.
    const loc = locateQuote(SEGMENTS, '1 <= nums.length <= 104.');
    expect(loc.start.seg).toBe(4);
    expect(loc.end).toEqual({ seg: 6, offset: 1 });
  });

  it('falls back to case-insensitive on exact-case miss, flags exact:false', () => {
    const loc = locateQuote(SEGMENTS, 'you are given an INTEGER array');
    expect(loc.exact).toBe(false);
    expect(loc.start).toEqual({ seg: 0, offset: 0 });
  });

  it('returns first occurrence when the quote is ambiguous', () => {
    const segs = ['return the index. return the index.'];
    const loc = locateQuote(segs, 'return the index.');
    expect(loc.start).toEqual({ seg: 0, offset: 0 });
  });

  it('misses cleanly: hallucinated quote, short quote, empty segments', () => {
    expect(locateQuote(SEGMENTS, 'this text is not in the problem')).toBeNull();
    expect(locateQuote(SEGMENTS, 'arr')).toBeNull(); // below minLength
    expect(locateQuote([], 'integer array')).toBeNull();
    expect(locateQuote(['', ''], 'integer array')).toBeNull();
  });

  it('NBSP and smart quotes on the DOM side still match a plain-ASCII quote', () => {
    const segs = ['Given a string ', 's', ', return “the longest palindrome”.'];
    const loc = locateQuote(segs, 'return "the longest palindrome".');
    expect(loc.start).toEqual({ seg: 2, offset: 2 });
    expect(loc.end).toEqual({ seg: 2, offset: segs[2].length }); // exclusive end lands after the final '.'
  });
});

describe('DESCRIPTION_SELECTORS', () => {
  it('keeps the known statement-container selectors in priority order', () => {
    expect(DESCRIPTION_SELECTORS[0]).toBe('[data-track-load="description_content"]');
    expect(DESCRIPTION_SELECTORS.length).toBeGreaterThanOrEqual(3);
  });
});

// ── REAL-PROBLEM FIXTURES (captured by the live spike, 2026-06-09) ─────────
// These pin the actual divergence surface: quotes from GraphQL htmlToText()
// matched against the rendered page's raw text-node segments (code/sup/em
// splits, double-space artifacts, sup-flattened exponents). Spike run: 9
// problems, ~54/54 quotes anchored. Two representative fixtures pinned here.

describe('locateQuote — real leetcode fixtures', () => {
  // search-in-rotated-sorted-array: prose split by <code>/<em>, constraints with
  // <sup>-split exponents ("-10","4" renders what GraphQL flattens to "-104").
  const ROTATED = ["There is an integer array ","nums"," sorted in ascending order (with ","distinct"," values).","\n\n","Prior to being passed to your function, ","nums"," is ","possibly left rotated"," at an unknown index ","k"," (","1 <= k < nums.length",") such that the resulting array is ","[nums[k], nums[k+1], ..., nums[n-1], nums[0], nums[1], ..., nums[k-1]]"," (","0-indexed","). For example, ","[0,1,2,4,5,6,7]"," might be left rotated by ","3"," indices and become ","[4,5,6,7,0,1,2]",".","\n\n","Given the array ","nums"," ","after"," the possible rotation and an integer ","target",", return ","the index of ","target"," if it is in ","nums",", or ","-1"," if it is not in ","nums",".","\n\n","You must write an algorithm with ","O(log n)"," runtime complexity.","\n\n"," ","\n","Example 1:","\n","Input:"," nums = [4,5,6,7,0,1,2], target = 0\n","Output:"," 4\n","Example 2:","\n","Input:"," nums = [4,5,6,7,0,1,2], target = 3\n","Output:"," -1\n","Example 3:","\n","Input:"," nums = [1], target = 0\n","Output:"," -1\n","\n"," ","\n","Constraints:","\n\n","\n\t","1 <= nums.length <= 5000","\n\t","-10","4"," <= nums[i] <= 10","4","\n\t","All values of ","nums"," are ","unique",".","\n\t","nums"," is an ascending array that is possibly rotated.","\n\t","-10","4"," <= target <= 10","4","\n","\n"];

  it('anchors a prose quote across code/em segment splits (rotated array)', () => {
    const loc = locateQuote(ROTATED, 'Given the array nums after the possible rotation and an integer target');
    expect(loc).not.toBeNull();
    expect(loc.exact).toBe(true);
  });

  it('anchors a sup-flattened constraint exactly as GraphQL renders it', () => {
    const loc = locateQuote(ROTATED, '-104 <= nums[i] <= 104');
    expect(loc).not.toBeNull();
    expect(loc.exact).toBe(true);
  });

  it('anchors the runtime-complexity sentence (code-split O(log n))', () => {
    const loc = locateQuote(ROTATED, 'You must write an algorithm with O(log n) runtime complexity.');
    expect(loc).not.toBeNull();
  });

  // unique-binary-search-trees-ii: apostrophe split ("BST'","s") and the
  // double-space artifacts ("from"," ","1"," ","to"," ","n") that whitespace
  // collapsing must absorb.
  const UNIQUE_BST = ["Given an integer ","n",", return ","all the structurally unique ","BST'","s (binary search trees), which has exactly ","n"," nodes of unique values from"," ","1"," ","to"," ","n",". Return the answer in ","any order",".","\n\n"," ","\n","Example 1:","\n","\n","Input:"," n = 3\n","Output:"," [[1,null,2,null,3],[1,null,3,2],[2,1,3],[3,1,null,null,2],[3,2,null,1]]\n","\n\n","Example 2:","\n\n","Input:"," n = 1\n","Output:"," [[1]]\n","\n\n"," ","\n","Constraints:","\n\n","\n\t","1 <= n <= 8","\n","\n"];

  it('anchors across an apostrophe-split segment and spaced-out single-char segments', () => {
    const loc = locateQuote(UNIQUE_BST, "unique BST's (binary search trees), which has exactly n nodes of unique values from 1 to n.");
    expect(loc).not.toBeNull();
    expect(loc.exact).toBe(true);
  });

  it('anchors a short closing sentence (unique BST)', () => {
    const loc = locateQuote(UNIQUE_BST, 'Return the answer in any order.');
    expect(loc).not.toBeNull();
  });
});

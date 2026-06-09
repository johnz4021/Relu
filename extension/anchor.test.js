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

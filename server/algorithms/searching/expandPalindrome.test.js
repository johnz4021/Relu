import { describe, it, expect } from 'vitest';
import { expandPalindrome, DEFAULT_EXPAND_PALINDROME_INPUT } from './expandPalindrome.js';

describe('expandPalindrome', () => {
  it('returns init as first step and result as last step', () => {
    const trace = expandPalindrome(DEFAULT_EXPAND_PALINDROME_INPUT.s);
    expect(trace[0].type).toBe('init');
    expect(trace[trace.length - 1].type).toBe('result');
  });

  it('babad → result palindrome length >= 3', () => {
    const trace = expandPalindrome('babad');
    const result = trace[trace.length - 1];
    expect(result.best_palindrome.length).toBeGreaterThanOrEqual(3);
  });

  it('cbbd → result palindrome is "bb" (even-length palindrome)', () => {
    const trace = expandPalindrome('cbbd');
    const result = trace[trace.length - 1];
    expect(result.best_palindrome).toBe('bb');
  });

  it('single char → result palindrome length === 1', () => {
    const trace = expandPalindrome('a');
    const result = trace[trace.length - 1];
    expect(result.best_palindrome.length).toBe(1);
  });

  it('string of length > 15 → trace.length <= 60 (cap guard)', () => {
    const trace = expandPalindrome('aaaaaaaaaaaaaaaaaaaaa'); // 21 chars > MAX_LEN=15; sliced to 15
    expect(trace.length).toBeLessThanOrEqual(62); // 60 + init + result
    expect(trace[trace.length - 1].type).toBe('result');
  });

  it('trace contains try_center step types', () => {
    const trace = expandPalindrome('babad');
    expect(trace.some(s => s.type === 'try_center')).toBe(true);
  });

  it('trace contains expand step types', () => {
    const trace = expandPalindrome('babad');
    expect(trace.some(s => s.type === 'expand')).toBe(true);
  });

  it('result step has best_palindrome, best_start, best_end fields', () => {
    const trace = expandPalindrome('babad');
    const result = trace[trace.length - 1];
    expect(typeof result.best_palindrome).toBe('string');
    expect(typeof result.best_start).toBe('number');
    expect(typeof result.best_end).toBe('number');
  });
});

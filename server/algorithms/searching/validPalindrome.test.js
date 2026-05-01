import { describe, it, expect } from 'vitest';
import { validPalindrome, DEFAULT_VALID_PALINDROME_INPUT } from './validPalindrome.js';

describe('validPalindrome', () => {
  it('returns init as first step and result as last step', () => {
    const trace = validPalindrome(DEFAULT_VALID_PALINDROME_INPUT.s);
    expect(trace[0].type).toBe('init');
    expect(trace[trace.length - 1].type).toBe('result');
  });

  it('racecar → is_palindrome === true', () => {
    const trace = validPalindrome('racecar');
    const result = trace[trace.length - 1];
    expect(result.is_palindrome).toBe(true);
  });

  it('abcde → is_palindrome === false', () => {
    const trace = validPalindrome('abcde');
    const result = trace[trace.length - 1];
    expect(result.is_palindrome).toBe(false);
  });

  it('single char → is_palindrome === true', () => {
    const trace = validPalindrome('a');
    const result = trace[trace.length - 1];
    expect(result.is_palindrome).toBe(true);
  });

  it('two same chars → is_palindrome === true', () => {
    const trace = validPalindrome('aa');
    const result = trace[trace.length - 1];
    expect(result.is_palindrome).toBe(true);
  });

  it('two different chars → is_palindrome === false', () => {
    const trace = validPalindrome('ab');
    const result = trace[trace.length - 1];
    expect(result.is_palindrome).toBe(false);
  });

  it('trace contains compare steps with L and R pointer fields', () => {
    const trace = validPalindrome('racecar');
    const compareSteps = trace.filter(s => s.type === 'compare');
    expect(compareSteps.length).toBeGreaterThan(0);
    for (const step of compareSteps) {
      expect(typeof step.L).toBe('number');
      expect(typeof step.R).toBe('number');
    }
  });
});

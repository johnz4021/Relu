import { describe, it, expect } from 'vitest';
import { findAnagrams, DEFAULT_FIND_ANAGRAMS_INPUT } from './findAnagrams.js';

describe('findAnagrams', () => {
  it('returns init as first step and result as last step', () => {
    const trace = findAnagrams(DEFAULT_FIND_ANAGRAMS_INPUT.s, DEFAULT_FIND_ANAGRAMS_INPUT.p);
    expect(trace[0].type).toBe('init');
    expect(trace[trace.length - 1].type).toBe('result');
  });

  it('cbaebabacd / abc → anagram_found steps at indices 0 and 6', () => {
    const trace = findAnagrams('cbaebabacd', 'abc');
    const foundSteps = trace.filter(s => s.type === 'anagram_found');
    const foundIndices = foundSteps.map(s => s.anagram_start);
    expect(foundIndices).toContain(0);
    expect(foundIndices).toContain(6);
  });

  it('p.length > s.length → no anagram_found steps', () => {
    const trace = findAnagrams('ab', 'abcd');
    expect(trace.some(s => s.type === 'anagram_found')).toBe(false);
  });

  it('s === p exactly → single anagram at index 0', () => {
    const trace = findAnagrams('abc', 'abc');
    const foundSteps = trace.filter(s => s.type === 'anagram_found');
    expect(foundSteps.length).toBe(1);
    expect(foundSteps[0].anagram_start).toBe(0);
  });

  it('p not in s at all → no anagram_found steps', () => {
    const trace = findAnagrams('aabbcc', 'xyz');
    expect(trace.some(s => s.type === 'anagram_found')).toBe(false);
    expect(trace[trace.length - 1].anagram_indices).toHaveLength(0);
  });

  it('trace contains slide steps', () => {
    const trace = findAnagrams('cbaebabacd', 'abc');
    expect(trace.some(s => s.type === 'slide')).toBe(true);
  });
});

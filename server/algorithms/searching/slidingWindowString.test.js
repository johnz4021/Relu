import { describe, it, expect } from 'vitest';
import { slidingWindowString, DEFAULT_SLIDING_WINDOW_STRING_INPUT } from './slidingWindowString.js';

describe('slidingWindowString', () => {
  it('returns init as first step and result as last step', () => {
    const trace = slidingWindowString(DEFAULT_SLIDING_WINDOW_STRING_INPUT.s);
    expect(trace[0].type).toBe('init');
    expect(trace[trace.length - 1].type).toBe('result');
  });

  it('abcabcbb → longest_length === 3', () => {
    const trace = slidingWindowString('abcabcbb');
    const result = trace[trace.length - 1];
    expect(result.longest_length).toBe(3);
  });

  it('all unique chars → window covers entire string', () => {
    const trace = slidingWindowString('abcde');
    const result = trace[trace.length - 1];
    expect(result.longest_length).toBe(5);
    expect(result.longest_start).toBe(0);
    expect(result.longest_end).toBe(4);
  });

  it('all same chars → result window size 1', () => {
    const trace = slidingWindowString('aaaa');
    const result = trace[trace.length - 1];
    expect(result.longest_length).toBe(1);
  });

  it('empty string → error step', () => {
    const trace = slidingWindowString('');
    expect(trace.length).toBe(1);
    expect(trace[0].type).toBe('error');
  });

  it('trace contains expand_window and shrink_window step types', () => {
    const trace = slidingWindowString('abcabcbb');
    expect(trace.some(s => s.type === 'expand_window')).toBe(true);
    expect(trace.some(s => s.type === 'shrink_window')).toBe(true);
  });

  it('result step has correct longest_start and longest_end fields', () => {
    const trace = slidingWindowString('abcabcbb');
    const result = trace[trace.length - 1];
    expect(typeof result.longest_start).toBe('number');
    expect(typeof result.longest_end).toBe('number');
    expect(result.longest_end - result.longest_start + 1).toBe(result.longest_length);
  });
});

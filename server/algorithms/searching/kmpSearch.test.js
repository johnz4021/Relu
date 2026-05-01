import { describe, it, expect } from 'vitest';
import { kmpSearch, DEFAULT_KMP_SEARCH_INPUT } from './kmpSearch.js';

describe('kmpSearch', () => {
  it('returns init as first step and result as last step', () => {
    const trace = kmpSearch(DEFAULT_KMP_SEARCH_INPUT.text, DEFAULT_KMP_SEARCH_INPUT.pattern);
    expect(trace[0].type).toBe('init');
    expect(trace[trace.length - 1].type).toBe('result');
  });

  it('hello / ll → found step with match_index === 2', () => {
    const trace = kmpSearch('hello', 'll');
    const foundStep = trace.find(s => s.type === 'found');
    expect(foundStep).toBeDefined();
    expect(foundStep.match_index).toBe(2);
  });

  it('aaaaaa / b → no found step in trace', () => {
    const trace = kmpSearch('aaaaaa', 'b');
    expect(trace.some(s => s.type === 'found')).toBe(false);
    expect(trace[trace.length - 1].found).toBe(false);
  });

  it('pattern longer than text → single result step (no match)', () => {
    const trace = kmpSearch('hi', 'hello');
    expect(trace.length).toBe(1);
    expect(trace[0].type).toBe('result');
    expect(trace[0].found).toBe(false);
  });

  it('empty pattern → error step', () => {
    const trace = kmpSearch('hello', '');
    expect(trace.length).toBe(1);
    expect(trace[0].type).toBe('error');
  });

  it('ababab / ab → 3 found steps', () => {
    const trace = kmpSearch('ababab', 'ab');
    const foundSteps = trace.filter(s => s.type === 'found');
    expect(foundSteps.length).toBe(3);
  });

  it('trace contains build_failure steps when pattern.length > 1', () => {
    const trace = kmpSearch('hello', 'll');
    expect(trace.some(s => s.type === 'build_failure')).toBe(true);
  });

  it('failure function for "aab" is [0, 1, 0]', () => {
    const trace = kmpSearch('aabaabaab', 'aab');
    const failureSteps = trace.filter(s => s.type === 'build_failure');
    expect(failureSteps.length).toBe(3);
    expect(failureSteps[0].failure_value).toBe(0);
    expect(failureSteps[1].failure_value).toBe(1);
    expect(failureSteps[2].failure_value).toBe(0);
  });

  it('failure function for "aaaa" is [0, 1, 2, 3]', () => {
    const trace = kmpSearch('aaaaaaa', 'aaaa');
    const failureSteps = trace.filter(s => s.type === 'build_failure');
    expect(failureSteps.length).toBe(4);
    expect(failureSteps[0].failure_value).toBe(0);
    expect(failureSteps[1].failure_value).toBe(1);
    expect(failureSteps[2].failure_value).toBe(2);
    expect(failureSteps[3].failure_value).toBe(3);
  });
});

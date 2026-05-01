import { describe, it, expect } from 'vitest';
import { slidingWindow, DEFAULT_SLIDING_WINDOW_INPUT } from './slidingWindow.js';

describe('slidingWindow', () => {
  it('returns a trace with init and result steps', () => {
    const trace = slidingWindow(DEFAULT_SLIDING_WINDOW_INPUT.array, DEFAULT_SLIDING_WINDOW_INPUT.window_size);
    expect(trace[0].type).toBe('init');
    expect(trace[trace.length - 1].type).toBe('result');
  });

  it('finds the correct max sum for default input', () => {
    const { array, window_size } = DEFAULT_SLIDING_WINDOW_INPUT;
    const trace = slidingWindow(array, window_size);
    const result = trace[trace.length - 1];
    // [2,1,5,1,3,2] window=3: max is [5,1,3]=9
    expect(result.max_sum).toBe(9);
  });

  it('produces slide steps equal to n - k', () => {
    const array = [1, 2, 3, 4, 5];
    const k = 2;
    const trace = slidingWindow(array, k);
    const slideSteps = trace.filter(s => s.type === 'slide');
    expect(slideSteps.length).toBe(array.length - k);
  });

  it('returns error step for window larger than array', () => {
    const trace = slidingWindow([1, 2], 5);
    expect(trace[0].type).toBe('error');
    expect(trace.length).toBe(1);
  });

  it('returns error step for zero window size', () => {
    const trace = slidingWindow([1, 2, 3], 0);
    expect(trace[0].type).toBe('error');
  });

  it('each slide step has window_start, window_end, window_sum', () => {
    const trace = slidingWindow([1, 2, 3, 4], 2);
    for (const step of trace.filter(s => s.type === 'slide')) {
      expect(typeof step.window_start).toBe('number');
      expect(typeof step.window_end).toBe('number');
      expect(typeof step.window_sum).toBe('number');
    }
  });

  it('highlighted array length matches input array length', () => {
    const array = [2, 1, 5, 1, 3, 2];
    const trace = slidingWindow(array, 3);
    for (const step of trace) {
      if (step.highlighted) {
        expect(step.highlighted.length).toBe(array.length);
      }
    }
  });
});

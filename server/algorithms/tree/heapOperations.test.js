import { describe, it, expect } from 'vitest';
import { heapOperations } from './heapOperations.js';

describe('heapOperations', () => {
  it('returns a trace with init and result steps', () => {
    const ops = [{ type: 'insert', value: 5 }];
    const trace = heapOperations(ops);
    expect(trace[0].type).toBe('init');
    expect(trace[trace.length - 1].type).toBe('result');
  });

  it('maintains min-heap property after multiple inserts', () => {
    const ops = [
      { type: 'insert', value: 10 },
      { type: 'insert', value: 3 },
      { type: 'insert', value: 7 },
      { type: 'insert', value: 1 },
    ];
    const trace = heapOperations(ops);
    const result = trace[trace.length - 1];
    // Root must be the minimum
    expect(result.heap[0]).toBe(1);
  });

  it('extract_min removes the smallest element', () => {
    const ops = [
      { type: 'insert', value: 5 },
      { type: 'insert', value: 2 },
      { type: 'insert', value: 8 },
      { type: 'extract_min' },
    ];
    const trace = heapOperations(ops);
    const result = trace[trace.length - 1];
    // After extracting 2, heap should not contain 2
    expect(result.heap).not.toContain(2);
    // Root should still be the new minimum
    expect(result.heap[0]).toBe(5);
  });

  it('handles extract_min on empty heap gracefully', () => {
    const ops = [{ type: 'extract_min' }];
    const trace = heapOperations(ops);
    expect(trace.some(s => s.type === 'extract_start')).toBe(true);
    // Should not throw — check result step exists
    expect(trace[trace.length - 1].type).toBe('result');
  });

  it('sift_up produces swaps when a small value is inserted at the end', () => {
    const ops = [
      { type: 'insert', value: 10 },
      { type: 'insert', value: 8 },
      { type: 'insert', value: 1 },
    ];
    const trace = heapOperations(ops);
    const swaps = trace.filter(s => s.type === 'sift_swap');
    expect(swaps.length).toBeGreaterThan(0);
  });

  it('each trace step has a description', () => {
    const ops = [{ type: 'insert', value: 3 }, { type: 'extract_min' }];
    const trace = heapOperations(ops);
    for (const step of trace) {
      expect(typeof step.description).toBe('string');
    }
  });
});

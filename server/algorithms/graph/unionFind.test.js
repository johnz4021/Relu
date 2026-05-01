import { describe, it, expect } from 'vitest';
import { unionFind, DEFAULT_UNION_FIND_GRAPH } from './unionFind.js';

describe('unionFind', () => {
  it('returns a trace with init and result steps', () => {
    const trace = unionFind(DEFAULT_UNION_FIND_GRAPH);
    expect(trace[0].type).toBe('init');
    expect(trace[trace.length - 1].type).toBe('result');
  });

  it('correctly identifies 3 components for default graph', () => {
    const trace = unionFind(DEFAULT_UNION_FIND_GRAPH);
    const result = trace[trace.length - 1];
    expect(result.components).toBe(3);
  });

  it('merges all nodes into 1 component when fully connected', () => {
    const graph = {
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      edges: [{ source: 'A', target: 'B' }, { source: 'B', target: 'C' }],
      directed: false,
    };
    const trace = unionFind(graph);
    const result = trace[trace.length - 1];
    expect(result.components).toBe(1);
  });

  it('produces find steps for each union operation', () => {
    const trace = unionFind(DEFAULT_UNION_FIND_GRAPH);
    const findSteps = trace.filter(s => s.type === 'find');
    expect(findSteps.length).toBeGreaterThan(0);
  });

  it('detects already-connected nodes without double-merging', () => {
    const graph = {
      nodes: [{ id: '0' }, { id: '1' }],
      edges: [{ source: '0', target: '1' }, { source: '0', target: '1' }],
      directed: false,
    };
    const trace = unionFind(graph);
    const result = trace[trace.length - 1];
    expect(result.components).toBe(1);
    const alreadyConnected = trace.filter(s => s.type === 'already_connected');
    expect(alreadyConnected.length).toBe(1);
  });

  it('each trace step includes a description string', () => {
    const trace = unionFind(DEFAULT_UNION_FIND_GRAPH);
    for (const step of trace) {
      expect(typeof step.description).toBe('string');
      expect(step.description.length).toBeGreaterThan(0);
    }
  });
});

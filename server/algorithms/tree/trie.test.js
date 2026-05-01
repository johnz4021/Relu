import { describe, it, expect } from 'vitest';
import { trie, DEFAULT_TRIE_INPUT } from './trie.js';

describe('trie', () => {
  it('returns a trace with init and result steps', () => {
    const trace = trie(DEFAULT_TRIE_INPUT.operations);
    expect(trace[0].type).toBe('init');
    expect(trace[trace.length - 1].type).toBe('result');
  });

  it('emits insert_done for each insert operation', () => {
    const ops = [
      { type: 'insert', word: 'cat' },
      { type: 'insert', word: 'car' },
    ];
    const trace = trie(ops);
    const doneDone = trace.filter(s => s.type === 'insert_done');
    expect(doneDone.length).toBe(2);
  });

  it('search returns found for an inserted word', () => {
    const ops = [
      { type: 'insert', word: 'hello' },
      { type: 'search', word: 'hello' },
    ];
    const trace = trie(ops);
    const searchResult = trace.filter(s => s.type === 'search_done');
    expect(searchResult.length).toBe(1);
    expect(searchResult[0].result).toBe('found');
  });

  it('search returns prefix_only for a prefix that is not a word', () => {
    const ops = [
      { type: 'insert', word: 'hello' },
      { type: 'search', word: 'hell' },
    ];
    const trace = trie(ops);
    const searchResult = trace.filter(s => s.type === 'search_done');
    expect(searchResult[0].result).toBe('prefix_only');
  });

  it('search returns not_found for absent prefix', () => {
    const ops = [
      { type: 'insert', word: 'hello' },
      { type: 'search', word: 'world' },
    ];
    const trace = trie(ops);
    const searchResult = trace.filter(s => s.type === 'search_done');
    expect(searchResult[0].result).toBe('not_found');
  });

  it('each trace step includes a graph snapshot', () => {
    const trace = trie(DEFAULT_TRIE_INPUT.operations);
    for (const step of trace) {
      expect(step.graph).toBeDefined();
      expect(Array.isArray(step.graph.nodes)).toBe(true);
      expect(Array.isArray(step.graph.edges)).toBe(true);
    }
  });

  it('graph grows as words are inserted', () => {
    const ops = [
      { type: 'insert', word: 'ab' },
      { type: 'insert', word: 'abc' },
    ];
    const trace = trie(ops);
    const initNodes = trace[0].graph.nodes.length;
    const finalNodes = trace[trace.length - 1].graph.nodes.length;
    expect(finalNodes).toBeGreaterThan(initNodes);
  });
});

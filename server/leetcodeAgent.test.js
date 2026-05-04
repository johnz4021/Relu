import { describe, it, expect } from 'vitest';
import { generateInputFormats } from './leetcodeAgent.js';
import { ALGORITHMS } from './algorithms/registry.js';

// Mirror the LC classifier filter: exclude poly_reduction (CS theory, not on LC)
// and `broken: true` algos (renderer mounts but never paints — kept out of
// classification so users don't land on a silently-empty viz).
const VALID_ALGORITHM_KEYS = Object.keys(ALGORITHMS).filter(
  k => k !== 'poly_reduction' && !ALGORITHMS[k].broken
);

describe('generateInputFormats', () => {
  it('produces format block from registry defaultInput', () => {
    const mock = {
      dijkstra: { defaultInput: { graph: { nodes: [], edges: [] }, source: 'A' } },
      prefix_sum: { defaultInput: { nums: [1, 2, 3], target: 5 } },
    };
    const result = generateInputFormats(mock);
    expect(result).toContain('dijkstra:');
    expect(result).toContain('prefix_sum:');
    expect(result).toContain('"source": "A"');
  });

  it('handles null defaultInput gracefully', () => {
    const mock = {
      some_algo: { defaultInput: null },
      other_algo: { defaultInput: { n: 5 } },
    };
    expect(() => generateInputFormats(mock)).not.toThrow();
    const result = generateInputFormats(mock);
    expect(result).not.toContain('some_algo:');
    expect(result).toContain('other_algo:');
  });

  it('covers all VALID_ALGORITHM_KEYS', () => {
    const result = generateInputFormats(ALGORITHMS);
    for (const key of VALID_ALGORITHM_KEYS) {
      expect(result).toContain(`${key}:`);
    }
  });
});

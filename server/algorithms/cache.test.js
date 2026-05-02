import { describe, it, expect } from 'vitest';
import { buildCacheKey, outputMatchesExpected } from './cache.js';

describe('buildCacheKey', () => {
  it('returns plain algorithmId when no description', () => {
    expect(buildCacheKey('math_simulation')).toBe('math_simulation');
  });

  it('returns plain algorithmId for undefined description', () => {
    expect(buildCacheKey('math_simulation', undefined)).toBe('math_simulation');
  });

  it('returns plain algorithmId for null description', () => {
    expect(buildCacheKey('math_simulation', null)).toBe('math_simulation');
  });

  it('returns plain algorithmId for empty string description', () => {
    expect(buildCacheKey('math_simulation', '')).toBe('math_simulation');
  });

  it('forms compound key with lowercased title', () => {
    expect(buildCacheKey('math_simulation', 'Integer to Roman')).toBe('math_simulation:integer_to_roman');
  });

  it('normalizes special characters in title', () => {
    expect(buildCacheKey('math_simulation', 'Two Sum (Easy)')).toBe('math_simulation:two_sum_easy');
  });

  it('collapses multiple separators', () => {
    expect(buildCacheKey('bfs', 'Number  of   Islands')).toBe('bfs:number_of_islands');
  });

  it('strips leading/trailing underscores from normalized title', () => {
    expect(buildCacheKey('dp', '(Jump Game)')).toBe('dp:jump_game');
  });

  it('different algorithms with same title produce different keys', () => {
    const k1 = buildCacheKey('math_simulation', 'Count Primes');
    const k2 = buildCacheKey('greedy_choice', 'Count Primes');
    expect(k1).not.toBe(k2);
    expect(k1).toBe('math_simulation:count_primes');
    expect(k2).toBe('greedy_choice:count_primes');
  });

  it('same algorithm with different titles produce different keys', () => {
    const k1 = buildCacheKey('math_simulation', 'Integer to Roman');
    const k2 = buildCacheKey('math_simulation', 'Happy Number');
    expect(k1).toBe('math_simulation:integer_to_roman');
    expect(k2).toBe('math_simulation:happy_number');
    expect(k1).not.toBe(k2);
  });
});

describe('outputMatchesExpected', () => {
  it('returns true when expectedOutput is null', () => {
    expect(outputMatchesExpected([{ type: 'result', output: '42' }], null)).toBe(true);
  });

  it('returns true when expectedOutput is undefined', () => {
    expect(outputMatchesExpected([{ type: 'result', output: '42' }], undefined)).toBe(true);
  });

  it('returns true when trace has no result step', () => {
    expect(outputMatchesExpected([{ type: 'init' }, { type: 'compare' }], '42')).toBe(true);
  });

  it('returns true when result step has no output field', () => {
    expect(outputMatchesExpected([{ type: 'result' }], '42')).toBe(true);
  });

  it('returns true when output matches expected', () => {
    expect(outputMatchesExpected([{ type: 'result', output: 'MMMDCCXLIX' }], 'MMMDCCXLIX')).toBe(true);
  });

  it('returns false when output does not match expected', () => {
    expect(outputMatchesExpected([{ type: 'result', output: 'IV' }], 'MMMDCCXLIX')).toBe(false);
  });

  it('uses the last result step when multiple exist', () => {
    const trace = [
      { type: 'result', output: 'wrong' },
      { type: 'result', output: 'MMMDCCXLIX' },
    ];
    expect(outputMatchesExpected(trace, 'MMMDCCXLIX')).toBe(true);
  });

  it('trims whitespace before comparing', () => {
    expect(outputMatchesExpected([{ type: 'result', output: ' 42 ' }], '42')).toBe(true);
  });

  it('returns false for mismatched numeric output', () => {
    expect(outputMatchesExpected([{ type: 'result', output: '13' }], '14')).toBe(false);
  });
});

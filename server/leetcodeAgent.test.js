import { describe, it, expect } from 'vitest';
import { generateInputFormats, EXTRACTION_TOOL } from './leetcodeAgent.js';
import { ALGORITHMS } from './algorithms/registry.js';
import { RENDERER_MANIFEST } from './rendererManifest.js';

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

// Tier 2 entry contract (always-viz ladder): the extraction schema must carry the
// free-form pattern_key + pattern_renderer alongside the registry-constrained
// algorithm_key, or off-registry problems can never reach trace generation.
describe('EXTRACTION_TOOL schema — pattern key (Tier 2 gate)', () => {
  const props = EXTRACTION_TOOL.input_schema.properties;

  it('algorithm_key stays enum-constrained to registry keys + null', () => {
    expect(props.algorithm_key.enum).toEqual([...VALID_ALGORITHM_KEYS, null]);
  });

  it('pattern_key is free-form (no enum) and documented as required when off-registry', () => {
    expect(props.pattern_key).toBeDefined();
    expect(props.pattern_key.enum).toBeUndefined();
    expect(props.pattern_key.description).toContain('algorithm_key is null');
  });

  it('pattern_renderer enum = manifest renderers + context (context panels live outside the manifest)', () => {
    expect([...props.pattern_renderer.enum].sort()).toEqual(
      [...Object.keys(RENDERER_MANIFEST), 'context'].sort()
    );
  });

  it('pattern fields are not in required[] — confident Tier 1 extractions omit them', () => {
    expect(EXTRACTION_TOOL.input_schema.required).not.toContain('pattern_key');
    expect(EXTRACTION_TOOL.input_schema.required).not.toContain('pattern_renderer');
  });
});

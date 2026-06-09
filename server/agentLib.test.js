import { describe, it, expect } from 'vitest';
import { validatePanelIds, companionSelfReport } from './agentLib.js';

// Registry shape mirrors registerPanels(): keyed by panel id, value {renderer, type}.
const arrayRegistry = { array_main: { renderer: 'array', type: 'renderer' } };

describe('validatePanelIds — renderer-type alias (blank-viz regression)', () => {
  // THE BUG: build_example_graph registers panel id "array_main"; the model (per the
  // emit_segment tool description) emits improvised viz_actions targeting bare "array".
  // Before the fix these were stripped ("renderer 'array' not declared") → blank panel.
  it('aliases a bare renderer type to its sole registered panel id', () => {
    const { valid, warnings } = validatePanelIds(
      [{ renderer: 'array', action: 'set_data', params: { values: [1, 1, 0, 1] } }],
      arrayRegistry,
    );
    expect(warnings).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0].renderer).toBe('array_main'); // rewritten, not dropped
    expect(valid[0].params).toEqual({ values: [1, 1, 0, 1] }); // payload untouched
  });

  it('leaves an exact panel-id target unchanged', () => {
    const { valid, warnings } = validatePanelIds(
      [{ renderer: 'array_main', action: 'highlight', params: { indices: [2] } }],
      arrayRegistry,
    );
    expect(warnings).toEqual([]);
    expect(valid[0].renderer).toBe('array_main');
  });

  it('still strips an unknown renderer type (no panel of that type)', () => {
    const { valid, warnings } = validatePanelIds(
      [{ renderer: 'tree', action: 'set_data' }],
      arrayRegistry,
    );
    expect(valid).toHaveLength(0);
    expect(warnings[0]).toContain("renderer 'tree' not declared");
  });

  it('does NOT guess when a renderer type is ambiguous (>1 panel of that type)', () => {
    const twoArrays = {
      array_left: { renderer: 'array', type: 'renderer' },
      array_right: { renderer: 'array', type: 'renderer' },
    };
    const { valid, warnings } = validatePanelIds([{ renderer: 'array', action: 'set_data' }], twoArrays);
    expect(valid).toHaveLength(0);
    expect(warnings[0]).toContain('ambiguous');
    expect(warnings[0]).toContain('array_left');
  });

  it('validates context updates by panel_id (unchanged behavior)', () => {
    const reg = { log: { renderer: 'context', type: 'context' } };
    const ok = validatePanelIds([{ renderer: 'context', action: 'update', params: { panel_id: 'log', entries: [] } }], reg);
    expect(ok.warnings).toEqual([]);
    expect(ok.valid).toHaveLength(1);
    const bad = validatePanelIds([{ renderer: 'context', action: 'update', params: { panel_id: 'ghost' } }], reg);
    expect(bad.valid).toHaveLength(0);
    expect(bad.warnings[0]).toContain("unknown panel 'ghost'");
  });

  it('passes through actions with no renderer (legacy/graph-relative)', () => {
    const { valid } = validatePanelIds([{ action: 'highlight', node: 'A' }], arrayRegistry);
    expect(valid).toHaveLength(1);
  });
});

// companionSelfReport already had coverage in guidedAgent.test.js; a smoke check here
// keeps the agentLib public surface self-documented in one place.
describe('companionSelfReport — smoke', () => {
  it('returns null with no fields, normalizes when present', () => {
    expect(companionSelfReport({ text: 'x' })).toBe(null);
    expect(companionSelfReport({ learner_state: 'partial', specificity_level: 2 })).toMatchObject({
      learner_state: 'partial',
      specificity_level: 2,
      reveals_key_insight: false,
    });
  });
});

// Cross-layer viz contract tests.
//
// The viz contract lives in rendererManifest.js and is consumed by four parties that
// historically drifted apart silently: the client renderers (handler keys), the
// deterministic vizMapper (emitted action names), the emit_segment tool schema (action
// enum), and the runtime validator. These tests pin all four to the manifest so a
// rename/addition in one layer fails CI instead of producing a blank panel in prod.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RENDERER_MANIFEST } from './rendererManifest.js';
import { SYSTEM_ACTIONS, CONTEXT_ACTIONS } from './vizValidator.js';
import { tools } from './tools.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Where each renderer type's client-side action handlers live.
const CLIENT_HANDLER_FILES = {
  graph: 'client/src/lib/vizActions.js',
  array: 'client/src/components/renderers/ArrayRenderer.jsx',
  table: 'client/src/components/renderers/TableRenderer.jsx',
  tree: 'client/src/components/renderers/TreeRenderer.jsx',
  linked: 'client/src/components/renderers/LinkedRenderer.jsx',
  interval: 'client/src/components/renderers/IntervalRenderer.jsx',
  recursion_tree: 'client/src/components/renderers/RecursionTreeRenderer.jsx',
  string: 'client/src/components/renderers/StringRenderer.jsx',
};

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('manifest ↔ client renderer parity', () => {
  it('covers every manifest renderer with a client handler file', () => {
    expect(Object.keys(CLIENT_HANDLER_FILES).sort()).toEqual(Object.keys(RENDERER_MANIFEST).sort());
  });

  for (const [type, file] of Object.entries(CLIENT_HANDLER_FILES)) {
    it(`every documented '${type}' action has a client handler in ${path.basename(file)}`, () => {
      const src = read(file);
      const missing = RENDERER_MANIFEST[type].actions
        .map((a) => a.name)
        .filter((name) => !src.includes(`'${name}'`) && !src.includes(`"${name}"`));
      expect(missing, `manifest actions with no client handler: ${missing.join(', ')}`).toEqual([]);
    });
  }

  it('every documented context action has a contextManager handler', () => {
    const src = read('client/src/lib/contextManager.js');
    const missing = [...CONTEXT_ACTIONS].filter(
      (name) => !src.includes(`'${name}'`) && !src.includes(`"${name}"`),
    );
    expect(missing).toEqual([]);
  });
});

describe('vizMapper ↔ manifest parity', () => {
  // Statically extract every viz('<renderer>', '<action>', ...) call the mapper makes.
  const mapperSrc = read('server/vizMapper.js');
  const calls = [...mapperSrc.matchAll(/viz\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'/g)].map((m) => ({
    renderer: m[1],
    action: m[2],
  }));

  it('extracts a meaningful number of mapper viz() calls (regex sanity check)', () => {
    expect(calls.length).toBeGreaterThan(50);
  });

  it('every mapper-emitted action is documented in the manifest or SYSTEM_ACTIONS', () => {
    const undocumented = [];
    for (const { renderer, action } of calls) {
      const manifest = RENDERER_MANIFEST[renderer];
      const known =
        manifest?.actions.some((a) => a.name === action) || SYSTEM_ACTIONS[renderer]?.has(action);
      if (!known) undocumented.push(`${renderer}.${action}`);
    }
    expect([...new Set(undocumented)], 'mapper emits actions the contract does not know').toEqual([]);
  });

  it('every mapper-emitted action has a client handler', () => {
    const unhandled = [];
    for (const { renderer, action } of calls) {
      const file = CLIENT_HANDLER_FILES[renderer];
      if (!file) { unhandled.push(`${renderer}.${action} (no client file)`); continue; }
      const src = read(file);
      if (!src.includes(`'${action}'`) && !src.includes(`"${action}"`)) {
        unhandled.push(`${renderer}.${action}`);
      }
    }
    expect([...new Set(unhandled)], 'mapper emits actions the client cannot apply').toEqual([]);
  });

  it('every mapper ctx() action is a known context action', () => {
    const ctxCalls = [...mapperSrc.matchAll(/ctx\(\s*'([a-z_]+)'/g)].map((m) => m[1]);
    const unknown = ctxCalls.filter((a) => !CONTEXT_ACTIONS.has(a));
    expect([...new Set(unknown)]).toEqual([]);
  });
});

describe('tools.js emit_segment schema ↔ manifest parity', () => {
  it('the action enum covers every manifest action plus context actions', () => {
    const emitSegment = tools.find((t) => t.name === 'emit_segment');
    const actionEnum = emitSegment.input_schema.properties.viz_actions.items.properties.action.enum;
    expect(Array.isArray(actionEnum)).toBe(true);

    const required = new Set([
      ...Object.values(RENDERER_MANIFEST).flatMap((m) => m.actions.map((a) => a.name)),
      ...CONTEXT_ACTIONS,
      'toggle_residual',
    ]);
    const missing = [...required].filter((name) => !actionEnum.includes(name));
    expect(missing).toEqual([]);
  });
});

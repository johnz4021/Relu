/**
 * Phase A of the viz-consistency campaign: deterministic FULL-FIDELITY sweep.
 *
 * pipeline.coverage.test.js asserts every action routes to a registered panel.
 * This sweep goes further: for every action the production pipeline delivers
 * (all Tier 1/Tier 2 algorithms × bare + custom-panel scenarios), assert the
 * action's complete shape is legal end to end:
 *
 *   1. Manifest membership — action name is documented for the resolved
 *      renderer type (or is a sanctioned SYSTEM_ACTION / context action).
 *   2. Param schema — required params present, types match the manifest DSL
 *      (via vizValidator's strict validation; a validator ERROR here means the
 *      client would have silently no-opped or mis-rendered the action).
 *   3. Client handler — the action name has a handler in the renderer's
 *      client-side file, so it cannot die as an unknown-key no-op.
 *
 * If this suite is green, the trace-driven path (the "given trace" half of the
 * viz contract) is 100% consistent — every action of every step of every
 * algorithm is provably applicable by the client.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('./tts.js', () => ({
  synthesizeAndStream: vi.fn(async () => ({ aborted: false })),
  resetTTSDisabled: vi.fn(),
}));

import { ALGORITHMS } from './algorithms/registry.js';
import { handleToolCall } from './agentLib.js';
import { validateVizActionSchemas, SYSTEM_ACTIONS, CONTEXT_ACTIONS } from './vizValidator.js';
import { RENDERER_MANIFEST } from './rendererManifest.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_HANDLER_FILES = {
  graph: 'client/src/lib/vizActions.js',
  array: 'client/src/components/renderers/ArrayRenderer.jsx',
  table: 'client/src/components/renderers/TableRenderer.jsx',
  tree: 'client/src/components/renderers/TreeRenderer.jsx',
  linked: 'client/src/components/renderers/LinkedRenderer.jsx',
  interval: 'client/src/components/renderers/IntervalRenderer.jsx',
  recursion_tree: 'client/src/components/renderers/RecursionTreeRenderer.jsx',
  string: 'client/src/components/renderers/StringRenderer.jsx',
  context: 'client/src/lib/contextManager.js',
};
const clientSrc = Object.fromEntries(
  Object.entries(CLIENT_HANDLER_FILES).map(([k, f]) => [k, fs.readFileSync(path.join(ROOT, f), 'utf8')]),
);

// ── mock session / pipeline runner (mirrors pipeline.coverage.test.js) ───────

function createMockSession(prePanels = []) {
  const sent = [];
  const session = {
    ws: {
      readyState: 1,
      OPEN: 1,
      sent,
      send(payload) {
        if (typeof payload === 'string') {
          try { sent.push(JSON.parse(payload)); } catch { sent.push({ _raw: payload }); }
        } else {
          sent.push({ _binary: true });
        }
      },
    },
    active: true,
    endSessionFlag: false,
    runGeneration: 1,
    _panels: {},
    _emittedTraceSteps: [],
    _rendererVizHistory: {},
    graphs: {},
    speedMultiplier: 8, // shrink inter-segment gap
  };
  for (const p of prePanels) {
    session._panels[p.id] = { renderer: p.renderer, type: 'renderer' };
  }
  return session;
}

const CUSTOM_PANEL_ID = {
  graph: 'graph_main',
  array: 'array_main',
  table: 'table_main',
  tree: 'tree_main',
  linked: 'linked_main',
  interval: 'interval_main',
  string: 'string_main',
};

async function runPipeline(algoId, scenario) {
  const algoInfo = ALGORITHMS[algoId];
  const customId = CUSTOM_PANEL_ID[algoInfo.renderer];
  const prePanels = scenario === 'custom' && customId
    ? [{ id: customId, renderer: algoInfo.renderer }]
    : [];
  const session = createMockSession(prePanels);

  await handleToolCall(session, { name: 'run_algorithm', input: { algorithm: algoId, input: {} } });
  const traceLen = session.currentTrace?.length ?? 0;
  // Batch all steps into a few segments — same mapper path, ~10x fewer awaits.
  const BATCH = 25;
  for (let i = 0; i < traceLen; i += BATCH) {
    const indices = [];
    for (let j = i; j < Math.min(i + BATCH, traceLen); j++) indices.push(j);
    await handleToolCall(session, { name: 'emit_segment', input: { trace_step_indices: indices } });
  }

  const actions = [];
  for (const msg of session.ws.sent) {
    if (msg.type === 'segment_start' && Array.isArray(msg.viz_actions)) {
      actions.push(...msg.viz_actions);
    }
  }
  return { session, actions, traceLen };
}

// ── fidelity audit of one delivered action ────────────────────────────────────

function auditAction(act, panels) {
  const problems = [];

  // Resolve renderer type the same way the client effectively does.
  let type = null;
  if (!act.renderer) {
    problems.push('missing renderer field');
    return problems;
  }
  if (act.renderer === 'context' || panels[act.renderer]?.type === 'context') {
    type = 'context';
  } else if (panels[act.renderer]) {
    type = panels[act.renderer].renderer;
  } else if (RENDERER_MANIFEST[act.renderer]) {
    type = act.renderer;
  } else {
    problems.push(`unresolvable renderer '${act.renderer}'`);
    return problems;
  }

  // 1+2: manifest membership + param schema (strict validator, no leniency)
  const { valid, errors } = validateVizActionSchemas([act], panels);
  if (errors.length > 0) problems.push(...errors);
  // Flag silent repairs too — mapper output must already be canonical.
  if (errors.length === 0 && valid.length === 1) {
    const v = valid[0];
    if (v.action !== act.action) problems.push(`action name needed repair: '${act.action}' → '${v.action}'`);
  }

  // 3: client handler containment
  if (type !== 'context') {
    const src = clientSrc[type];
    if (!src) {
      problems.push(`no client handler file known for type '${type}'`);
    } else if (!src.includes(`'${act.action}'`) && !src.includes(`"${act.action}"`)) {
      problems.push(`client ${type} renderer has no handler for '${act.action}'`);
    }
  } else if (!CONTEXT_ACTIONS.has(act.action)) {
    problems.push(`context action '${act.action}' unknown to contextManager`);
  }

  return problems;
}

// ── sweep ─────────────────────────────────────────────────────────────────────

const allAlgos = Object.keys(ALGORITHMS).filter((id) => ALGORITHMS[id].run);

// Algorithms with known fidelity gaps — drive to empty.
const WIP = new Set([]);

const TALLY = { actions: 0, bad: 0 };

describe('viz fidelity sweep — every delivered action is fully legal (trace-driven path)', () => {
  for (const scenario of ['bare', 'custom']) {
    describe(`${scenario} panel scenario`, () => {
      for (const algoId of allAlgos) {
        if (scenario === 'custom' && ALGORITHMS[algoId].renderer === 'context') continue;
        it(`${algoId}: 100% of actions pass the full-fidelity audit`, async () => {
          const { session, actions } = await runPipeline(algoId, scenario);
          const violations = [];
          for (const act of actions) {
            const problems = auditAction(act, session._panels);
            if (problems.length > 0) {
              violations.push(`[${act.renderer}/${act.action}] ${problems.join('; ')}`);
            }
          }
          TALLY.actions += actions.length;
          TALLY.bad += violations.length;

          const isWip = WIP.has(algoId);
          if (violations.length > 0 && !isWip) {
            const uniq = [...new Set(violations)];
            throw new Error(
              `${algoId} (${scenario}): ${violations.length}/${actions.length} actions failed fidelity. ` +
              `Distinct: ${uniq.slice(0, 5).join(' || ')}`,
            );
          }
          if (violations.length === 0 && isWip) {
            throw new Error(`${algoId}: now passes — remove from WIP set.`);
          }
        });
      }
    });
  }

  it('reports aggregate fidelity', () => {
    const pct = TALLY.actions === 0 ? 0 : (100 * (TALLY.actions - TALLY.bad)) / TALLY.actions;
    // eslint-disable-next-line no-console
    console.log(`[vizFidelity] ${TALLY.actions} actions audited, ${TALLY.bad} violations → ${pct.toFixed(2)}% fidelity`);
    expect(TALLY.actions).toBeGreaterThan(500);
  });
});

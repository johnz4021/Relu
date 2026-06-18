// Companion reveal — fresh-panel remount across ALL renderers / ALL run_algorithm
// branches (general viz-reset fix, 2026-06-18).
//
// The hint→give-up→walkthrough flow must start the terminal walkthrough on a CLEAN
// renderer instance for EVERY renderer, not just the non-graph array/string case. The
// companion-reveal remount decision is hoisted in run_algorithm (agentLib.js) and a shared
// mountKey is threaded through every panel-mounting branch:
//   - else / non-graph (array, string, table, interval, linked, single-panel tree) -> create_visualization {panels:[{...mountKey}]}
//   - multi-panel (median_finder, merge_k_sorted)                                   -> create_visualization {panels:[{...mountKey}, ...]}
//   - graph (bfs, dijkstra, ...)                                                     -> create_graph {...mountKey}
//   - the create_visualization TOOL (Tier-3 hand-built reveal)                       -> panels[i].mountKey
// The client (useTutorState SET_VIZ_PANELS + CREATE_GRAPH, VizLayout key=`${id}#${mountKey}`)
// remounts a fresh instance on a bumped key. This is the message-level acceptance gate for
// that fix — REAL registry, REAL mapper, no renderer mocks.

import { describe, it, expect, vi } from 'vitest';

vi.mock('./tts.js', () => ({
  synthesizeAndStream: vi.fn(async () => ({})),
  resetTTSDisabled: vi.fn(),
}));

import { handleToolCall } from './agentLib.js';
import { ALGORITHMS } from './algorithms/registry.js';
import { mapTraceStep } from './vizMapper.js';

function makeSession(extra = {}) {
  const sent = [];
  const ws = { readyState: 1, OPEN: 1, send: (s) => sent.push(JSON.parse(s)) };
  return { sent, session: { ws, speedMultiplier: 1, _panels: {}, _panelMountKey: 0, ...extra } };
}
// Seed a HINT renderer panel exactly as registerPanels stores it (type:'renderer').
function seedHint(session, id, renderer) { session._panels[id] = { renderer, type: 'renderer' }; }

const runAlgo = (session, algorithm) =>
  handleToolCall(session, { name: 'run_algorithm', input: { algorithm, input: ALGORITHMS[algorithm]?.defaultInput } }, null, null, null);

const createViz = (sent) => sent.filter((m) => m.type === 'create_visualization' && m.panels?.length).at(-1);
const createGraph = (sent) => sent.filter((m) => m.type === 'create_graph').at(-1);

// Map the first N trace steps (threading state) and collect every viz action.
function vizActionsForFirstSteps(algorithm, renderer, trace, n = 8) {
  const state = {};
  const out = [];
  for (let i = 0; i < Math.min(n, trace.length); i++) {
    const { viz } = mapTraceStep(algorithm, renderer, trace[i], state) || {};
    for (const a of viz || []) out.push(a);
  }
  return out;
}
const hasAction = (actions, name) => actions.some((a) => a.action === name);

// ── A. else / non-graph renderers — remount via create_visualization{panels:[{mountKey}]} ──
const ELSE_CASES = [
  { renderer: 'array',    algorithm: 'two_pointers',          dataAction: 'set_data' },
  { renderer: 'array',    algorithm: 'binary_search',         dataAction: 'set_data' },
  { renderer: 'string',   algorithm: 'valid_palindrome',      dataAction: 'set_string' },
  { renderer: 'table',    algorithm: 'coin_change',           dataAction: 'init_grid' },
  { renderer: 'interval', algorithm: 'interval_merge',        dataAction: 'set_jobs' },
  { renderer: 'linked',   algorithm: 'linked_list_reversal',  dataAction: 'set_list' },
  { renderer: 'tree',     algorithm: 'bst_insert',            dataAction: 'set_tree' },
];

describe('companion reveal — else/non-graph renderers remount + repopulate', () => {
  for (const { renderer, algorithm, dataAction } of ELSE_CASES) {
    it(`${algorithm} (${renderer}): companion reveal re-declares the hint panel with a bumped mountKey`, async () => {
      const { sent, session } = makeSession({ companionMode: true });
      seedHint(session, `${renderer}_hint`, renderer); // the student's HINT canvas
      const result = await runAlgo(session, algorithm);

      expect(result.success).toBe(true);
      const viz = createViz(sent);
      expect(viz, 'a non-empty create_visualization was sent').toBeDefined();
      expect(viz.panels[0].renderer).toBe(renderer);
      expect(viz.panels[0].mountKey).toBe(1);          // remount, not panels:[]
      expect(session._panelMountKey).toBe(1);

      // repopulation: the trace's early steps emit this renderer's data-population action,
      // so the freshly-remounted (empty) panel is refilled.
      expect(result.trace.length).toBeGreaterThan(0);
      const actions = vizActionsForFirstSteps(algorithm, renderer, result.trace);
      expect(hasAction(actions, dataAction), `trace emits ${dataAction}`).toBe(true);
    });

    it(`${algorithm} (${renderer}): NON-companion preserves the panel (panels:[], no mountKey)`, async () => {
      const { sent, session } = makeSession({ companionMode: false });
      seedHint(session, `${renderer}_hint`, renderer);
      await runAlgo(session, algorithm);
      const preserve = sent.filter((m) => m.type === 'create_visualization').at(-1);
      expect(preserve.panels).toEqual([]);             // preserve path
      expect(session._panelMountKey).toBe(0);          // never bumped
    });
  }
});

// ── B. graph branch — remount via create_graph{mountKey} (cy reuse needs a real remount) ──
const GRAPH_ALGOS = ['bfs', 'dijkstra', 'topological_sort'];
describe('companion reveal — graph renderer remounts (create_graph mountKey)', () => {
  for (const algorithm of GRAPH_ALGOS) {
    it(`${algorithm} (graph): companion reveal attaches mountKey to create_graph`, async () => {
      const { sent, session } = makeSession({ companionMode: true });
      seedHint(session, 'graph', 'graph');
      const result = await runAlgo(session, algorithm);

      expect(result.success).toBe(true);
      const cg = createGraph(sent);
      expect(cg, 'a create_graph was sent').toBeDefined();
      expect(cg.graph?.nodes?.length, 'graph repopulated').toBeGreaterThan(0); // fresh panel refilled
      expect(cg.mountKey).toBe(1);                      // THE FIX: graph branch now remounts
      expect(session._panelMountKey).toBe(1);
    });

    it(`${algorithm} (graph): NON-companion sends create_graph WITHOUT mountKey`, async () => {
      const { sent, session } = makeSession({ companionMode: false });
      seedHint(session, 'graph', 'graph');
      await runAlgo(session, algorithm);
      const cg = createGraph(sent);
      expect(cg).toBeDefined();
      expect(cg.mountKey).toBeUndefined();
      expect(session._panelMountKey).toBe(0);
    });
  }
});

// ── C. multi-panel branch — EVERY declared panel remounts ──
const MULTI = [
  { algorithm: 'median_finder', panels: ['lo_heap', 'hi_heap'] },
  { algorithm: 'merge_k_sorted', panels: ['merge_heap', 'merge_result'] },
];
describe('companion reveal — multi-panel algorithms remount every panel', () => {
  for (const { algorithm, panels } of MULTI) {
    it(`${algorithm}: both declared panels carry the same bumped mountKey`, async () => {
      const { sent, session } = makeSession({ companionMode: true });
      seedHint(session, 'tree_hint', 'tree'); // any prior renderer panel = the hint canvas
      const result = await runAlgo(session, algorithm);

      expect(result.success).toBe(true);
      const viz = createViz(sent);
      expect(viz).toBeDefined();
      const ids = viz.panels.map((p) => p.id);
      for (const id of panels) expect(ids).toContain(id);
      for (const p of viz.panels) expect(p.mountKey).toBe(1); // every panel remounts together
      expect(session._panelMountKey).toBe(1);
    });

    it(`${algorithm}: NON-companion declares panels without mountKey`, async () => {
      const { sent, session } = makeSession({ companionMode: false });
      seedHint(session, 'tree_hint', 'tree');
      await runAlgo(session, algorithm);
      const viz = createViz(sent);
      expect(viz).toBeDefined();
      for (const p of viz.panels) expect(p.mountKey).toBeUndefined();
      expect(session._panelMountKey).toBe(0);
    });
  }
});

// ── D. create_visualization TOOL path (Tier-3 hand-built reveal) ──
describe('companion reveal — create_visualization tool remounts a re-declared panel', () => {
  it('re-declaring an existing renderer panel in companion mode bumps mountKey', async () => {
    const { sent, session } = makeSession({ companionMode: true });
    seedHint(session, 'array', 'array'); // hint already mounted this id
    await handleToolCall(session, { name: 'create_visualization', input: { panels: [{ id: 'array', renderer: 'array' }] } }, null, null, null);
    const viz = sent.filter((m) => m.type === 'create_visualization').at(-1);
    expect(viz.panels[0].mountKey).toBe(1);
    expect(session._panelMountKey).toBe(1);
  });

  it('first mount of a NEW panel does not bump (nothing to carry over)', async () => {
    const { sent, session } = makeSession({ companionMode: true });
    await handleToolCall(session, { name: 'create_visualization', input: { panels: [{ id: 'array', renderer: 'array' }] } }, null, null, null);
    const viz = sent.filter((m) => m.type === 'create_visualization').at(-1);
    expect(viz.panels[0].mountKey).toBeUndefined();
    expect(session._panelMountKey).toBe(0);
  });

  it('NON-companion re-declaration does not bump', async () => {
    const { sent, session } = makeSession({ companionMode: false });
    seedHint(session, 'array', 'array');
    await handleToolCall(session, { name: 'create_visualization', input: { panels: [{ id: 'array', renderer: 'array' }] } }, null, null, null);
    const viz = sent.filter((m) => m.type === 'create_visualization').at(-1);
    expect(viz.panels[0].mountKey).toBeUndefined();
    expect(session._panelMountKey).toBe(0);
  });
});

// ── E. cross-renderer reveal: a graph walkthrough after an array hint still remounts ──
describe('companion reveal — cross-renderer replacement still remounts', () => {
  it('array hint -> graph reveal: create_graph carries mountKey (hasExistingRendererPanel gate)', async () => {
    const { sent, session } = makeSession({ companionMode: true });
    seedHint(session, 'array_hint', 'array'); // different renderer than the reveal
    await runAlgo(session, 'bfs');
    const cg = createGraph(sent);
    expect(cg).toBeDefined();
    expect(cg.mountKey).toBe(1);
  });
});

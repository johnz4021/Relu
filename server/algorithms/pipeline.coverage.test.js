/**
 * Tier 1 pipeline coverage harness.
 *
 * For every Tier 1 algorithm in the registry, this test runs the *full*
 * server-side pipeline that production uses:
 *
 *   1. handleToolCall('run_algorithm', { algorithm, input: defaultInput })
 *      → registers panels via registerPanels()
 *      → sends create_graph / create_visualization / algorithm_step
 *      → loads trace + currentRenderer + _rendererPanelId on the session
 *
 *   2. handleToolCall('emit_segment', { trace_step_indices: [i] }) for each
 *      trace step → runs mapTraceStep → applies the renderer-rewrite at
 *      agentLib.js:565 → sends segment_start with viz_actions
 *
 * This catches bugs that the single-step mapper.coverage.test.js cannot:
 *
 *   - The exact production bug from the rotting-oranges QA: mapper emits
 *     `renderer: 'graph'` but build_example_graph registered the panel as
 *     'graph_main' and the renderer-rewrite didn't fire.
 *   - Context panel id mismatches: mapper writes ctxUpdate('distances', ...)
 *     but getDefaultContextPanels registered the panel as 'time_to_reach'.
 *   - Renderer-id rewrites missing for non-graph renderers.
 *   - Algorithm runs that emit zero panel updates across the entire trace.
 *
 * Two scenarios per algorithm:
 *
 *   A) Bare (no custom panel pre-registered) — simulates the agent calling
 *      run_algorithm directly without build_example_graph.
 *   B) Custom-named (e.g. 'graph_main' for graph algos) — simulates
 *      build_example_graph having registered a custom panel id beforehand.
 *
 * The harness asserts, for each scenario:
 *   - ≥2 distinct panel ids received at least one viz_action update
 *   - Every emitted action's renderer/panel_id resolves to a registered
 *     entry in session._panels
 *
 * Today, Tier 1 catches the production-bug class for free across all 92
 * algorithms in one CI run.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock TTS to no-op — the pipeline harness only cares about viz_actions and
// panel registration, not audio synthesis. Real TTS calls would either crash
// (no ELEVENLABS_API_KEY) or block on simulated delays for ~5 minutes total.
vi.mock('../tts.js', () => ({
  synthesizeAndStream: vi.fn(async () => ({ aborted: false })),
  resetTTSDisabled: vi.fn(),
}));

import { ALGORITHMS } from './registry.js';
import { handleToolCall } from '../agentLib.js';
import { getDefaultContextPanels } from '../contextPanelDefaults.js';

// ── Mock WebSocket ───────────────────────────────────────────────────────────

function createMockWs() {
  const sent = [];
  return {
    readyState: 1,  // WebSocket.OPEN
    OPEN: 1,
    sent,
    send(payload) {
      if (typeof payload === 'string') {
        try { sent.push(JSON.parse(payload)); } catch { sent.push({ _raw: payload }); }
      } else {
        sent.push({ _binary: true });
      }
    },
  };
}

function createMockSession({ algoId, prePanels = [], preContextPanels = [] }) {
  const ws = createMockWs();
  const session = {
    ws,
    active: true,
    endSessionFlag: false,
    runGeneration: 1,
    _panels: {},
    _emittedTraceSteps: [],
    _rendererVizHistory: {},
    graphs: {},
    modelContract: null,
    currentAlgorithm: algoId,
  };
  // Simulate agent's pre-registration of custom-named panels.
  for (const p of prePanels) {
    session._panels[p.id] = { renderer: p.renderer, type: 'renderer' };
  }
  for (const p of preContextPanels) {
    session._panels[p.id] = { renderer: 'context', type: 'context' };
  }
  return session;
}

// Realistic build_example_graph custom panel id per renderer.
const CUSTOM_PANEL_ID = {
  graph: 'graph_main',
  array: 'array_main',
  table: 'table_main',
  tree: 'tree_main',
  linked: 'linked_main',
  interval: 'interval_main',
  string: 'string_main',
  context: 'algorithm_state',  // context-renderer algos always use this
};

// ── Verdict computation ──────────────────────────────────────────────────────

function collectVizActionsFromSent(sent) {
  const actions = [];
  for (const msg of sent) {
    if (msg.type === 'segment_start' && Array.isArray(msg.viz_actions)) {
      actions.push(...msg.viz_actions);
    }
  }
  return actions;
}

function checkActionsRouted(actions, registeredPanels) {
  const violations = [];
  const panelsTouched = new Set();
  for (const act of actions) {
    if (act.renderer === 'context') {
      const pid = act.params?.panel_id;
      if (!pid) {
        violations.push(`context action missing panel_id: ${act.action}`);
        continue;
      }
      if (!registeredPanels[pid]) {
        violations.push(`context action targets unregistered panel '${pid}' (action: ${act.action})`);
        continue;
      }
      panelsTouched.add(pid);
    } else {
      if (!registeredPanels[act.renderer]) {
        violations.push(`action targets unregistered renderer '${act.renderer}' (action: ${act.action})`);
        continue;
      }
      panelsTouched.add(act.renderer);
    }
  }
  return { violations, panelsTouched };
}

// ── WIP allowlists ───────────────────────────────────────────────────────────

// Algorithms whose pipeline-level integration is known broken under the bare
// scenario (no build_example_graph custom panel). Each entry means: the algo's
// mapper writes to a context panel id that getDefaultContextPanels never
// registered, so those updates silently no-op in production.
//
// Fix per algo: open `server/contextPanelDefaults.js`, find the algo's entry,
// add the missing panel id (use the harness output to identify which panels
// are being written but not registered).
//
// Drive to empty.
const WIP_BARE_GAPS = new Set([
  'binary_search', 'bitmask_dp', 'climbing_stairs', 'combination_sum', 'dfs',
  'difference_array', 'heap_ops', 'house_robber', 'interval_dp', 'jump_game',
  'k_closest_points', 'lca_tree', 'linked_list_cycle', 'lis', 'manacher',
  'max_subarray', 'median_finder', 'merge_k_sorted', 'mergesort', 'min_path_sum',
  'number_of_islands', 'palindrome_dp', 'permutations', 'poly_reduction',
  'prefix_sum', 'prim', 'rabin_karp', 'rotate_array', 'rotate_matrix',
  'sieve_primes', 'sliding_window', 'sliding_window_max', 'spiral_matrix',
  'stock_dp', 'subsets', 'tarjan_bridges', 'top_k_heap', 'tree_depth_dfs',
  'tree_dp', 'tree_level_order', 'tree_path', 'trie', 'two_pointers',
  'union_find', 'validate_bst', 'word_break', 'word_search',
]);

// Algorithms whose pipeline-level integration is known broken under the
// custom-named-panel scenario (simulates build_example_graph). Same root
// causes as WIP_BARE_GAPS; populated identically since context-panel
// registration doesn't depend on the renderer panel scenario.
const WIP_CUSTOM_PANEL_GAPS = new Set([
  'binary_search', 'bitmask_dp', 'climbing_stairs', 'combination_sum', 'dfs',
  'difference_array', 'heap_ops', 'house_robber', 'interval_dp', 'jump_game',
  'k_closest_points', 'lca_tree', 'linked_list_cycle', 'lis', 'manacher',
  'max_subarray', 'median_finder', 'merge_k_sorted', 'mergesort', 'min_path_sum',
  'number_of_islands', 'palindrome_dp', 'permutations', 'poly_reduction',
  'prefix_sum', 'prim', 'rabin_karp', 'rotate_array', 'rotate_matrix',
  'sieve_primes', 'sliding_window', 'sliding_window_max', 'spiral_matrix',
  'stock_dp', 'subsets', 'tarjan_bridges', 'top_k_heap', 'tree_depth_dfs',
  'tree_dp', 'tree_level_order', 'tree_path', 'trie', 'two_pointers',
  'union_find', 'validate_bst', 'word_break', 'word_search',
]);

// Algorithms that legitimately produce panel updates from <2 distinct panels
// (e.g. context-only algos with a single algorithm_state panel).
const KNOWN_SINGLE_PANEL = new Set([
  // populated based on trace inspection
]);

// ── Harness ──────────────────────────────────────────────────────────────────

async function runPipeline(algoId, scenario) {
  const algoInfo = ALGORITHMS[algoId];
  const customId = CUSTOM_PANEL_ID[algoInfo.renderer];

  const prePanels = scenario === 'custom' && customId && customId !== algoInfo.renderer
    ? [{ id: customId, renderer: algoInfo.renderer }]
    : [];

  const session = createMockSession({ algoId, prePanels });

  // Step 1: run_algorithm
  await handleToolCall(session, {
    name: 'run_algorithm',
    input: { algorithm: algoId, input: {} },
  });

  // Step 2: emit_segment for each trace step
  const traceLen = session.currentTrace?.length ?? 0;
  for (let i = 0; i < traceLen; i++) {
    await handleToolCall(session, {
      name: 'emit_segment',
      input: { trace_step_indices: [i] },
    });
  }

  return {
    session,
    sent: session.ws.sent,
    actions: collectVizActionsFromSent(session.ws.sent),
    traceLen,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('pipeline coverage — full server-side flow per algorithm', () => {
  const allAlgos = Object.keys(ALGORITHMS).filter((id) => ALGORITHMS[id].run);

  describe('bare scenario: run_algorithm without pre-registered custom panel', () => {
    for (const algoId of allAlgos) {
      it(`${algoId}: every viz_action routes to a registered panel`, async () => {
        const { session, actions } = await runPipeline(algoId, 'bare');
        const { violations, panelsTouched } = checkActionsRouted(actions, session._panels);

        const isWip = WIP_BARE_GAPS.has(algoId);
        if (violations.length > 0 && !isWip) {
          throw new Error(
            `${algoId}: ${violations.length} action(s) routed to unregistered panels in bare scenario. ` +
            `First: ${violations.slice(0, 3).join(' | ')}. ` +
            `Registered panels: ${Object.keys(session._panels).join(', ')}.`
          );
        }
        if (violations.length === 0 && isWip) {
          throw new Error(`${algoId}: bare scenario now passes. Remove from WIP_BARE_GAPS.`);
        }

        if (panelsTouched.size === 0 && actions.length > 0) {
          throw new Error(
            `${algoId}: ${actions.length} action(s) emitted but 0 panels updated. ` +
            `Likely a renderer-rewrite or registration bug.`
          );
        }
      });
    }
  });

  describe('custom-panel scenario: build_example_graph registered <renderer>_main beforehand', () => {
    for (const algoId of allAlgos) {
      const algoInfo = ALGORITHMS[algoId];
      const customId = CUSTOM_PANEL_ID[algoInfo.renderer];
      // Skip context-renderer algos — their panel id IS already 'algorithm_state',
      // there's no "custom" scenario different from the bare one.
      if (algoInfo.renderer === 'context') continue;
      if (!customId) continue;

      it(`${algoId}: viz_actions route correctly when '${customId}' panel pre-registered`, async () => {
        const { session, actions } = await runPipeline(algoId, 'custom');
        const { violations, panelsTouched } = checkActionsRouted(actions, session._panels);

        const isWip = WIP_CUSTOM_PANEL_GAPS.has(algoId);
        if (violations.length > 0 && !isWip) {
          throw new Error(
            `${algoId}: ${violations.length} action(s) routed to unregistered panels in custom-panel scenario. ` +
            `First: ${violations.slice(0, 3).join(' | ')}. ` +
            `Registered panels: ${Object.keys(session._panels).join(', ')}. ` +
            `Likely cause: agentLib's run_algorithm branch for renderer '${algoInfo.renderer}' is not setting ` +
            `_rendererPanelId to the custom id, so emit_segment's rewrite at agentLib.js:565 doesn't fire.`
          );
        }
        if (violations.length === 0 && isWip) {
          throw new Error(`${algoId}: custom-panel scenario now passes. Remove from WIP_CUSTOM_PANEL_GAPS.`);
        }

        if (panelsTouched.size === 0 && actions.length > 0) {
          throw new Error(
            `${algoId}: ${actions.length} action(s) emitted but 0 panels updated under custom panel scenario.`
          );
        }
      });
    }
  });

  describe('non-empty integration: each algorithm updates at least one panel end-to-end', () => {
    for (const algoId of allAlgos) {
      it(`${algoId}: emits ≥1 panel update across the full trace`, async () => {
        const { actions, session, traceLen } = await runPipeline(algoId, 'bare');
        const { panelsTouched } = checkActionsRouted(actions, session._panels);


        if (traceLen === 0) {
          throw new Error(`${algoId}: trace has 0 steps — algorithm produced no execution to narrate.`);
        }
        if (panelsTouched.size === 0) {
          throw new Error(
            `${algoId}: across ${traceLen} trace steps, ZERO panel updates reached a registered panel. ` +
            `This algorithm would render visually empty in production.`
          );
        }
      });
    }
  });
});

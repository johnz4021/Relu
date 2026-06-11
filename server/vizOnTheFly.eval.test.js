// Phase B of the viz-consistency campaign: LIVE on-the-fly viz eval.
//
// SKIPPED BY DEFAULT — gated on RELU_EVAL=1 + ANTHROPIC_API_KEY (same convention as
// companionMode.eval.test.js). Phase A (vizFidelity.sweep.test.js) proves the
// trace-driven path deterministically; THIS file measures the half that depends on
// model behavior: hand-built visualizations, one scenario per renderer plus the
// structural edge cases (multi-panel disambiguation, mixed trace+manual, context
// panels). Each scenario runs the REAL production stack:
//
//   buildGuidedSystemPrompt(session) + shared tools.js schemas
//     → live model tool calls
//     → real handleToolCall (panel registry → manifest validation → node-id checks)
//     → delivered segment_start actions on a mock WS
//
// Scoring per scenario:
//   supplied   — viz_actions the model emitted across all attempts
//   delivered  — actions that survived the enforcement ladder (post safe-repair)
//   semantic   — scenario-specific assertion that the RIGHT picture was drawn
//
// The campaign bar: aggregate delivered/supplied ≥ 95% AND every scenario
// semantically complete.
//
//   Run with:  RELU_EVAL=1 npx vitest run server/vizOnTheFly.eval.test.js
//   (ANTHROPIC_API_KEY comes from .env via dotenv)

import { describe, it, expect, vi } from 'vitest';
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';

vi.mock('./tts.js', () => ({
  synthesizeAndStream: vi.fn(async () => ({ aborted: false })),
  resetTTSDisabled: vi.fn(),
}));

import { buildGuidedSystemPrompt } from './guidedAgent.js';
import { handleToolCall } from './agentLib.js';
import { tools } from './tools.js';
import { buildRendererDocs } from './rendererManifest.js';

const ENABLED = process.env.RELU_EVAL === '1' && !!process.env.ANTHROPIC_API_KEY;
// Production teaching model (models.js); override with RELU_EVAL_MODEL to test candidates.
import { TEACHING_MODEL } from './models.js';
const MODEL = process.env.RELU_EVAL_MODEL || TEACHING_MODEL;

const TOOL_NAMES = ['create_graph', 'create_visualization', 'emit_segment'];
const evalTools = tools.filter((t) => TOOL_NAMES.includes(t.name));
const interruptTools = tools.filter((t) =>
  [...TOOL_NAMES, 'respond_to_interrupt', 'end_illustration'].includes(t.name));

const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function mockSession() {
  const sent = [];
  return {
    sent,
    ws: { readyState: 1, OPEN: 1, send: (p) => { if (typeof p === 'string') sent.push(JSON.parse(p)); } },
    active: true,
    runGeneration: 1,
    _panels: {},
    _emittedTraceSteps: [],
    _rendererVizHistory: {},
    graphs: {},
    speedMultiplier: 8,
    mode: 'leetcode',
    hasViz: true,
  };
}

// Aggregate tally across all scenarios (printed at the end).
const TALLY = { supplied: 0, delivered: 0, hardFailures: 0, scenarios: 0, semanticPasses: 0 };

/**
 * Drive one scenario: live model + real tool handlers, up to maxTurns assistant turns.
 * Returns { session, delivered, supplied, hardFailures, toolCalls }.
 */
async function runScenario({ task, rendererDocs, maxTurns = 6, session: presetSession, tools: toolset }) {
  const session = presetSession || mockSession();
  const system = buildGuidedSystemPrompt(session);
  const messages = [{
    role: 'user',
    content:
      `${task}\n\nRENDERER REFERENCE:\n${rendererDocs}\n\n` +
      'Build the visualization now with the available tools, then narrate it in 1-2 short emit_segment calls. ' +
      'Keep narration brief — this is a visual check.',
  }];

  let supplied = 0;
  let hardFailures = 0;
  const toolCalls = [];

  for (let turn = 0; turn < maxTurns; turn++) {
    const resp = await client().messages.create({
      model: MODEL, max_tokens: 2000, system, tools: toolset || evalTools, messages,
    });
    const uses = resp.content.filter((b) => b.type === 'tool_use');
    if (uses.length === 0) break;

    messages.push({ role: 'assistant', content: resp.content });
    const results = [];
    for (const use of uses) {
      toolCalls.push(use);
      if (use.name === 'emit_segment' || use.name === 'respond_to_interrupt') {
        supplied += (use.input.viz_actions || []).length;
      }
      let result;
      try {
        result = await handleToolCall(session, use, null, null, null);
      } catch (err) {
        result = { success: false, message: String(err?.message || err) };
      }
      if (result?.success === false) hardFailures++;
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify(result),
        is_error: result?.success === false,
      });
    }
    messages.push({ role: 'user', content: results });
    if (resp.stop_reason === 'end_turn') break;
  }

  const delivered = [];
  for (const msg of session.sent) {
    if (msg.type === 'segment_start' && Array.isArray(msg.viz_actions)) {
      delivered.push(...msg.viz_actions);
    }
  }
  return { session, delivered, supplied, hardFailures, toolCalls };
}

const has = (delivered, pred) => delivered.some(pred);

// Mid-lesson session state for interrupt scenarios: a dijkstra lesson graph is on
// screen, panels registered — the exact state respond_to_interrupt fires from.
const LESSON_GRAPH = {
  nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
  edges: [
    { source: 'a', target: 'b', weight: 1 },
    { source: 'a', target: 'c', weight: 4 },
    { source: 'b', target: 'c', weight: 2 },
    { source: 'c', target: 'd', weight: 1 },
  ],
  directed: true,
};
function midLessonSession() {
  const s = mockSession();
  s.currentGraph = LESSON_GRAPH;
  s.currentAlgorithm = 'dijkstra';
  s.currentRenderer = 'graph';
  s._panels = { graph: { renderer: 'graph', type: 'renderer' } };
  return s;
}
const sentOfType = (session, type) => session.sent.filter((m) => m.type === type);

// ── scenario matrix: one per renderer + structural edge cases ────────────────
const SCENARIOS = [
  {
    name: 'array — counterexample with highlights',
    docs: ['array'],
    task: 'Show the array [4, 5, 6, 7, 0, 1, 2] (a rotated sorted array) and highlight the rotation point at index 4 so a student can see where ascending order breaks.',
    semantic: (d) =>
      has(d, (a) => a.action === 'set_data' && JSON.stringify(a.params?.values) === '[4,5,6,7,0,1,2]') &&
      has(d, (a) => ['highlight', 'set_pointer', 'set_label', 'partition'].includes(a.action)),
  },
  {
    name: 'graph — small directed cycle with highlights',
    docs: ['graph'],
    task: 'Draw a small directed graph with nodes a, b, c and edges a→b, b→c, c→a (a cycle), then highlight the cycle path so the student sees why a topological sort is impossible.',
    semantic: (d, session) =>
      (session.currentGraph?.nodes?.length ?? 0) === 3 &&
      has(d, (a) => ['show_path', 'highlight_edge', 'highlight_node', 'mark_current'].includes(a.action)),
  },
  {
    name: 'table — DP grid setup and first row',
    docs: ['table'],
    task: 'Set up a dynamic-programming table with 4 rows and 5 columns (row headers "", "a", "b", "c"; column headers "", "x", "y", "z", "w") for edit distance, then fill the first row with the base case values 0, 1, 2, 3, 4.',
    semantic: (d) =>
      has(d, (a) => a.action === 'init_grid' && a.params?.rows === 4 && a.params?.cols === 5) &&
      d.filter((a) => a.action === 'fill_cell' && a.params?.row === 0).length >= 5,
  },
  {
    name: 'string — sliding window with pointers',
    docs: ['string'],
    task: 'Show the string "abcabcbb" and visualize the first sliding-window step: window over indices 0..2 and a pointer named L at index 0.',
    semantic: (d) =>
      has(d, (a) => a.action === 'set_string' && a.params?.s === 'abcabcbb') &&
      has(d, (a) => a.action === 'set_window') &&
      has(d, (a) => a.action === 'set_pointer'),
  },
  {
    name: 'tree — small BST with highlighted root',
    docs: ['tree'],
    task: 'Draw a binary search tree with root 10, left child 5, right child 15, and highlight the root as current to start an insertion walkthrough.',
    semantic: (d) =>
      has(d, (a) => a.action === 'set_tree' && (a.params?.nodes?.length ?? 0) >= 3) &&
      has(d, (a) => a.action === 'highlight_node'),
  },
  {
    name: 'linked — list with pointer and reversal step',
    docs: ['linked'],
    task: 'Show the linked list 1 → 2 → 3 → 4, put a pointer named "prev" before index 0, and reverse the first arrow to begin an in-place reversal demo.',
    semantic: (d) =>
      has(d, (a) => a.action === 'set_list' && (a.params?.values?.length ?? 0) === 4) &&
      has(d, (a) => ['reverse_pointer', 'set_pointer', 'highlight_pointer', 'set_arrows'].includes(a.action)),
  },
  {
    name: 'interval — jobs assigned to machines',
    docs: ['interval'],
    task: 'Show three jobs — A from 0 to 3, B from 1 to 4, C from 4 to 6 — create two machine rows, assign A to machine 0 and B to machine 1, and highlight the overlap between A and B.',
    semantic: (d) =>
      has(d, (a) => a.action === 'set_jobs' && (a.params?.jobs?.length ?? 0) === 3) &&
      has(d, (a) => a.action === 'assign_machine') &&
      has(d, (a) => ['highlight_overlap', 'highlight_job', 'highlight_jobs'].includes(a.action)),
  },
  {
    name: 'recursion_tree — recurrence with level highlight',
    docs: ['recursion_tree'],
    task: 'Visualize the recurrence T(n) = 2T(n/2) + O(n) for n = 16 as a recursion tree and highlight level 0 to start the level-by-level cost sum.',
    semantic: (d) =>
      has(d, (a) => a.action === 'set_recurrence_tree' && a.params?.a === 2 && a.params?.b === 2) &&
      has(d, (a) => ['highlight_level', 'reveal_level', 'set_cumulative'].includes(a.action)),
  },
  {
    name: 'interrupt overlay — spotlight on the live lesson graph',
    docs: ['graph'],
    session: midLessonSession,
    tools: interruptTools,
    maxTurns: 4,
    requiresActions: false, // overlay spotlights live on the interrupt_response, not viz_actions
    task:
      'MID-LESSON INTERRUPT. The dijkstra lesson graph currently on screen has nodes a, b, c, d ' +
      'and directed edges a→b (weight 1), a→c (weight 4), b→c (weight 2), c→d (weight 1). ' +
      'The student just asked: "Why did we visit b before c?" ' +
      'Answer with respond_to_interrupt using overlay mode — spotlight the nodes and edges that explain the answer.',
    semantic: (d, session) => {
      const ir = sentOfType(session, 'interrupt_response').find((m) => m.explanation_mode === 'overlay');
      const nodes = ir?.overlay?.spotlight_nodes || [];
      const edges = ir?.overlay?.spotlight_edges || [];
      const known = new Set(['a', 'b', 'c', 'd']);
      return !!ir && (nodes.length + edges.length) > 0 &&
        nodes.every((n) => known.has(n)) &&
        edges.every((e) => known.has(e.from) && known.has(e.to));
    },
  },
  {
    name: 'interrupt illustrate — smaller example graph, then borrow-and-return',
    docs: ['graph'],
    session: midLessonSession,
    tools: interruptTools,
    maxTurns: 8,
    task:
      'MID-LESSON INTERRUPT. A dijkstra lesson is running on a 4-node graph. ' +
      'The student just asked: "This graph is confusing — can you show me the idea on a smaller example first?" ' +
      'Use respond_to_interrupt with illustrate mode to draw a fresh 2-3 node example graph, teach ONE short ' +
      'emit_segment beat on it (highlight something), then call end_illustration to restore the lesson graph.',
    semantic: (d, session) => {
      const ir = sentOfType(session, 'interrupt_response').find((m) => m.explanation_mode === 'illustrate');
      const exampleNodes = ir?.illustrate?.graph?.nodes?.length ?? 0;
      const restored = sentOfType(session, 'explanation_complete').length > 0;
      return exampleNodes >= 2 && exampleNodes <= 4 && restored;
    },
  },
  {
    name: 'context panel — hash map state tracking',
    docs: ['array'],
    task: 'Create an array panel showing [2, 7, 11, 15] plus a key_value context panel with id "seen" titled "Seen map". Then show the first two-sum step: highlight index 0 and update the "seen" panel with the entry key "2" value "index 0".',
    semantic: (d) =>
      has(d, (a) => a.action === 'set_data') &&
      has(d, (a) => a.renderer === 'context' && a.action === 'update' && a.params?.panel_id === 'seen'),
  },
  {
    name: 'graph — weighted directed graph with edge label updates',
    docs: ['graph'],
    task: 'Draw a weighted directed graph: s→a weight 4, s→b weight 2, a→b weight 5, b→t weight 3, a→t weight 1. Then highlight the edge s→b as examining and update its displayed label to "2 ✓" as if it was just relaxed.',
    semantic: (d, session) =>
      (session.currentGraph?.edges?.length ?? 0) === 5 &&
      session.currentGraph.edges.every((e) => e.weight !== undefined) &&
      has(d, (a) => a.action === 'update_edge_label') &&
      has(d, (a) => a.action === 'highlight_edge'),
  },
  {
    name: 'graph — undirected graph + mid-lesson add_node/add_edge mutation',
    docs: ['graph'],
    task: 'Draw a small UNDIRECTED graph with nodes x, y, z and edges x-y, y-z. Then, as a follow-up teaching beat, ADD a new node w connected to y (use the add_node and add_edge viz actions, not a new graph) and highlight the new node w as current.',
    semantic: (d, session) =>
      session.currentGraph?.directed === false &&
      has(d, (a) => a.action === 'add_node' && (a.params?.id === 'w' || a.params?.label === 'w')) &&
      has(d, (a) => a.action === 'add_edge') &&
      has(d, (a) => ['highlight_node', 'mark_current'].includes(a.action) && (a.params?.node === 'w' || a.params?.id === 'w')),
  },
  {
    name: 'multi-panel — two graphs, unambiguous targeting',
    docs: ['graph'],
    task: 'Create TWO graph panels side by side with ids "graph_left" (title "Original") and "graph_right" (title "Reversed"). You cannot run algorithms here, so describe nothing — just highlight node a in the LEFT panel only, after setting up both panels. Use create_visualization (not create_graph) and target panels by id.',
    semantic: (d, session) =>
      Object.keys(session._panels).includes('graph_left') &&
      Object.keys(session._panels).includes('graph_right') &&
      has(d, (a) => a.renderer === 'graph_left'),
  },
];

describe.skipIf(!ENABLED)('on-the-fly viz — live model accuracy eval', () => {
  for (const sc of SCENARIOS) {
    it(sc.name, async () => {
      const { session, delivered, supplied, hardFailures } = await runScenario({
        task: sc.task,
        rendererDocs: buildRendererDocs(sc.docs),
        session: sc.session ? sc.session() : undefined,
        tools: sc.tools,
        maxTurns: sc.maxTurns,
      });

      TALLY.scenarios++;
      TALLY.supplied += supplied;
      TALLY.delivered += delivered.length;
      TALLY.hardFailures += hardFailures;

      const semanticOk = sc.semantic(delivered, session);
      if (semanticOk) TALLY.semanticPasses++;

      // eslint-disable-next-line no-console
      console.log(
        `[onTheFly] ${sc.name}: supplied=${supplied} delivered=${delivered.length} ` +
        `hardFailures=${hardFailures} semantic=${semanticOk ? 'PASS' : 'FAIL'}` +
        (semanticOk ? '' : ` — delivered actions: ${JSON.stringify(delivered.map((a) => `${a.renderer}/${a.action}`))}`),
      );

      if (sc.requiresActions !== false) {
        expect(supplied, 'model never attempted any viz_actions').toBeGreaterThan(0);
      }
      expect(semanticOk, `scenario did not produce the intended picture. Delivered: ${JSON.stringify(delivered, null, 1).slice(0, 1500)}`).toBe(true);
    }, 240000);
  }

  it('aggregate: delivered/supplied accuracy ≥ 95% across all scenarios', () => {
    const acc = TALLY.supplied === 0 ? 0 : TALLY.delivered / TALLY.supplied;
    // eslint-disable-next-line no-console
    console.log(
      `[onTheFly AGGREGATE] supplied=${TALLY.supplied} delivered=${TALLY.delivered} ` +
      `accuracy=${(acc * 100).toFixed(1)}% hardFailures=${TALLY.hardFailures} ` +
      `semantic=${TALLY.semanticPasses}/${TALLY.scenarios}`,
    );
    expect(acc).toBeGreaterThanOrEqual(0.95);
  });
});

// ── Tier 2 live authoring (always-viz ladder) ───────────────────────────────
// Exercises the real authorAgent → sandbox → correctness-gate path for an
// off-registry pattern key, exactly as start_leetcode's Tier 2 rung invokes it.
describe.skipIf(!ENABLED)('viz Tier 2 — live trace authoring for an off-registry pattern', () => {
  it('authors a correct, mappable trace for product_except_self', async () => {
    const { runAlgorithmWithFallback } = await import('./algorithms/registry.js');
    const { validateVizActionSchemas } = await import('./vizValidator.js');

    const result = await runAlgorithmWithFallback(
      'product_except_self',
      { nums: [1, 2, 3, 4] },
      { description: 'Product of Array Except Self', expectedOutput: '[24,12,8,6]' },
    );

    expect(result.tier).toBe(2);
    expect(result.trace.length).toBeGreaterThanOrEqual(3);

    // Correctness: the result step's output must match Example 1.
    const resultStep = [...result.trace].reverse().find((s) => s.type === 'result');
    expect(resultStep?.output?.replace(/\s/g, '')).toBe('[24,12,8,6]');

    // Every embedded viz_action must pass the manifest schema validation the
    // emit_segment ladder applies (lenient mode, panels as run_algorithm registers them).
    const panels = {
      algorithm_state: { renderer: 'context', type: 'context' },
      [result.renderer]: { renderer: result.renderer, type: 'renderer' },
    };
    let checked = 0;
    for (const [idx, step] of result.trace.entries()) {
      if (!Array.isArray(step.viz_actions) || step.viz_actions.length === 0) continue;
      const { valid, errors } = validateVizActionSchemas(step.viz_actions, panels, { lenientUnknownRenderer: true });
      checked += step.viz_actions.length;
      expect(errors, `step ${idx} embedded actions invalid: ${errors.join('; ')}`).toHaveLength(0);
      expect(valid.length).toBe(step.viz_actions.length);
    }
    // eslint-disable-next-line no-console
    console.log(`[tier2 AUTHOR] renderer=${result.renderer} steps=${result.trace.length} embeddedActionsChecked=${checked}`);
  }, 240000);
});

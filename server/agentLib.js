// Shared agent utilities — used by agent.js, guidedAgent.js, and explainAgent.js

import Anthropic from '@anthropic-ai/sdk';
import { tools } from './tools.js';
import { runAlgorithmWithFallback, ALGORITHMS } from './algorithms/registry.js';
import { validateAlgorithmInput } from './algorithms/validateInput.js';
import { adaptAlgorithmInput } from './algorithms/adaptInput.js';
import { synthesizeAndStream, resetTTSDisabled } from './tts.js';
import { mapTraceStep } from './vizMapper.js';
import { validateVizActionSchemas } from './vizValidator.js';
import { getDefaultContextPanels } from './contextPanelDefaults.js';
import { layoutGrid, autoLayout } from './graphLayout.js';

// Proxy that always reads session.ws dynamically, so agent loops survive WS reconnects
export function liveWs(session) {
  return new Proxy({}, {
    get(_, prop) {
      const target = session.ws;
      return typeof target[prop] === 'function' ? target[prop].bind(target) : target[prop];
    }
  });
}

const defaultAnthropicClient = new Anthropic({ maxRetries: 5 });
export function getClient(session) {
  return session?.anthropicClient || defaultAnthropicClient;
}

export function sendJSON(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// STUCK COMPANION MODE self-report (eng D2). Pulls the optional pacing fields off a
// tool call's input. Returns null when none are present (non-companion turns), so the
// outgoing WS message stays clean for every other mode. The client reads this to post
// precise funnel events (nudge_given, key-insight reveal) instead of guessing from viz.
export function companionSelfReport(input) {
  if (!input) return null;
  const { learner_state, specificity_level, reveals_key_insight, offer_made, escalation_consented } = input;
  if (learner_state == null && specificity_level == null && reveals_key_insight == null
    && offer_made == null && escalation_consented == null) return null;
  return {
    learner_state: learner_state ?? null,
    specificity_level: specificity_level ?? null,
    reveals_key_insight: reveals_key_insight === true,
    // Consent-contract audit fields (2026-06-12): offer_made marks an explicit
    // escalation offer; escalation_consented marks a specificity rise the student
    // licensed (ask / accepted offer / give-up).
    offer_made: offer_made === true,
    escalation_consented: escalation_consented === true,
  };
}

export function sendBinary(ws, buffer) {
  if (ws.readyState === ws.OPEN) {
    ws.send(buffer, { binary: true });
  }
}

// Server-side companion_turn analytics (consent-gating review 2026-06-12, T3).
// PostHog HTTP capture from the server: the client funnel lives in an iframe on
// leetcode.com (storage-partitioned, adblock-exposed), while the server already
// holds the self-report in hand — so the audit trail of the consent contract is
// emitted here. Fire-and-forget: telemetry must never block or fail a teaching
// turn. Rows are emitted even when the model omitted its self-report — absence
// of the report is itself a metric (self_report_present=false).
// The pre-registered readout over these rows lives in TODOS.md §"Consent-gating readout".
export function emitCompanionTurn(session, report, turnKind) {
  // Env read per-call (not module-load) so tests can exercise the emitter and a
  // missing key degrades to a silent no-op rather than a crash.
  const POSTHOG_KEY = process.env.POSTHOG_KEY || process.env.VITE_POSTHOG_KEY;
  const POSTHOG_HOST = process.env.POSTHOG_HOST || process.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
  if (!session?.companionMode || !POSTHOG_KEY) return;
  session._companionTurnIndex = (session._companionTurnIndex || 0) + 1;
  if (!session.userId && !session._companionAnonId) {
    session._companionAnonId = `anon-companion-${globalThis.crypto.randomUUID()}`;
  }
  const body = {
    api_key: POSTHOG_KEY,
    event: 'companion_turn',
    distinct_id: session.userId || session._companionAnonId,
    properties: {
      turn_index: session._companionTurnIndex,
      turn_kind: turnKind, // 'reply' | 'segment'
      self_report_present: report != null,
      learner_state: report?.learner_state ?? null,
      specificity_level: report?.specificity_level ?? null,
      reveals_key_insight: report?.reveals_key_insight ?? null,
      offer_made: report?.offer_made ?? null,
      escalation_consented: report?.escalation_consented ?? null,
      algorithm_key: session._leetcodeAlgorithmKey ?? null,
    },
  };
  fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((err) => console.warn(`[Companion] companion_turn emit failed (non-blocking): ${err.message}`));
}

// index.js routes the client's `highlight_result` WS message here (page-highlight
// ack, eng review 2026-06-09 D2/D9). The id check is the correlation guard: a late
// ack from a timed-out highlight must be DROPPED, never resolve a newer call's
// promise. Returns true when a pending call was resolved.
export function resolveHighlightResult(session, msg) {
  const pending = session._highlightResolver;
  if (!pending || msg?.id !== pending.id) return false;
  session._highlightResolver = null;
  pending.resolve({ anchored: msg.anchored, method: msg.method ?? null, visible: msg.visible === true });
  return true;
}

// end_session / disconnect cleanup — mirrors the pauseResolver/guidedResponseResolver
// pattern in index.js: a pending highlight await must not dangle into a dead session.
export function abortHighlightWait(session) {
  if (!session._highlightResolver) return;
  const pending = session._highlightResolver;
  session._highlightResolver = null;
  pending.resolve({ anchored: 'unknown', aborted: true });
}

// Registry of declared panels (both renderer and context).
// Call whenever create_visualization or create_graph sends panels to the client.
export function registerPanels(session, panels, contextPanels) {
  if (!session._panels) session._panels = {};
  for (const p of (panels || [])) {
    const id = p.id || p.renderer;
    if (id) session._panels[id] = { renderer: p.renderer, type: 'renderer' };
  }
  for (const p of (contextPanels || [])) {
    if (p.id) session._panels[p.id] = { renderer: 'context', type: 'context' };
  }
}

// Validate viz_actions against the panel registry.
// Returns { valid, warnings } — actions targeting unknown panels are stripped.
//
// RENDERER-TYPE ALIAS (the recurring blank-viz fix): panels are often registered under
// a custom id (e.g. "array_main" from build_example_graph), but the emit_segment tool
// description explicitly tells the model it MAY target a single-panel layout by its bare
// renderer type ("array"). The trace-driven paths rewrite type→id via _rendererPanelId,
// but the agent's OWN improvised viz_actions used to come straight here and get stripped
// ("renderer 'array' not declared") → blank panel. So when a bare renderer type matches
// exactly ONE registered panel of that type, we alias it to that panel's id instead of
// dropping it. Ambiguous (>1 panel of the type) still warns — the model must disambiguate.
export function validatePanelIds(actions, panels) {
  const valid = [];
  const warnings = [];
  const idsByRenderer = {};
  for (const [id, p] of Object.entries(panels || {})) {
    if (p?.type === 'renderer') (idsByRenderer[p.renderer] ||= []).push(id);
  }
  for (const action of actions) {
    const renderer = action.renderer;
    if (!renderer) { valid.push(action); continue; }
    if (renderer === 'context') {
      const panelId = action.params?.panel_id;
      if (panelId && !panels[panelId]) {
        warnings.push(`context update targets unknown panel '${panelId}'`);
        continue;
      }
      valid.push(action);
      continue;
    }
    if (panels[renderer]) { valid.push(action); continue; } // exact id / registered match
    // No exact match — alias a bare renderer type to its sole registered panel id.
    const candidates = idsByRenderer[renderer] || [];
    if (candidates.length === 1) {
      valid.push({ ...action, renderer: candidates[0] });
      continue;
    }
    warnings.push(
      candidates.length > 1
        ? `renderer '${renderer}' is ambiguous (${candidates.length} panels: ${candidates.join(', ')}) — target a specific panel id`
        : `renderer '${renderer}' not declared in create_visualization`,
    );
  }
  return { valid, warnings };
}

// Validate agent-emitted viz_actions against the known graph.
// Returns { valid, warnings } — invalid actions are stripped and reported back to the agent.
// extraNodeIds: ids introduced outside the loaded graph (agent add_node calls, this batch
// or earlier segments) — legal targets even though they aren't in session.currentGraph.
function validateVizActions(actions, graph, extraNodeIds = new Set()) {
  const nodeIds = new Set([...graph.nodes.map(n => n.id), ...extraNodeIds]);
  // add_node in this same batch introduces ids that later actions in the batch may target
  for (const action of actions) {
    const p = action.params || action;
    if (action.action === 'add_node' && p.id) nodeIds.add(p.id);
  }
  const availableNodes = [...nodeIds].join(', ');
  const valid = [];
  const warnings = [];

  for (const action of actions) {
    const act = action.action;
    const p = action.params || action; // handle both flat and nested formats

    let warn = null;
    if (['highlight_node', 'mark_visited', 'mark_current', 'set_label'].includes(act)) {
      const id = p.node;
      if (id && !nodeIds.has(id)) warn = `${act}: node '${id}' not found (available: ${availableNodes})`;
    } else if (['highlight_edge', 'update_edge_label'].includes(act)) {
      const from = p.from, to = p.to;
      if (from && !nodeIds.has(from)) warn = `${act}: node '${from}' not found (available: ${availableNodes})`;
      else if (to && !nodeIds.has(to)) warn = `${act}: node '${to}' not found (available: ${availableNodes})`;
    } else if (act === 'show_path') {
      const path = p.path || [];
      const bad = path.filter(id => !nodeIds.has(id));
      if (bad.length > 0) warn = `show_path: nodes [${bad.join(', ')}] not found (available: ${availableNodes})`;
    }

    if (warn) {
      warnings.push(warn);
    } else {
      valid.push(action);
    }
  }
  return { valid, warnings };
}

/**
 * Restore saved graph state (original lesson graph) after an interrupt or Q&A example.
 * Replays all viz_actions that were emitted before the interrupt so the graph
 * doesn't appear blank.
 */
export async function restoreGraphState(session, ws) {
  if (!session._savedGraphState) {
    console.log('[restoreGraphState] no saved state, skipping');
    return;
  }
  const saved = session._savedGraphState;
  console.log(`[restoreGraphState] restoring: renderer=${saved.renderer}, ${saved.emittedTraceSteps?.length || 0} emitted steps, algorithm=${saved.algorithm}, vizType=${saved.lastVizMessage?.type}`);
  session.currentGraph = saved.graph;
  session._addedNodeIds = new Set();
  session.currentTrace = saved.trace;
  session.currentAlgorithm = saved.algorithm;
  session.currentRenderer = saved.renderer;
  session._rendererPanelId = saved.rendererPanelId || saved.renderer;
  session.mapperState = saved.mapperState;
  session._emittedTraceSteps = saved.emittedTraceSteps || [];
  session._lastVizMessage = saved.lastVizMessage || null;

  // Use the saved viz creation message (create_graph or create_visualization) to remount
  // the correct renderer. Fall back to create_graph if only graph data is available.
  const vizMessage = saved.lastVizMessage || (saved.graph ? { type: 'create_graph', graph: saved.graph } : null);

  if (vizMessage) {
    console.log('[restoreGraphState] re-sending viz creation message:', vizMessage.type);
    sendJSON(ws, vizMessage);

    // Wait for the frontend to process the viz creation and mount the renderer
    // before replaying viz actions — React state updates are async.
    await new Promise((r) => setTimeout(r, 300));

    // Determine the primary renderer to restore (from saved renderer or viz message)
    const primaryRenderer = saved.renderer ||
      (saved.lastVizMessage?.panels?.[0]?.renderer) || null;

    // Prefer trace-step replay when available (deterministic). Fall back to
    // viz_action history for renderers built via manual viz_actions (recursion_tree, interval, etc.)
    const hasTraceReplay = saved.emittedTraceSteps?.length > 0 && saved.trace;
    // History is keyed by panel ID (post-rewrite) when agent used a named panel; fall back to type
    const historyKey = saved.rendererPanelId || primaryRenderer;
    const vizHistory = historyKey ? (saved.rendererVizHistory?.[historyKey] ?? saved.rendererVizHistory?.[primaryRenderer]) : null;
    const hasVizHistory = vizHistory?.length > 0;

    const replayActions = [];

    if (hasTraceReplay) {
      const replayState = {};
      const rendererPanelId = saved.rendererPanelId;
      for (const idx of saved.emittedTraceSteps) {
        const step = saved.trace[idx];
        if (!step) continue;
        let { viz: vizActs, ctx: ctxActs } = mapTraceStep(
          saved.algorithm,
          saved.renderer,
          step,
          replayState
        );
        if (rendererPanelId && rendererPanelId !== saved.renderer) {
          vizActs = vizActs.map((act) =>
            act.renderer === saved.renderer ? { ...act, renderer: rendererPanelId } : act
          );
        }
        replayActions.push(...vizActs, ...ctxActs);
      }
    } else if (hasVizHistory) {
      replayActions.push(...vizHistory);
    }

    if (replayActions.length > 0) {
      console.log(`[restoreGraphState] replaying ${replayActions.length} actions via ${hasTraceReplay ? 'trace steps' : 'viz history'} for renderer=${primaryRenderer}`);
      sendJSON(ws, {
        type: 'segment_start',
        segment_id: 'restore_' + Math.random().toString(36).slice(2, 8),
        narration: '',
        viz_actions: replayActions,
        phase: '',
      });
      sendJSON(ws, { type: 'segment_end', segment_id: 'restore' });
    }
  } else {
    console.log('[restoreGraphState] no viz message in saved state, skipping renderer restore');
  }
  session._savedGraphState = null;
  console.log('[restoreGraphState] done, _savedGraphState cleared');
}

export async function handleToolCall(session, toolCall, graph, algorithm, source) {
  if (session.endSessionFlag) {
    throw new Error('__end_session__');
  }
  const ws = liveWs(session);
  const { name, input } = toolCall;

  switch (name) {
    case 'create_graph': {
      let graphData;
      if (input.variant_id && session.graphVariants?.[input.variant_id]) {
        const variant = session.graphVariants[input.variant_id];
        graphData = variant.graph;
        // Update panel title if variant has one
        if (variant.title) {
          sendJSON(ws, { type: 'update_panel_title', panel_id: Object.keys(session.graphs || {})[0] || 'graph_main', title: variant.title });
        }
      } else {
        graphData = {
          nodes: input.nodes || graph?.nodes || [],
          edges: input.edges || graph?.edges || [],
          positions: input.positions || graph?.positions,
          directed: input.directed !== undefined ? input.directed : (graph?.directed !== undefined ? graph?.directed : true),
        };
      }
      // Auto-layout if no positions provided
      if (!graphData.positions || Object.keys(graphData.positions).length === 0) {
        graphData.positions = autoLayout(graphData.nodes, graphData.edges, {});
      }
      sendJSON(ws, { type: 'create_graph', graph: graphData });
      session.currentGraph = graphData;
      session._addedNodeIds = new Set();
      session._lastVizMessage = { type: 'create_graph', graph: graphData };
      if (!session._rendererVizHistory) session._rendererVizHistory = {};
      session._rendererVizHistory['graph'] = [];
      // Also update in session.graphs for graph_id lookups
      if (session.graphs) {
        const panelId = Object.keys(session.graphs)[0] || 'graph';
        session.graphs[panelId] = graphData;
      }
      // Register only 'graph' server-side, matching what the client received via
      // this create_graph message. Previously we also registered the build_example_graph
      // custom-named panel id (e.g. 'graph_main') in session._panels, but the client
      // never received a create_visualization for that id — only the bare create_graph.
      // That asymmetry caused run_algorithm's _rendererPanelId lookup to find the
      // orphan custom id, set _rendererPanelId, and rewrite mapper-emitted actions to
      // a renderer the client doesn't have registered. Result: actions buffered as
      // unregistered. The named-id registration belongs in the create_visualization
      // handler (line 338), which DOES send the panel to the client.
      registerPanels(session, [{ id: 'graph', renderer: 'graph' }], []);
      return {
        success: true,
        message: input.variant_id
          ? `Graph swapped to variant "${input.variant_id}". ${session.graphVariants[input.variant_id]?.title || ''}`
          : 'Graph created and displayed to learner.',
      };
    }

    case 'update_graph': {
      if (!session.currentGraph) {
        session.currentGraph = {
          nodes: [],
          edges: [],
          positions: {},
          directed: input.directed !== undefined ? input.directed : true,
        };
      }
      const g = session.currentGraph;

      if (input.remove_nodes) {
        const removeSet = new Set(input.remove_nodes);
        g.nodes = g.nodes.filter((n) => !removeSet.has(n.id));
        g.edges = g.edges.filter((e) => !removeSet.has(e.source) && !removeSet.has(e.target));
        for (const id of input.remove_nodes) delete g.positions[id];
      }
      if (input.remove_edges) {
        for (const re of input.remove_edges) {
          g.edges = g.edges.filter((e) => !(e.source === re.source && e.target === re.target));
        }
      }
      if (input.add_nodes) {
        for (const node of input.add_nodes) {
          if (!g.nodes.some((n) => n.id === node.id)) {
            g.nodes.push({ id: node.id, label: node.label || node.id });
          }
        }
      }
      const skippedEdges = [];
      if (input.add_edges) {
        const nodeIdSet = new Set(g.nodes.map((n) => n.id));
        for (const edge of input.add_edges) {
          if (!nodeIdSet.has(edge.source) || !nodeIdSet.has(edge.target)) {
            skippedEdges.push(`${edge.source}->${edge.target}`);
            continue;
          }
          if (!g.edges.some((e) => e.source === edge.source && e.target === edge.target)) {
            g.edges.push(edge);
          }
        }
      }
      if (input.directed !== undefined) g.directed = input.directed;

      g.positions = autoLayout(g.nodes, g.edges, g.positions);
      sendJSON(ws, { type: 'create_graph', graph: g });
      session._lastVizMessage = { type: 'create_graph', graph: g };

      const skippedWarning = skippedEdges.length > 0
        ? ` WARNING: ${skippedEdges.length} edge(s) skipped because their nodes don't exist: ${skippedEdges.join(', ')}. Add those nodes first.`
        : '';
      return {
        success: skippedEdges.length === 0,
        node_count: g.nodes.length,
        edge_count: g.edges.length,
        message: `Graph updated: ${g.nodes.length} nodes, ${g.edges.length} edges. Displayed to student.${skippedWarning}`,
      };
    }

    case 'create_visualization': {
      console.log('[Agent] create_visualization panels:', JSON.stringify(input.panels));
      if (input.context_panels) {
        console.log('[Agent] context_panels:', JSON.stringify(input.context_panels));
      }
      const panels = input.panels || [];
      // Store graphs by panel ID and auto-layout positions if missing
      if (!session.graphs) session.graphs = {};
      for (const panel of panels) {
        if (panel.renderer === 'graph' && panel.config?.graph) {
          const g = panel.config.graph;
          if (!g.positions || Object.keys(g.positions).length === 0) {
            g.positions = autoLayout(g.nodes || [], g.edges || [], {});
          }
          const panelId = panel.id || 'graph';
          session.graphs[panelId] = g;
          // Keep backward compat: first graph panel is also currentGraph
          if (!session.currentGraph) session.currentGraph = g;
        }
      }
      const vizMsg = {
        type: 'create_visualization',
        panels: panels.map(p => ({ ...p, id: p.id, title: p.title })),
        context_panels: input.context_panels || [],
      };
      sendJSON(ws, vizMsg);
      registerPanels(session, panels, input.context_panels || []);
      // Only update _lastVizMessage / clear history when panels has a renderer
      if (panels.length > 0) {
        session._lastVizMessage = vizMsg;
        if (!session._rendererVizHistory) session._rendererVizHistory = {};
        for (const p of panels) {
          if (p.renderer) session._rendererVizHistory[p.renderer] = [];
        }
      }
      return { success: true, message: 'Visualization and context panels created and displayed to learner.' };
    }

    case 'run_algorithm': {
      const algo = input.algorithm || algorithm;
      const algoInfo = ALGORITHMS[algo];
      const graphId = input.graph_id || null;

      // Off-registry keys are only legal when they match this session's pattern key —
      // this replaces the typo protection the run_algorithm tool enum used to provide
      // (a hallucinated/misspelled key must not trigger a 20-60s authoring call).
      if (!algoInfo) {
        const sessionKeys = [session._leetcodePatternKey, session._leetcodeAlgorithmKey].filter(Boolean);
        if (!sessionKeys.includes(algo)) {
          return {
            error: `Unknown algorithm '${algo}'. Use a registered algorithm (${Object.keys(ALGORITHMS).join(', ')})` +
              (sessionKeys.length ? ` or this session's pattern key '${sessionKeys[0]}'.` : '.'),
          };
        }
      }

      {
        // Registry algorithms take the Tier 1 fast path inside runAlgorithmWithFallback;
        // off-registry keys (Tier 2 pattern keys) go through the author-agent fallback
        // (cache → generate → sandbox → correctness gate).
        try {
          const registryInput = { ...input.input };
          // For graph algorithms, only inject session/tool-call overrides when present.
          // Otherwise let the registry's defaultInput provide the correct graph/source/sink.
          if (algoInfo?.renderer === 'graph') {
            // Use graph_id-specific graph if available, else fall back to currentGraph
            const targetGraph = (graphId && session.graphs?.[graphId]) || session.currentGraph;
            if (targetGraph && !registryInput.graph) {
              registryInput.graph = targetGraph;
            }
            if (input.source && !registryInput.source) {
              registryInput.source = input.source;
            }
            if (input.sink) {
              registryInput.sink = input.sink;
            }
          }
          // Validate and adapt input against algorithm capabilities (registry only —
          // off-registry keys have no declared capabilities to validate against)
          let validation = { adaptations: [], warnings: [] };
          if (algoInfo) {
            validation = validateAlgorithmInput(algo, registryInput, session.modelContract);
            if (!validation.valid) {
              return { error: validation.errors.join('; '), warnings: validation.warnings };
            }
            if (validation.adaptations.length > 0) {
              adaptAlgorithmInput(algo, registryInput, validation.adaptations);
            }
          } else if (Object.keys(registryInput).length === 0 && session._leetcodeTestCase) {
            // Off-registry with no input from the agent: generated trace functions expect
            // the problem's own input shape — default to the parsed Example 1 test case.
            Object.assign(registryInput, session._leetcodeTestCase);
          }

          // Tier 2 pattern key: reuse the trace pre-run at start_leetcode. Regenerating
          // here would stall the lesson 20-60s (the generator may not have been cached —
          // e.g. output-format mismatch) and could produce a DIFFERENT trace than the one
          // lc_viz_ready already painted on the student's screen.
          const result = (!algoInfo && session._leetcodeTier === 2 && algo === session._leetcodeAlgorithmKey && Array.isArray(session._leetcodeTrace))
            ? { trace: session._leetcodeTrace, renderer: session._leetcodeRenderer, input: session._leetcodeInput || registryInput, tier: 2 }
            : await runAlgorithmWithFallback(algo, registryInput, { description: session._leetcodeTitle, expectedOutput: session._leetcodeExpectedOutput || null });
          console.log(`[Agent] run_algorithm '${algo}' returned ${result.trace.length} steps, renderer: ${result.renderer}, tier: ${result.tier}`);
          // Off-registry: renderer comes from the generated result, not a registry entry.
          const rendererType = algoInfo?.renderer || result.renderer;

          // ── Store trace on session for deterministic mapping ──
          session.currentTrace = result.trace;
          session.currentRenderer = result.renderer;
          session.currentAlgorithm = algo;
          session.mapperState = {};
          // Clear any stale renderer panel id from a prior algorithm run.
          // The graph/context branches below may not set this, so leaving a
          // stale value would cause emit_segment to rewrite this run's
          // viz_action renderers to the previous algorithm's panel id.
          session._rendererPanelId = null;
          // Multi-graph: also store trace/mapper keyed by graph_id
          if (graphId) {
            if (!session.traces) session.traces = {};
            if (!session.mapperStates) session.mapperStates = {};
            session.traces[graphId] = result.trace;
            session.mapperStates[graphId] = {};
          }

          // ── Auto-configure visualization + context panels ──
          let contextPanels = getDefaultContextPanels(algo);
          // Off-registry context traces embed viz_actions targeting 'algorithm_state' —
          // there's no PANEL_DEFAULTS entry for a pattern key, so register the panel here.
          if (!algoInfo && rendererType === 'context' && contextPanels.length === 0) {
            contextPanels = [{ id: 'algorithm_state', type: 'key_value', title: 'Algorithm State' }];
          }
          console.log(`[Agent] Auto-setup for '${algo}': renderer=${rendererType}, contextPanels=${contextPanels.map(p => p.id).join(',')}, sessionGraph=${!!session.currentGraph}`);

          // Notify frontend which algorithm is running (enables algorithm-specific UI like residual toggle).
          // Use 'algorithm_step' instead of 'lesson_start' to avoid wiping transcript/viz state.
          sendJSON(ws, { type: 'algorithm_step', algorithm: algo });

          if (algoInfo?.panels?.length > 0) {
            // Multi-panel registry declaration (median_finder, merge_k_sorted):
            // mount EVERY declared panel. The mapper targets these panel ids
            // explicitly, so _rendererPanelId stays null — a bare renderer-type
            // rewrite would be ambiguous with two panels of the same type.
            const autoVizMsg = {
              type: 'create_visualization',
              panels: algoInfo.panels.map(p => ({ id: p.id, renderer: p.renderer, title: p.title, config: {} })),
              context_panels: contextPanels,
            };
            sendJSON(ws, autoVizMsg);
            registerPanels(session, algoInfo.panels, contextPanels);
            session._lastVizMessage = autoVizMsg;
          } else if (rendererType === 'context') {
            // Context-only (Tier 2 hash map / data structure algorithms): no main viz panel
            const autoVizMsg = {
              type: 'create_visualization',
              panels: [],
              context_panels: contextPanels,
            };
            sendJSON(ws, autoVizMsg);
            registerPanels(session, [], contextPanels);
            session._lastVizMessage = autoVizMsg;
          } else if (rendererType === 'graph') {
            // Always send the graph for the current algorithm run.
            // Fall back to the trace's first step's graph for algorithms that
            // generate their graph dynamically from other input (trie, backtracking,
            // word_search, etc. — their defaultInput has no top-level `graph` field).
            // Some runners (number_of_islands, multi_source_bfs, dijkstra_k_stops,
            // backtracking) emit `nodes` and `edges` as TOP-LEVEL fields on
            // trace[0] rather than wrapping them in a `graph` object. Synthesize
            // a graph object from that shape so the client gets create_graph and
            // doesn't render an empty "context-mode-looking" panel.
            const firstStep = result.trace?.[0];
            const trace0Graph = firstStep?.graph
              || (firstStep?.nodes ? { nodes: firstStep.nodes, edges: firstStep.edges || [] } : null);
            const graphData = registryInput.graph
              || algoInfo?.defaultInput?.graph
              || trace0Graph;
            if (graphData) {
              const directed = graphData.directed !== undefined ? graphData.directed : true;
              // Normalize edge field names. Some trace producers (backtracking) emit
              // {from, to} edges; the client GraphRenderer reads {source, target} and
              // cytoscape hard-crashes on an edge with undefined source ("Can not
              // create edge undefined-undefined"). Same synthesis path that previously
              // shipped position-less graphs — normalize EVERYTHING here, like the
              // create_graph/update_graph tool paths do.
              const edges = (graphData.edges || []).map((e) => {
                const { from, to, ...rest } = e;
                return { ...rest, source: e.source ?? from, target: e.target ?? to };
              });
              // Synthesize node positions when the trace didn't supply them. The
              // client's cytoscape uses a 'preset' layout — it never auto-lays-out —
              // so a graph with no positions collapses every node onto (0,0) and
              // renders as a single stacked blob. Mirror the create_graph /
              // update_graph / create_visualization tool paths, which all autoLayout.
              let positions = graphData.positions;
              if (!positions || Object.keys(positions).length === 0) {
                // Seed from any per-node coords (e.g. backtracking's node.position);
                // autoLayout fills in whatever ids are still missing.
                const seed = {};
                for (const n of graphData.nodes || []) {
                  if (n.position) seed[n.id] = n.position;
                }
                positions = autoLayout(graphData.nodes || [], edges, seed);
              }
              const finalGraph = { ...graphData, edges, positions, directed };
              console.log(`[Agent] Auto-creating graph: ${finalGraph.nodes?.length} nodes, directed=${directed}`);
              const autoGraphMsg = { type: 'create_graph', graph: finalGraph };
              sendJSON(ws, autoGraphMsg);
              session.currentGraph = finalGraph;
              session._addedNodeIds = new Set();
              session._lastVizMessage = autoGraphMsg;
            }
            // If the agent pre-registered a custom-named graph panel (e.g. 'graph_main'
            // from build_example_graph), point _rendererPanelId at it so emit_segment
            // rewrites mapper-emitted 'graph' actions to that panel id. Without this,
            // mapper actions buffer as unregistered renderer 'graph' on the client.
            const existingGraphEntry = Object.entries(session._panels || {}).find(
              ([id, p]) => p.renderer === 'graph' && p.type === 'renderer' && id !== 'graph'
            );
            if (existingGraphEntry) {
              session._rendererPanelId = existingGraphEntry[0];
            } else {
              // No custom panel: mirror the client's create_graph effect by registering
              // 'graph' server-side too. Without this, panel-id validation strips
              // legitimate viz_actions targeting the graph and emit_segment can't
              // verify routing.
              registerPanels(session, [{ id: 'graph', renderer: 'graph' }], []);
            }
            // Send context panels via create_visualization
            if (contextPanels.length > 0) {
              sendJSON(ws, {
                type: 'create_visualization',
                panels: [],
                context_panels: contextPanels,
              });
              registerPanels(session, [], contextPanels);
            }
          } else {
            // Non-graph: auto-send create_visualization with renderer + context panels.
            // If the agent already called create_visualization with a named panel id (e.g.
            // "array_main" from build_example_graph), reuse that id so we don't replace
            // the named panel with an id-less one that the client auto-ids as the renderer
            // type (e.g. "array") — which would break subsequent viz_actions targeting the
            // original name.
            const existingEntry = Object.entries(session._panels || {}).find(
              ([, p]) => p.renderer === rendererType && p.type === 'renderer'
            );
            const rendererPanelId = existingEntry ? existingEntry[0] : rendererType;
            // Store so emit_segment can rewrite Tier 2 viz_action renderer targets
            session._rendererPanelId = rendererPanelId;
            const autoVizMsg = {
              type: 'create_visualization',
              // If the agent already registered a named panel (e.g. 'string_main'), send
              // panels:[] so the client preserves the existing mounted panel rather than
              // remounting it — which would strip its title and reset renderer state.
              panels: existingEntry ? [] : [{ id: rendererPanelId, renderer: rendererType, config: {} }],
              context_panels: contextPanels,
            };
            sendJSON(ws, autoVizMsg);
            registerPanels(session, existingEntry ? [] : [{ id: rendererPanelId, renderer: rendererType }], contextPanels);
            if (!existingEntry) session._lastVizMessage = autoVizMsg;
            if (!session._rendererVizHistory) session._rendererVizHistory = {};
            session._rendererVizHistory[rendererType] = [];
          }

          const panelNames = contextPanels.map((p) => p.id);
          const tier2Note = result.tier === 2 ? ' The trace was AI-generated — each step has embedded viz_actions that update the panels automatically.' : '';
          const contextNote = rendererType === 'context' ? ' Context-only algorithm: no main visualization panel. Use trace_step_indices to drive context panel updates via the embedded viz_actions in each step.' : '';
          return {
            success: true,
            algorithm: algo,
            renderer: result.renderer,
            trace: result.trace,
            step_count: result.trace.length,
            source: registryInput.source,
            visualization_auto_configured: true,
            context_panels: panelNames,
            tier: result.tier,
            capabilities: algoInfo?.capabilities || {},
            adaptations_applied: validation.adaptations,
            warnings: validation.warnings,
            message: `Algorithm executed. Visualization and context panels auto-configured. Use emit_segment with trace_step_indices to teach. You have ${result.trace.length} trace steps available (indices 0 to ${result.trace.length - 1}).${tier2Note}${contextNote}`,
          };
        } catch (err) {
          return { error: err.message };
        }
      }
    }

    case 'emit_segment': {
      const segmentId = Math.random().toString(36).slice(2, 8);
      const emitGraphId = input.graph_id || null;

      // ── Track emitted trace steps for graph state replay on restore ──
      if (input.trace_step_indices && input.trace_step_indices.length > 0) {
        if (!session._emittedTraceSteps) session._emittedTraceSteps = [];
        session._emittedTraceSteps.push(...input.trace_step_indices);
      }

      // ── Resolve trace and mapper state (graph_id-specific or default) ──
      const activeTrace = (emitGraphId && session.traces?.[emitGraphId]) || session.currentTrace;
      const activeMapperState = (emitGraphId && session.mapperStates?.[emitGraphId]) || session.mapperState;

      // ── Build viz_actions from trace_step_indices (deterministic mapper) ──
      let allVizActions = [];
      const mapperWarnings = [];
      if (input.trace_step_indices && input.trace_step_indices.length > 0 && activeTrace) {
        for (const idx of input.trace_step_indices) {
          const step = activeTrace[idx];
          if (!step) {
            console.warn(`[Agent] trace_step_indices: index ${idx} out of bounds (trace has ${activeTrace.length} steps)`);
            mapperWarnings.push(`index ${idx} out of bounds (trace has ${activeTrace.length} steps)`);
            continue;
          }
          // Tier 2 traces embed viz_actions directly in each step.
          // Rewrite renderer type → named panel ID when the agent gave the panel a
          // custom ID (e.g. 'string_main' instead of 'string') so the client registry
          // can find it.
          if (step.viz_actions && Array.isArray(step.viz_actions) && step.viz_actions.length > 0) {
            const rendererType = session.currentRenderer;
            const panelId = session._rendererPanelId;
            let actions = step.viz_actions;
            if (panelId && rendererType && panelId !== rendererType) {
              actions = actions.map((act) =>
                act.renderer === rendererType ? { ...act, renderer: panelId } : act
              );
            }
            // Tier 2 traces are AI-authored — schema-check their embedded actions
            // against the manifest. Lenient on unknown renderers (panel registry may
            // not cover every Tier 2 panel) but strict on action names/params.
            const { valid: t2Valid, errors: t2Errors } = validateVizActionSchemas(
              actions, session._panels || {}, { lenientUnknownRenderer: true });
            if (t2Errors.length > 0) {
              console.warn(`[Agent] Tier 2 step ${idx} embedded viz_action errors:`, t2Errors);
              mapperWarnings.push(...t2Errors.map((e) => `trace step ${idx}: ${e}`));
            }
            allVizActions.push(...t2Valid);
            continue;
          }
          const { viz: vizActs, ctx: ctxActs } = mapTraceStep(
            session.currentAlgorithm,
            session.currentRenderer,
            step,
            activeMapperState
          );
          if (vizActs.length === 0 && ctxActs.length === 0) {
            mapperWarnings.push(`step ${idx} (type: '${step.type}') produced 0 viz/ctx actions for renderer '${session.currentRenderer}' — this step may not be handled by the mapper`);
          }
          // Rewrite renderer targets for multi-graph: 'graph' → graph_id
          if (emitGraphId) {
            for (const act of vizActs) {
              if (act.renderer === 'graph') act.renderer = emitGraphId;
            }
          }
          // Rewrite renderer type → named panel ID (Tier 1 mapper hardcodes the type)
          const t1RendererType = session.currentRenderer;
          const t1PanelId = session._rendererPanelId;
          if (t1PanelId && t1RendererType && t1PanelId !== t1RendererType) {
            for (const act of vizActs) {
              if (act.renderer === t1RendererType) act.renderer = t1PanelId;
            }
          }
          allVizActions.push(...vizActs, ...ctxActs);
        }
      } else if (input.trace_step_indices && !activeTrace) {
        console.warn('[Agent] trace_step_indices provided but no trace on session — was run_algorithm called?');
        mapperWarnings.push('trace_step_indices provided but no trace on session — was run_algorithm called?');
      }
      // Merge any explicit viz_actions from agent (manual path — model-authored, so this
      // is where the full validation ladder runs: panel registry → manifest schema →
      // graph node ids). Invalid actions are stripped with precise errors; if EVERYTHING
      // the model supplied is invalid (and no trace actions carry the segment), the tool
      // call FAILS so the model corrects and retries instead of the student watching
      // narration point at a blank panel.
      const traceActionCount = allVizActions.length;
      let manualAccepted = 0;
      if (input.viz_actions && input.viz_actions.length > 0) {
        let actionsToProcess = input.viz_actions;
        const allActionWarnings = [];

        // 1. Panel registry validation — alias bare types, strip unknown panels/IDs
        if (session._panels) {
          const { valid: panelValid, warnings: panelWarnings } = validatePanelIds(actionsToProcess, session._panels);
          if (panelWarnings.length > 0) {
            console.warn('[Agent] panel registry warnings:', panelWarnings);
          }
          allActionWarnings.push(...panelWarnings);
          actionsToProcess = panelValid;
        }

        // 2. Manifest schema validation — action names + param types (vizValidator.js).
        //    Repairs safe near-misses, coerces types, normalizes to nested params.
        const { valid: schemaValid, errors: schemaErrors } = validateVizActionSchemas(
          actionsToProcess, session._panels || {});
        if (schemaErrors.length > 0) {
          console.warn('[Agent] viz_action schema errors:', schemaErrors);
        }
        allActionWarnings.push(...schemaErrors);
        actionsToProcess = schemaValid;

        // 3. Node/edge ID validation against the current graph (graph renderer only).
        //    Ids introduced by accepted add_node actions (this batch or earlier
        //    segments) are legal targets.
        const graph = session.currentGraph;
        if (graph?.nodes?.length > 0) {
          if (!session._addedNodeIds) session._addedNodeIds = new Set();
          const { valid, warnings } = validateVizActions(actionsToProcess, graph, session._addedNodeIds);
          if (warnings.length > 0) {
            console.warn('[Agent] viz_action node warnings:', warnings);
          }
          allActionWarnings.push(...warnings);
          for (const act of valid) {
            const p = act.params || act;
            if (act.action === 'add_node' && p.id) session._addedNodeIds.add(p.id);
          }
          allVizActions.push(...valid);
          manualAccepted = valid.length;
        } else {
          // No graph loaded — non-graph renderers (array, table, recursion_tree, …)
          allVizActions.push(...actionsToProcess);
          manualAccepted = actionsToProcess.length;
        }

        session._lastVizWarnings = allActionWarnings;

        // Loud failure: every supplied action was rejected and nothing else carries
        // the segment. Reject the call — the errors below are precise enough to fix.
        if (manualAccepted === 0 && traceActionCount === 0) {
          const errs = session._lastVizWarnings;
          session._lastVizWarnings = [];
          return {
            success: false,
            message:
              `Segment NOT delivered — every viz_action was invalid: ${errs.join('; ')}. ` +
              'Fix the actions per the renderer documentation and call emit_segment again with the same narration.',
          };
        }
      }

      // Track viz_actions per renderer for state restoration (non-trace-step renderers like recursion_tree, interval, tree)
      if (allVizActions.length > 0) {
        if (!session._rendererVizHistory) session._rendererVizHistory = {};
        for (const act of allVizActions) {
          const r = act.renderer;
          if (r && r !== 'context') {
            if (!session._rendererVizHistory[r]) session._rendererVizHistory[r] = [];
            session._rendererVizHistory[r].push(act);
          }
        }
      }

      // Extract residual toggle actions and send as separate message
      const toggleAction = allVizActions.find(a => (a.action || a.params?.action) === 'toggle_residual');
      if (toggleAction) {
        const show = toggleAction.show ?? toggleAction.params?.show ?? true;
        sendJSON(ws, { type: 'residual_toggle', show });
        allVizActions = allVizActions.filter(a => (a.action || a.params?.action) !== 'toggle_residual');
      }

      if (allVizActions.length === 0 && input.narration) {
        console.warn(`[Agent] emit_segment has narration but NO viz_actions (trace_step_indices: ${JSON.stringify(input.trace_step_indices)}, viz_actions: ${input.viz_actions?.length || 0})`);
      }
      console.log(`[Agent] emit_segment viz_actions (${allVizActions.length}, trace_steps: ${input.trace_step_indices?.length || 0}):`, JSON.stringify(allVizActions).slice(0, 500));

      {
        const companionReport = companionSelfReport(input);
        emitCompanionTurn(session, companionReport, 'segment');
        sendJSON(ws, {
          type: 'segment_start',
          segment_id: segmentId,
          narration: input.narration,
          viz_actions: allVizActions,
          phase: input.phase || '',
          companion: companionReport,
        });
      }

      // TTS or simulated delay (synthesizeAndStream waits for playback to finish)
      session.interruptAbortFlag = false;
      const sendBinaryFn = (buffer) => sendBinary(ws, buffer);
      const sendJsonFn = (obj) => sendJSON(ws, obj);
      const ttsResult = await synthesizeAndStream(sendBinaryFn, input.narration, session.speedMultiplier, sendJsonFn, () => session.pauseFlag || session.skipFlag || session.interruptAbortFlag, session.ttsMuted);
      if (ttsResult?.ttsAutoDisabled && !session._ttsDisabledNotified) {
        session._ttsDisabledNotified = true;
        sendJSON(ws, { type: 'tts_auto_disabled', message: 'Voice narration temporarily unavailable. Continuing with text only.' });
      }

      if (ttsResult?.aborted || session.pauseFlag || session.skipFlag || session.interruptAbortFlag) {
        sendJSON(ws, { type: 'audio_flush' });
        sendJSON(ws, { type: 'segment_end', segment_id: segmentId });

        // Skip takes priority over pause — advance immediately without pausing
        if (session.skipFlag) {
          session.skipFlag = false;
          session.pauseFlag = false;
          if (session.endSessionFlag) throw new Error('__end_session__');
          return {
            success: true,
            message: 'Segment skipped. Continue with the next segment.',
          };
        }

        // Interrupt abort — TTS stopped because student sent a message, continue normally
        if (session.interruptAbortFlag) {
          session.interruptAbortFlag = false;
          if (session.endSessionFlag) throw new Error('__end_session__');
          return {
            success: true,
            message: 'Segment interrupted by student message. Continue.',
          };
        }

        // Pause was pressed during or after TTS
        session.pauseFlag = false;
        if (session.endSessionFlag) throw new Error('__end_session__');
        sendJSON(ws, { type: 'paused' });
        await new Promise((resolve) => { session.pauseResolver = resolve; });
        session.pauseResolver = null;
        if (session.endSessionFlag) throw new Error('__end_session__');
        if (!session.interruptFlag) {
          sendJSON(ws, { type: 'resumed' });
        }
        return {
          success: true,
          message: 'Segment interrupted by pause. Resumed.',
        };
      }

      // Small buffer between segments for natural pacing (skippable)
      if (session.skipFlag) {
        session.skipFlag = false;
        sendJSON(ws, { type: 'segment_end', segment_id: segmentId });
        return { success: true, message: 'Segment skipped during gap. Continue with the next segment.' };
      }
      const gapMs = 300 / session.speedMultiplier;
      await new Promise((resolve) => setTimeout(resolve, gapMs));

      sendJSON(ws, { type: 'segment_end', segment_id: segmentId });

      const vizWarnings = session._lastVizWarnings || [];
      session._lastVizWarnings = [];
      const allWarnings = [
        ...vizWarnings.map(w => `invalid viz_action: ${w}`),
        ...mapperWarnings,
      ];
      const warningText = allWarnings.length > 0
        ? ` WARNINGS: ${allWarnings.join('; ')}`
        : '';
      return {
        success: true,
        message: `Segment delivered. Narration played and animations applied.${warningText}`,
      };
    }

    case 'respond_to_interrupt': {
      // Auto-cleanup any leftover illustration from a previous interrupt
      if (session._illustrationActive) {
        console.warn('[respond_to_interrupt] previous illustration not ended, auto-restoring');
        session._illustrationActive = false;
        sendJSON(ws, { type: 'explanation_complete' });
        await restoreGraphState(session, ws);
      }

      // Validate mode-specific object is present before committing — once interrupt_response
      // is sent the client has already applied the mode, so catch malformed input here
      if (input.explanation_mode === 'overlay' && !input.overlay) {
        return { success: false, message: 'overlay mode requires the "overlay" property. Please retry with the overlay object populated.' };
      }
      if (input.explanation_mode === 'rewind' && (!input.rewind || !Array.isArray(input.rewind?.narration_per_step) || input.rewind.narration_per_step.length === 0)) {
        return { success: false, message: 'rewind mode requires a "rewind" object with steps_back (number) and narration_per_step (non-empty array of strings). Please retry with the correct structure.' };
      }
      if (input.explanation_mode === 'ghost_alternative' && !input.ghost_alternative) {
        return { success: false, message: 'ghost_alternative mode requires the "ghost_alternative" property. Please retry with the ghost_alternative object populated.' };
      }
      if (input.explanation_mode === 'illustrate') {
        if (!input.illustrate?.graph?.nodes?.length) {
          return {
            success: false,
            message: 'illustrate mode requires the "illustrate" property with "graph" (containing nodes and edges). Please retry with the full illustrate object, or use explanation_mode "none" with a verbal explanation.',
          };
        }
      }

      // Validate model-supplied viz payloads before the client applies them.
      const interruptVizWarnings = [];
      let interruptVizActions = input.viz_actions || [];
      if (interruptVizActions.length > 0) {
        const { valid: pValid, warnings: pWarn } = validatePanelIds(interruptVizActions, session._panels || {});
        const { valid: sValid, errors: sErr } = validateVizActionSchemas(pValid, session._panels || {});
        interruptVizWarnings.push(...pWarn, ...sErr);
        interruptVizActions = sValid;
      }
      let interruptOverlay = input.overlay || null;
      if (interruptOverlay && session.currentGraph?.nodes?.length > 0) {
        const nodeIds = new Set([
          ...session.currentGraph.nodes.map((n) => n.id),
          ...(session._addedNodeIds || []),
        ]);
        if (Array.isArray(interruptOverlay.spotlight_nodes)) {
          const bad = interruptOverlay.spotlight_nodes.filter((n) => !nodeIds.has(n));
          if (bad.length > 0) {
            interruptVizWarnings.push(`overlay spotlight_nodes not in graph: [${bad.join(', ')}] (available: ${[...nodeIds].join(', ')})`);
            interruptOverlay = {
              ...interruptOverlay,
              spotlight_nodes: interruptOverlay.spotlight_nodes.filter((n) => nodeIds.has(n)),
            };
          }
        }
        if (Array.isArray(interruptOverlay.spotlight_edges)) {
          const bad = interruptOverlay.spotlight_edges.filter((e) => !nodeIds.has(e?.from) || !nodeIds.has(e?.to));
          if (bad.length > 0) {
            interruptVizWarnings.push(`overlay spotlight_edges reference unknown nodes: ${JSON.stringify(bad).slice(0, 120)}`);
            interruptOverlay = {
              ...interruptOverlay,
              spotlight_edges: interruptOverlay.spotlight_edges.filter((e) => nodeIds.has(e?.from) && nodeIds.has(e?.to)),
            };
          }
        }
      }
      if (interruptVizWarnings.length > 0) {
        console.warn('[respond_to_interrupt] viz warnings:', interruptVizWarnings);
      }
      const interruptWarningText = interruptVizWarnings.length > 0
        ? ` WARNINGS (invalid viz stripped): ${interruptVizWarnings.join('; ')}`
        : '';

      sendJSON(ws, {
        type: 'interrupt_response',
        answer: input.answer,
        explanation_mode: input.explanation_mode || 'none',
        overlay: interruptOverlay,
        rewind: input.rewind || null,
        ghost_alternative: input.ghost_alternative || null,
        illustrate: input.illustrate || null,
        viz_actions: interruptVizActions,
      });

      const sendBinaryFn = (buffer) => sendBinary(ws, buffer);
      const sendJsonFn = (obj) => sendJSON(ws, obj);
      console.log(`[respond_to_interrupt] TTS start — pauseFlag=${session.pauseFlag}, skipFlag=${session.skipFlag}, ttsMuted=${session.ttsMuted}, interruptAbortFlag=${session.interruptAbortFlag}`);
      const ttsResult = await synthesizeAndStream(sendBinaryFn, input.answer, session.speedMultiplier, sendJsonFn, () => session.pauseFlag || session.skipFlag, session.ttsMuted);
      console.log(`[respond_to_interrupt] TTS end — result=${JSON.stringify(ttsResult)}, pauseFlag=${session.pauseFlag}, skipFlag=${session.skipFlag}`);
      if (ttsResult?.ttsAutoDisabled && !session._ttsDisabledNotified) {
        session._ttsDisabledNotified = true;
        sendJSON(ws, { type: 'tts_auto_disabled', message: 'Voice narration temporarily unavailable. Continuing with text only.' });
      }

      // Handle skip/pause — either TTS was aborted, or pause arrived after TTS finished
      if (ttsResult?.aborted || session.pauseFlag || session.skipFlag) {
        sendJSON(ws, { type: 'audio_flush' });

        if (session.skipFlag) {
          session.skipFlag = false;
          session.pauseFlag = false;
          if (session.endSessionFlag) throw new Error('__end_session__');
          // Skip past the rest of this interrupt response
        } else {
          session.pauseFlag = false;
          if (session.endSessionFlag) throw new Error('__end_session__');
          sendJSON(ws, { type: 'paused' });
          await new Promise((resolve) => { session.pauseResolver = resolve; });
          session.pauseResolver = null;
          if (session.endSessionFlag) throw new Error('__end_session__');
          if (!session.interruptFlag) {
            sendJSON(ws, { type: 'resumed' });
          }
        }
      }

      // If rewind mode, also narrate each replayed step
      if (input.explanation_mode === 'rewind' && input.rewind?.narration_per_step) {
        for (const stepNarration of input.rewind.narration_per_step) {
          if (session.pauseFlag) break;
          if (session.skipFlag) { session.skipFlag = false; continue; }
          await new Promise((r) => setTimeout(r, 800));
          sendJSON(ws, { type: 'rewind_step_narration', narration: stepNarration });
          const rewindTts = await synthesizeAndStream(sendBinaryFn, stepNarration, session.speedMultiplier, sendJsonFn, () => session.pauseFlag || session.skipFlag, session.ttsMuted);
          if (rewindTts?.ttsAutoDisabled && !session._ttsDisabledNotified) {
            session._ttsDisabledNotified = true;
            sendJSON(ws, { type: 'tts_auto_disabled', message: 'Voice narration temporarily unavailable. Continuing with text only.' });
          }

          if (rewindTts?.aborted || session.pauseFlag || session.skipFlag) {
            sendJSON(ws, { type: 'audio_flush' });

            if (session.skipFlag) {
              session.skipFlag = false;
              session.pauseFlag = false;
              if (session.endSessionFlag) throw new Error('__end_session__');
              continue; // Skip this rewind step, advance to next
            }

            session.pauseFlag = false;
            if (session.endSessionFlag) throw new Error('__end_session__');
            sendJSON(ws, { type: 'paused' });
            await new Promise((resolve) => { session.pauseResolver = resolve; });
            session.pauseResolver = null;
            if (session.endSessionFlag) throw new Error('__end_session__');
            if (!session.interruptFlag) {
              sendJSON(ws, { type: 'resumed' });
            }
          }
        }
      }

      // If illustrate mode, build example graph and step through it
      // Auto-save graph state if the caller didn't (e.g. guided message path vs interrupt path)
      if (input.explanation_mode === 'illustrate' && input.illustrate && !session._savedGraphState) {
        console.log('[respond_to_interrupt] auto-saving graph state before illustrate (caller did not snapshot)');
        session._savedGraphState = {
          graph: session.currentGraph,
          trace: session.currentTrace,
          algorithm: session.currentAlgorithm,
          renderer: session.currentRenderer,
          rendererPanelId: session._rendererPanelId || null,
          mapperState: session.mapperState ? { ...session.mapperState } : {},
          emittedTraceSteps: session._emittedTraceSteps ? [...session._emittedTraceSteps] : [],
          // Without these, restoreGraphState has no viz message to remount for
          // non-graph algos (incl. multi-panel layouts) and silently skips the
          // renderer restore — the panel stays blank after the illustrate detour.
          lastVizMessage: session._lastVizMessage || null,
          rendererVizHistory: session._rendererVizHistory || {},
        };
      }
      if (input.explanation_mode === 'illustrate' && input.illustrate) {
        const { graph: illGraph } = input.illustrate;

        // Build graph with auto-layout
        const graphData = {
          nodes: illGraph.nodes || [],
          edges: illGraph.edges || [],
          directed: illGraph.directed !== undefined ? illGraph.directed : true,
        };
        graphData.positions = autoLayout(graphData.nodes, graphData.edges, {});

        // Swap to the example graph
        sendJSON(ws, { type: 'create_graph', graph: graphData });
        session.currentGraph = graphData;
        session._addedNodeIds = new Set();
        await new Promise((r) => setTimeout(r, 600));

        // Mark illustration active and return immediately — agent teaches with emit_segment
        session._illustrationActive = true;

        return {
          success: true,
          message: `Example graph displayed. Teach on it using emit_segment with manual viz_actions (no trace_step_indices). Call end_illustration when done to restore the lesson graph.${interruptWarningText}`,
        };
      }

      // Signal explanation complete so frontend can clean up (non-illustrate modes only).
      // The client restores from its pre-explanation snapshot — no server-side graph
      // rebuild needed since overlay/ghost/rewind don't swap the graph.
      await new Promise((resolve) => setTimeout(resolve, 500));
      sendJSON(ws, { type: 'explanation_complete' });
      session._savedGraphState = null;

      return {
        success: true,
        message: `Interrupt response delivered with explanation. Continue teaching.${interruptWarningText}`,
      };
    }

    case 'end_illustration': {
      if (!session._illustrationActive) {
        return { success: false, message: 'No active illustration to end.' };
      }
      session._illustrationActive = false;
      await new Promise((r) => setTimeout(r, 500));
      sendJSON(ws, { type: 'explanation_complete' });
      await restoreGraphState(session, ws);
      return {
        success: true,
        message: 'Illustration ended. Original graph restored. Continue teaching.',
      };
    }

    case 'send_options': {
      const { prompt, options } = input;

      sendJSON(ws, { type: 'guided_options', prompt, options: input.options || [], mode: input.mode || 'mc', input_placeholder: input.input_placeholder });

      // Set up resolver BEFORE TTS so early responses are captured
      const responsePromise = new Promise((resolve) => {
        if (session.guidedResponse) { resolve(); return; }
        session.guidedResponseResolver = resolve;
      });
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve('__timeout__'), 600000);
      });

      // TTS the prompt (abortable on pause/skip) — learner can respond during this
      const sendBinaryFn = (buffer) => sendBinary(ws, buffer);
      const sendJsonFn = (obj) => sendJSON(ws, obj);
      const ttsResult = await synthesizeAndStream(sendBinaryFn, prompt, session.speedMultiplier, sendJsonFn, () => session.pauseFlag || session.skipFlag, session.ttsMuted);
      if (ttsResult?.ttsAutoDisabled && !session._ttsDisabledNotified) {
        session._ttsDisabledNotified = true;
        sendJSON(ws, { type: 'tts_auto_disabled', message: 'Voice narration temporarily unavailable. Continuing with text only.' });
      }

      // Handle skip/pause — either TTS was aborted, or pause arrived after TTS finished
      if (ttsResult?.aborted || session.pauseFlag || session.skipFlag) {
        sendJSON(ws, { type: 'audio_flush' });

        if (session.skipFlag) {
          session.skipFlag = false;
          session.pauseFlag = false;
          if (session.endSessionFlag) throw new Error('__end_session__');
          // Skip bypasses the question entirely — clear options and advance
          session.guidedResponseResolver = null;
          sendJSON(ws, { type: 'clear_guided_options' });
          return {
            student_response: null,
            skipped: true,
            message: 'The learner skipped this question. Do NOT re-ask it. Move on to the next part of the lesson immediately using emit_segment.',
          };
        } else {
          session.pauseFlag = false;
          if (session.endSessionFlag) throw new Error('__end_session__');
          sendJSON(ws, { type: 'paused' });
          await new Promise((resolve) => { session.pauseResolver = resolve; });
          session.pauseResolver = null;
          if (session.endSessionFlag) throw new Error('__end_session__');
          if (!session.interruptFlag) {
            sendJSON(ws, { type: 'resumed' });
          }
        }
      }

      // Now wait for learner response (may already be resolved if they clicked during TTS)
      // Also allow skip to break out of the wait
      const skipPromise = new Promise((resolve) => {
        const interval = setInterval(() => {
          if (session.skipFlag) {
            clearInterval(interval);
            resolve('__skipped__');
          }
        }, 50);
        // Clean up when other promises win the race
        responsePromise.then(() => clearInterval(interval));
        timeoutPromise.then(() => clearInterval(interval));
      });
      const raceResult = await Promise.race([responsePromise, timeoutPromise, skipPromise]);

      session.guidedResponseResolver = null;

      if (raceResult === '__skipped__' || session.skipFlag) {
        session.skipFlag = false;
        session.pauseFlag = false;
        sendJSON(ws, { type: 'clear_guided_options' });
        return {
          student_response: null,
          skipped: true,
          message: 'The learner skipped this question. Do NOT re-ask it. Move on to the next part of the lesson immediately using emit_segment.',
        };
      } else if (raceResult === '__end_session__' || session.endSessionFlag) {
        throw new Error('__end_session__');
      } else if (raceResult === '__timeout__') {
        sendJSON(ws, { type: 'clear_guided_options' });
        return {
          student_response: null,
          timed_out: true,
          message: 'Learner did not respond within 2 minutes. Give a brief clarification and move on.',
        };
      } else if (raceResult === '__interrupted__') {
        sendJSON(ws, { type: 'clear_guided_options' });
        return {
          student_response: null,
          interrupted: true,
          message: 'Learner interrupted with a question. The interrupt will be handled next.',
        };
      } else {
        const studentResponse = session.guidedResponse;
        session.guidedResponse = null;
        sendJSON(ws, { type: 'clear_guided_options' });
        const answerText = studentResponse?.text || studentResponse?.labels?.join(', ') || studentResponse?.optionId || '';
        return {
          student_response: studentResponse,
          timed_out: false,
          selected_option_id: studentResponse?.optionId || null,
          selected_option_ids: studentResponse?.optionIds || null,
          selected_labels: studentResponse?.labels || null,
          freeform_text: studentResponse?.text || null,
          message: `The learner answered: "${answerText}". STOP and evaluate this answer BEFORE continuing. If CORRECT: give brief praise (1 sentence) via conversational_reply with wait_for_response: false, then continue the lesson in the SAME turn. Do NOT ask follow-up probing questions on the same concept. If WRONG: explain why and give a hint (first attempt) or the correct answer (second attempt).`,
        };
      }
    }

    case 'highlight_problem_text': {
      // STUCK COMPANION MODE page-highlight (eng review 2026-06-09 D1-D3, D9).
      // Sends highlight_problem to the embed app, which relays it over the
      // content-script MessagePort to paint on the leetcode page. The handler
      // AWAITS the relayed ack (anchored/method/visible) so the model knows
      // whether the student can actually see the mark — with a 2s timeout
      // (anchored:'unknown') because the chain crosses three fire-and-forget
      // hops and any of them can be dead.
      const quote = typeof input.quote === 'string' ? input.quote.trim() : '';
      if (input.clear) {
        const id = (session._highlightSeq = (session._highlightSeq || 0) + 1);
        sendJSON(ws, { type: 'highlight_problem', id, clear: true });
        return { success: true, cleared: true };
      }
      if (quote.length < 5 || quote.length > 300) {
        return {
          success: false,
          message: 'highlight_problem_text requires a verbatim "quote" of 5-300 characters copied exactly from the problem statement (or clear: true).',
        };
      }
      // Correlation id (D9 item 1): a late ack from a timed-out call must never
      // resolve a newer call's promise — the route drops mismatched ids.
      const id = (session._highlightSeq = (session._highlightSeq || 0) + 1);
      const ack = new Promise((resolve) => {
        session._highlightResolver = { id, resolve };
      });
      const timeout = new Promise((resolve) => setTimeout(() => resolve({ anchored: 'unknown', timedOut: true }), 2000));
      sendJSON(ws, { type: 'highlight_problem', id, quote });
      const result = await Promise.race([ack, timeout]);
      if (session._highlightResolver?.id === id) session._highlightResolver = null;
      const anchored = result.anchored === true ? true : result.anchored === false ? false : 'unknown';
      const visible = result.visible === true;
      return {
        success: true,
        anchored,
        visible,
        method: result.method ?? null,
        message: anchored === true
          ? (visible
            ? 'Highlight is on the page and on-screen. Ask your short standalone question — do not restate the quoted text.'
            : 'Highlight anchored but is NOT visible to the student right now (off-screen or fullscreen overlay). Your reply must make the point on its own.')
          : 'Highlight did not land — the student sees nothing. Treat as failed: make the same point in prose (quoting the passage in chat is fine here).',
      };
    }

    case 'conversational_reply': {
      const { text, wait_for_response } = input;

      sendJSON(ws, { type: 'interrupt_response', answer: text, explanation_mode: 'none' });

      // Set up resolver BEFORE TTS so early responses are captured
      let responsePromise, timeoutPromise;
      if (wait_for_response !== false) {
        sendJSON(ws, { type: 'guided_prompt', prompt: text });
        responsePromise = new Promise((resolve) => {
          if (session.guidedResponse) { resolve(); return; }
          session.guidedResponseResolver = resolve;
        });
        timeoutPromise = new Promise((resolve) => {
          setTimeout(() => resolve('__timeout__'), 600000);
        });
      }

      // TTS for the reply (abortable on pause/skip) — learner can respond during this
      const sendBinaryFn = (buffer) => sendBinary(ws, buffer);
      const sendJsonFn = (obj) => sendJSON(ws, obj);
      const ttsResult = await synthesizeAndStream(sendBinaryFn, text, session.speedMultiplier, sendJsonFn, () => session.pauseFlag || session.skipFlag, session.ttsMuted);
      if (ttsResult?.ttsAutoDisabled && !session._ttsDisabledNotified) {
        session._ttsDisabledNotified = true;
        sendJSON(ws, { type: 'tts_auto_disabled', message: 'Voice narration temporarily unavailable. Continuing with text only.' });
      }

      // Handle skip/pause — either TTS was aborted, or pause arrived after TTS finished
      if (ttsResult?.aborted || session.pauseFlag || session.skipFlag) {
        sendJSON(ws, { type: 'audio_flush' });

        if (session.skipFlag) {
          session.skipFlag = false;
          session.pauseFlag = false;
          if (session.endSessionFlag) throw new Error('__end_session__');
          // Skip bypasses the response wait — clear prompt and advance
          if (wait_for_response !== false) {
            session.guidedResponseResolver = null;
            sendJSON(ws, { type: 'clear_guided_options' });
          }
          return {
            student_response: null,
            skipped: true,
            message: 'The learner skipped this. Do NOT re-ask. Move on to the next part of the lesson immediately using emit_segment.',
          };
        } else {
          session.pauseFlag = false;
          if (session.endSessionFlag) throw new Error('__end_session__');
          sendJSON(ws, { type: 'paused' });
          await new Promise((resolve) => { session.pauseResolver = resolve; });
          session.pauseResolver = null;
          if (session.endSessionFlag) throw new Error('__end_session__');
          if (!session.interruptFlag) {
            sendJSON(ws, { type: 'resumed' });
          }
        }
      }

      if (wait_for_response !== false) {
        // Also allow skip to break out of the wait
        const skipPromise = new Promise((resolve) => {
          const interval = setInterval(() => {
            if (session.skipFlag) {
              clearInterval(interval);
              resolve('__skipped__');
            }
          }, 50);
          responsePromise.then(() => clearInterval(interval));
          timeoutPromise.then(() => clearInterval(interval));
        });
        const raceResult = await Promise.race([responsePromise, timeoutPromise, skipPromise]);
        session.guidedResponseResolver = null;
        // Clear guided prompt so subsequent student messages route as interrupts, not guided_message
        sendJSON(ws, { type: 'clear_guided_options' });

        if (raceResult === '__skipped__' || session.skipFlag) {
          session.skipFlag = false;
          session.pauseFlag = false;
          return {
            student_response: null,
            skipped: true,
            message: 'The learner skipped this. Do NOT re-ask. Move on to the next part of the lesson immediately using emit_segment.',
          };
        } else if (raceResult === '__end_session__' || session.endSessionFlag) {
          throw new Error('__end_session__');
        } else if (raceResult === '__timeout__') {
          return { student_response: null, timed_out: true, message: 'Learner did not respond. Move on.' };
        } else if (raceResult === '__interrupted__') {
          return { student_response: null, interrupted: true, message: 'Learner interrupted with a question.' };
        } else {
          const studentResponse = session.guidedResponse;
          session.guidedResponse = null;
          const answerText = studentResponse?.text || '';
          return {
            student_response: studentResponse,
            timed_out: false,
            freeform_text: answerText,
            message: `The learner responded: "${answerText}". STOP and address this response BEFORE continuing. If the learner answered CORRECTLY or is signaling they want to move on (e.g., "I understand", "got it", "next", "skip", "let's move on") — give brief praise if correct via conversational_reply with wait_for_response: false, then continue the lesson in the SAME turn. Do NOT ask follow-up probing questions on a concept they just got right. If they are disagreeing, re-explain. If they expressed confusion, address it.`,
          };
        }
      }
      return { success: true, message: 'Reply sent.' };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

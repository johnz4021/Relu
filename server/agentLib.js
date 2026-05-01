// Shared agent utilities — used by agent.js, guidedAgent.js, and explainAgent.js

import Anthropic from '@anthropic-ai/sdk';
import { tools } from './tools.js';
import { runAlgorithm } from './algorithms.js';
import { runRegisteredAlgorithm, runAlgorithmWithFallback, ALGORITHMS } from './algorithms/registry.js';
import { validateAlgorithmInput } from './algorithms/validateInput.js';
import { adaptAlgorithmInput } from './algorithms/adaptInput.js';
import { synthesizeAndStream, resetTTSDisabled } from './tts.js';
import { mapTraceStep } from './vizMapper.js';
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

export function sendBinary(ws, buffer) {
  if (ws.readyState === ws.OPEN) {
    ws.send(buffer, { binary: true });
  }
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
function validatePanelIds(actions, panels) {
  const valid = [];
  const warnings = [];
  for (const action of actions) {
    const renderer = action.renderer;
    if (!renderer) { valid.push(action); continue; }
    if (renderer === 'context') {
      const panelId = action.params?.panel_id;
      if (panelId && !panels[panelId]) {
        warnings.push(`context update targets unknown panel '${panelId}'`);
        continue;
      }
    } else if (!panels[renderer]) {
      warnings.push(`renderer '${renderer}' not declared in create_visualization`);
      continue;
    }
    valid.push(action);
  }
  return { valid, warnings };
}

// Validate agent-emitted viz_actions against the known graph.
// Returns { valid, warnings } — invalid actions are stripped and reported back to the agent.
function validateVizActions(actions, graph) {
  const nodeIds = new Set(graph.nodes.map(n => n.id));
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
  session.currentTrace = saved.trace;
  session.currentAlgorithm = saved.algorithm;
  session.currentRenderer = saved.renderer;
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
    const vizHistory = primaryRenderer ? saved.rendererVizHistory?.[primaryRenderer] : null;
    const hasVizHistory = vizHistory?.length > 0;

    const replayActions = [];

    if (hasTraceReplay) {
      const replayState = {};
      for (const idx of saved.emittedTraceSteps) {
        const step = saved.trace[idx];
        if (!step) continue;
        const { viz: vizActs, ctx: ctxActs } = mapTraceStep(
          saved.algorithm,
          saved.renderer,
          step,
          replayState
        );
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
      session._lastVizMessage = { type: 'create_graph', graph: graphData };
      if (!session._rendererVizHistory) session._rendererVizHistory = {};
      session._rendererVizHistory['graph'] = [];
      // Also update in session.graphs for graph_id lookups
      if (session.graphs) {
        const panelId = Object.keys(session.graphs)[0] || 'graph';
        session.graphs[panelId] = graphData;
      }
      // Register both 'graph' and the named panel ID so either form of renderer target is valid
      registerPanels(session, [{ id: 'graph', renderer: 'graph' }], []);
      if (session.graphs) {
        const panelId = Object.keys(session.graphs)[0];
        if (panelId && panelId !== 'graph') registerPanels(session, [{ id: panelId, renderer: 'graph' }], []);
      }
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

      if (algoInfo) {
        // Use the registry for all registered algorithms
        try {
          const registryInput = { ...input.input };
          // For graph algorithms, only inject session/tool-call overrides when present.
          // Otherwise let the registry's defaultInput provide the correct graph/source/sink.
          if (algoInfo.renderer === 'graph') {
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
          // Validate and adapt input against algorithm capabilities
          const validation = validateAlgorithmInput(algo, registryInput, session.modelContract);
          if (!validation.valid) {
            return { error: validation.errors.join('; '), warnings: validation.warnings };
          }
          if (validation.adaptations.length > 0) {
            adaptAlgorithmInput(algo, registryInput, validation.adaptations);
          }

          const result = await runAlgorithmWithFallback(algo, registryInput);
          console.log(`[Agent] run_algorithm '${algo}' returned ${result.trace.length} steps, renderer: ${result.renderer}, tier: ${result.tier}`);

          // ── Store trace on session for deterministic mapping ──
          session.currentTrace = result.trace;
          session.currentRenderer = result.renderer;
          session.currentAlgorithm = algo;
          session.mapperState = {};
          // Multi-graph: also store trace/mapper keyed by graph_id
          if (graphId) {
            if (!session.traces) session.traces = {};
            if (!session.mapperStates) session.mapperStates = {};
            session.traces[graphId] = result.trace;
            session.mapperStates[graphId] = {};
          }

          // ── Auto-configure visualization + context panels ──
          const contextPanels = getDefaultContextPanels(algo);
          console.log(`[Agent] Auto-setup for '${algo}': renderer=${algoInfo.renderer}, contextPanels=${contextPanels.map(p => p.id).join(',')}, sessionGraph=${!!session.currentGraph}`);

          // Notify frontend which algorithm is running (enables algorithm-specific UI like residual toggle).
          // Use 'algorithm_step' instead of 'lesson_start' to avoid wiping transcript/viz state.
          sendJSON(ws, { type: 'algorithm_step', algorithm: algo });

          if (algoInfo.renderer === 'context') {
            // Context-only (Tier 2 hash map / data structure algorithms): no main viz panel
            const autoVizMsg = {
              type: 'create_visualization',
              panels: [],
              context_panels: contextPanels,
            };
            sendJSON(ws, autoVizMsg);
            registerPanels(session, [], contextPanels);
            session._lastVizMessage = autoVizMsg;
          } else if (algoInfo.renderer === 'graph') {
            // Always send the graph for the current algorithm run
            const graphData = registryInput.graph || algoInfo.defaultInput?.graph;
            if (graphData) {
              const directed = graphData.directed !== undefined ? graphData.directed : true;
              console.log(`[Agent] Auto-creating graph: ${graphData.nodes?.length} nodes, directed=${directed}`);
              const autoGraphMsg = { type: 'create_graph', graph: { ...graphData, directed } };
              sendJSON(ws, autoGraphMsg);
              session.currentGraph = graphData;
              session._lastVizMessage = autoGraphMsg;
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
            // Non-graph: auto-send create_visualization with renderer + context panels
            const autoVizMsg = {
              type: 'create_visualization',
              panels: [{ renderer: algoInfo.renderer, config: {} }],
              context_panels: contextPanels,
            };
            sendJSON(ws, autoVizMsg);
            registerPanels(session, [{ renderer: algoInfo.renderer }], contextPanels);
            session._lastVizMessage = autoVizMsg;
            if (!session._rendererVizHistory) session._rendererVizHistory = {};
            session._rendererVizHistory[algoInfo.renderer] = [];
          }

          const panelNames = contextPanels.map((p) => p.id);
          const tier2Note = result.tier === 2 ? ' The trace was AI-generated — each step has embedded viz_actions that update the context panels automatically.' : '';
          const contextNote = algoInfo.renderer === 'context' ? ' Context-only algorithm: no main visualization panel. Use trace_step_indices to drive context panel updates via the embedded viz_actions in each step.' : '';
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
            capabilities: algoInfo.capabilities,
            adaptations_applied: validation.adaptations,
            warnings: validation.warnings,
            message: `Algorithm executed. Visualization and context panels auto-configured. Use emit_segment with trace_step_indices to teach. You have ${result.trace.length} trace steps available (indices 0 to ${result.trace.length - 1}).${tier2Note}${contextNote}`,
          };
        } catch (err) {
          return { error: err.message };
        }
      }

      // Fallback: legacy path for unregistered algorithms
      const src = input.source || source;
      const trace = runAlgorithm(algo, session.currentGraph || graph, src);
      session.currentTrace = trace;
      session.currentAlgorithm = algo;
      session.mapperState = {};
      return {
        success: true,
        algorithm: algo,
        source: src,
        trace,
        step_count: trace.length,
        message: `Algorithm executed successfully. ${trace.length} steps in trace. Use emit_segment with trace_step_indices to narrate each step.`,
      };
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
          // Tier 2 traces embed viz_actions directly in each step — use them as-is
          if (step.viz_actions && Array.isArray(step.viz_actions) && step.viz_actions.length > 0) {
            allVizActions.push(...step.viz_actions);
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
          allVizActions.push(...vizActs, ...ctxActs);
        }
      } else if (input.trace_step_indices && !activeTrace) {
        console.warn('[Agent] trace_step_indices provided but no trace on session — was run_algorithm called?');
        mapperWarnings.push('trace_step_indices provided but no trace on session — was run_algorithm called?');
      }
      // Merge any explicit viz_actions from agent (rare overrides / backward compat)
      if (input.viz_actions && input.viz_actions.length > 0) {
        let actionsToProcess = input.viz_actions;
        const allActionWarnings = [];

        // Panel registry validation — strip actions targeting undeclared panels/IDs
        if (session._panels) {
          const { valid: panelValid, warnings: panelWarnings } = validatePanelIds(actionsToProcess, session._panels);
          if (panelWarnings.length > 0) {
            console.warn('[Agent] panel registry warnings:', panelWarnings);
          }
          allActionWarnings.push(...panelWarnings);
          actionsToProcess = panelValid;
        }

        // Node/edge ID validation against the current graph (graph renderer only)
        const graph = session.currentGraph;
        if (graph?.nodes?.length > 0) {
          const { valid, warnings } = validateVizActions(actionsToProcess, graph);
          if (warnings.length > 0) {
            console.warn('[Agent] viz_action node warnings:', warnings);
          }
          allActionWarnings.push(...warnings);
          allVizActions.push(...valid);
        } else {
          // No graph loaded — pass through (non-graph renderers like recursion_tree, table)
          allVizActions.push(...actionsToProcess);
        }

        session._lastVizWarnings = allActionWarnings;
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

      sendJSON(ws, {
        type: 'segment_start',
        segment_id: segmentId,
        narration: input.narration,
        viz_actions: allVizActions,
        phase: input.phase || '',
      });

      // TTS or simulated delay (synthesizeAndStream waits for playback to finish)
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

      sendJSON(ws, {
        type: 'interrupt_response',
        answer: input.answer,
        explanation_mode: input.explanation_mode || 'none',
        overlay: input.overlay || null,
        rewind: input.rewind || null,
        ghost_alternative: input.ghost_alternative || null,
        illustrate: input.illustrate || null,
        viz_actions: input.viz_actions || [],
      });

      const sendBinaryFn = (buffer) => sendBinary(ws, buffer);
      const sendJsonFn = (obj) => sendJSON(ws, obj);
      const ttsResult = await synthesizeAndStream(sendBinaryFn, input.answer, session.speedMultiplier, sendJsonFn, () => session.pauseFlag || session.skipFlag, session.ttsMuted);
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
          mapperState: session.mapperState ? { ...session.mapperState } : {},
          emittedTraceSteps: session._emittedTraceSteps ? [...session._emittedTraceSteps] : [],
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
        await new Promise((r) => setTimeout(r, 600));

        // Mark illustration active and return immediately — agent teaches with emit_segment
        session._illustrationActive = true;

        return {
          success: true,
          message: 'Example graph displayed. Teach on it using emit_segment with manual viz_actions (no trace_step_indices). Call end_illustration when done to restore the lesson graph.',
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
        message: 'Interrupt response delivered with explanation. Continue teaching.',
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

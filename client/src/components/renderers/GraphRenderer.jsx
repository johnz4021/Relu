import { useEffect, useRef, useState, useCallback } from 'react';
import cytoscape from 'cytoscape';
import {
  applyVizActions,
  takeSnapshot,
  restoreSnapshot,
  applyOverlay,
  removeOverlay,
  applyGhostAlternative,
  removeGhostAlternative,
} from '../../lib/vizActions';
import { registerRenderer, unregisterRenderer } from '../../lib/rendererRegistry';

const CYTOSCAPE_STYLE = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'background-color': '#374151',
      color: '#f3f4f6',
      'border-width': 2,
      'border-color': '#6b7280',
      width: 50,
      height: 50,
      'font-size': '14px',
      'text-wrap': 'wrap',
      'text-max-width': '60px',
      'transition-property': 'background-color, border-color, border-width',
      'transition-duration': '0.3s',
    },
  },
  {
    selector: 'edge',
    style: {
      label: 'data(weight)',
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 1.2,
      'line-color': '#4b5563',
      'target-arrow-color': '#4b5563',
      width: 2,
      'font-size': '12px',
      color: '#9ca3af',
      'text-background-color': '#111827',
      'text-background-opacity': 0.8,
      'text-background-padding': '3px',
      'transition-property': 'line-color, target-arrow-color, width',
      'transition-duration': '0.3s',
    },
  },
  {
    selector: 'edge[color]',
    style: {
      'line-color': 'data(color)',
      'target-arrow-color': 'data(color)',
    },
  },
  {
    selector: '.highlighted',
    style: {
      'background-color': '#fbbf24',
      'border-color': '#f59e0b',
      'line-color': '#fbbf24',
      'target-arrow-color': '#fbbf24',
      color: '#111827',
      width: 3,
    },
  },
  {
    selector: '.current',
    style: {
      'background-color': '#3b82f6',
      'border-color': '#2563eb',
      'border-width': 4,
    },
  },
  {
    selector: '.visited',
    style: {
      'background-color': '#10b981',
      'border-color': '#059669',
    },
  },
  {
    selector: '.path',
    style: {
      'background-color': '#8b5cf6',
      'border-color': '#7c3aed',
      'border-width': 4,
      'line-color': '#8b5cf6',
      'target-arrow-color': '#8b5cf6',
      width: 4,
    },
  },
  {
    selector: '.examining',
    style: {
      'line-color': '#f59e0b',
      'target-arrow-color': '#f59e0b',
      width: 3,
    },
  },
  {
    selector: '.color-red',
    style: {
      'background-color': '#ef4444',
      'border-color': '#dc2626',
      'border-width': 4,
    },
  },
  {
    selector: '.color-blue',
    style: {
      'background-color': '#3b82f6',
      'border-color': '#2563eb',
      'border-width': 4,
    },
  },
  {
    selector: '.color-green',
    style: {
      'background-color': '#10b981',
      'border-color': '#059669',
      'border-width': 4,
    },
  },
  {
    selector: '.ghost',
    style: {
      opacity: 0.3,
    },
  },
  {
    selector: '.dimmed',
    style: { opacity: 0.2 },
  },
  {
    selector: '.spotlit',
    style: {
      opacity: 1,
      'border-width': 4,
      'border-color': '#60a5fa',
      'z-index': 999,
    },
  },
  {
    selector: 'edge.spotlit',
    style: {
      opacity: 1,
      'line-color': '#60a5fa',
      'target-arrow-color': '#60a5fa',
      width: 4,
      'z-index': 999,
    },
  },
  {
    selector: '.ghost-alt',
    style: {
      'line-color': '#f87171',
      'target-arrow-color': '#f87171',
      'line-style': 'dashed',
      opacity: 0.5,
      width: 3,
    },
  },
  {
    selector: '.ghost-actual-label',
    style: {
      'text-background-color': '#1e3a5f',
      'text-background-opacity': 0.9,
      'text-background-padding': '4px',
      'text-background-shape': 'roundrectangle',
      'text-margin-y': 12,
      'text-valign': 'bottom',
      'font-size': '11px',
      color: '#93c5fd',
      'text-wrap': 'wrap',
      'text-max-width': '120px',
    },
  },
  {
    selector: '.ghost-alt-label',
    style: {
      'text-background-color': '#4c1d1d',
      'text-background-opacity': 0.9,
      'text-background-padding': '4px',
      'text-background-shape': 'roundrectangle',
      'text-margin-y': 12,
      'text-valign': 'bottom',
      'font-size': '11px',
      color: '#fca5a5',
      'text-wrap': 'wrap',
      'text-max-width': '120px',
    },
  },
  {
    selector: '[ghost_badge]',
    style: {
      label: (ele) => {
        const main = ele.data('label') || ele.id();
        const badge = ele.data('ghost_badge');
        return badge ? `${main}\n${badge}` : main;
      },
    },
  },
  {
    selector: '.mst-edge',
    style: {
      'line-color': '#10b981',
      'target-arrow-color': '#10b981',
      width: 4,
    },
  },
  {
    selector: '.strikethrough',
    style: {
      'line-color': '#ef4444',
      'target-arrow-color': '#ef4444',
      'line-style': 'dashed',
      opacity: 0.4,
      width: 2,
    },
  },
  {
    selector: '.saturated',
    style: {
      'line-color': '#ef4444',
      'target-arrow-color': '#ef4444',
      width: 3,
    },
  },
  {
    selector: '.augmenting',
    style: {
      'background-color': '#3b82f6',
      'border-color': '#2563eb',
      'border-width': 4,
      'line-color': '#3b82f6',
      'target-arrow-color': '#3b82f6',
      width: 4,
    },
  },
  {
    selector: '.min-cut',
    style: {
      'line-color': '#f59e0b',
      'target-arrow-color': '#f59e0b',
      'line-style': 'dashed',
      width: 4,
    },
  },
  {
    selector: '.source-side',
    style: {
      'background-color': '#10b981',
      'border-color': '#059669',
      'border-width': 4,
    },
  },
  {
    selector: '.sink-side',
    style: {
      'background-color': '#8b5cf6',
      'border-color': '#7c3aed',
      'border-width': 4,
    },
  },
  {
    selector: '.tapped',
    style: {
      'border-color': '#60a5fa',
      'border-width': 4,
      'transition-duration': '0.15s',
    },
  },
  {
    selector: 'edge.tapped',
    style: {
      'line-color': '#60a5fa',
      'target-arrow-color': '#60a5fa',
      width: 4,
      'transition-duration': '0.15s',
    },
  },
  {
    selector: '.residual-fwd',
    style: {
      'line-color': '#06b6d4',
      'target-arrow-color': '#06b6d4',
      color: '#06b6d4',
      'font-size': '11px',
      'text-background-color': '#111827',
      'text-background-opacity': 0.8,
      'text-background-padding': '3px',
    },
  },
  {
    selector: '.residual-dimmed',
    style: {
      opacity: 0.25,
    },
  },
  {
    selector: '.residual-rev',
    style: {
      'line-color': '#22d3ee',
      'target-arrow-color': '#22d3ee',
      'line-style': 'dashed',
      opacity: 0.6,
      width: 2,
      color: '#22d3ee',
      'font-size': '11px',
      'text-background-color': '#111827',
      'text-background-opacity': 0.8,
      'text-background-padding': '3px',
    },
  },
];

/**
 * Apply a single graph viz action to the Cytoscape instance.
 * This bridges the new unified protocol (action + params) to the existing
 * applyVizActions format.
 */
// Module-level map of live (non-destroyed) Cytoscape instances by rendererId.
// Avoids stale-closure issues with React refs during StrictMode remounts.
const liveCyInstances = new Map();

function applyGraphAction(cy, action, params) {
  if (!cy) return;
  // Unwrap nested params (agent sends { renderer, action, params: { ... } },
  // registry destructures to params = { params: { ... } })
  const flatParams = params.params || params;
  const legacyAction = { action, ...flatParams };
  applyVizActions(cy, [legacyAction]);
}

export default function GraphRenderer({
  graph,
  vizActions,
  phase,
  explanationMode,
  segmentCount,
  rewindStep = 0,
  rendererId = 'graph',
  algorithm,
  residualEdges,
  residualToggle,
  onElementClick,
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const snapshotsRef = useRef([]);
  const preExplanationSnapshotRef = useRef(null);
  const rewindStartIdxRef = useRef(null);
  const preToggleSnapshotRef = useRef(null);
  const [annotations, setAnnotations] = useState([]);
  const [showingResidual, setShowingResidual] = useState(false);
  const [hasGraph, setHasGraph] = useState(false);

  // Initialize Cytoscape and register with renderer registry
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: CYTOSCAPE_STYLE,
      layout: { name: 'preset' },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
    });

    cyRef.current = cy;
    liveCyInstances.set(rendererId, cy);
    console.log(`[GraphRenderer] MOUNT ${rendererId} — cy created, mapSize=${liveCyInstances.size}`);

    registerRenderer(rendererId, {
      apply: (action, params) => {
        const targetCy = liveCyInstances.get(rendererId);
        const isDestroyed = targetCy?.destroyed?.();
        const nodeCount = targetCy?.nodes?.()?.length ?? 0;
        console.log(`[GraphRenderer] APPLY '${action}' — hasCy=${!!targetCy}, destroyed=${isDestroyed}, nodes=${nodeCount}`);
        if (!targetCy || isDestroyed) {
          console.warn(`[GraphRenderer] DROPPED '${action}' — no valid cy`);
          return;
        }
        applyGraphAction(targetCy, action, params);
        // Verify it actually stuck
        if (action === 'show_path' || action === 'highlight_node' || action === 'highlight_edge') {
          const pathCount = targetCy.elements('.path').length;
          const highlightedCount = targetCy.elements('.highlighted, .color-red, .color-blue, .color-green').length;
          console.log(`[GraphRenderer] AFTER '${action}' — pathEls=${pathCount}, highlightedEls=${highlightedCount}`);
        }
      },
      loadGraph: (graphData) => loadGraphIntoCy(graphData),
      takeSnapshot: () => {
        const c = liveCyInstances.get(rendererId);
        return c && !c.destroyed() ? takeSnapshot(c) : null;
      },
      restoreSnapshot: (snap) => {
        const c = liveCyInstances.get(rendererId);
        if (c && !c.destroyed()) restoreSnapshot(c, snap);
      },
      cleanup: () => {
        const c = liveCyInstances.get(rendererId);
        if (c && !c.destroyed()) {
          removeOverlay(c);
          removeGhostAlternative(c);
        }
      },
    });

    return () => {
      console.log(`[GraphRenderer] UNMOUNT ${rendererId} — mapSize=${liveCyInstances.size}`);
      unregisterRenderer(rendererId);
      cy.destroy();
      if (liveCyInstances.get(rendererId) === cy) {
        liveCyInstances.delete(rendererId);
      }
      if (cyRef.current === cy) {
        cyRef.current = null;
      }
      lastLoadedGraphRef.current = null;
    };
  }, [rendererId]);

  // Phase 7: Tap handlers for clickable graph element references
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !onElementClick) return;

    const handleNodeTap = (evt) => {
      const node = evt.target;
      const refText = `[${node.id()}]`;
      onElementClick(refText);
      node.addClass('tapped');
      setTimeout(() => node.removeClass('tapped'), 300);
    };

    const handleEdgeTap = (evt) => {
      const edge = evt.target;
      const refText = `[${edge.source().id()}->${edge.target().id()}]`;
      onElementClick(refText);
      edge.addClass('tapped');
      setTimeout(() => edge.removeClass('tapped'), 300);
    };

    cy.on('tap', 'node', handleNodeTap);
    cy.on('tap', 'edge', handleEdgeTap);

    return () => {
      cy.off('tap', 'node', handleNodeTap);
      cy.off('tap', 'edge', handleEdgeTap);
    };
  }, [onElementClick]);

  // Synchronous graph loader — shared by useEffect and registry.loadGraph.
  // Tracks last loaded graph by reference to skip redundant loads (the registry
  // loads synchronously on create_graph, then the useEffect fires for the same
  // graph object — the ref check skips the second load to preserve viz actions).
  const lastLoadedGraphRef = useRef(null);
  const loadGraphIntoCy = useCallback((graphData) => {
    const cy = cyRef.current;
    if (!cy || !graphData) return;
    if (lastLoadedGraphRef.current === graphData) return;
    lastLoadedGraphRef.current = graphData;

    cy.elements().remove();
    snapshotsRef.current = [];

    const elements = [];
    for (const node of graphData.nodes) {
      elements.push({
        group: 'nodes',
        data: { id: node.id, label: node.label || node.id, originalLabel: node.label || node.id },
        position: graphData.positions?.[node.id] || { x: 0, y: 0 },
      });
    }
    for (const edge of graphData.edges) {
      elements.push({
        group: 'edges',
        data: {
          id: `${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          weight: edge.weight ?? '',
          ...(edge.color ? { color: edge.color } : {}),
        },
      });
    }

    cy.add(elements);

    if (graphData.directed === false) {
      cy.edges().style('target-arrow-shape', 'none');
    }

    cy.fit(undefined, 40);
    if (graphData.nodes.length > 0) setHasGraph(true);
  }, [setHasGraph]);

  // Load graph data (also handles React prop changes / initial mount).
  // Skipped if the registry already loaded the same graph object synchronously.
  useEffect(() => {
    loadGraphIntoCy(graph);
  }, [graph, loadGraphIntoCy]);

  // Apply viz actions (supports both legacy array and new registry format)
  useEffect(() => {
    if (vizActions && cyRef.current) {
      applyVizActions(cyRef.current, vizActions);
    }
  }, [vizActions]);

  // Take snapshot after each segment completes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || segmentCount === undefined || segmentCount === 0) return;
    snapshotsRef.current.push(takeSnapshot(cy));
  }, [segmentCount]);

  // Recompute annotation positions on viewport changes
  const updateAnnotationPositions = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || annotations.length === 0) return;

    setAnnotations((prev) =>
      prev.map((ann) => {
        const ele = cy.getElementById(ann.target);
        if (!ele || ele.length === 0) return ann;
        const pos = ele.renderedPosition();
        return { ...ann, x: pos.x, y: pos.y };
      })
    );
  }, [annotations.length]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.on('viewport', updateAnnotationPositions);
    return () => cy.off('viewport', updateAnnotationPositions);
  }, [updateAnnotationPositions]);

  // Handle explanation mode changes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (explanationMode?.mode === 'overlay') {
      preExplanationSnapshotRef.current = takeSnapshot(cy);
      applyOverlay(cy, explanationMode.config);
      if (explanationMode.config?.annotations) {
        const annots = explanationMode.config.annotations
          .map((a) => {
            const ele = cy.getElementById(a.target);
            if (!ele || ele.empty()) return null;
            const pos = ele.renderedPosition();
            return { ...a, x: pos.x, y: pos.y };
          })
          .filter(Boolean);
        setAnnotations(annots);
      }
    } else if (explanationMode?.mode === 'ghost_alternative') {
      preExplanationSnapshotRef.current = takeSnapshot(cy);
      applyGhostAlternative(cy, explanationMode.config);
    } else if (explanationMode?.mode === 'rewind') {
      preExplanationSnapshotRef.current = takeSnapshot(cy);
      const idx = Math.max(
        0,
        snapshotsRef.current.length - (explanationMode.config?.steps_back || 2)
      );
      rewindStartIdxRef.current = idx;
      if (snapshotsRef.current[idx]) {
        restoreSnapshot(cy, snapshotsRef.current[idx]);
      }
    } else if (explanationMode?.mode === 'illustrate') {
      // No snapshot needed — server restores lesson graph via create_graph after explanation_complete
    } else if (explanationMode === null && preExplanationSnapshotRef.current) {
      removeOverlay(cy);
      removeGhostAlternative(cy);
      restoreSnapshot(cy, preExplanationSnapshotRef.current);
      preExplanationSnapshotRef.current = null;
      rewindStartIdxRef.current = null;
      setAnnotations([]);
    }
  }, [explanationMode]);

  // Advance one snapshot per rewind narration step
  useEffect(() => {
    if (!rewindStep || rewindStartIdxRef.current === null) return;
    const cy = cyRef.current;
    if (!cy) return;
    const snap = snapshotsRef.current[rewindStartIdxRef.current + rewindStep];
    if (snap) restoreSnapshot(cy, snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewindStep]);

  // Auto-reset residual toggle when a new segment arrives
  useEffect(() => {
    if (showingResidual) {
      const cy = cyRef.current;
      if (cy) {
        // Clean up residual overlay from the graph before the new segment's actions land
        applyVizActions(cy, [{ action: 'hide_residual_overlay' }]);
        if (preToggleSnapshotRef.current) {
          restoreSnapshot(cy, preToggleSnapshotRef.current);
        }
      }
      preToggleSnapshotRef.current = null;
      setShowingResidual(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentCount]);

  const handleResidualToggle = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (!showingResidual) {
      // Toggle ON: first ensure any agent-applied residual overlay is cleared so we
      // snapshot the clean original-graph state, then apply our own overlay
      applyVizActions(cy, [{ action: 'hide_residual_overlay' }]);
      preToggleSnapshotRef.current = takeSnapshot(cy);
      applyVizActions(cy, [{ action: 'show_residual_overlay', residual_edges: residualEdges, mode: 'full' }]);
      setShowingResidual(true);
    } else {
      // Toggle OFF: hide overlay then restore snapshot
      applyVizActions(cy, [{ action: 'hide_residual_overlay' }]);
      if (preToggleSnapshotRef.current) {
        restoreSnapshot(cy, preToggleSnapshotRef.current);
        preToggleSnapshotRef.current = null;
      }
      setShowingResidual(false);
    }
  }, [showingResidual, residualEdges]);

  // Agent-controlled residual toggle (via residual_toggle message from server)
  useEffect(() => {
    if (!residualToggle || !residualEdges) return;
    const cy = cyRef.current;
    if (!cy) return;

    if (residualToggle.show && !showingResidual) {
      applyVizActions(cy, [{ action: 'hide_residual_overlay' }]);
      preToggleSnapshotRef.current = takeSnapshot(cy);
      applyVizActions(cy, [{ action: 'show_residual_overlay', residual_edges: residualEdges, mode: 'full' }]);
      setShowingResidual(true);
    } else if (!residualToggle.show && showingResidual) {
      applyVizActions(cy, [{ action: 'hide_residual_overlay' }]);
      if (preToggleSnapshotRef.current) {
        restoreSnapshot(cy, preToggleSnapshotRef.current);
        preToggleSnapshotRef.current = null;
      }
      setShowingResidual(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residualToggle]);

  return (
    <div className="relative h-full">
      <div ref={containerRef} className="w-full h-full" />

      {!hasGraph && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 pointer-events-none z-20">
          <svg width="160" height="80" viewBox="0 0 160 80" aria-hidden="true">
            <line x1="40" y1="48" x2="80" y2="16" stroke="#374151" strokeWidth="1.5" strokeDasharray="4 3" />
            <line x1="80" y1="16" x2="120" y2="48" stroke="#374151" strokeWidth="1.5" strokeDasharray="4 3" />
            <line x1="40" y1="48" x2="120" y2="48" stroke="#374151" strokeWidth="1.5" strokeDasharray="4 3" />
            <circle cx="40" cy="48" r="14" fill="#111827" stroke="#374151" strokeWidth="1.5" opacity="0.7" />
            <circle cx="80" cy="16" r="14" fill="#111827" stroke="#374151" strokeWidth="1.5" opacity="0.7" />
            <circle cx="120" cy="48" r="14" fill="#111827" stroke="#374151" strokeWidth="1.5" opacity="0.7" />
          </svg>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary, #6b7280)' }}>
            Run an algorithm to see the visualization
          </p>
        </div>
      )}

      {algorithm === 'maxflow' && residualEdges && (
        <button
          onClick={handleResidualToggle}
          className={`absolute bottom-3 right-3 z-10 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
            showingResidual
              ? 'bg-cyan-900/90 text-cyan-200 border-cyan-700 hover:bg-cyan-800/90'
              : 'bg-gray-800/90 text-gray-300 border-gray-700 hover:bg-gray-700/90'
          }`}
        >
          {showingResidual ? 'Hide Residual Graph' : 'Show Residual Graph'}
        </button>
      )}

      {explanationMode && (
        <div className="absolute top-3 right-3 z-10 bg-purple-900/90 text-sm text-purple-200 px-3 py-1.5 rounded-lg border border-purple-700 flex items-center gap-2">
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
          Explaining...
        </div>
      )}

      {annotations.map((ann, i) => {
        const container = containerRef.current?.parentElement;
        const cw = container?.clientWidth || 800;
        const ch = container?.clientHeight || 600;
        const annW = 240; // matches max-w-[240px]
        const annH = 40;  // approximate height
        let left = ann.x + (ann.position === 'right' ? 35 : ann.position === 'left' ? -150 : -40);
        let top = ann.y + (ann.position === 'bottom' ? 35 : ann.position === 'top' ? -40 : -10);
        // Clamp to stay within canvas bounds
        left = Math.max(4, Math.min(left, cw - annW - 4));
        top = Math.max(4, Math.min(top, ch - annH - 4));
        return (
          <div
            key={i}
            className="absolute z-20 bg-gray-900/95 border border-blue-500 text-blue-200 text-sm px-3 py-2 rounded-md shadow-lg pointer-events-none max-w-[240px]"
            style={{ left, top }}
          >
            {ann.text}
          </div>
        );
      })}
    </div>
  );
}

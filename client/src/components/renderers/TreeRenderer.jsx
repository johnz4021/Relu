import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { registerRenderer, unregisterRenderer } from '../../lib/rendererRegistry';
import { m, AnimatePresence } from 'motion/react';
import * as d3 from 'd3';

const NODE_RADIUS = 22;
const LEVEL_HEIGHT = 70;
const MARGIN = { top: 40, right: 40, bottom: 60, left: 40 };

const NODE_COLORS = {
  default: { fill: '#374151', stroke: '#6B7280' },
  current: { fill: '#3B82F6', stroke: '#60A5FA' },
  comparing: { fill: '#EAB308', stroke: '#FACC15' },
  inserted: { fill: '#22C55E', stroke: '#4ADE80' },
  deleted: { fill: '#EF4444', stroke: '#F87171' },
  rotated: { fill: '#A855F7', stroke: '#C084FC' },
  highlighted: { fill: '#F59E0B', stroke: '#FBBF24' },
  sifting: { fill: '#06B6D4', stroke: '#22D3EE' },
};

const EDGE_COLORS = {
  default: '#6B7280',
  highlighted: '#FACC15',
  sifting: '#22D3EE',
};

const SPRING_TRANSITION = { type: 'spring', stiffness: 200, damping: 25 };
const FAST_SPRING = { type: 'spring', stiffness: 300, damping: 30 };

/**
 * Builds a D3 hierarchy from a flat node/edge list.
 */
function buildHierarchy(nodes, edges, rootId) {
  if (!nodes || nodes.length === 0) return null;

  const nodeMap = {};
  for (const n of nodes) {
    nodeMap[n.id] = { ...n, children: [] };
  }

  for (const e of edges) {
    const parent = nodeMap[e.from];
    const child = nodeMap[e.to];
    if (parent && child) {
      if (e.label !== undefined) child.parentEdgeLabel = e.label;
      if (e.side === 'right') {
        parent.children.push(child);
      } else {
        parent.children.unshift(child);
      }
    }
  }

  const root = nodeMap[rootId];
  if (!root) return null;

  function ensureBinarySlots(node) {
    if (!node) return node;
    const hasLeft = edges.some(e => e.from === node.id && e.side === 'left');
    const hasRight = edges.some(e => e.from === node.id && e.side === 'right');

    if (hasLeft || hasRight) {
      const leftChild = node.children.find(c =>
        edges.some(e => e.from === node.id && e.to === c.id && e.side === 'left')
      );
      const rightChild = node.children.find(c =>
        edges.some(e => e.from === node.id && e.to === c.id && e.side === 'right')
      );
      node.children = [];
      if (leftChild) {
        ensureBinarySlots(leftChild);
        node.children.push(leftChild);
      }
      if (rightChild) {
        ensureBinarySlots(rightChild);
        node.children.push(rightChild);
      }
    } else {
      for (const child of node.children) {
        ensureBinarySlots(child);
      }
    }
    return node;
  }

  ensureBinarySlots(root);
  return root;
}

/** Build edge keys from a path array, e.g. ['A','B','C'] -> ['A-B','B-C'] */
function buildEdgeKeys(path) {
  const keys = [];
  for (let i = 0; i < path.length - 1; i++) {
    keys.push(`${path[i]}-${path[i + 1]}`);
  }
  return keys;
}

export default function TreeRenderer({
  rendererId = 'tree',
  phase,
  explanationMode,
  segmentCount,
  rewindStep = 0,
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const zoomRef = useRef(null);
  const [zoomTransformStr, setZoomTransformStr] = useState('');
  const [treeData, setTreeData] = useState(null);
  const [nodeClasses, setNodeClasses] = useState({});
  const [edgeClasses, setEdgeClasses] = useState({});
  const [nodeColors, setNodeColors] = useState({});
  const [heapArray, setHeapArray] = useState(null);
  const [levelHighlight, setLevelHighlight] = useState(null);
  const [overlayState, setOverlayState] = useState(null);
  const [ghostState, setGhostState] = useState(null);
  const snapshotsRef = useRef([]);
  const preExplanationRef = useRef(null);
  const rewindStartIdxRef = useRef(null);

  // Track container dimensions with ResizeObserver
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // D3 zoom/pan — re-run when treeData changes so we attach after SVG mounts
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    if (!zoomRef.current) {
      const zoom = d3.zoom()
        .scaleExtent([0.2, 3])
        .on('zoom', (event) => setZoomTransformStr(event.transform.toString()));
      zoomRef.current = zoom;
    }
    svg.call(zoomRef.current);
    svg.on('dblclick.zoom', null);
    return () => { svg.on('.zoom', null); };
  }, [treeData]);

  const resetZoom = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current)
      .transition().duration(300)
      .call(zoomRef.current.transform, d3.zoomIdentity);
  }, []);

  const takeTreeSnapshot = useCallback(() => {
    return {
      treeData: treeData ? JSON.parse(JSON.stringify(treeData)) : null,
      nodeClasses: { ...nodeClasses },
      edgeClasses: { ...edgeClasses },
      nodeColors: { ...nodeColors },
      heapArray: heapArray ? [...heapArray] : null,
      levelHighlight,
    };
  }, [treeData, nodeClasses, edgeClasses, nodeColors, heapArray, levelHighlight]);

  const restoreTreeSnapshot = useCallback((snap) => {
    if (!snap) return;
    setTreeData(snap.treeData);
    setNodeClasses(snap.nodeClasses);
    setEdgeClasses(snap.edgeClasses);
    setNodeColors(snap.nodeColors);
    setHeapArray(snap.heapArray);
    setLevelHighlight(snap.levelHighlight);
  }, []);

  const applyTreeAction = useCallback((action, rawParams) => {
    const params = rawParams.params || rawParams;
    switch (action) {
      case 'set_tree': {
        setTreeData({
          nodes: params.nodes || [],
          edges: params.edges || [],
          root: params.root,
        });
        setNodeClasses({});
        setEdgeClasses({});
        setNodeColors({});
        setHeapArray(params.heap_array || null);
        setLevelHighlight(null);
        break;
      }
      case 'highlight_node': {
        setNodeClasses(prev => ({
          ...prev,
          [params.id]: params.className || 'highlighted',
        }));
        break;
      }
      case 'highlight_edge': {
        const key = `${params.from}-${params.to}`;
        setEdgeClasses(prev => ({
          ...prev,
          [key]: params.className || 'highlighted',
        }));
        break;
      }
      case 'insert_node': {
        setTreeData(prev => {
          if (!prev) {
            return {
              nodes: [{ id: params.id, value: params.value }],
              edges: [],
              root: params.id,
            };
          }
          const newNodes = [...prev.nodes, { id: params.id, value: params.value }];
          const newEdges = params.parent
            ? [...prev.edges, { from: params.parent, to: params.id, side: params.side || 'left', ...(params.label !== undefined && { label: params.label }) }]
            : prev.edges;
          return { nodes: newNodes, edges: newEdges, root: prev.root };
        });
        setNodeClasses(prev => ({ ...prev, [params.id]: 'inserted' }));
        break;
      }
      case 'delete_node': {
        setNodeClasses(prev => ({ ...prev, [params.id]: 'deleted' }));
        setTimeout(() => {
          setTreeData(prev => {
            if (!prev) return prev;
            return {
              nodes: prev.nodes.filter(n => n.id !== params.id),
              edges: prev.edges.filter(e => e.from !== params.id && e.to !== params.id),
              root: prev.root === params.id ? null : prev.root,
            };
          });
          setNodeClasses(prev => {
            const next = { ...prev };
            delete next[params.id];
            return next;
          });
        }, 400);
        break;
      }
      case 'rotate_left':
      case 'rotate_right': {
        const pivotId = params.pivot;
        setNodeClasses(prev => ({ ...prev, [pivotId]: 'rotated' }));
        setTreeData(prev => {
          if (!prev) return prev;
          const edges = [...prev.edges];
          const isLeft = action === 'rotate_left';

          const childEdge = edges.find(e =>
            e.from === pivotId && e.side === (isLeft ? 'right' : 'left')
          );
          if (!childEdge) return prev;
          const childId = childEdge.to;

          const parentEdge = edges.find(e => e.to === pivotId);

          const innerSide = isLeft ? 'left' : 'right';
          const innerEdgeIdx = edges.findIndex(e => e.from === childId && e.side === innerSide);

          const pivotChildIdx = edges.findIndex(e => e.from === pivotId && e.to === childId);
          if (pivotChildIdx >= 0) edges.splice(pivotChildIdx, 1);

          if (innerEdgeIdx >= 0) {
            const innerEdge = edges[innerEdgeIdx > pivotChildIdx ? innerEdgeIdx - 1 : innerEdgeIdx];
            innerEdge.from = pivotId;
            innerEdge.side = isLeft ? 'right' : 'left';
          }

          edges.push({ from: childId, to: pivotId, side: innerSide });

          if (parentEdge) {
            parentEdge.to = childId;
          }

          const newRoot = prev.root === pivotId ? childId : prev.root;
          return { nodes: prev.nodes, edges, root: newRoot };
        });
        break;
      }
      case 'recolor_node': {
        setNodeColors(prev => ({
          ...prev,
          [params.id]: params.color,
        }));
        break;
      }
      case 'sift_up':
      case 'sift_down': {
        setNodeClasses(prev => ({ ...prev, [params.id]: 'sifting' }));
        break;
      }
      case 'mark_level': {
        setLevelHighlight(params.level);
        break;
      }
      case 'update_heap_array': {
        setHeapArray(params.array ? [...params.array] : null);
        break;
      }
      case 'reset': {
        setNodeClasses({});
        setEdgeClasses({});
        setNodeColors({});
        setLevelHighlight(null);
        break;
      }
    }
  }, []);

  // Register with renderer registry
  useEffect(() => {
    registerRenderer(rendererId, {
      apply: applyTreeAction,
      takeSnapshot: takeTreeSnapshot,
      restoreSnapshot: restoreTreeSnapshot,
      cleanup: () => {
        setNodeClasses({});
        setEdgeClasses({});
        setNodeColors({});
        setLevelHighlight(null);
      },
    });
    return () => unregisterRenderer(rendererId);
  }, [rendererId, applyTreeAction, takeTreeSnapshot, restoreTreeSnapshot]);

  // Take snapshot after each segment
  useEffect(() => {
    if (segmentCount === undefined || segmentCount === 0 || !treeData) return;
    snapshotsRef.current.push(takeTreeSnapshot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentCount]);

  // Handle explanation mode
  useEffect(() => {
    if (explanationMode?.mode === 'rewind') {
      preExplanationRef.current = takeTreeSnapshot();
      const stepsBack = explanationMode.config?.steps_back || 2;
      const idx = Math.max(0, snapshotsRef.current.length - stepsBack);
      rewindStartIdxRef.current = idx;
      if (snapshotsRef.current[idx]) {
        restoreTreeSnapshot(snapshotsRef.current[idx]);
      }
    } else if (explanationMode?.mode === 'overlay') {
      preExplanationRef.current = takeTreeSnapshot();
      const config = explanationMode.config;
      setOverlayState({
        spotlitNodes: new Set(config.spotlight_nodes || []),
        spotlitEdges: new Set((config.spotlight_edges || []).map(e => `${e.from}-${e.to}`)),
        annotations: config.annotations || [],
      });
    } else if (explanationMode?.mode === 'ghost_alternative') {
      preExplanationRef.current = takeTreeSnapshot();
      const config = explanationMode.config;
      setGhostState({
        ghostPath: new Set(config.ghost_path || []),
        actualPath: new Set(config.actual_path || []),
        ghostEdges: new Set(buildEdgeKeys(config.ghost_path || [])),
        actualEdges: new Set(buildEdgeKeys(config.actual_path || [])),
        ghostLabel: config.ghost_label,
        actualLabel: config.actual_label,
      });
    } else if (explanationMode === null && preExplanationRef.current) {
      setOverlayState(null);
      setGhostState(null);
      restoreTreeSnapshot(preExplanationRef.current);
      preExplanationRef.current = null;
      rewindStartIdxRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explanationMode]);

  // Advance one snapshot per rewind narration step
  useEffect(() => {
    if (!rewindStep || rewindStartIdxRef.current === null) return;
    const snap = snapshotsRef.current[rewindStartIdxRef.current + rewindStep];
    if (snap) restoreTreeSnapshot(snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewindStep]);

  // Compute D3 tree layout positions via useMemo (no DOM mutation)
  const layout = useMemo(() => {
    if (!treeData || !treeData.nodes.length) return null;

    const innerWidth = dimensions.width - MARGIN.left - MARGIN.right;
    const innerHeight = dimensions.height - MARGIN.top - MARGIN.bottom;

    const rootData = buildHierarchy(treeData.nodes, treeData.edges, treeData.root);
    if (!rootData) return null;

    const hierarchy = d3.hierarchy(rootData, d => d.children.length > 0 ? d.children : null);
    const treeLayout = d3.tree().size([
      innerWidth,
      Math.min(innerHeight, hierarchy.height * LEVEL_HEIGHT + 60),
    ]);
    treeLayout(hierarchy);

    return hierarchy;
  }, [treeData, dimensions.width, dimensions.height]);

  // Derive node positions map for overlay annotations
  const nodePositions = useMemo(() => {
    if (!layout) return {};
    const map = {};
    layout.descendants().forEach(d => {
      map[d.data.id] = { x: d.x, y: d.y };
    });
    return map;
  }, [layout]);

  // Compute level highlight rect bounds
  const levelRect = useMemo(() => {
    if (levelHighlight === null || !layout) return null;
    const levelNodes = layout.descendants().filter(d => d.depth === levelHighlight);
    if (levelNodes.length === 0) return null;
    const minX = Math.min(...levelNodes.map(d => d.x)) - NODE_RADIUS - 10;
    const maxX = Math.max(...levelNodes.map(d => d.x)) + NODE_RADIUS + 10;
    const y = levelNodes[0].y;
    return {
      x: minX,
      y: y - NODE_RADIUS - 8,
      width: maxX - minX,
      height: NODE_RADIUS * 2 + 16,
    };
  }, [layout, levelHighlight]);

  // Helper functions for computing visual properties
  const getNodeFill = useCallback((id) => {
    const cls = nodeClasses[id] || 'default';
    return (NODE_COLORS[cls] || NODE_COLORS.default).fill;
  }, [nodeClasses]);

  const getNodeStroke = useCallback((id) => {
    if (ghostState?.actualPath.has(id)) return '#60a5fa';
    if (ghostState?.ghostPath.has(id)) return '#ef4444';
    if (overlayState?.spotlitNodes.has(id)) return '#60a5fa';
    const cls = nodeClasses[id] || 'default';
    return (NODE_COLORS[cls] || NODE_COLORS.default).stroke;
  }, [nodeClasses, ghostState, overlayState]);

  const getNodeStrokeWidth = useCallback((id) => {
    if (overlayState?.spotlitNodes.has(id) || ghostState?.actualPath.has(id) || ghostState?.ghostPath.has(id)) return 4;
    return 2.5;
  }, [overlayState, ghostState]);

  const getNodeStrokeDasharray = useCallback((id) => {
    if (ghostState?.ghostPath.has(id)) return '6,3';
    return 'none';
  }, [ghostState]);

  const getNodeOpacity = useCallback((id) => {
    if (ghostState) {
      if (ghostState.ghostPath.has(id)) return 0.4;
      if (ghostState.actualPath.has(id)) return 1;
      return 0.15;
    }
    if (overlayState) {
      return overlayState.spotlitNodes.has(id) ? 1 : 0.15;
    }
    return 1;
  }, [ghostState, overlayState]);

  const getEdgeStroke = useCallback((sourceId, targetId) => {
    const key = `${sourceId}-${targetId}`;
    if (ghostState?.actualEdges.has(key)) return '#60a5fa';
    if (ghostState?.ghostEdges.has(key)) return '#ef4444';
    if (overlayState?.spotlitEdges.has(key)) return '#60a5fa';
    const cls = edgeClasses[key] || 'default';
    return EDGE_COLORS[cls] || EDGE_COLORS.default;
  }, [edgeClasses, ghostState, overlayState]);

  const getEdgeStrokeWidth = useCallback((sourceId, targetId) => {
    const key = `${sourceId}-${targetId}`;
    if (ghostState?.actualEdges.has(key) || ghostState?.ghostEdges.has(key)) return 3;
    if (overlayState?.spotlitEdges.has(key)) return 3;
    return edgeClasses[key] ? 3 : 2;
  }, [edgeClasses, ghostState, overlayState]);

  const getEdgeDasharray = useCallback((sourceId, targetId) => {
    const key = `${sourceId}-${targetId}`;
    if (ghostState?.ghostEdges.has(key)) return '6,3';
    return 'none';
  }, [ghostState]);

  const getEdgeOpacity = useCallback((sourceId, targetId) => {
    const key = `${sourceId}-${targetId}`;
    if (ghostState) {
      if (ghostState.ghostEdges.has(key)) return 0.4;
      if (ghostState.actualEdges.has(key)) return 1;
      return 0.15;
    }
    if (overlayState) {
      if (overlayState.spotlitEdges.has(key)) return 1;
      return 0.15;
    }
    return 0.8;
  }, [ghostState, overlayState]);

  return (
    <div className="relative h-full flex flex-col">


      {explanationMode && (
        <div className="absolute top-3 right-3 z-10 bg-purple-900/90 text-sm text-purple-200 px-3 py-1.5 rounded-lg border border-purple-700 flex items-center gap-2">
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
          Explaining...
        </div>
      )}

      <div ref={containerRef} className="relative flex-1 w-full" style={{ minHeight: '300px' }}>
        {!treeData || treeData.nodes.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500">Waiting for tree data...</p>
          </div>
        ) : (
          <>
            {zoomTransformStr && (
              <button
                onClick={resetZoom}
                className="absolute bottom-10 right-3 z-10 bg-gray-800/90 text-xs text-gray-300 px-2 py-1 rounded border border-gray-700 hover:bg-gray-700 transition-colors"
              >
                Reset view
              </button>
            )}
            <svg
              ref={svgRef}
              width={dimensions.width}
              height={dimensions.height}
              className="w-full h-full"
              style={{ cursor: 'grab' }}
              role="img"
              aria-label="Binary tree visualization"
            >
              <g transform={zoomTransformStr}>
              <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
                {/* Level highlight rectangle */}
                {levelRect && (
                  <m.rect
                    initial={{ opacity: 0 }}
                    animate={{
                      x: levelRect.x,
                      y: levelRect.y,
                      width: levelRect.width,
                      height: levelRect.height,
                      opacity: 1,
                    }}
                    exit={{ opacity: 0 }}
                    transition={SPRING_TRANSITION}
                    rx={8}
                    fill="rgba(59, 130, 246, 0.15)"
                    stroke="rgba(59, 130, 246, 0.3)"
                    strokeWidth={1}
                  />
                )}

                {/* Edges */}
                {layout && (
                  <AnimatePresence>
                    {layout.links().map(link => {
                      const sourceId = link.source.data.id;
                      const targetId = link.target.data.id;
                      const edgeKey = `${sourceId}-${targetId}`;
                      const edgeLabel = link.target.data.parentEdgeLabel;
                      const midX = (link.source.x + link.target.x) / 2;
                      const midY = (link.source.y + link.target.y) / 2;
                      return (
                        <React.Fragment key={edgeKey}>
                          <m.line
                            initial={{
                              x1: link.source.x,
                              y1: link.source.y,
                              x2: link.source.x,
                              y2: link.source.y,
                              opacity: 0,
                            }}
                            animate={{
                              x1: link.source.x,
                              y1: link.source.y,
                              x2: link.target.x,
                              y2: link.target.y,
                              opacity: getEdgeOpacity(sourceId, targetId),
                            }}
                            exit={{
                              opacity: 0,
                            }}
                            transition={SPRING_TRANSITION}
                            stroke={getEdgeStroke(sourceId, targetId)}
                            strokeWidth={getEdgeStrokeWidth(sourceId, targetId)}
                            strokeDasharray={getEdgeDasharray(sourceId, targetId)}
                          />
                          {edgeLabel !== undefined && (
                            <m.g
                              initial={{ x: link.source.x, y: link.source.y, opacity: 0 }}
                              animate={{ x: midX, y: midY, opacity: getEdgeOpacity(sourceId, targetId) }}
                              exit={{ opacity: 0 }}
                              transition={SPRING_TRANSITION}
                            >
                              <rect
                                x={-(edgeLabel.length * 7 + 8) / 2}
                                y={-9}
                                width={edgeLabel.length * 7 + 8}
                                height={14}
                                rx={3}
                                fill="#111827"
                                fillOpacity={0.85}
                              />
                              <text
                                textAnchor="middle"
                                dy="0.35em"
                                fill="#9CA3AF"
                                fontSize="11px"
                                fontFamily="monospace"
                                style={{ pointerEvents: 'none', userSelect: 'none' }}
                              >
                                {edgeLabel}
                              </text>
                            </m.g>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </AnimatePresence>
                )}

                {/* Nodes */}
                {layout && (
                  <AnimatePresence>
                    {layout.descendants().map(node => {
                      const id = node.data.id;
                      const rbColor = nodeColors[id];
                      const nodeOpacity = getNodeOpacity(id);

                      return (
                        <m.g
                          key={id}
                          initial={{ x: node.x, y: node.y, opacity: 0, scale: 0 }}
                          animate={{
                            x: node.x,
                            y: node.y,
                            opacity: 1,
                            scale: 1,
                          }}
                          exit={{ opacity: 0, scale: 0 }}
                          transition={SPRING_TRANSITION}
                        >
                          {/* Node circle */}
                          <m.circle
                            r={NODE_RADIUS}
                            animate={{
                              fill: getNodeFill(id),
                              stroke: getNodeStroke(id),
                              strokeWidth: getNodeStrokeWidth(id),
                              opacity: nodeOpacity,
                            }}
                            transition={FAST_SPRING}
                            strokeDasharray={getNodeStrokeDasharray(id)}
                          />

                          {/* Red-black tree color indicator */}
                          {rbColor && (
                            <circle
                              r={6}
                              cx={NODE_RADIUS - 4}
                              cy={-(NODE_RADIUS - 4)}
                              fill={rbColor === 'red' ? '#EF4444' : '#1F2937'}
                              stroke={rbColor === 'red' ? '#FCA5A5' : '#6B7280'}
                              strokeWidth={1.5}
                            />
                          )}

                          {/* Node value text */}
                          <m.text
                            textAnchor="middle"
                            dy="0.35em"
                            fill="white"
                            fontSize="14px"
                            fontWeight="bold"
                            fontFamily="monospace"
                            animate={{ opacity: nodeOpacity }}
                            transition={FAST_SPRING}
                            style={{ pointerEvents: 'none', userSelect: 'none' }}
                          >
                            {node.data.value}
                          </m.text>
                        </m.g>
                      );
                    })}
                  </AnimatePresence>
                )}

                {/* Overlay annotations */}
                {overlayState?.annotations?.length > 0 && layout && (
                  overlayState.annotations.map((ann, i) => {
                    const pos = nodePositions[ann.target];
                    if (!pos) return null;
                    const offsetX = ann.position === 'left' ? -80 : ann.position === 'right' ? 40 : 0;
                    const offsetY = ann.position === 'top' ? -(NODE_RADIUS + 30) : ann.position === 'bottom' ? (NODE_RADIUS + 10) : -(NODE_RADIUS + 30);
                    return (
                      <foreignObject
                        key={`ann-${i}`}
                        x={pos.x + offsetX - 60}
                        y={pos.y + offsetY}
                        width={140}
                        height={40}
                      >
                        <div
                          xmlns="http://www.w3.org/1999/xhtml"
                          style={{
                            background: 'rgba(17,24,39,0.95)',
                            border: '1px solid #3b82f6',
                            color: '#93c5fd',
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            textAlign: 'center',
                            pointerEvents: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ann.text}
                        </div>
                      </foreignObject>
                    );
                  })
                )}
              </g>
              </g>{/* end zoom wrapper */}
            </svg>

          {/* Heap array representation */}
          {heapArray && (
            <div className="px-4 pb-3 border-t border-gray-800 pt-3">
              <div className="text-xs uppercase tracking-wide mb-1 text-center" style={{ color: 'var(--color-text-secondary, #9a9690)' }}>
                Heap Array
              </div>
              <div className="flex items-center justify-center gap-1">
                {heapArray.map((val, idx) => {
                  const nodeId = treeData.nodes[idx]?.id;
                  const cls = nodeId ? (nodeClasses[nodeId] || 'default') : 'default';
                  const colors = NODE_COLORS[cls] || NODE_COLORS.default;
                  return (
                    <div
                      key={idx}
                      className="flex flex-col items-center"
                    >
                      <div
                        className="flex items-center justify-center rounded border-2 px-2 py-1 min-w-[32px] transition-all duration-300"
                        style={{ backgroundColor: colors.fill, borderColor: colors.stroke }}
                      >
                        <span className="text-xs font-mono text-white font-bold">{val}</span>
                      </div>
                      <span className="text-[9px] text-gray-500 font-mono">{idx}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}

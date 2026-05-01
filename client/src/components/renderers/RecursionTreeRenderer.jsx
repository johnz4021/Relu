import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { registerRenderer, unregisterRenderer } from '../../lib/rendererRegistry';
import { m, AnimatePresence } from 'motion/react';
import * as d3 from 'd3';

const NODE_WIDTH = 72;
const NODE_HEIGHT = 32;
const LEVEL_HEIGHT = 72;
// Fixed-width annotation column on the right; tree gets all remaining space
const ANNOT_WIDTH = 170;
const TREE_PAD = { top: 40, bottom: 100, left: 36, right: 12 };

const SPRING = { type: 'spring', stiffness: 200, damping: 25 };
const FAST_SPRING = { type: 'spring', stiffness: 300, damping: 30 };

// Color palettes for Master Theorem cases
const CASE_COLORS = {
  root_heavy: {
    // Dark at top (root dominates), light at bottom
    generate: (depth, maxDepth) => {
      const t = maxDepth > 0 ? depth / maxDepth : 0;
      const r = Math.round(29 + t * 30);
      const g = Math.round(78 + t * 30);
      const b = Math.round(216 - t * 80);
      return `rgb(${r},${g},${b})`;
    },
  },
  balanced: {
    // Uniform medium intensity
    generate: () => 'rgb(59,130,246)',
  },
  leaf_heavy: {
    // Light at top, dark at bottom (leaves dominate)
    generate: (depth, maxDepth) => {
      const t = maxDepth > 0 ? depth / maxDepth : 0;
      const r = Math.round(59 - t * 30);
      const g = Math.round(130 - t * 50);
      const b = Math.round(246 - t * 80);
      return `rgb(${r},${g},${b})`;
    },
  },
};

const DEFAULT_FILL = '#374151';
const HIGHLIGHT_STROKE = '#60A5FA';
const DEFAULT_STROKE = '#6B7280';

/**
 * Build an abstract recursion tree from recurrence parameters.
 * T(n) = a * T(n/b) + O(n^d)
 */
function buildRecurrenceTree(a, b, d, n) {
  const levels = Math.floor(Math.log(n) / Math.log(b)) + 1;
  const nodes = [];
  const edges = [];
  const levelAnnotations = [];
  let nodeCounter = 0;

  // Determine Master Theorem case
  const logBA = Math.log(a) / Math.log(b);
  let masterCase;
  if (Math.abs(d - logBA) < 0.001) {
    masterCase = 'balanced';
  } else if (d > logBA) {
    masterCase = 'root_heavy';
  } else {
    masterCase = 'leaf_heavy';
  }

  // Build nodes level by level
  for (let k = 0; k < levels; k++) {
    const numNodes = Math.pow(a, k);
    const problemSize = n / Math.pow(b, k);
    const workPerNode = Math.pow(problemSize, d);
    const totalWork = numNodes * workPerNode;

    // Label formatting
    const sizeLabel = k === 0 ? 'n' : `n/${Math.pow(b, k)}`;
    const formula = `${numNodes} × (${sizeLabel})^${d} = ${formatNumber(totalWork)}`;

    levelAnnotations.push({
      level: k,
      nodeCount: numNodes,
      workPerNode,
      totalWork,
      formula,
      sizeLabel: `T(${sizeLabel})`,
    });

    const levelStart = nodeCounter;
    for (let i = 0; i < numNodes; i++) {
      const id = `n${nodeCounter}`;
      const label = k === 0 ? 'T(n)' : (numNodes <= 16 ? `T(${sizeLabel})` : '·');
      nodes.push({
        id,
        label,
        depth: k,
        problemSize,
        work: workPerNode,
      });

      // Connect to parent
      if (k > 0) {
        const parentIndex = Math.floor((nodeCounter - Math.pow(a, k)) / a) + Math.floor((nodeCounter - levelStart) / a);
        // Parent is at level k-1, child i's parent is floor(i/a) at level k-1
        const parentLevelStart = levelStart - Math.pow(a, k - 1);
        const parentIdx = parentLevelStart + Math.floor(i / a);
        edges.push({ from: `n${parentIdx}`, to: id });
      }

      nodeCounter++;
    }
  }

  // Compute Big-O result
  let bigO;
  if (masterCase === 'root_heavy') {
    bigO = d === 1 ? 'O(n)' : `O(n^${d})`;
  } else if (masterCase === 'balanced') {
    bigO = d === 1 ? 'O(n log n)' : `O(n^${d} log n)`;
  } else {
    const logStr = formatLogBA(a, b);
    bigO = `O(n^${logStr})`;
  }

  return {
    nodes,
    edges,
    root: 'n0',
    meta: { a, b, d, n, levels, masterCase },
    levelAnnotations,
    bigO,
  };
}

function formatNumber(n) {
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(1);
}

function formatLogBA(a, b) {
  if (a === b) return '1';
  if (a === 1) return '0';
  // Check for clean integer result
  const val = Math.log(a) / Math.log(b);
  if (Math.abs(val - Math.round(val)) < 0.001) return Math.round(val).toString();
  return `log_${b}(${a})`;
}

/**
 * Build hierarchy from flat node/edge list for d3.tree().
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
      parent.children.push(child);
    }
  }
  return nodeMap[rootId] || null;
}

export default function RecursionTreeRenderer({
  rendererId = 'recursion_tree',
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
  const [levelAnnotations, setLevelAnnotations] = useState([]);
  const [highlightedLevel, setHighlightedLevel] = useState(null);
  const [highlightedNode, setHighlightedNode] = useState(null);
  const [cumulativeLevel, setCumulativeLevel] = useState(null);
  const [masterCase, setMasterCase] = useState(null);
  const [bigO, setBigO] = useState(null);
  const [revealedLevels, setRevealedLevels] = useState(Infinity);
  const [customAnnotations, setCustomAnnotations] = useState({});
  const snapshotsRef = useRef([]);
  const preExplanationRef = useRef(null);
  const rewindStartIdxRef = useRef(null);

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

  const takeSnapshot = useCallback(() => {
    return {
      treeData: treeData ? JSON.parse(JSON.stringify(treeData)) : null,
      levelAnnotations: levelAnnotations.map(a => ({ ...a })),
      highlightedLevel,
      highlightedNode,
      cumulativeLevel,
      masterCase,
      bigO,
      revealedLevels,
      customAnnotations: { ...customAnnotations },
    };
  }, [treeData, levelAnnotations, highlightedLevel, highlightedNode, cumulativeLevel, masterCase, bigO, revealedLevels, customAnnotations]);

  const restoreSnapshot = useCallback((snap) => {
    if (!snap) return;
    setTreeData(snap.treeData);
    setLevelAnnotations(snap.levelAnnotations);
    setHighlightedLevel(snap.highlightedLevel);
    setHighlightedNode(snap.highlightedNode);
    setCumulativeLevel(snap.cumulativeLevel);
    setMasterCase(snap.masterCase);
    setBigO(snap.bigO);
    setRevealedLevels(snap.revealedLevels);
    setCustomAnnotations(snap.customAnnotations);
  }, []);

  const applyAction = useCallback((action, rawParams) => {
    const params = rawParams.params || rawParams;
    switch (action) {
      case 'set_recurrence_tree': {
        const { a, b, d, n } = params;
        const result = buildRecurrenceTree(a, b, d, n);
        setTreeData({ nodes: result.nodes, edges: result.edges, root: result.root, meta: result.meta });
        setLevelAnnotations(result.levelAnnotations);
        setMasterCase(result.meta.masterCase);
        setBigO(result.bigO);
        setHighlightedLevel(null);
        setHighlightedNode(null);
        setCumulativeLevel(null);
        setRevealedLevels(Infinity);
        setCustomAnnotations({});
        break;
      }
      case 'set_concrete_tree': {
        setTreeData({
          nodes: params.nodes || [],
          edges: params.edges || [],
          root: params.root,
          meta: null,
        });
        setHighlightedLevel(null);
        setHighlightedNode(null);
        break;
      }
      case 'highlight_level': {
        setHighlightedLevel(params.level);
        break;
      }
      case 'highlight_node': {
        setHighlightedNode(params.id);
        break;
      }
      case 'set_cumulative': {
        setCumulativeLevel(params.level);
        break;
      }
      case 'show_master_case': {
        setMasterCase(params.case);
        break;
      }
      case 'add_level_annotation': {
        setCustomAnnotations(prev => ({
          ...prev,
          [params.level]: params.text,
        }));
        break;
      }
      case 'reveal_level': {
        setRevealedLevels(params.level + 1);
        break;
      }
      case 'reset': {
        setHighlightedLevel(null);
        setHighlightedNode(null);
        setCumulativeLevel(null);
        setCustomAnnotations({});
        break;
      }
      case 'clear': {
        setTreeData(null);
        setLevelAnnotations([]);
        setHighlightedLevel(null);
        setHighlightedNode(null);
        setCumulativeLevel(null);
        setMasterCase(null);
        setBigO(null);
        setRevealedLevels(Infinity);
        setCustomAnnotations({});
        break;
      }
    }
  }, []);

  // Register with renderer registry
  useEffect(() => {
    registerRenderer(rendererId, {
      apply: applyAction,
      takeSnapshot,
      restoreSnapshot,
      cleanup: () => {
        setHighlightedLevel(null);
        setHighlightedNode(null);
        setCumulativeLevel(null);
        setCustomAnnotations({});
      },
    });
    return () => unregisterRenderer(rendererId);
  }, [rendererId, applyAction, takeSnapshot, restoreSnapshot]);

  // Take snapshot after each segment
  useEffect(() => {
    if (segmentCount === undefined || segmentCount === 0 || !treeData) return;
    snapshotsRef.current.push(takeSnapshot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentCount]);

  // Handle explanation mode (rewind)
  useEffect(() => {
    if (explanationMode?.mode === 'rewind') {
      preExplanationRef.current = takeSnapshot();
      const stepsBack = explanationMode.config?.steps_back || 2;
      const idx = Math.max(0, snapshotsRef.current.length - stepsBack);
      rewindStartIdxRef.current = idx;
      if (snapshotsRef.current[idx]) {
        restoreSnapshot(snapshotsRef.current[idx]);
      }
    } else if (explanationMode === null && preExplanationRef.current) {
      restoreSnapshot(preExplanationRef.current);
      preExplanationRef.current = null;
      rewindStartIdxRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explanationMode]);

  // Advance one snapshot per rewind narration step
  useEffect(() => {
    if (!rewindStep || rewindStartIdxRef.current === null) return;
    const snap = snapshotsRef.current[rewindStartIdxRef.current + rewindStep];
    if (snap) restoreSnapshot(snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewindStep]);

  // Filter nodes/edges by revealedLevels
  const visibleData = useMemo(() => {
    if (!treeData) return null;
    if (revealedLevels === Infinity) return treeData;
    const visibleNodes = treeData.nodes.filter(n => n.depth < revealedLevels);
    const visibleIds = new Set(visibleNodes.map(n => n.id));
    const visibleEdges = treeData.edges.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to));
    return { ...treeData, nodes: visibleNodes, edges: visibleEdges };
  }, [treeData, revealedLevels]);

  // Derived layout regions
  const hasAnnotations = levelAnnotations.length > 0;
  const annotColWidth = hasAnnotations ? ANNOT_WIDTH : 0;
  const treeWidth = dimensions.width - annotColWidth;
  const annotX = treeWidth; // absolute x where annotation column starts

  // D3 tree layout — tree gets the left portion of the SVG
  const layout = useMemo(() => {
    if (!visibleData || !visibleData.nodes.length) return null;

    const innerWidth = treeWidth - TREE_PAD.left - TREE_PAD.right;
    const innerHeight = dimensions.height - TREE_PAD.top - TREE_PAD.bottom;

    const rootData = buildHierarchy(visibleData.nodes, visibleData.edges, visibleData.root);
    if (!rootData) return null;

    const hierarchy = d3.hierarchy(rootData, d => d.children.length > 0 ? d.children : null);
    const treeLayout = d3.tree().size([
      innerWidth,
      innerHeight,
    ]);
    treeLayout(hierarchy);

    return hierarchy;
  }, [visibleData, treeWidth, dimensions.height]);

  // Get Y position for a level
  const levelY = useCallback((level) => {
    if (!layout) return 0;
    const nodesAtLevel = layout.descendants().filter(d => d.depth === level);
    if (nodesAtLevel.length > 0) return nodesAtLevel[0].y;
    return level * LEVEL_HEIGHT;
  }, [layout]);

  // Node fill color based on master case gradient
  const getNodeFill = useCallback((depth) => {
    if (!masterCase || !CASE_COLORS[masterCase]) return DEFAULT_FILL;
    const maxDepth = treeData?.meta?.levels ? treeData.meta.levels - 1 : 3;
    return CASE_COLORS[masterCase].generate(depth, maxDepth);
  }, [masterCase, treeData]);

  // Cumulative work computation
  const cumulativeWork = useMemo(() => {
    if (cumulativeLevel === null || levelAnnotations.length === 0) return null;
    let sum = 0;
    for (let k = 0; k <= Math.min(cumulativeLevel, levelAnnotations.length - 1); k++) {
      sum += levelAnnotations[k].totalWork;
    }
    return formatNumber(sum);
  }, [cumulativeLevel, levelAnnotations]);

  const maxLevels = treeData?.meta?.levels || (levelAnnotations.length) || 0;

  return (
    <div className="relative h-full flex flex-col">


      <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
        {(bigO || masterCase) && (
          <div className="bg-gray-800/90 px-3 py-1.5 rounded-lg border border-gray-700 text-right">
            {masterCase && (
              <div className="text-[10px] text-gray-400 mb-0.5 font-mono">
                {masterCase === 'root_heavy' ? 'Case 3: Root-heavy' :
                 masterCase === 'balanced' ? 'Case 2: Balanced' :
                 'Case 1: Leaf-heavy'}
              </div>
            )}
            {bigO && (
              <div className="text-sm font-mono font-bold" style={{ color: '#d4a574' }}>
                {bigO}
              </div>
            )}
          </div>
        )}
        {explanationMode && (
          <div className="bg-purple-900/90 text-sm text-purple-200 px-3 py-1.5 rounded-lg border border-purple-700 flex items-center gap-2">
            <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
            Explaining...
          </div>
        )}
      </div>

      <div ref={containerRef} className="relative flex-1 w-full pb-3" style={{ minHeight: '300px' }}>
        {!treeData || treeData.nodes.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-500">Waiting for recursion tree...</p>
          </div>
        ) : (
          <>
            {zoomTransformStr && (
              <button
                onClick={resetZoom}
                className="absolute bottom-4 right-3 z-10 bg-gray-800/90 text-xs text-gray-300 px-2 py-1 rounded border border-gray-700 hover:bg-gray-700 transition-colors"
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
            aria-label="Recursion tree visualization"
          >
            <g transform={zoomTransformStr}>
            {/* ── Tree area (left portion) ── */}
            <g transform={`translate(${TREE_PAD.left}, ${TREE_PAD.top})`}>
              {/* Level highlight band */}
              {highlightedLevel !== null && layout && (() => {
                const nodesAtLevel = layout.descendants().filter(d => d.depth === highlightedLevel);
                if (nodesAtLevel.length === 0) return null;
                const minX = Math.min(...nodesAtLevel.map(d => d.x)) - NODE_WIDTH / 2 - 10;
                const maxX = Math.max(...nodesAtLevel.map(d => d.x)) + NODE_WIDTH / 2 + 10;
                const y = nodesAtLevel[0].y;
                return (
                  <m.rect
                    key={`level-hl-${highlightedLevel}`}
                    initial={{ opacity: 0 }}
                    animate={{
                      x: minX,
                      y: y - NODE_HEIGHT / 2 - 8,
                      width: maxX - minX,
                      height: NODE_HEIGHT + 16,
                      opacity: 1,
                    }}
                    transition={SPRING}
                    rx={8}
                    fill="rgba(59, 130, 246, 0.15)"
                    stroke="rgba(59, 130, 246, 0.3)"
                    strokeWidth={1}
                  />
                );
              })()}

              {/* Edges */}
              {layout && (
                <AnimatePresence>
                  {layout.links().map(link => {
                    const sourceId = link.source.data.id;
                    const targetId = link.target.data.id;
                    const edgeKey = `${sourceId}-${targetId}`;
                    return (
                      <m.line
                        key={edgeKey}
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
                          opacity: 0.6,
                        }}
                        exit={{ opacity: 0 }}
                        transition={SPRING}
                        stroke="#6B7280"
                        strokeWidth={1.5}
                      />
                    );
                  })}
                </AnimatePresence>
              )}

              {/* Nodes */}
              {layout && (
                <AnimatePresence>
                  {layout.descendants().map(node => {
                    const id = node.data.id;
                    const depth = node.data.depth;
                    const isLevelHighlighted = highlightedLevel === depth;
                    const isNodeHighlighted = highlightedNode === id;
                    const isHighlighted = isLevelHighlighted || isNodeHighlighted;

                    return (
                      <m.g
                        key={id}
                        initial={{ x: node.x, y: node.y, opacity: 0, scale: 0.5 }}
                        animate={{ x: node.x, y: node.y, opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0 }}
                        transition={SPRING}
                      >
                        <m.rect
                          width={NODE_WIDTH}
                          height={NODE_HEIGHT}
                          rx={6}
                          x={-NODE_WIDTH / 2}
                          y={-NODE_HEIGHT / 2}
                          animate={{
                            fill: getNodeFill(depth),
                            stroke: isHighlighted ? HIGHLIGHT_STROKE : DEFAULT_STROKE,
                            strokeWidth: isHighlighted ? 2 : 1,
                          }}
                          transition={FAST_SPRING}
                        />
                        <m.text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="white"
                          fontSize={11}
                          fontFamily="monospace"
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        >
                          {node.data.label}
                        </m.text>
                      </m.g>
                    );
                  })}
                </AnimatePresence>
              )}

              {/* Level labels (left edge, inside tree <g>) */}
              {layout && Array.from({ length: maxLevels }, (_, k) => {
                if (k >= revealedLevels) return null;
                const y = levelY(k);
                return (
                  <m.text
                    key={`level-label-${k}`}
                    x={-TREE_PAD.left + 4}
                    y={y}
                    fill="#6B7280"
                    fontSize={10}
                    fontFamily="monospace"
                    dominantBaseline="central"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: k * 0.05 }}
                  >
                    k={k}
                  </m.text>
                );
              })}
            </g>

            {/* ── Annotation column (right portion, absolute coords) ── */}
            {hasAnnotations && layout && (
              <g transform={`translate(${annotX + 8}, ${TREE_PAD.top})`}>
                {/* Thin separator line */}
                <line x1={-4} y1={-10} x2={-4} y2={dimensions.height - TREE_PAD.top - TREE_PAD.bottom + 10}
                  stroke="#374151" strokeWidth={1} />

                {levelAnnotations.map(({ level, formula }) => {
                  if (level >= revealedLevels) return null;
                  const y = levelY(level);
                  const isActive = highlightedLevel === level ||
                    (cumulativeLevel !== null && level <= cumulativeLevel);
                  const customText = customAnnotations[level];
                  return (
                    <m.text
                      key={`annot-${level}`}
                      x={0}
                      y={y}
                      fill={isActive ? '#93C5FD' : '#6B7280'}
                      fontSize={10}
                      fontFamily="monospace"
                      dominantBaseline="central"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: isActive ? 1 : 0.5 }}
                      transition={{ delay: level * 0.05 }}
                    >
                      {customText || formula}
                    </m.text>
                  );
                })}

                {/* Cumulative work indicator */}
                {cumulativeLevel !== null && (() => {
                  const y = levelY(cumulativeLevel) + NODE_HEIGHT / 2 + 10;
                  return (
                    <m.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={SPRING}>
                      <m.line
                        x1={-4} y1={y}
                        x2={annotColWidth - 16} y2={y}
                        stroke="#60A5FA" strokeWidth={1} strokeDasharray="4,3"
                      />
                      <m.text
                        x={0} y={y + 14}
                        fill="#93C5FD" fontSize={11} fontFamily="monospace" fontWeight="bold"
                      >
                        Sum = {cumulativeWork}
                      </m.text>
                    </m.g>
                  );
                })()}
              </g>
            )}

            </g>{/* end zoom wrapper */}
          </svg>
          </>
        )}
      </div>
    </div>
  );
}

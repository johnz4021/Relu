import { useEffect, useRef, useState, useCallback } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { registerRenderer, unregisterRenderer } from '../../lib/rendererRegistry';

const NODE_COLORS = {
  default: 'bg-gray-700 border-gray-500',
  highlighted: 'bg-yellow-500/80 border-yellow-400',
  current: 'bg-blue-500/80 border-blue-400',
  inserted: 'bg-green-500/80 border-green-400',
  deleted: 'bg-red-500/50 border-red-400 opacity-50',
  reversed: 'bg-purple-500/80 border-purple-400',
};

const POINTER_COLORS = [
  '#60a5fa', // blue
  '#f87171', // red
  '#34d399', // green
  '#fbbf24', // amber
  '#a78bfa', // purple
  '#fb923c', // orange
  '#2dd4bf', // teal
  '#f472b6', // pink
];

let stableIdCounter = 0;

export default function LinkedRenderer({
  rendererId = 'linked',
  phase,
  explanationMode,
  segmentCount,
  rewindStep = 0,
}) {
  const [nodes, setNodes] = useState([]);
  const [classes, setClasses] = useState([]);
  const [pointers, setPointers] = useState({});
  const [mode, setMode] = useState('list'); // 'list' | 'stack' | 'queue'
  const [overlayState, setOverlayState] = useState(null);
  const [ghostState, setGhostState] = useState(null);
  const [arrows, setArrows] = useState([]);
  const [stableIds, setStableIds] = useState([]);
  const [arrowPositions, setArrowPositions] = useState([]);
  const snapshotsRef = useRef([]);
  const preExplanationRef = useRef(null);
  const rewindStartIdxRef = useRef(null);
  const containerRef = useRef(null);
  const nodeRefs = useRef([]);

  // Generate stable IDs for a list of values
  const generateStableIds = useCallback((count) => {
    const ids = [];
    for (let i = 0; i < count; i++) {
      ids.push(`node-${stableIdCounter++}`);
    }
    return ids;
  }, []);

  // Generate default forward arrows for consecutive nodes
  const generateDefaultArrows = useCallback((count) => {
    const arr = [];
    for (let i = 0; i < count - 1; i++) {
      arr.push({ id: `arrow-${i}`, from: i, to: i + 1, reversed: false });
    }
    return arr;
  }, []);

  // Recalculate arrow positions from DOM refs
  const recalcArrowPositions = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const positions = [];

    for (const arrow of arrows) {
      const fromEl = nodeRefs.current[arrow.from];
      const toEl = nodeRefs.current[arrow.to];
      if (!fromEl || !toEl) continue;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      const fromX = fromRect.right - containerRect.left;
      const fromY = fromRect.top + fromRect.height / 2 - containerRect.top;
      const toX = toRect.left - containerRect.left;
      const toY = toRect.top + toRect.height / 2 - containerRect.top;

      positions.push({
        fromX,
        fromY,
        toX,
        toY,
        reversed: arrow.reversed,
        id: arrow.id,
      });
    }

    setArrowPositions(positions);
  }, [arrows]);

  // Recalculate arrows when nodes or arrows change
  useEffect(() => {
    // Small delay to let layout settle
    const timer = setTimeout(recalcArrowPositions, 50);
    return () => clearTimeout(timer);
  }, [nodes, arrows, recalcArrowPositions]);

  // Also observe resize
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      recalcArrowPositions();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [recalcArrowPositions]);

  const takeLinkedSnapshot = useCallback(() => {
    return {
      nodes: [...nodes],
      classes: [...classes],
      pointers: { ...pointers },
      mode,
      arrows: arrows.map((a) => ({ ...a })),
      stableIds: [...stableIds],
    };
  }, [nodes, classes, pointers, mode, arrows, stableIds]);

  const restoreLinkedSnapshot = useCallback((snap) => {
    if (!snap) return;
    setNodes(snap.nodes);
    setClasses(snap.classes);
    setPointers(snap.pointers);
    setMode(snap.mode);
    if (snap.arrows) setArrows(snap.arrows);
    if (snap.stableIds) setStableIds(snap.stableIds);
  }, []);

  const applyLinkedAction = useCallback((action, rawParams) => {
    const params = rawParams.params || rawParams;
    switch (action) {
      case 'set_list': {
        const values = params.values || [];
        setNodes(values);
        setClasses(new Array(values.length).fill('default'));
        setPointers({});
        setMode(params.mode || 'list');
        setArrows(generateDefaultArrows(values.length));
        setStableIds(generateStableIds(values.length));
        break;
      }
      case 'highlight_node': {
        setClasses((prev) => {
          const next = [...prev];
          const idx = typeof params.index === 'number' ? params.index : nodes.indexOf(params.value);
          if (idx >= 0 && idx < next.length) {
            next[idx] = params.className || 'highlighted';
          }
          return next;
        });
        break;
      }
      case 'highlight_pointer': {
        setPointers((prev) => ({
          ...prev,
          [params.name]: { index: params.index, highlighted: true },
        }));
        break;
      }
      case 'insert_after': {
        const idx = params.index;
        setNodes((prev) => {
          const next = [...prev];
          next.splice(idx + 1, 0, params.value);
          return next;
        });
        setClasses((prev) => {
          const next = [...prev];
          next.splice(idx + 1, 0, 'inserted');
          return next;
        });
        setStableIds((prev) => {
          const next = [...prev];
          next.splice(idx + 1, 0, `node-${stableIdCounter++}`);
          return next;
        });
        setArrows((prev) => {
          // Update indices for arrows after insertion point
          const updated = prev.map((a) => ({
            ...a,
            from: a.from > idx ? a.from + 1 : a.from,
            to: a.to > idx ? a.to + 1 : a.to,
          }));
          // Insert new arrow from idx to idx+1, and update the old arrow from idx
          const newArrow = { id: `arrow-ins-${stableIdCounter}`, from: idx, to: idx + 1, reversed: false };
          // Find arrow that was from idx and point it from idx+1
          const existingIdx = updated.findIndex((a) => a.from === idx && a.to === idx + 2);
          if (existingIdx >= 0) {
            updated[existingIdx] = { ...updated[existingIdx], from: idx + 1 };
          }
          updated.push(newArrow);
          return updated;
        });
        break;
      }
      case 'delete_node': {
        const idx = params.index;
        setClasses((prev) => {
          const next = [...prev];
          if (idx >= 0 && idx < next.length) next[idx] = 'deleted';
          return next;
        });
        // Remove after animation delay
        setTimeout(() => {
          setNodes((prev) => prev.filter((_, i) => i !== idx));
          setClasses((prev) => prev.filter((_, i) => i !== idx));
          setStableIds((prev) => prev.filter((_, i) => i !== idx));
          setArrows((prev) => {
            // Remove arrows involving deleted node, adjust indices
            return prev
              .filter((a) => a.from !== idx && a.to !== idx)
              .map((a) => ({
                ...a,
                from: a.from > idx ? a.from - 1 : a.from,
                to: a.to > idx ? a.to - 1 : a.to,
              }));
          });
        }, 400);
        break;
      }
      case 'reverse_segment': {
        const { start, end } = params;
        setNodes((prev) => {
          const next = [...prev];
          const segment = next.slice(start, end + 1).reverse();
          for (let i = start; i <= end; i++) {
            next[i] = segment[i - start];
          }
          return next;
        });
        setClasses((prev) => {
          const next = [...prev];
          for (let i = start; i <= end; i++) {
            next[i] = 'reversed';
          }
          return next;
        });
        setStableIds((prev) => {
          const next = [...prev];
          const segment = next.slice(start, end + 1).reverse();
          for (let i = start; i <= end; i++) {
            next[i] = segment[i - start];
          }
          return next;
        });
        // Reverse arrows in the segment range
        setArrows((prev) =>
          prev.map((a) => {
            if (a.from >= start && a.from < end && a.to > start && a.to <= end) {
              return { ...a, from: a.to, to: a.from, reversed: !a.reversed };
            }
            return a;
          })
        );
        break;
      }
      case 'push': {
        const newId = `node-${stableIdCounter++}`;
        setNodes((prev) => [params.value, ...prev]);
        setClasses((prev) => ['inserted', ...prev]);
        setStableIds((prev) => [newId, ...prev]);
        setArrows((prev) => {
          const updated = prev.map((a) => ({
            ...a,
            from: a.from + 1,
            to: a.to + 1,
          }));
          if (nodes.length > 0) {
            updated.unshift({ id: `arrow-push-${stableIdCounter}`, from: 0, to: 1, reversed: false });
          }
          return updated;
        });
        break;
      }
      case 'pop': {
        setClasses((prev) => {
          const next = [...prev];
          if (next.length > 0) next[0] = 'deleted';
          return next;
        });
        setTimeout(() => {
          setNodes((prev) => prev.slice(1));
          setClasses((prev) => prev.slice(1));
          setStableIds((prev) => prev.slice(1));
          setArrows((prev) =>
            prev
              .filter((a) => a.from !== 0 && a.to !== 0)
              .map((a) => ({
                ...a,
                from: a.from - 1,
                to: a.to - 1,
              }))
          );
        }, 400);
        break;
      }
      case 'enqueue': {
        const newId = `node-${stableIdCounter++}`;
        setNodes((prev) => [...prev, params.value]);
        setClasses((prev) => [...prev, 'inserted']);
        setStableIds((prev) => [...prev, newId]);
        setArrows((prev) => {
          const newArrows = [...prev];
          if (nodes.length > 0) {
            newArrows.push({
              id: `arrow-enq-${stableIdCounter}`,
              from: nodes.length - 1,
              to: nodes.length,
              reversed: false,
            });
          }
          return newArrows;
        });
        break;
      }
      case 'dequeue': {
        setClasses((prev) => {
          const next = [...prev];
          if (next.length > 0) next[0] = 'deleted';
          return next;
        });
        setTimeout(() => {
          setNodes((prev) => prev.slice(1));
          setClasses((prev) => prev.slice(1));
          setStableIds((prev) => prev.slice(1));
          setArrows((prev) =>
            prev
              .filter((a) => a.from !== 0 && a.to !== 0)
              .map((a) => ({
                ...a,
                from: a.from - 1,
                to: a.to - 1,
              }))
          );
        }, 400);
        break;
      }
      case 'set_pointer': {
        setPointers((prev) => ({
          ...prev,
          [params.name]: { index: params.index, highlighted: false },
        }));
        break;
      }
      case 'reverse_pointer': {
        const { from, to } = params;
        setArrows((prev) =>
          prev.map((a) => {
            // Find the arrow that goes from 'from' to something, and reverse it
            if (a.from === from && !a.reversed) {
              return { ...a, from: a.to, to: a.from, reversed: true };
            }
            return a;
          })
        );
        break;
      }
      case 'set_arrows': {
        setArrows(params.arrows || []);
        break;
      }
      case 'reset': {
        setClasses((prev) => prev.map(() => 'default'));
        setPointers({});
        break;
      }
    }
  }, [nodes, generateDefaultArrows, generateStableIds]);

  // Register with renderer registry
  useEffect(() => {
    registerRenderer(rendererId, {
      apply: applyLinkedAction,
      takeSnapshot: takeLinkedSnapshot,
      restoreSnapshot: restoreLinkedSnapshot,
      cleanup: () => {
        setClasses((prev) => prev.map(() => 'default'));
        setPointers({});
      },
    });
    return () => unregisterRenderer(rendererId);
  }, [rendererId, applyLinkedAction, takeLinkedSnapshot, restoreLinkedSnapshot]);

  // Take snapshot after each segment
  useEffect(() => {
    if (segmentCount === undefined || segmentCount === 0 || nodes.length === 0) return;
    snapshotsRef.current.push(takeLinkedSnapshot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentCount]);

  // Handle explanation mode
  useEffect(() => {
    if (explanationMode?.mode === 'rewind') {
      preExplanationRef.current = takeLinkedSnapshot();
      const stepsBack = explanationMode.config?.steps_back || 2;
      const idx = Math.max(0, snapshotsRef.current.length - stepsBack);
      rewindStartIdxRef.current = idx;
      if (snapshotsRef.current[idx]) {
        restoreLinkedSnapshot(snapshotsRef.current[idx]);
      }
    } else if (explanationMode?.mode === 'overlay') {
      preExplanationRef.current = takeLinkedSnapshot();
      const config = explanationMode.config;
      const spotlit = new Set(config.spotlight_indices || []);
      setOverlayState({
        spotlit,
        annotations: (config.annotations || []).map(a => ({
          index: typeof a.target === 'number' ? a.target : parseInt(a.target),
          text: a.text,
          position: a.position || 'top',
        })),
      });
    } else if (explanationMode?.mode === 'ghost_alternative') {
      preExplanationRef.current = takeLinkedSnapshot();
      const config = explanationMode.config;
      setGhostState({
        ghost: new Set(config.ghost_indices || []),
        actual: new Set(config.actual_indices || []),
        ghostLabel: config.ghost_label,
        actualLabel: config.actual_label,
      });
    } else if (explanationMode === null && preExplanationRef.current) {
      setOverlayState(null);
      setGhostState(null);
      restoreLinkedSnapshot(preExplanationRef.current);
      preExplanationRef.current = null;
      rewindStartIdxRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explanationMode]);

  // Advance one snapshot per rewind narration step
  useEffect(() => {
    if (!rewindStep || rewindStartIdxRef.current === null) return;
    const snap = snapshotsRef.current[rewindStartIdxRef.current + rewindStep];
    if (snap) restoreLinkedSnapshot(snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewindStep]);

  const isVertical = mode === 'stack';

  // Compute pointer positions based on node refs
  const getPointerNodePositions = () => {
    if (!containerRef.current) return {};
    const containerRect = containerRef.current.getBoundingClientRect();
    const positions = {};
    for (const [name, ptr] of Object.entries(pointers)) {
      const el = nodeRefs.current[ptr.index];
      if (el) {
        const rect = el.getBoundingClientRect();
        positions[name] = {
          x: rect.left + rect.width / 2 - containerRect.left,
          y: rect.top - containerRect.top - 28,
        };
      }
    }
    return positions;
  };

  const pointerPositions = containerRef.current ? getPointerNodePositions() : {};

  return (
    <div className="relative h-full flex flex-col items-center justify-center p-6">


      {explanationMode && (
        <div className="absolute top-3 right-3 z-10 bg-purple-900/90 text-sm text-purple-200 px-3 py-1.5 rounded-lg border border-purple-700 flex items-center gap-2">
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
          Explaining...
        </div>
      )}

      {nodes.length === 0 ? (
        <p className="text-gray-500">Waiting for linked structure data...</p>
      ) : (
        <div className="w-full max-w-3xl">
          {/* Mode label */}
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-3 text-center">
            {mode === 'stack' ? 'Stack (top →)' : mode === 'queue' ? 'Queue (front → rear)' : 'Linked List (head → tail)'}
          </div>

          {/* Nodes chain */}
          <div
            ref={containerRef}
            className={`relative flex ${isVertical ? 'flex-col' : 'flex-row flex-wrap'} items-center justify-center gap-4`}
          >
            {/* SVG arrow overlay */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none z-0"
              style={{ overflow: 'visible' }}
            >
              <defs>
                <marker
                  id="arrowhead-gold"
                  markerWidth="8"
                  markerHeight="6"
                  refX="7"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L8,3 L0,6 Z" fill="#d4a574" />
                </marker>
                <marker
                  id="arrowhead-purple"
                  markerWidth="8"
                  markerHeight="6"
                  refX="7"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L8,3 L0,6 Z" fill="#a78bfa" />
                </marker>
              </defs>
              <AnimatePresence>
                {arrowPositions.map((pos) => (
                  <m.line
                    key={pos.id}
                    x1={pos.fromX}
                    y1={pos.fromY}
                    x2={pos.toX}
                    y2={pos.toY}
                    stroke={pos.reversed ? '#a78bfa' : '#d4a574'}
                    strokeWidth={2}
                    markerEnd={pos.reversed ? 'url(#arrowhead-purple)' : 'url(#arrowhead-gold)'}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  />
                ))}
              </AnimatePresence>
            </svg>

            {/* Pointer badges positioned above nodes */}
            {Object.entries(pointers).map(([name, ptr], ptrIdx) => {
              const pos = pointerPositions[name];
              if (!pos) return null;
              return (
                <m.div
                  key={`ptr-${name}`}
                  className="absolute z-30 pointer-events-none"
                  layout
                  animate={{ x: pos.x, y: pos.y }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                  style={{ transform: 'translateX(-50%)' }}
                >
                  <div
                    className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                    style={{
                      backgroundColor: POINTER_COLORS[ptrIdx % POINTER_COLORS.length] + '33',
                      color: POINTER_COLORS[ptrIdx % POINTER_COLORS.length],
                      border: `1px solid ${POINTER_COLORS[ptrIdx % POINTER_COLORS.length]}`,
                    }}
                  >
                    {name}
                  </div>
                </m.div>
              );
            })}

            <AnimatePresence mode="popLayout">
              {nodes.map((value, idx) => {
                const colorClass = NODE_COLORS[classes[idx]] || NODE_COLORS.default;
                const isDimmed = (overlayState && !overlayState.spotlit.has(idx)) || (ghostState && !ghostState.ghost.has(idx) && !ghostState.actual.has(idx));
                const isSpotlit = overlayState?.spotlit.has(idx);
                const isGhost = ghostState?.ghost.has(idx);
                const isActual = ghostState?.actual.has(idx);
                const layoutId = stableIds[idx] || `node-fallback-${idx}`;
                return (
                  <m.div
                    key={layoutId}
                    layout
                    layoutId={layoutId}
                    ref={(el) => {
                      nodeRefs.current[idx] = el;
                    }}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                    className={`relative z-10 flex items-center justify-center rounded-lg border-2 px-4 py-2 min-w-[48px] ${colorClass} ${isSpotlit ? 'ring-2 ring-blue-400' : ''} ${isActual ? 'ring-2 ring-blue-400' : ''}`}
                    style={{
                      ...(isDimmed ? { opacity: 0.15 } : {}),
                      ...(isGhost ? { opacity: 0.4, borderStyle: 'dashed', borderColor: '#ef4444' } : {}),
                    }}
                  >
                    <span className="text-sm font-mono text-white font-bold">{value}</span>
                  </m.div>
                );
              })}
            </AnimatePresence>
            <span className="text-gray-600 text-sm ml-1 z-10">null</span>

            {/* Overlay annotations */}
            {overlayState?.annotations?.map((ann, i) => {
              const leftPct = ((ann.index + 0.5) / nodes.length) * 100;
              return (
                <div key={i}
                  className="absolute z-20 bg-gray-900/95 border border-blue-500 text-blue-200 text-sm px-3 py-2 rounded-md shadow-lg pointer-events-none max-w-[240px]"
                  style={{
                    left: `${leftPct}%`, transform: 'translateX(-50%)',
                    ...(ann.position === 'bottom' ? { bottom: '-24px' } : { top: '-24px' }),
                  }}>
                  {ann.text}
                </div>
              );
            })}
          </div>

        </div>
      )}
    </div>
  );
}

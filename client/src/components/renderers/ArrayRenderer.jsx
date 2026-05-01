import { useEffect, useRef, useState, useCallback } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { registerRenderer, unregisterRenderer } from '../../lib/rendererRegistry';

const BAR_GAP = 6; // matches gap-1.5 (0.375rem = 6px)
const MAX_BAR_W = 60;

function barGeometry(n, containerW) {
  if (!n || !containerW) return { barW: 0, offset: 0 };
  const barW = Math.min(MAX_BAR_W, (containerW - (n - 1) * BAR_GAP) / n);
  const totalW = n * barW + (n - 1) * BAR_GAP;
  return { barW, offset: (containerW - totalW) / 2 };
}

function barCenterPx(idx, n, containerW) {
  const { barW, offset } = barGeometry(n, containerW);
  return offset + idx * (barW + BAR_GAP) + barW / 2;
}

const CLASS_COLORS = {
  default: 'bg-gray-700 border-gray-600',
  comparing: 'bg-yellow-500/80 border-yellow-400',
  swapping: 'bg-blue-500/80 border-blue-400',
  sorted: 'bg-green-600/80 border-green-500',
  pivot: 'bg-purple-600/80 border-purple-500',
  active: 'bg-blue-500/80 border-blue-400',
  window: 'bg-cyan-600/80 border-cyan-500',
};

const DEPTH_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#eab308'];

const barSpring = { type: 'spring', stiffness: 300, damping: 25 };
const pointerSpring = { type: 'spring', stiffness: 200, damping: 20 };

let nextStableId = 0;

export default function ArrayRenderer({
  rendererId = 'array',
  phase,
  explanationMode,
  segmentCount,
  rewindStep = 0,
}) {
  const [data, setData] = useState([]);
  const [classes, setClasses] = useState([]);
  const [labels, setLabels] = useState([]);
  const [pointers, setPointers] = useState({});
  const [windowRange, setWindowRange] = useState(null);
  const [overlayState, setOverlayState] = useState(null);
  const [ghostState, setGhostState] = useState(null);
  const [stableIds, setStableIds] = useState([]);
  const [partitionRange, setPartitionRange] = useState(null);
  const [subarrayRanges, setSubarrayRanges] = useState([]);
  const barContainerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const snapshotsRef = useRef([]);
  const preExplanationRef = useRef(null);
  const rewindStartIdxRef = useRef(null);

  const takeArraySnapshot = useCallback(() => {
    return {
      data: [...data],
      classes: [...classes],
      labels: [...labels],
      pointers: { ...pointers },
      windowRange: windowRange ? { ...windowRange } : null,
      stableIds: [...stableIds],
      partitionRange: partitionRange ? { ...partitionRange } : null,
      subarrayRanges: subarrayRanges.map(r => ({ ...r })),
    };
  }, [data, classes, labels, pointers, windowRange, stableIds, partitionRange, subarrayRanges]);

  const restoreArraySnapshot = useCallback((snap) => {
    if (!snap) return;
    setData(snap.data);
    setClasses(snap.classes);
    setLabels(snap.labels);
    setPointers(snap.pointers);
    setWindowRange(snap.windowRange);
    setStableIds(snap.stableIds || []);
    setPartitionRange(snap.partitionRange || null);
    setSubarrayRanges(snap.subarrayRanges || []);
  }, []);

  const applyArrayAction = useCallback((action, rawParams) => {
    const params = rawParams.params || rawParams;
    console.log(`[ArrayRenderer] applyArrayAction: ${action}`, params);
    switch (action) {
      case 'set_data': {
        const values = params.values || [];
        setData(values);
        setClasses(new Array(values.length).fill('default'));
        setLabels(params.labels || new Array(values.length).fill(''));
        setPointers({});
        setWindowRange(null);
        const ids = values.map(() => nextStableId++);
        setStableIds(ids);
        setPartitionRange(null);
        setSubarrayRanges([]);
        break;
      }
      case 'highlight': {
        setClasses((prev) => {
          const next = [...prev];
          for (const idx of params.indices || []) {
            if (idx >= 0 && idx < next.length) {
              next[idx] = params.className || 'comparing';
            }
          }
          return next;
        });
        break;
      }
      case 'swap': {
        const { i, j } = params;
        setData((prev) => {
          const next = [...prev];
          [next[i], next[j]] = [next[j], next[i]];
          return next;
        });
        setClasses((prev) => {
          const next = [...prev];
          next[i] = 'swapping';
          next[j] = 'swapping';
          return next;
        });
        setStableIds((prev) => {
          const next = [...prev];
          [next[i], next[j]] = [next[j], next[i]];
          return next;
        });
        break;
      }
      case 'compare': {
        const { i, j } = params;
        setClasses((prev) => {
          const next = prev.map((c) => (c === 'comparing' ? 'default' : c));
          if (i >= 0 && i < next.length) next[i] = 'comparing';
          if (j >= 0 && j < next.length) next[j] = 'comparing';
          return next;
        });
        break;
      }
      case 'partition': {
        const { pivot_index, left, right } = params;
        setClasses((prev) => {
          const next = [...prev];
          for (let k = left; k <= right; k++) {
            if (k >= 0 && k < next.length) {
              next[k] = k === pivot_index ? 'pivot' : 'active';
            }
          }
          return next;
        });
        setPartitionRange({ left, right });
        break;
      }
      case 'place':
      case 'shift': {
        const { index, value } = params;
        setData((prev) => {
          const next = [...prev];
          if (index >= 0 && index < next.length) next[index] = value;
          return next;
        });
        setClasses((prev) => {
          const next = [...prev];
          if (index >= 0 && index < next.length) next[index] = 'swapping';
          return next;
        });
        break;
      }
      case 'mark_sorted': {
        setClasses((prev) => {
          const next = [...prev];
          for (const idx of params.indices || []) {
            if (idx >= 0 && idx < next.length) {
              next[idx] = 'sorted';
            }
          }
          return next;
        });
        break;
      }
      case 'set_pointer': {
        setPointers((prev) => ({
          ...prev,
          [params.name]: params.index,
        }));
        break;
      }
      case 'clear_pointers': {
        setPointers({});
        break;
      }
      case 'slide_window': {
        setWindowRange({ start: params.start, end: params.end });
        setClasses((prev) => {
          const next = prev.map((c) => (c === 'window' ? 'default' : c));
          for (let k = params.start; k <= params.end && k < next.length; k++) {
            next[k] = 'window';
          }
          return next;
        });
        break;
      }
      case 'set_label': {
        setLabels((prev) => {
          const next = [...prev];
          if (params.index >= 0 && params.index < next.length) {
            next[params.index] = params.label || '';
          }
          return next;
        });
        break;
      }
      case 'mark_subarrays': {
        setSubarrayRanges(params.ranges || []);
        break;
      }
      case 'clear_subarrays': {
        setSubarrayRanges([]);
        break;
      }
      case 'reset': {
        setClasses((prev) => prev.map(() => 'default'));
        setPointers({});
        setWindowRange(null);
        setLabels((prev) => prev.map(() => ''));
        setPartitionRange(null);
        setSubarrayRanges([]);
        break;
      }
    }
  }, []);

  // Register with renderer registry
  useEffect(() => {
    registerRenderer(rendererId, {
      apply: applyArrayAction,
      takeSnapshot: takeArraySnapshot,
      restoreSnapshot: restoreArraySnapshot,
      cleanup: () => {
        setClasses((prev) => prev.map(() => 'default'));
        setPointers({});
        setWindowRange(null);
        setPartitionRange(null);
        setSubarrayRanges([]);
      },
    });
    return () => unregisterRenderer(rendererId);
  }, [rendererId, applyArrayAction, takeArraySnapshot, restoreArraySnapshot]);

  // Take snapshot after each segment
  useEffect(() => {
    if (segmentCount === undefined || segmentCount === 0 || data.length === 0) return;
    snapshotsRef.current.push(takeArraySnapshot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentCount]);

  // Handle explanation mode
  useEffect(() => {
    if (explanationMode?.mode === 'rewind') {
      preExplanationRef.current = takeArraySnapshot();
      const stepsBack = explanationMode.config?.steps_back || 2;
      const idx = Math.max(0, snapshotsRef.current.length - stepsBack);
      rewindStartIdxRef.current = idx;
      if (snapshotsRef.current[idx]) {
        restoreArraySnapshot(snapshotsRef.current[idx]);
      }
    } else if (explanationMode?.mode === 'overlay') {
      preExplanationRef.current = takeArraySnapshot();
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
      preExplanationRef.current = takeArraySnapshot();
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
      restoreArraySnapshot(preExplanationRef.current);
      preExplanationRef.current = null;
      rewindStartIdxRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explanationMode]);

  // Advance one snapshot per rewind narration step
  useEffect(() => {
    if (!rewindStep || rewindStartIdxRef.current === null) return;
    const snap = snapshotsRef.current[rewindStartIdxRef.current + rewindStep];
    if (snap) restoreArraySnapshot(snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewindStep]);

  useEffect(() => {
    const el = barContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data.length]);

  const maxVal = data.length > 0 ? Math.max(...data.map((v) => Math.abs(v)), 1) : 1;

  return (
    <div className="relative h-full flex flex-col items-center justify-center p-6">


      {explanationMode && (
        <div className="absolute top-3 right-3 z-10 bg-purple-900/90 text-sm text-purple-200 px-3 py-1.5 rounded-lg border border-purple-700 flex items-center gap-2">
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
          Explaining...
        </div>
      )}

      {data.length === 0 ? (
        <p className="text-gray-500">Waiting for array data...</p>
      ) : (
        <div className="w-full max-w-3xl">
          {/* Bar chart visualization */}
          <div ref={barContainerRef} className="relative flex items-end justify-center gap-1.5" style={{ height: '250px' }}>
            {/* Partition range overlay */}
            {partitionRange && data.length > 0 && containerWidth > 0 && (() => {
              const { barW, offset } = barGeometry(data.length, containerWidth);
              const pLeft = offset + partitionRange.left * (barW + BAR_GAP);
              const pWidth = (partitionRange.right - partitionRange.left + 1) * barW + (partitionRange.right - partitionRange.left) * BAR_GAP;
              return (
                <div
                  className="absolute bottom-0 rounded pointer-events-none"
                  style={{
                    left: pLeft,
                    width: pWidth,
                    height: '100%',
                    backgroundColor: 'rgba(147, 51, 234, 0.15)',
                    border: '1px solid rgba(147, 51, 234, 0.3)',
                    zIndex: 0,
                  }}
                />
              );
            })()}
            )}

            <AnimatePresence>
              {data.map((value, idx) => {
                const barHeight = Math.max((Math.abs(value) / maxVal) * 200, 20);
                const colorClass = CLASS_COLORS[classes[idx]] || CLASS_COLORS.default;
                const isDimmed = (overlayState && !overlayState.spotlit.has(idx)) || (ghostState && !ghostState.ghost.has(idx) && !ghostState.actual.has(idx));
                const isSpotlit = overlayState?.spotlit.has(idx);
                const isGhost = ghostState?.ghost.has(idx);
                const isActual = ghostState?.actual.has(idx);
                return (
                  <div key={idx} className="flex flex-col items-center gap-1" style={{ flex: '1 1 0', maxWidth: '60px' }}>
                    {labels[idx] && (
                      <span className="text-[10px] text-purple-400 truncate max-w-full">
                        {labels[idx]}
                      </span>
                    )}
                    {isActual && ghostState?.actualLabel && (
                      <span className="text-[9px] text-blue-400 font-mono truncate max-w-full">{ghostState.actualLabel}</span>
                    )}
                    {isGhost && ghostState?.ghostLabel && (
                      <span className="text-[9px] text-red-400 font-mono truncate max-w-full">{ghostState.ghostLabel}</span>
                    )}
                    <m.div
                      layout
                      layoutId={`bar-${stableIds[idx]}`}
                      initial={false}
                      transition={barSpring}
                      className={`w-full rounded-t border-2 flex items-center justify-center ${colorClass}`}
                      style={{
                        height: `${barHeight}px`,
                        minWidth: '28px',
                        ...(isDimmed ? { opacity: 0.15 } : {}),
                        ...(isSpotlit ? { boxShadow: '0 0 0 3px #60a5fa' } : {}),
                        ...(isActual ? { boxShadow: '0 0 0 3px #60a5fa' } : {}),
                        ...(isGhost ? { opacity: 0.4, borderStyle: 'dashed', borderColor: '#ef4444' } : {}),
                      }}
                    >
                      <span className="text-xs font-mono text-white font-bold">{value}</span>
                    </m.div>
                    <span className="text-[11px] text-gray-500 font-mono">{idx}</span>
                  </div>
                );
              })}
            </AnimatePresence>
            {/* Overlay annotations */}
            {overlayState?.annotations?.map((ann, i) => {
              const leftPct = ((ann.index + 0.5) / data.length) * 100;
              return (
                <div key={i}
                  className="absolute z-20 bg-gray-900/95 border border-blue-500 text-blue-200 text-sm px-3 py-2 rounded-md shadow-lg pointer-events-none max-w-[240px]"
                  style={{
                    left: `${leftPct}%`, transform: 'translateX(-50%)',
                    ...(ann.position === 'bottom' ? { bottom: '8px' } : { top: '60px' }),
                  }}>
                  {ann.text}
                </div>
              );
            })}
          </div>

          {/* Subarray level indicators */}
          {subarrayRanges.length > 0 && (
            <div className="relative mt-1" style={{ height: `${Math.max(...subarrayRanges.map(r => (r.depth || 0) + 1)) * 8 + 4}px` }}>
              {subarrayRanges.map((range, i) => {
                const depth = range.depth || 0;
                const color = DEPTH_COLORS[depth % DEPTH_COLORS.length];
                return (
                  <div
                    key={i}
                    className="absolute rounded-sm"
                    style={{
                      left: `${(range.left / data.length) * 100}%`,
                      width: `${((range.right - range.left + 1) / data.length) * 100}%`,
                      top: `${depth * 8}px`,
                      height: '6px',
                      backgroundColor: color,
                      opacity: 0.6,
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* Pointers */}
          {Object.keys(pointers).length > 0 && containerWidth > 0 && (
            <div className="relative h-8 mt-2">
              {Object.entries(pointers).map(([name, idx]) => {
                if (idx < 0 || idx >= data.length) return null;
                const leftPx = barCenterPx(idx, data.length, containerWidth);
                return (
                  <m.div
                    key={name}
                    layout
                    className="absolute text-center"
                    animate={{ left: leftPx }}
                    transition={pointerSpring}
                    style={{ transform: 'translateX(-50%)' }}
                  >
                    <div style={{ color: '#d4a574', fontSize: 10 }}>▲</div>
                    <div style={{ color: 'var(--color-text-secondary, #9a9690)', fontSize: 10, fontFamily: "'Instrument Sans', sans-serif", fontWeight: 500 }}>{name}</div>
                  </m.div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { registerRenderer, unregisterRenderer } from '../../lib/rendererRegistry';
import { usePanZoom } from '../../hooks/usePanZoom';

const CELL_BG_COLORS = {
  empty: 'rgba(31, 41, 55, 1)',         // gray-800
  filled: 'rgba(55, 65, 81, 1)',         // gray-700
  current: 'rgba(37, 99, 235, 1)',       // blue-600
  highlighted: 'rgba(234, 179, 8, 0.6)', // yellow-500/60
  optimal: 'rgba(22, 163, 74, 0.7)',     // green-600/70
  'dep-skip': 'rgba(249, 115, 22, 0.4)', // orange-500/40
  'dep-take': 'rgba(6, 182, 212, 0.4)',  // cyan-500/40
};

const CELL_TEXT_COLORS = {
  empty: 'text-gray-500',
  filled: 'text-gray-100',
  current: 'text-white',
  highlighted: 'text-white',
  optimal: 'text-white',
  'dep-skip': 'text-white',
  'dep-take': 'text-white',
};

const RING_CLASSES = {
  current: 'ring-2 ring-blue-400',
  'dep-skip': 'ring-2 ring-orange-400',
  'dep-take': 'ring-2 ring-cyan-400',
};

const ARROW_COLORS = {
  skip: '#f97316',  // orange-500
  take: '#06b6d4',  // cyan-500
};

export default function TableRenderer({
  rendererId = 'table',
  phase,
  explanationMode,
  segmentCount,
  rewindStep = 0,
}) {
  const [grid, setGrid] = useState([]);
  const [cellClasses, setCellClasses] = useState([]);
  const [rowHeaders, setRowHeaders] = useState([]);
  const [colHeaders, setColHeaders] = useState([]);
  const [depArrows, setDepArrows] = useState([]);
  const [overlayState, setOverlayState] = useState(null);
  const snapshotsRef = useRef([]);
  const preExplanationRef = useRef(null);
  const rewindStartIdxRef = useRef(null);
  const tableRef = useRef(null);
  const panZoom = usePanZoom();

  const takeTableSnapshot = useCallback(() => {
    return {
      grid: grid.map((r) => [...r]),
      cellClasses: cellClasses.map((r) => [...r]),
      rowHeaders: [...rowHeaders],
      colHeaders: [...colHeaders],
      depArrows: depArrows.map((a) => ({ ...a })),
    };
  }, [grid, cellClasses, rowHeaders, colHeaders, depArrows]);

  const restoreTableSnapshot = useCallback((snap) => {
    if (!snap) return;
    setGrid(snap.grid);
    setCellClasses(snap.cellClasses);
    setRowHeaders(snap.rowHeaders);
    setColHeaders(snap.colHeaders);
    setDepArrows(snap.depArrows);
  }, []);

  const applyTableAction = useCallback((action, rawParams) => {
    const params = rawParams.params || rawParams;
    console.log(`[TableRenderer] applyTableAction: ${action}`, params);
    switch (action) {
      case 'init_grid': {
        const rows = params.rows || 0;
        const cols = params.cols || 0;
        setGrid(Array.from({ length: rows }, () => new Array(cols).fill(null)));
        setCellClasses(Array.from({ length: rows }, () => new Array(cols).fill('empty')));
        setRowHeaders(params.row_headers || Array.from({ length: rows }, (_, i) => `${i}`));
        setColHeaders(params.col_headers || Array.from({ length: cols }, (_, i) => `${i}`));
        setDepArrows([]);
        break;
      }
      case 'fill_cell': {
        const { row, col, value, className } = params;
        setGrid((prev) => {
          const next = prev.map((r) => [...r]);
          if (next[row]) next[row][col] = value;
          return next;
        });
        setCellClasses((prev) => {
          const next = prev.map((r) => [...r]);
          if (next[row]) next[row][col] = className || 'filled';
          return next;
        });
        break;
      }
      case 'highlight_cell': {
        const { row, col, className } = params;
        setCellClasses((prev) => {
          const next = prev.map((r) => [...r]);
          if (next[row]) next[row][col] = className || 'current';
          return next;
        });
        break;
      }
      case 'highlight_row': {
        const { row } = params;
        setCellClasses((prev) => {
          const next = prev.map((r) => [...r]);
          if (next[row]) {
            next[row] = next[row].map((c) => (c === 'empty' || c === 'filled' ? 'highlighted' : c));
          }
          return next;
        });
        break;
      }
      case 'highlight_col': {
        const { col } = params;
        setCellClasses((prev) => {
          const next = prev.map((r) => [...r]);
          for (let i = 0; i < next.length; i++) {
            if (next[i] && (next[i][col] === 'empty' || next[i][col] === 'filled')) {
              next[i][col] = 'highlighted';
            }
          }
          return next;
        });
        break;
      }
      case 'show_dependency_arrow': {
        setDepArrows((prev) => [...prev, { from: params.from, to: params.to, role: params.role }]);
        break;
      }
      case 'clear_dependency_arrows': {
        setDepArrows([]);
        break;
      }
      case 'set_row_header': {
        setRowHeaders((prev) => {
          const next = [...prev];
          next[params.row] = params.label;
          return next;
        });
        break;
      }
      case 'set_col_header': {
        setColHeaders((prev) => {
          const next = [...prev];
          next[params.col] = params.label;
          return next;
        });
        break;
      }
      case 'mark_optimal': {
        setCellClasses((prev) => {
          const next = prev.map((r) => [...r]);
          for (const { row, col } of params.cells || []) {
            if (next[row]) next[row][col] = 'optimal';
          }
          return next;
        });
        break;
      }
      case 'reset': {
        setCellClasses((prev) => prev.map((r) => r.map(() => 'empty')));
        setGrid((prev) => prev.map((r) => r.map(() => null)));
        setDepArrows([]);
        break;
      }
    }
  }, []);

  // Register with renderer registry
  useEffect(() => {
    registerRenderer(rendererId, {
      apply: applyTableAction,
      takeSnapshot: takeTableSnapshot,
      restoreSnapshot: restoreTableSnapshot,
      cleanup: () => {
        setDepArrows([]);
        setCellClasses((prev) => prev.map((r) => r.map((c) => (c === 'current' || c === 'highlighted' ? 'filled' : c))));
      },
    });
    return () => unregisterRenderer(rendererId);
  }, [rendererId, applyTableAction, takeTableSnapshot, restoreTableSnapshot]);

  // Take snapshot after each segment — segmentCount only, matching GraphRenderer
  useEffect(() => {
    if (segmentCount === undefined || segmentCount === 0 || grid.length === 0) return;
    snapshotsRef.current.push(takeTableSnapshot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentCount]);

  // Handle explanation mode
  useEffect(() => {
    if (explanationMode?.mode === 'rewind') {
      preExplanationRef.current = takeTableSnapshot();
      const stepsBack = explanationMode.config?.steps_back || 2;
      const idx = Math.max(0, snapshotsRef.current.length - stepsBack);
      rewindStartIdxRef.current = idx;
      if (snapshotsRef.current[idx]) {
        restoreTableSnapshot(snapshotsRef.current[idx]);
      }
    } else if (explanationMode?.mode === 'overlay') {
      preExplanationRef.current = takeTableSnapshot();
      const config = explanationMode.config;
      const spotlit = new Set((config.spotlight_cells || []).map(c => `${c.row}-${c.col}`));
      setOverlayState({ spotlit, annotations: config.annotations || [] });
    } else if (explanationMode === null && preExplanationRef.current) {
      setOverlayState(null);
      restoreTableSnapshot(preExplanationRef.current);
      preExplanationRef.current = null;
      rewindStartIdxRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explanationMode]);

  // Advance one snapshot per rewind narration step
  useEffect(() => {
    if (!rewindStep || rewindStartIdxRef.current === null) return;
    const snap = snapshotsRef.current[rewindStartIdxRef.current + rewindStep];
    if (snap) restoreTableSnapshot(snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewindStep]);

  // Build a lookup for dependency arrow source cells -> role
  const depSourceMap = useMemo(() => {
    const map = {};
    for (const arrow of depArrows) {
      const key = `${arrow.from.row}-${arrow.from.col}`;
      map[key] = arrow.role || 'skip';
    }
    return map;
  }, [depArrows]);

  // Compute arrow coordinates as percentages of the table grid area
  // Each cell center is at ((col + 1.5) / (totalCols + 1), (row + 1.5) / (totalRows + 1))
  // +1 accounts for the header row/col
  const arrowLines = useMemo(() => {
    if (depArrows.length === 0 || grid.length === 0) return [];
    const totalRows = grid.length + 1;     // +1 for header row
    const totalCols = (grid[0]?.length || 0) + 1; // +1 for header col
    return depArrows.map((arrow, i) => {
      const x1Pct = ((arrow.from.col + 1.5) / totalCols) * 100;
      const y1Pct = ((arrow.from.row + 1.5) / totalRows) * 100;
      const x2Pct = ((arrow.to.col + 1.5) / totalCols) * 100;
      const y2Pct = ((arrow.to.row + 1.5) / totalRows) * 100;
      const color = ARROW_COLORS[arrow.role] || ARROW_COLORS.skip;
      return { x1Pct, y1Pct, x2Pct, y2Pct, color, key: `arrow-${i}` };
    });
  }, [depArrows, grid]);

  return (
    <div
      ref={panZoom.containerRef}
      className="relative h-full flex flex-col items-center justify-center p-8 overflow-hidden"
      style={{ cursor: 'grab', userSelect: 'none' }}
      {...panZoom.handlers}
    >


      {explanationMode && (
        <div className="absolute top-3 right-3 z-10 bg-purple-900/90 text-sm text-purple-200 px-3 py-1.5 rounded-lg border border-purple-700 flex items-center gap-2">
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
          Explaining...
        </div>
      )}

      {panZoom.hasMoved && (
        <button
          onClick={panZoom.reset}
          className="absolute bottom-3 right-3 z-10 bg-gray-800/90 text-xs text-gray-300 px-2 py-1 rounded border border-gray-700 hover:bg-gray-700 transition-colors"
        >
          Reset view
        </button>
      )}

      {grid.length === 0 ? (
        <p className="text-gray-500">Waiting for table data...</p>
      ) : (
        <div
          className="relative w-full flex items-center justify-center"
          style={{ transform: panZoom.transformStyle, transformOrigin: '0 0' }}
        >
          {/* Overlay annotations */}
          {overlayState?.annotations?.map((ann, i) => {
            const target = ann.target;
            let row, col;
            if (typeof target === 'object' && target.row !== undefined) {
              row = target.row;
              col = target.col;
            } else if (typeof target === 'string' && target.includes('-')) {
              [row, col] = target.split('-').map(Number);
            }
            if (row === undefined || col === undefined) return null;
            const cols = grid[0]?.length || 1;
            const rows = grid.length || 1;
            const leftPct = ((col + 1.5) / (cols + 1)) * 100;
            const topPct = ((row + 1.5) / (rows + 1)) * 100;
            return (
              <div key={i}
                className="absolute z-20 bg-gray-900/95 border border-blue-500 text-blue-200 text-sm px-3 py-2 rounded-md shadow-lg pointer-events-none max-w-[240px]"
                style={{
                  left: `${leftPct}%`, top: `${topPct}%`,
                  transform: 'translate(-50%, -50%)',
                }}>
                {ann.text}
              </div>
            );
          })}

          {/* Dependency arrows SVG overlay */}
          {arrowLines.length > 0 && (
            <svg
              className="absolute inset-0 w-full h-full z-10 pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <defs>
                <marker
                  id="arrowhead-skip"
                  markerWidth="8"
                  markerHeight="6"
                  refX="7"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 8 3, 0 6" fill={ARROW_COLORS.skip} />
                </marker>
                <marker
                  id="arrowhead-take"
                  markerWidth="8"
                  markerHeight="6"
                  refX="7"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 8 3, 0 6" fill={ARROW_COLORS.take} />
                </marker>
              </defs>
              <AnimatePresence>
                {arrowLines.map((line) => (
                  <m.line
                    key={line.key}
                    x1={line.x1Pct}
                    y1={line.y1Pct}
                    x2={line.x2Pct}
                    y2={line.y2Pct}
                    stroke={line.color}
                    strokeWidth="0.4"
                    strokeLinecap="round"
                    markerEnd={`url(#arrowhead-${line.color === ARROW_COLORS.take ? 'take' : 'skip'})`}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                  />
                ))}
              </AnimatePresence>
            </svg>
          )}

          <table ref={tableRef} className="border-collapse w-full max-w-4xl">
            <thead>
              <tr>
                <th className="p-1" />
                {colHeaders.map((h, ci) => (
                  <th
                    key={ci}
                    className="px-4 py-3 text-sm text-gray-400 font-mono font-normal text-center truncate"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, ri) => (
                <tr key={ri}>
                  <td className="px-4 py-3 text-sm text-gray-400 font-mono text-right whitespace-nowrap">
                    {rowHeaders[ri]}
                  </td>
                  {row.map((cell, ci) => {
                    const cls = cellClasses[ri]?.[ci] || 'empty';
                    const cellKey = `${ri}-${ci}`;
                    // Apply dependency highlight if this cell is a source and not current/optimal
                    const depRole = depSourceMap[cellKey];
                    const effectiveCls = depRole && (cls === 'filled' || cls === 'empty')
                      ? `dep-${depRole}`
                      : cls;
                    const cellBgColor = CELL_BG_COLORS[effectiveCls] || CELL_BG_COLORS.empty;
                    const textColorClass = CELL_TEXT_COLORS[effectiveCls] || CELL_TEXT_COLORS.empty;
                    const ringClass = RING_CLASSES[effectiveCls] || '';
                    const isDimmed = overlayState && !overlayState.spotlit.has(cellKey);
                    const isSpotlit = overlayState?.spotlit.has(cellKey);
                    return (
                      <m.td
                        key={`${ri}-${ci}`}
                        initial={{ backgroundColor: 'transparent' }}
                        animate={{
                          backgroundColor: cellBgColor,
                          scale: effectiveCls === 'current' ? [1, 1.1, 1] : 1,
                        }}
                        transition={{ duration: 0.3 }}
                        className={`px-5 py-4 text-center text-base font-mono border border-gray-700 ${textColorClass} ${ringClass} ${isDimmed ? 'opacity-[0.15]' : ''} ${isSpotlit ? 'ring-2 ring-blue-400' : ''}`}
                      >
                        <AnimatePresence mode="wait">
                          {cell !== null && (
                            <m.span
                              key={cell}
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ type: 'spring', stiffness: 300 }}
                            >
                              {cell}
                            </m.span>
                          )}
                        </AnimatePresence>
                      </m.td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState, useCallback } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { registerRenderer, unregisterRenderer } from '../../lib/rendererRegistry';

const CELL_SIZE = 40;
const CELL_SIZE_MOBILE = 36;
const CELL_GAP = 4;
const POINTER_SPRING = { type: 'spring', stiffness: 300, damping: 25 };
const PATTERN_SPRING = { type: 'spring', stiffness: 200, damping: 30 };

const CLASS_COLORS = {
  default:   'bg-gray-700 border-gray-600',
  'in-window': 'bg-cyan-600/80 border-cyan-500',
  active:    'bg-blue-500/80 border-blue-400',
  match:     'bg-green-600/80 border-green-500',
  mismatch:  'bg-red-500/80 border-red-400',
  visited:   'bg-gray-700/40 border-gray-600/50',
  found:     'bg-[#d4a574]/80 border-[#d4a574]',
};

const WINDOW_CLASS_OVERRIDE = {
  mismatch: 'bg-red-500/80 border-red-400',
  found:    'bg-[#d4a574]/80 border-[#d4a574]',
  match:    'bg-green-600/80 border-green-500',
  active:   'bg-blue-500/80 border-blue-400',
};

function cellColor(charState, inWindow, windowClass) {
  if (inWindow && windowClass && WINDOW_CLASS_OVERRIDE[windowClass]) {
    return WINDOW_CLASS_OVERRIDE[windowClass];
  }
  if (inWindow) return CLASS_COLORS['in-window'];
  return CLASS_COLORS[charState] || CLASS_COLORS.default;
}

function CharCell({ char, state, inWindow, windowClass, index, stagger = 0 }) {
  const colorClass = cellColor(state, inWindow, windowClass);
  const isFound = state === 'found' || (inWindow && windowClass === 'found');

  return (
    <m.div
      className={`relative flex items-center justify-center border-[1.5px] rounded-[6px] flex-shrink-0 select-none ${colorClass}`}
      style={{
        width: CELL_SIZE,
        height: CELL_SIZE,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 16,
        fontWeight: 600,
        transition: 'background-color 150ms ease-out, border-color 150ms ease-out',
      }}
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        scale: isFound ? [1, 1.04, 1] : 1,
      }}
      transition={isFound ? { scale: { duration: 0.2 } } : { delay: stagger * 0.03 }}
      role="cell"
      aria-label={`position ${index}: '${char}', state: ${state}`}
    >
      {char}
    </m.div>
  );
}

function Pointer({ name, index, cellSize, gap }) {
  const x = index * (cellSize + gap) + cellSize / 2;
  return (
    <m.div
      className="absolute flex flex-col items-center pointer-events-none"
      style={{ bottom: 0, left: 0 }}
      animate={{ x: x - 12 }}
      transition={POINTER_SPRING}
    >
      <span
        style={{
          fontFamily: "'Instrument Sans', sans-serif",
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--color-text-secondary, #9a9690)',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
      <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '6px solid #d4a574', marginTop: 2 }} />
      <div style={{ width: 2, height: 6, background: '#d4a574' }} />
    </m.div>
  );
}

function StringRow({ chars, charStates, windowRange, windowClass, pointers, label, stagger = false }) {
  const n = chars.length;

  return (
    <div className="flex items-start gap-0">
      {label && (
        <div
          className="flex-shrink-0 flex items-center justify-end pr-3"
          style={{
            width: 52,
            height: CELL_SIZE,
            fontFamily: "'Source Sans 3', sans-serif",
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--color-text-secondary, #9a9690)',
          }}
        >
          {label}
        </div>
      )}

      <div className="relative flex flex-col">
        {/* Pointer row above cells */}
        <div className="relative" style={{ height: 36 }}>
          <AnimatePresence>
            {Object.entries(pointers).map(([name, idx]) => (
              <Pointer key={name} name={name} index={idx} cellSize={CELL_SIZE} gap={CELL_GAP} />
            ))}
          </AnimatePresence>
        </div>

        {/* Character cells */}
        <div
          className="flex"
          style={{ gap: CELL_GAP }}
          role="figure"
          aria-label="String algorithm visualization"
        >
          {chars.map((ch, i) => {
            const inWindow = windowRange ? (i >= windowRange.start && i <= windowRange.end) : false;
            return (
              <CharCell
                key={i}
                char={ch}
                state={charStates[i] || 'default'}
                inWindow={inWindow}
                windowClass={windowClass}
                index={i}
                stagger={stagger ? i : 0}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex" style={{ gap: CELL_GAP }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-gray-800 border border-dashed border-gray-600 rounded-[6px] opacity-50 flex-shrink-0"
            style={{ width: CELL_SIZE, height: CELL_SIZE }}
          />
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary, #6b7280)' }}>
        Run an algorithm to see the visualization
      </p>
    </div>
  );
}

export default function StringRenderer({
  rendererId = 'string',
  phase,
  explanationMode,
  segmentCount,
  rewindStep = 0,
}) {
  const [mode, setMode] = useState('single'); // 'single' | 'dual'
  const [chars, setChars] = useState([]);
  const [charStates, setCharStates] = useState([]);
  const [windowRange, setWindowRange] = useState(null);
  const [windowClass, setWindowClass] = useState(null);
  const [pointers, setPointers] = useState({});
  const [patternChars, setPatternChars] = useState([]);
  const [patternStates, setPatternStates] = useState([]);
  const [patternOffset, setPatternOffset] = useState(0);
  const [patternPointers, setPatternPointers] = useState({});

  const snapshotsRef = useRef([]);
  const preExplanationRef = useRef(null);

  const takeSnapshot = useCallback(() => ({
    mode,
    chars: [...chars],
    charStates: [...charStates],
    windowRange: windowRange ? { ...windowRange } : null,
    windowClass,
    pointers: { ...pointers },
    patternChars: [...patternChars],
    patternStates: [...patternStates],
    patternOffset,
    patternPointers: { ...patternPointers },
  }), [mode, chars, charStates, windowRange, windowClass, pointers, patternChars, patternStates, patternOffset, patternPointers]);

  const restoreSnapshot = useCallback((snap) => {
    if (!snap) return;
    setMode(snap.mode || 'single');
    setChars(snap.chars || []);
    setCharStates(snap.charStates || []);
    setWindowRange(snap.windowRange);
    setWindowClass(snap.windowClass);
    setPointers(snap.pointers || {});
    setPatternChars(snap.patternChars || []);
    setPatternStates(snap.patternStates || []);
    setPatternOffset(snap.patternOffset ?? 0);
    setPatternPointers(snap.patternPointers || {});
  }, []);

  const applyAction = useCallback((action, rawParams) => {
    const params = rawParams?.params ?? rawParams ?? {};
    console.log(`[StringRenderer] applyAction: ${action}`, params);

    switch (action) {
      case 'set_string': {
        const s = String(params.s || '');
        const arr = [...s];
        setMode('single');
        setChars(arr);
        setCharStates(new Array(arr.length).fill('default'));
        setWindowRange(null);
        setWindowClass(null);
        setPointers({});
        setPatternChars([]);
        setPatternStates([]);
        setPatternOffset(0);
        setPatternPointers({});
        break;
      }

      case 'set_pattern': {
        const p = String(params.p || '');
        const arr = [...p];
        setMode('dual');
        setPatternChars(arr);
        setPatternStates(new Array(arr.length).fill('default'));
        setPatternOffset(0);
        setPatternPointers({});
        break;
      }

      case 'set_window': {
        setWindowRange({ start: params.start, end: params.end });
        setWindowClass(params.windowClass ?? null);
        break;
      }

      case 'set_char_state': {
        if (params.start !== undefined && params.end !== undefined) {
          // Range form
          setCharStates((prev) => {
            const next = [...prev];
            for (let i = params.start; i <= params.end && i < next.length; i++) {
              next[i] = params.state || 'default';
            }
            return next;
          });
        } else if (params.index !== undefined) {
          setCharStates((prev) => {
            const next = [...prev];
            if (params.index >= 0 && params.index < next.length) {
              next[params.index] = params.state || 'default';
            }
            return next;
          });
        }
        break;
      }

      case 'set_all_state': {
        setCharStates((prev) => prev.map(() => params.state || 'default'));
        break;
      }

      case 'set_pointer': {
        setPointers((prev) => ({ ...prev, [params.name]: params.index }));
        break;
      }

      case 'set_pattern_offset': {
        setPatternOffset(params.k ?? 0);
        break;
      }

      case 'set_match': {
        const { ti, pi, state: matchState = 'match' } = params;
        if (ti !== undefined) {
          setCharStates((prev) => {
            const next = [...prev];
            if (ti >= 0 && ti < next.length) next[ti] = matchState;
            return next;
          });
        }
        if (pi !== undefined) {
          setPatternStates((prev) => {
            const next = [...prev];
            if (pi >= 0 && pi < next.length) next[pi] = matchState;
            return next;
          });
        }
        break;
      }

      default:
        console.warn(`[StringRenderer] Unknown action: ${action}`);
    }
  }, []);

  // Register with renderer registry
  useEffect(() => {
    registerRenderer(rendererId, {
      apply: applyAction,
      takeSnapshot,
      restoreSnapshot,
      cleanup: () => {
        setCharStates((prev) => prev.map(() => 'default'));
        setWindowRange(null);
        setWindowClass(null);
        setPointers({});
        setPatternStates((prev) => prev.map(() => 'default'));
        setPatternOffset(0);
      },
    });
    return () => unregisterRenderer(rendererId);
  }, [rendererId, applyAction, takeSnapshot, restoreSnapshot]);

  // Take snapshot after each segment
  useEffect(() => {
    if (!segmentCount || chars.length === 0) return;
    snapshotsRef.current.push(takeSnapshot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentCount]);

  // Handle explanation mode (rewind)
  useEffect(() => {
    if (explanationMode?.mode === 'rewind') {
      preExplanationRef.current = takeSnapshot();
      const stepsBack = explanationMode.config?.steps_back || 2;
      const idx = Math.max(0, snapshotsRef.current.length - stepsBack);
      if (snapshotsRef.current[idx]) {
        restoreSnapshot(snapshotsRef.current[idx]);
      }
    } else if (explanationMode === null && preExplanationRef.current) {
      restoreSnapshot(preExplanationRef.current);
      preExplanationRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explanationMode]);

  const isEmpty = chars.length === 0;

  if (isEmpty) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState />
      </div>
    );
  }

  const patternTranslateX = patternOffset * (CELL_SIZE + CELL_GAP);

  return (
    <div className="relative h-full flex flex-col items-center justify-center gap-6 p-4 overflow-x-auto">
      {/* Main text row */}
      <StringRow
        chars={chars}
        charStates={charStates}
        windowRange={windowRange}
        windowClass={windowClass}
        pointers={pointers}
        label={mode === 'dual' ? 'text' : null}
        stagger
      />

      {/* Pattern row (KMP dual-string mode) */}
      {mode === 'dual' && patternChars.length > 0 && (
        <div className="flex items-start gap-0">
          <div
            className="flex-shrink-0 flex items-center justify-end pr-3"
            style={{
              width: 52,
              height: CELL_SIZE,
              fontFamily: "'Source Sans 3', sans-serif",
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--color-text-secondary, #9a9690)',
            }}
          >
            pattern
          </div>

          <div className="relative flex flex-col overflow-hidden">
            {/* Pattern offset badge */}
            {patternOffset > 0 && (
              <div
                className="absolute top-0 right-0 text-[11px] px-1.5 py-0.5 rounded"
                style={{ background: '#d4a574', color: '#0d0d0d', fontWeight: 600, zIndex: 10 }}
              >
                offset: {patternOffset}
              </div>
            )}

            {/* Pointer row */}
            <div className="relative" style={{ height: 36 }}>
              <AnimatePresence>
                {Object.entries(patternPointers).map(([name, idx]) => (
                  <Pointer key={name} name={name} index={idx} cellSize={CELL_SIZE} gap={CELL_GAP} />
                ))}
              </AnimatePresence>
            </div>

            {/* Pattern cells with horizontal offset */}
            <m.div
              className="flex"
              style={{ gap: CELL_GAP }}
              animate={{ x: patternTranslateX }}
              transition={PATTERN_SPRING}
            >
              {patternChars.map((ch, i) => (
                <CharCell
                  key={i}
                  char={ch}
                  state={patternStates[i] || 'default'}
                  inWindow={false}
                  windowClass={null}
                  index={i}
                />
              ))}
            </m.div>
          </div>
        </div>
      )}
    </div>
  );
}

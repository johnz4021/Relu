import { useEffect, useRef, useState, useCallback } from 'react';
import { registerRenderer, unregisterRenderer } from '../../lib/rendererRegistry';
import { usePanZoom } from '../../hooks/usePanZoom';

const CLASS_COLORS = {
  default: 'bg-gray-600 border-gray-500',
  current: 'bg-yellow-500/80 border-yellow-400',
  selected: 'bg-green-600/80 border-green-500',
  rejected: 'bg-gray-500/40 border-gray-600',
  overlap: 'bg-red-500/80 border-red-400',
  comparing: 'bg-yellow-500/80 border-yellow-400',
  assigned: 'bg-cyan-600/80 border-cyan-500',
  sorted: 'bg-green-600/80 border-green-500',
};

const MIN_PX_PER_UNIT = 40;

const MACHINE_COLORS = [
  'bg-blue-500/60 border-blue-400',
  'bg-emerald-500/60 border-emerald-400',
  'bg-rose-500/60 border-rose-400',
  'bg-amber-500/60 border-amber-400',
  'bg-sky-500/60 border-sky-400',
  'bg-violet-500/60 border-violet-400',
];

const MACHINE_COLOR_LABELS = [
  { bg: 'bg-blue-500/60', border: 'border-blue-400', text: 'text-blue-300' },
  { bg: 'bg-emerald-500/60', border: 'border-emerald-400', text: 'text-emerald-300' },
  { bg: 'bg-rose-500/60', border: 'border-rose-400', text: 'text-rose-300' },
  { bg: 'bg-amber-500/60', border: 'border-amber-400', text: 'text-amber-300' },
  { bg: 'bg-sky-500/60', border: 'border-sky-400', text: 'text-sky-300' },
  { bg: 'bg-violet-500/60', border: 'border-violet-400', text: 'text-violet-300' },
];

export default function IntervalRenderer({
  rendererId = 'interval',
  phase,
  explanationMode,
  segmentCount,
  rewindStep = 0,
}) {
  const [jobs, setJobs] = useState([]);
  const [machines, setMachines] = useState([]);
  const [assignments, setAssignments] = useState({});   // jobId -> machineIndex
  const [jobClasses, setJobClasses] = useState({});     // jobId -> className
  const [overlaps, setOverlaps] = useState([]);         // [{job1, job2}]
  const [sweepLine, setSweepLine] = useState(null);     // time position or null
  const [pointers, setPointers] = useState({});         // name -> jobId
  const [overlayState, setOverlayState] = useState(null);
  const [ghostState, setGhostState] = useState(null);
  const snapshotsRef = useRef([]);
  const preExplanationRef = useRef(null);
  const rewindStartIdxRef = useRef(null);
  const panZoom = usePanZoom();

  const takeSnapshot = useCallback(() => ({
    jobs: jobs.map(j => ({ ...j })),
    machines: [...machines],
    assignments: { ...assignments },
    jobClasses: { ...jobClasses },
    overlaps: overlaps.map(o => ({ ...o })),
    sweepLine,
    pointers: { ...pointers },
  }), [jobs, machines, assignments, jobClasses, overlaps, sweepLine, pointers]);

  const restoreSnapshot = useCallback((snap) => {
    if (!snap) return;
    setJobs(snap.jobs);
    setMachines(snap.machines);
    setAssignments(snap.assignments);
    setJobClasses(snap.jobClasses);
    setOverlaps(snap.overlaps);
    setSweepLine(snap.sweepLine);
    setPointers(snap.pointers);
  }, []);

  const applyAction = useCallback((action, rawParams) => {
    const params = rawParams.params || rawParams;
    console.log(`[IntervalRenderer] applyAction: ${action}`, params);
    switch (action) {
      case 'set_jobs': {
        const newJobs = (params.jobs || []).map((j, i) => ({
          id: j.id ?? `job_${i}`,
          name: j.name ?? `Job ${i}`,
          start: j.start,
          end: j.end,
        }));
        setJobs(newJobs);
        setJobClasses({});
        setAssignments({});
        setOverlaps([]);
        setSweepLine(null);
        setPointers({});
        break;
      }
      case 'set_machines': {
        const count = params.count || params.machines?.length || 0;
        const names = params.machines || Array.from({ length: count }, (_, i) => `M${i + 1}`);
        setMachines(names);
        break;
      }
      case 'assign_machine': {
        const { job_id, machine } = params;
        setAssignments(prev => ({ ...prev, [job_id]: machine }));
        setJobClasses(prev => ({ ...prev, [job_id]: prev[job_id] || 'assigned' }));
        break;
      }
      case 'highlight_job': {
        const { job_id, className } = params;
        setJobClasses(prev => ({ ...prev, [job_id]: className || 'current' }));
        break;
      }
      case 'highlight_jobs': {
        const { job_ids, className } = params;
        setJobClasses(prev => {
          const next = { ...prev };
          for (const id of job_ids || []) {
            next[id] = className || 'current';
          }
          return next;
        });
        break;
      }
      case 'highlight_overlap': {
        const { job1, job2 } = params;
        setOverlaps(prev => [...prev, { job1, job2 }]);
        setJobClasses(prev => ({
          ...prev,
          [job1]: 'overlap',
          [job2]: 'overlap',
        }));
        break;
      }
      case 'clear_overlaps': {
        setOverlaps([]);
        break;
      }
      case 'mark_sorted': {
        const { job_ids } = params;
        setJobClasses(prev => {
          const next = { ...prev };
          for (const id of job_ids || []) next[id] = 'sorted';
          return next;
        });
        break;
      }
      case 'mark_selected': {
        const { job_ids } = params;
        setJobClasses(prev => {
          const next = { ...prev };
          for (const id of job_ids || []) next[id] = 'selected';
          return next;
        });
        break;
      }
      case 'mark_rejected': {
        const { job_ids } = params;
        setJobClasses(prev => {
          const next = { ...prev };
          for (const id of job_ids || []) next[id] = 'rejected';
          return next;
        });
        break;
      }
      case 'sweep_line': {
        setSweepLine(params.time);
        break;
      }
      case 'clear_sweep_line': {
        setSweepLine(null);
        break;
      }
      case 'set_pointer': {
        setPointers(prev => ({ ...prev, [params.name]: params.job_id }));
        break;
      }
      case 'clear_pointers': {
        setPointers({});
        break;
      }
      case 'reset': {
        setJobClasses({});
        setAssignments({});
        setOverlaps([]);
        setSweepLine(null);
        setPointers({});
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
        setJobClasses({});
        setOverlaps([]);
        setSweepLine(null);
        setPointers({});
      },
    });
    return () => unregisterRenderer(rendererId);
  }, [rendererId, applyAction, takeSnapshot, restoreSnapshot]);

  // Take snapshot after each segment
  useEffect(() => {
    if (segmentCount === undefined || segmentCount === 0 || jobs.length === 0) return;
    snapshotsRef.current.push(takeSnapshot());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentCount]);

  // Handle explanation mode
  useEffect(() => {
    if (explanationMode?.mode === 'rewind') {
      preExplanationRef.current = takeSnapshot();
      const stepsBack = explanationMode.config?.steps_back || 2;
      const idx = Math.max(0, snapshotsRef.current.length - stepsBack);
      rewindStartIdxRef.current = idx;
      if (snapshotsRef.current[idx]) {
        restoreSnapshot(snapshotsRef.current[idx]);
      }
    } else if (explanationMode?.mode === 'overlay') {
      preExplanationRef.current = takeSnapshot();
      const config = explanationMode.config;
      const spotlit = new Set(config.spotlight_job_ids || []);
      setOverlayState({ spotlit });
    } else if (explanationMode?.mode === 'ghost_alternative') {
      preExplanationRef.current = takeSnapshot();
      const config = explanationMode.config;
      setGhostState({
        ghost: new Set(config.ghost_job_ids || []),
        actual: new Set(config.actual_job_ids || []),
        ghostLabel: config.ghost_label,
        actualLabel: config.actual_label,
      });
    } else if (explanationMode === null && preExplanationRef.current) {
      setOverlayState(null);
      setGhostState(null);
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

  // Compute time range
  const timeMin = jobs.length > 0 ? Math.min(...jobs.map(j => j.start)) : 0;
  const timeMax = jobs.length > 0 ? Math.max(...jobs.map(j => j.end)) : 10;
  const timeRange = timeMax - timeMin || 1;
  const minTimelineWidth = timeRange * MIN_PX_PER_UNIT;

  // Group jobs by machine assignment
  const assignedJobs = {};
  const unassignedJobs = [];
  for (const job of jobs) {
    const m = assignments[job.id];
    if (m !== undefined && m !== null) {
      if (!assignedJobs[m]) assignedJobs[m] = [];
      assignedJobs[m].push(job);
    } else {
      unassignedJobs.push(job);
    }
  }

  // Build time axis ticks
  const tickCount = Math.min(timeRange + 1, 15);
  const tickStep = timeRange / (tickCount - 1);
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const val = timeMin + i * tickStep;
    return Math.round(val * 10) / 10;
  });

  const getJobStyle = (job) => {
    const left = ((job.start - timeMin) / timeRange) * 100;
    const width = ((job.end - job.start) / timeRange) * 100;
    return { left: `${left}%`, width: `${Math.max(width, 1)}%` };
  };

  const getJobColor = (job) => {
    const cls = jobClasses[job.id];
    if (cls && CLASS_COLORS[cls]) return CLASS_COLORS[cls];
    const m = assignments[job.id];
    if (m !== undefined && m !== null) {
      return MACHINE_COLORS[m % MACHINE_COLORS.length];
    }
    return CLASS_COLORS.default;
  };

  const isDimmed = (job) => {
    if (overlayState && !overlayState.spotlit.has(job.id)) return true;
    if (ghostState && !ghostState.ghost.has(job.id) && !ghostState.actual.has(job.id)) return true;
    return false;
  };

  const isGhost = (job) => ghostState?.ghost.has(job.id);
  const isActual = (job) => ghostState?.actual.has(job.id);

  const pointerJobIds = new Set(Object.values(pointers));

  const renderJobBar = (job) => {
    const style = getJobStyle(job);
    const colorClass = getJobColor(job);
    const dimmed = isDimmed(job);
    const ghost = isGhost(job);
    const actual = isActual(job);

    return (
      <div
        key={job.id}
        className={`absolute h-7 rounded border-2 flex items-center justify-center transition-all duration-300 ${colorClass}`}
        style={{
          ...style,
          top: '2px',
          ...(dimmed ? { opacity: 0.15 } : {}),
          ...(ghost ? { opacity: 0.4, borderStyle: 'dashed', borderColor: '#ef4444' } : {}),
          ...(actual ? { boxShadow: '0 0 0 3px #60a5fa' } : {}),
        }}
        title={`${job.name}: [${job.start}, ${job.end})`}
      >
        <span className="text-[10px] font-mono text-white font-bold truncate px-1">
          {job.name}
        </span>
        {pointerJobIds.has(job.id) && (
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-red-400 text-[9px] font-mono font-bold">
            {Object.entries(pointers).filter(([, v]) => v === job.id).map(([name]) => name).join(',')}
          </div>
        )}
      </div>
    );
  };

  const renderRow = (label, rowJobs, rowIndex) => (
    <div key={`row-${rowIndex}-${label}`} className="flex items-stretch min-h-[36px]">
      <div className="w-16 flex-shrink-0 flex items-center justify-end pr-3">
        <span className="text-xs font-mono text-gray-400 truncate">{label}</span>
      </div>
      <div className="flex-1 relative border-b border-gray-800">
        {rowJobs.map(renderJobBar)}
      </div>
    </div>
  );

  return (
    <div
      ref={panZoom.containerRef}
      className="relative h-full flex flex-col p-4 overflow-hidden"
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

      {jobs.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Waiting for interval data...</p>
        </div>
      ) : (
        <div
          className="flex flex-col gap-1 mt-8"
          style={{ minWidth: minTimelineWidth + 64, transform: panZoom.transformStyle, transformOrigin: '0 0' }}
        >
          {/* Machine rows */}
          {machines.map((name, i) => renderRow(name, assignedJobs[i] || [], i))}

          {/* Unassigned row (shown if there are unassigned jobs or no machines) */}
          {(unassignedJobs.length > 0 || machines.length === 0) && (
            renderRow(machines.length > 0 ? 'Unassigned' : 'Jobs', unassignedJobs, machines.length)
          )}

          {/* Time axis */}
          <div className="flex items-start mt-1">
            <div className="w-16 flex-shrink-0" />
            <div className="flex-1 relative h-6">
              {ticks.map((t, i) => {
                const left = ((t - timeMin) / timeRange) * 100;
                return (
                  <div
                    key={i}
                    className="absolute text-[11px] text-gray-500 font-mono"
                    style={{ left: `${left}%`, transform: 'translateX(-50%)' }}
                  >
                    {t}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sweep line */}
          {sweepLine !== null && (
            <div className="flex items-start">
              <div className="w-16 flex-shrink-0" />
              <div className="flex-1 relative" style={{ height: 0 }}>
                <div
                  className="absolute z-20"
                  style={{
                    left: `${((sweepLine - timeMin) / timeRange) * 100}%`,
                    width: '2px',
                    backgroundColor: '#d4a574',
                    top: `-${(machines.length + (unassignedJobs.length > 0 || machines.length === 0 ? 1 : 0)) * 36 + 28}px`,
                    height: `${(machines.length + (unassignedJobs.length > 0 || machines.length === 0 ? 1 : 0)) * 36 + 28}px`,
                  }}
                >
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-mono whitespace-nowrap" style={{ color: '#d4a574' }}>
                    t={sweepLine}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Overlap indicators */}
          {overlaps.length > 0 && (
            <div className="flex items-start mt-2">
              <div className="w-16 flex-shrink-0" />
              <div className="flex-1">
                <div className="flex flex-wrap gap-2">
                  {overlaps.map((o, i) => (
                    <span key={i} className="text-[10px] text-red-400 bg-red-900/30 px-2 py-0.5 rounded font-mono">
                      {o.job1} overlaps {o.job2}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Machine color legend */}
          {machines.length > 1 && (
            <div className="flex items-center gap-3 mt-3 pl-16 flex-wrap">
              {machines.map((name, i) => {
                const c = MACHINE_COLOR_LABELS[i % MACHINE_COLOR_LABELS.length];
                return (
                  <div key={name} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-sm border ${c.bg} ${c.border}`} />
                    <span className={`text-[11px] font-mono ${c.text}`}>{name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

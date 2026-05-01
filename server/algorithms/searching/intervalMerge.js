export function intervalMerge(intervals) {
  const trace = [];

  const jobs = intervals.map((iv, i) => ({
    id: `iv${i}`,
    name: `[${iv.start},${iv.end}]`,
    start: iv.start,
    end: iv.end,
  }));

  trace.push({
    type: 'init',
    intervals: jobs.map(j => ({ id: j.id, start: j.start, end: j.end, name: j.name })),
    description: `Merge ${jobs.length} intervals`,
  });

  // Sort by start time
  const sorted = [...jobs].sort((a, b) => a.start - b.start);
  trace.push({
    type: 'sort',
    job_ids: sorted.map(j => j.id),
    description: 'Sort intervals by start time',
  });

  const merged = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const iv = sorted[i];
    trace.push({
      type: 'consider_interval',
      job_id: iv.id,
      description: `Consider interval ${iv.name}`,
    });

    if (iv.start <= current.end) {
      trace.push({
        type: 'overlap_check',
        job1: current.id,
        job2: iv.id,
        description: `Overlap: ${current.name} and ${iv.name} — merge`,
      });
      if (iv.end > current.end) {
        current = { ...current, end: iv.end, name: `[${current.start},${iv.end}]` };
      }
      trace.push({
        type: 'extend_current',
        job_id: current.id,
        new_end: current.end,
        description: `Extended to ${current.name}`,
      });
    } else {
      merged.push({ ...current });
      trace.push({
        type: 'no_overlap',
        job_id: current.id,
        description: `No overlap — keep ${current.name}`,
      });
      current = { ...iv };
    }
  }
  merged.push({ ...current });

  trace.push({
    type: 'result',
    merged: merged.map(m => [m.start, m.end]),
    job_ids: merged.map(m => m.id),
    description: `Merged result: ${merged.map(m => `[${m.start},${m.end}]`).join(', ')}`,
  });

  return trace;
}

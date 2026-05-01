export function intervalScheduling(jobs) {
  const trace = [];

  const jobList = jobs.map((j, i) => ({
    id: j.id ?? `job${i}`,
    name: j.name ?? `Job ${i}`,
    start: j.start,
    end: j.end,
  }));

  trace.push({
    type: 'init_machines',
    jobs: jobList.map(j => ({ id: j.id, name: j.name, start: j.start, end: j.end })),
    machine_count: 1,
    description: `Activity selection: maximize non-overlapping jobs on 1 machine`,
  });

  // Sort by finish time (greedy activity selection)
  const sorted = [...jobList].sort((a, b) => a.end - b.end);
  trace.push({
    type: 'sort',
    job_ids: sorted.map(j => j.id),
    description: 'Sort jobs by finish time',
  });

  const accepted = [];
  let lastEnd = -Infinity;

  for (const job of sorted) {
    trace.push({
      type: 'consider_interval',
      job_id: job.id,
      description: `Consider job ${job.name} [${job.start}, ${job.end}]`,
    });

    if (job.start >= lastEnd) {
      accepted.push(job);
      lastEnd = job.end;
      trace.push({
        type: 'assign_job',
        job_id: job.id,
        machine: 0,
        description: `Accept job ${job.name} — no overlap`,
      });
    } else {
      trace.push({
        type: 'reject_overlap',
        job_id: job.id,
        description: `Reject job ${job.name} — overlaps with last accepted (ends at ${lastEnd})`,
      });
    }
  }

  trace.push({
    type: 'result',
    count: accepted.length,
    job_ids: accepted.map(j => j.id),
    description: `Selected ${accepted.length} non-overlapping jobs`,
  });

  return trace;
}

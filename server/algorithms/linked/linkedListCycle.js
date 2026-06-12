// Floyd's cycle detection (fast/slow pointer) on a linked list.
// Input: { values: [3, 2, 0, -4], pos: 1 } where pos is the index the tail connects to (-1 = no cycle)
//
// Renders on the LINKED renderer: init carries the list + pos so the mapper
// can draw the row with the cycle back-edge (set_arrows); every step carries
// explicit slow/fast INDICES for the named-pointer badges. (Previously on the
// tree renderer, which structurally cannot represent the back-edge — the
// whole point of the algorithm.)

export function linkedListCycle(input) {
  const values = input.values || [3, 2, 0, -4];
  const pos = input.pos ?? 1; // tail connects to node at this index; -1 = no cycle
  const n = values.length;
  const trace = [];

  trace.push({
    type: 'init',
    description: `Floyd's cycle detection: values=[${values.join(', ')}], tail→node[${pos}] (${pos === -1 ? 'no cycle' : `cycle back to index ${pos}`})`,
    list: [...values],
    pos,
    slow: 0,
    fast: 0,
  });

  if (n === 0) {
    trace.push({
      type: 'result',
      description: 'Empty list — no cycle',
      output: 'false',
    });
    return trace;
  }

  // next index for node i: i+1 within the array, tail loops to pos (-1 = end)
  const next = (i) => (i < n - 1 ? i + 1 : (pos >= 0 && pos < n ? pos : -1));

  let slow = 0, fast = 0;
  let cycleDetected = false;
  const maxSteps = n * 2 + 4;

  for (let step = 0; step < maxSteps; step++) {
    const fastNext1 = next(fast);
    const fastNext2 = fastNext1 === -1 ? -1 : next(fastNext1);

    if (fastNext1 === -1 || fastNext2 === -1) {
      trace.push({
        type: 'no_cycle',
        description: `Fast pointer reached the end (null) — no cycle`,
        slow,
        fast,
      });
      break;
    }

    slow = next(slow);
    fast = fastNext2;

    trace.push({
      type: 'traverse',
      description: `Step ${step + 1}: slow→node[${slow}] (${values[slow]}), fast→node[${fast}] (${values[fast]})`,
      slow,
      fast,
    });

    if (slow === fast) {
      cycleDetected = true;
      trace.push({
        type: 'found',
        description: `Cycle detected! slow == fast at node[${slow}] (value=${values[slow]})`,
        slow,
        fast,
        meet: slow,
      });
      break;
    }
  }

  trace.push({
    type: 'result',
    description: cycleDetected ? `Cycle detected — pointers met at node[${slow}]` : 'No cycle detected',
    output: String(cycleDetected),
  });

  return trace;
}

export const DEFAULT_LINKED_LIST_CYCLE_INPUT = { values: [3, 2, 0, -4], pos: 1 };

// ── merge_k_sorted — Merge K Sorted Lists (min-heap approach) ─────────────────
export function mergeKSorted(input) {
  const lists = input.lists || [[1,4,5],[1,3,4],[2,6]];
  const trace = [];

  trace.push({
    type: 'init',
    description: `Merge K=${lists.length} sorted lists using a min-heap. Pop smallest, advance that list's pointer.`,
    node: null,
    parent: null,
  });

  // Min-heap simulation: store [value, listIndex, elementIndex]
  const heap = [];
  for (let i = 0; i < lists.length; i++) {
    if (lists[i].length > 0) {
      heap.push([lists[i][0], i, 0]);
    }
  }
  heap.sort((a, b) => a[0] - b[0]);

  const result = [];

  while (heap.length > 0) {
    const [val, listIdx, elemIdx] = heap.shift();
    result.push(val);

    trace.push({
      type: 'pop',
      description: `Pop ${val} from list[${listIdx}]. Result so far: [${result.join(', ')}]`,
      node: String(val),
      parent: String(listIdx),
    });

    if (elemIdx + 1 < lists[listIdx].length) {
      const nextVal = lists[listIdx][elemIdx + 1];
      heap.push([nextVal, listIdx, elemIdx + 1]);
      heap.sort((a, b) => a[0] - b[0]);
      trace.push({
        type: 'push',
        description: `Advance list[${listIdx}]: next element ${nextVal} added to heap`,
        node: String(nextVal),
        parent: String(listIdx),
      });
    }
  }

  trace.push({
    type: 'result',
    description: `Merged result: [${result.join(', ')}]`,
    node: null,
    parent: null,
    output: JSON.stringify(result),
  });

  return trace;
}

export const DEFAULT_MERGE_K_SORTED_INPUT = { lists: [[1,4,5],[1,3,4],[2,6]] };

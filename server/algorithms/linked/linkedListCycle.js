// Floyd's cycle detection (fast/slow pointer) on a linked list.
// Input: { values: [3, 2, 0, -4], pos: 1 } where pos is the index the tail connects to (-1 = no cycle)

export function linkedListCycle(input) {
  const values = input.values || [3, 2, 0, -4];
  const pos = input.pos ?? 1; // tail connects to node at this index; -1 = no cycle
  const n = values.length;
  const trace = [];

  // Build linked list as array with next pointers
  const nodes = values.map((val, i) => ({
    id: `node${i}`,
    val,
    nextIdx: i < n - 1 ? i + 1 : pos, // last node points to pos (or null if -1)
  }));

  trace.push({
    type: 'init',
    description: `Floyd's cycle detection: values=[${values.join(', ')}], tail→node[${pos}] (${pos === -1 ? 'no cycle' : `cycle at index ${pos}`})`,
    node: 'node0',
    parent: null,
  });

  let slow = 0, fast = 0;
  let cycleDetected = false;
  const maxSteps = n * 2 + 4;

  for (let step = 0; step < maxSteps; step++) {
    const slowNext = nodes[slow]?.nextIdx;
    const fastNext1 = nodes[fast]?.nextIdx;
    const fastNext2 = fastNext1 !== -1 && fastNext1 !== null ? nodes[fastNext1]?.nextIdx : -1;

    if (fastNext1 === -1 || fastNext1 === null || fastNext2 === -1 || fastNext2 === null) {
      trace.push({
        type: 'no_cycle',
        description: `Fast pointer reached end (null) — no cycle`,
        node: `node${slow}`,
        parent: `node${fast}`,
      });
      break;
    }

    slow = slowNext;
    fast = fastNext2 !== undefined ? fastNext2 : -1;

    if (fast === -1 || slow === -1) break;

    trace.push({
      type: 'traverse',
      description: `Step ${step+1}: slow→node${slow}(${values[slow]}), fast→node${fast}(${values[fast]})`,
      node: `node${slow}`,
      parent: `node${fast}`,
    });

    if (slow === fast) {
      cycleDetected = true;
      trace.push({
        type: 'found',
        description: `Cycle detected! slow == fast at node${slow} (value=${values[slow]})`,
        node: `node${slow}`,
        parent: `node${fast}`,
      });
      break;
    }
  }

  trace.push({
    type: 'result',
    description: cycleDetected ? `Cycle detected at node${slow}` : 'No cycle detected',
    node: 'node0',
    parent: null,
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

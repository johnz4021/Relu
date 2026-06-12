// Tier 1 implementations for heap / priority queue patterns.
// Uses a simple array-backed min-heap for correctness.

class MinHeap {
  // cmp(a, b) → true when `a` belongs above `b`. The default preserves the
  // plain numeric min-heap; pair-valued heaps (top_k_heap, k_closest_points)
  // pass a comparator instead of encoding pairs into a single number.
  constructor(cmp = (a, b) => a < b) { this.data = []; this.cmp = cmp; }
  push(val) {
    this.data.push(val);
    this._siftUp(this.data.length - 1);
  }
  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) { this.data[0] = last; this._siftDown(0); }
    return top;
  }
  peek() { return this.data[0]; }
  size() { return this.data.length; }
  _siftUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(this.data[i], this.data[p])) { [this.data[p], this.data[i]] = [this.data[i], this.data[p]]; i = p; }
      else break;
    }
  }
  _siftDown(i) {
    const n = this.data.length;
    while (true) {
      let s = i;
      const l = 2*i+1, r = 2*i+2;
      if (l < n && this.cmp(this.data[l], this.data[s])) s = l;
      if (r < n && this.cmp(this.data[r], this.data[s])) s = r;
      if (s === i) break;
      [this.data[s], this.data[i]] = [this.data[i], this.data[s]]; i = s;
    }
  }
}

class MaxHeap {
  constructor() { this.data = []; }
  push(val) {
    this.data.push(val);
    this._siftUp(this.data.length - 1);
  }
  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) { this.data[0] = last; this._siftDown(0); }
    return top;
  }
  peek() { return this.data[0]; }
  size() { return this.data.length; }
  _siftUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.data[p] < this.data[i]) { [this.data[p], this.data[i]] = [this.data[i], this.data[p]]; i = p; }
      else break;
    }
  }
  _siftDown(i) {
    const n = this.data.length;
    while (true) {
      let s = i;
      const l = 2*i+1, r = 2*i+2;
      if (l < n && this.data[l] > this.data[s]) s = l;
      if (r < n && this.data[r] > this.data[s]) s = r;
      if (s === i) break;
      [this.data[s], this.data[i]] = [this.data[i], this.data[s]]; i = s;
    }
  }
}

// Snapshot an array-backed heap into the {value, label} wire entries that
// vizMapper's heapToTree consumes (label is display-only; value stays data),
// plus the display string runners interpolate into step descriptions.
export function heapSnapshot(items, toEntry) {
  const entries = items.map(toEntry);
  return { entries, show: entries.map(e => e.label ?? String(e.value)).join(', ') };
}

// ── top_k_heap — Top K Frequent Elements (min-heap of size K) ─────────────────
export function topKHeap(input) {
  const nums = input.nums || [];
  const k = input.k ?? 2;
  const trace = [];

  // Count frequencies
  const freq = {};
  for (const n of nums) freq[n] = (freq[n] || 0) + 1;

  trace.push({
    type: 'init',
    description: `Top ${k} frequent from [${nums.join(', ')}]: count frequencies, then min-heap of size ${k}`,
    node: null,
  });

  // Min-heap of [freq, num] pairs — lowest frequency at the root, first to
  // evict. Snapshot-only traces: each insert/evict carries the resulting heap
  // (heapToTree draws it); sift mechanics are heap_ops' lesson, not this one's.
  const heap = new MinHeap((a, b) => (a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1]));
  const toEntry = ([c, n]) => ({ value: n, label: `${n}(×${c})` });

  for (const [nStr, c] of Object.entries(freq)) {
    const n = Number(nStr);
    heap.push([c, n]);
    const snap = heapSnapshot(heap.data, toEntry);
    trace.push({
      type: 'insert',
      description: `Add num=${n} freq=${c} to heap: [${snap.show}]`,
      node: String(n),
      heap: snap.entries,
      heap_index: heap.data.findIndex(([, num]) => num === n),
    });

    if (heap.size() > k) {
      const [ec, en] = heap.pop();
      const snap2 = heapSnapshot(heap.data, toEntry);
      trace.push({
        type: 'extract_min',
        description: `Heap exceeds ${k} — evict lowest freq: ${en}(×${ec})`,
        node: String(en),
        value: `${en}(×${ec})`,
        heap: snap2.entries,
      });
    }
  }

  // Most frequent first in the answer.
  const result = [...heap.data].sort((a, b) => b[0] - a[0]).map(([, n]) => n);

  trace.push({
    type: 'result',
    description: `Top ${k} frequent elements: [${result.join(', ')}]`,
    node: null,
    output: `[${result.join(',')}]`,
  });

  return trace;
}

export const DEFAULT_TOP_K_HEAP_INPUT = { nums: [1, 1, 1, 2, 2, 3], k: 2 };

// ── median_finder — Find Median from Data Stream (two heaps) ──────────────────
export function medianFinder(input) {
  const stream = input.stream || [5, 15, 1, 3, 2, 8];
  const trace = [];

  // lo = max-heap (lower half), hi = min-heap (upper half)
  const lo = new MaxHeap();
  const hi = new MinHeap();

  trace.push({
    type: 'init',
    description: `Median finder: lo=max-heap (lower half), hi=min-heap (upper half)`,
    node: null,
  });

  const medians = [];

  for (const num of stream) {
    // Add to appropriate side
    if (lo.size() === 0 || num <= lo.peek()) {
      lo.push(num);
    } else {
      hi.push(num);
    }

    // Rebalance: lo can have at most 1 more than hi
    if (lo.size() > hi.size() + 1) {
      hi.push(lo.pop());
    } else if (hi.size() > lo.size()) {
      lo.push(hi.pop());
    }

    const median = lo.size() > hi.size()
      ? lo.peek()
      : (lo.peek() + hi.peek()) / 2;
    medians.push(median);

    trace.push({
      type: 'insert',
      description: `Add ${num}: lo=[${[...lo.data].sort((a,b)=>b-a).join(',')}] hi=[${[...hi.data].sort((a,b)=>a-b).join(',')}] → median=${median}`,
      node: String(num),
    });
  }

  trace.push({
    type: 'result',
    description: `Medians after each insertion: [${medians.join(', ')}]`,
    node: null,
    output: String(medians[medians.length - 1]),
  });

  return trace;
}

export const DEFAULT_MEDIAN_FINDER_INPUT = { stream: [5, 15, 1, 3, 2, 8] };

// ── k_closest_points — K Closest Points to Origin (max-heap of size K) ────────
export function kClosestPoints(input) {
  const points = input.points || [[3,3],[5,-1],[-2,4]];
  const k = input.k ?? 2;
  const trace = [];

  // Max-heap by distance — farthest point at the root, first to evict.
  // Snapshot-only traces, same contract as top_k_heap.
  const heap = new MinHeap((a, b) => a[0] > b[0]); // [dist2, point]
  const toEntry = ([d, p]) => ({ value: d, label: `(${p}) d²=${d}` });

  trace.push({
    type: 'init',
    description: `K=${k} closest points to origin from ${points.length} points using max-heap`,
    node: null,
  });

  for (const [x, y] of points) {
    const d2 = x*x + y*y;
    heap.push([d2, [x, y]]);
    const snap = heapSnapshot(heap.data, toEntry);
    trace.push({
      type: 'insert',
      description: `Add (${x},${y}) dist²=${d2} → heap: [${snap.show}]`,
      node: `${x},${y}`,
      heap: snap.entries,
      heap_index: heap.data.findIndex(([d, p]) => p[0] === x && p[1] === y && d === d2),
    });

    if (heap.size() > k) {
      const [ed, ep] = heap.pop();
      const snap2 = heapSnapshot(heap.data, toEntry);
      trace.push({
        type: 'extract_min',
        description: `Evict farthest point (${ep}) d²=${ed}`,
        node: `${ep}`,
        value: `(${ep}) d²=${ed}`,
        heap: snap2.entries,
      });
    }
  }

  const result = heap.data.map(([, p]) => p);
  trace.push({
    type: 'result',
    description: `${k} closest points: ${result.map(p => `(${p})`).join(', ')}`,
    node: null,
    output: JSON.stringify(result),
  });

  return trace;
}

export const DEFAULT_K_CLOSEST_POINTS_INPUT = { points: [[3,3],[5,-1],[-2,4]], k: 2 };

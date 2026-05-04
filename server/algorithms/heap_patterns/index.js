// Tier 1 implementations for heap / priority queue patterns.
// Uses a simple array-backed min-heap for correctness.

class MinHeap {
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
      if (this.data[p] > this.data[i]) { [this.data[p], this.data[i]] = [this.data[i], this.data[p]]; i = p; }
      else break;
    }
  }
  _siftDown(i) {
    const n = this.data.length;
    while (true) {
      let s = i;
      const l = 2*i+1, r = 2*i+2;
      if (l < n && this.data[l] < this.data[s]) s = l;
      if (r < n && this.data[r] < this.data[s]) s = r;
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

  // Build min-heap of [freq, num] pairs, keeping only top k
  // Represented as sorted array for trace clarity
  const heap = new MinHeap();
  // heap stores [frequency, num]; compare by frequency
  // Use custom heap with pair comparator by storing freq*1000+num to simplify
  const freqPairs = Object.entries(freq).map(([n, c]) => [c, Number(n)]);

  const heapData = [];
  for (const [c, n] of freqPairs) {
    heapData.push([c, n]);
    heapData.sort((a, b) => a[0] - b[0]);

    const show = [...heapData].map(([c,n]) => `${n}(×${c})`).join(', ');
    trace.push({
      type: 'insert',
      description: `Add num=${n} freq=${c} to heap: [${show}]`,
      node: String(n),
    });

    if (heapData.length > k) {
      const evicted = heapData.shift();
      trace.push({
        type: 'extract_min',
        description: `Heap exceeds ${k} — evict lowest freq: ${evicted[0]}(num=${evicted[1]})`,
        node: String(evicted[1]),
      });
    }
  }

  const result = heapData.map(([, n]) => n);

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

  // Max-heap by distance; evict farthest when > k
  const heapData = []; // [dist2, point]

  trace.push({
    type: 'init',
    description: `K=${k} closest points to origin from ${points.length} points using max-heap`,
    node: null,
  });

  for (const [x, y] of points) {
    const d2 = x*x + y*y;
    heapData.push([d2, [x, y]]);
    heapData.sort((a, b) => b[0] - a[0]);

    trace.push({
      type: 'insert',
      description: `Add (${x},${y}) dist²=${d2} → heap: [${heapData.map(([d,p]) => `(${p})d²=${d}`).join(', ')}]`,
      node: `${x},${y}`,
    });

    if (heapData.length > k) {
      const evicted = heapData.shift();
      trace.push({
        type: 'extract_min',
        description: `Evict farthest point (${evicted[1]}) d²=${evicted[0]}`,
        node: `${evicted[1]}`,
      });
    }
  }

  const result = heapData.map(([, p]) => p);
  trace.push({
    type: 'result',
    description: `${k} closest points: ${result.map(p => `(${p})`).join(', ')}`,
    node: null,
    output: JSON.stringify(result),
  });

  return trace;
}

export const DEFAULT_K_CLOSEST_POINTS_INPUT = { points: [[3,3],[5,-1],[-2,4]], k: 2 };

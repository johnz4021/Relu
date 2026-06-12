// Tier 1 implementations for monotonic deque / sliding window max patterns.

// ── sliding_window_max — Sliding Window Maximum (monotonic deque) ─────────────
export function slidingWindowMax(input) {
  const nums = input.nums || [1, 3, -1, -3, 5, 3, 6, 7];
  const k = input.k ?? 3;
  const n = nums.length;
  const trace = [];
  const result = [];

  trace.push({
    type: 'init',
    description: `Sliding Window Maximum: k=${k}, nums=[${nums.join(', ')}]. Monotonic deque stores INDICES (front = max of window).`,
    array: [...nums],
    indices: [],
  });

  const deque = []; // stores indices; deque[0] is index of window's max

  for (let i = 0; i < n; i++) {
    // Remove indices outside window
    while (deque.length && deque[0] < i - k + 1) {
      const removed = deque.shift();
      trace.push({
        type: 'dequeue',
        description: `Window slid: remove index ${removed} (value ${nums[removed]}) — out of range`,
        array: [...nums],
        indices: [i],
      });
    }

    // Remove indices whose values are smaller than nums[i] (they can never be max)
    while (deque.length && nums[deque[deque.length - 1]] < nums[i]) {
      const popped = deque.pop();
      trace.push({
        type: 'pop',
        description: `Pop index ${popped} (value ${nums[popped]} < ${nums[i]}) — can never be window max`,
        array: [...nums],
        indices: [popped, i],
      });
    }

    deque.push(i);
    trace.push({
      type: 'push',
      description: `Push index ${i} (value ${nums[i]}). Deque: [${deque.map(d => `${d}(${nums[d]})`).join(', ')}]`,
      array: [...nums],
      indices: [...deque],
    });

    // Window is full — record max
    if (i >= k - 1) {
      const max = nums[deque[0]];
      result.push(max);
      trace.push({
        type: 'window_max',
        description: `Window [${i-k+1}..${i}] = [${nums.slice(i-k+1, i+1).join(', ')}] → max = ${max} (index ${deque[0]})`,
        array: [...nums],
        indices: [deque[0]],
      });
    }
  }

  trace.push({
    type: 'result',
    description: `Sliding window maxima: [${result.join(', ')}]`,
    array: [...result],
    indices: result.map((_, i) => i),
    output: JSON.stringify(result),
  });

  return trace;
}

export const DEFAULT_SLIDING_WINDOW_MAX_INPUT = { nums: [1, 3, -1, -3, 5, 3, 6, 7], k: 3 };

// ── jump_game — Jump Game II (greedy BFS-like) ────────────────────────────────
export function jumpGame(input) {
  const nums = input.nums || [2, 3, 1, 1, 4];
  const n = nums.length;
  const trace = [];

  trace.push({
    type: 'init',
    description: `Jump Game: can you reach index ${n-1}? nums=[${nums.join(', ')}]. Greedy: track max reachable index.`,
    array: [...nums],
    indices: [],
  });

  let maxReach = 0;

  for (let i = 0; i < n; i++) {
    if (i > maxReach) {
      trace.push({
        type: 'blocked',
        description: `i=${i} > maxReach=${maxReach}: cannot reach here — stuck!`,
        array: [...nums],
        indices: [i],
      });
      trace.push({
        type: 'result',
        description: `Cannot reach the end`,
        array: [...nums],
        indices: [],
        output: 'false',
      });
      return trace;
    }

    const newMax = Math.max(maxReach, i + nums[i]);
    if (newMax > maxReach) {
      maxReach = newMax;
      trace.push({
        type: 'update',
        description: `i=${i} jump=${nums[i]}: maxReach updated to ${maxReach} (i + jump = ${i}+${nums[i]})`,
        array: [...nums],
        indices: [i],
      });
    } else {
      trace.push({
        type: 'skip',
        description: `i=${i} jump=${nums[i]}: maxReach stays ${maxReach} (no improvement)`,
        array: [...nums],
        indices: [i],
      });
    }

    if (maxReach >= n - 1) break;
  }

  const canReach = maxReach >= n - 1;
  trace.push({
    type: 'result',
    description: canReach ? `Can reach index ${n-1}: true` : `Cannot reach the end: false`,
    array: [...nums],
    indices: canReach ? [n - 1] : [],
    output: String(canReach),
  });

  return trace;
}

// LC Ex2: maxReach stalls at the 0 and index 4 is unreachable — the trace shows
// non-improving indices and the blocked/false ending. LC Ex1 reached the goal
// in two straight updates with no tension.
export const DEFAULT_JUMP_GAME_INPUT = { nums: [3, 2, 1, 0, 4] };

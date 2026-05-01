export const DEFAULT_SLIDING_WINDOW_INPUT = {
  array: [2, 1, 5, 1, 3, 2],
  window_size: 3,
};

export function slidingWindow(array, windowSize) {
  const trace = [];
  const n = array.length;
  const k = windowSize;

  if (k > n || k <= 0) {
    trace.push({
      type: 'error',
      description: `Invalid window size ${k} for array of length ${n}.`,
      array: [...array],
    });
    return trace;
  }

  trace.push({
    type: 'init',
    description: `Sliding window of size ${k} over array of ${n} elements. Goal: find maximum sum subarray.`,
    array: [...array],
    window_size: k,
    window_start: 0,
    window_end: k - 1,
  });

  // Build initial window
  let windowSum = 0;
  for (let i = 0; i < k; i++) {
    windowSum += array[i];
  }

  trace.push({
    type: 'initial_window',
    description: `Initial window [0..${k - 1}]: [${array.slice(0, k).join(', ')}]. Sum = ${windowSum}.`,
    array: [...array],
    window_start: 0,
    window_end: k - 1,
    window_sum: windowSum,
    highlighted: Array.from({ length: n }, (_, i) => i < k),
  });

  let maxSum = windowSum;
  let maxStart = 0;

  // Slide the window
  for (let i = k; i < n; i++) {
    const outgoing = array[i - k];
    const incoming = array[i];
    const prevSum = windowSum;

    windowSum += incoming - outgoing;

    trace.push({
      type: 'slide',
      description: `Slide right: remove ${outgoing} (index ${i - k}), add ${incoming} (index ${i}). Sum: ${prevSum} - ${outgoing} + ${incoming} = ${windowSum}.`,
      array: [...array],
      window_start: i - k + 1,
      window_end: i,
      window_sum: windowSum,
      outgoing_index: i - k,
      incoming_index: i,
      highlighted: Array.from({ length: n }, (_, j) => j >= i - k + 1 && j <= i),
    });

    if (windowSum > maxSum) {
      maxSum = windowSum;
      maxStart = i - k + 1;
      trace.push({
        type: 'new_max',
        description: `New maximum! Sum ${windowSum} > previous max ${maxSum - (windowSum - maxSum === 0 ? 0 : windowSum - maxSum)}. Window [${maxStart}..${maxStart + k - 1}].`,
        array: [...array],
        window_start: maxStart,
        window_end: maxStart + k - 1,
        window_sum: windowSum,
        max_sum: maxSum,
        max_start: maxStart,
        highlighted: Array.from({ length: n }, (_, j) => j >= maxStart && j <= maxStart + k - 1),
      });
    }
  }

  trace.push({
    type: 'result',
    description: `Maximum sum subarray: [${array.slice(maxStart, maxStart + k).join(', ')}] at indices [${maxStart}..${maxStart + k - 1}] with sum ${maxSum}.`,
    array: [...array],
    max_sum: maxSum,
    max_start: maxStart,
    max_end: maxStart + k - 1,
    highlighted: Array.from({ length: n }, (_, j) => j >= maxStart && j <= maxStart + k - 1),
  });

  return trace;
}

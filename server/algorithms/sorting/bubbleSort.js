export function bubbleSort(arr) {
  const trace = [];
  const data = [...arr];
  const n = data.length;

  trace.push({
    type: 'init',
    description: `Starting bubble sort on array of ${n} elements`,
    array: [...data],
  });

  for (let i = 0; i < n - 1; i++) {
    let swapped = false;

    trace.push({
      type: 'pass_start',
      pass: i + 1,
      description: `Pass ${i + 1}: bubble through [0..${n - 1 - i}]`,
    });

    for (let j = 0; j < n - 1 - i; j++) {
      trace.push({
        type: 'compare',
        indices: [j, j + 1],
        values: [data[j], data[j + 1]],
        description: `Compare ${data[j]} and ${data[j + 1]}`,
      });

      if (data[j] > data[j + 1]) {
        trace.push({
          type: 'swap',
          i: j,
          j: j + 1,
          values: [data[j], data[j + 1]],
          description: `Swap ${data[j]} and ${data[j + 1]}`,
        });
        [data[j], data[j + 1]] = [data[j + 1], data[j]];
        swapped = true;
      }
    }

    // After each pass, the last unsorted element is in its final position
    trace.push({
      type: 'mark_sorted',
      indices: [n - 1 - i],
      description: `${data[n - 1 - i]} is now in its final position at index ${n - 1 - i}`,
      array: [...data],
    });

    if (!swapped) {
      trace.push({
        type: 'early_exit',
        description: 'No swaps in this pass — array is sorted!',
      });
      break;
    }
  }

  // Mark all as sorted
  trace.push({
    type: 'mark_sorted',
    indices: Array.from({ length: n }, (_, k) => k),
    description: 'All elements sorted',
  });

  trace.push({
    type: 'result',
    array: [...data],
    description: 'Bubble sort complete!',
  });

  return trace;
}

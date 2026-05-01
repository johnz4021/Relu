export function selectionSort(arr) {
  const trace = [];
  const data = [...arr];

  trace.push({
    type: 'init',
    description: `Starting selection sort on array of ${data.length} elements`,
    array: [...data],
  });

  for (let i = 0; i < data.length - 1; i++) {
    let minIdx = i;

    trace.push({
      type: 'scan_start',
      index: i,
      description: `Find minimum in unsorted portion [${i}..${data.length - 1}]`,
    });

    for (let j = i + 1; j < data.length; j++) {
      trace.push({
        type: 'compare',
        indices: [j, minIdx],
        values: [data[j], data[minIdx]],
        description: `Compare ${data[j]} with current min ${data[minIdx]}`,
      });

      if (data[j] < data[minIdx]) {
        minIdx = j;
        trace.push({
          type: 'new_min',
          index: minIdx,
          value: data[minIdx],
          description: `New minimum: ${data[minIdx]} at index ${minIdx}`,
        });
      }
    }

    if (minIdx !== i) {
      trace.push({
        type: 'swap',
        i,
        j: minIdx,
        values: [data[i], data[minIdx]],
        description: `Swap ${data[i]} at index ${i} with min ${data[minIdx]} at index ${minIdx}`,
      });
      [data[i], data[minIdx]] = [data[minIdx], data[i]];
    }

    trace.push({
      type: 'mark_sorted',
      indices: Array.from({ length: i + 1 }, (_, k) => k),
      description: `${data[i]} is now in its final position at index ${i}`,
      array: [...data],
    });
  }

  // Last element is trivially sorted
  trace.push({
    type: 'mark_sorted',
    indices: Array.from({ length: data.length }, (_, k) => k),
    description: 'All elements sorted',
  });

  trace.push({
    type: 'result',
    array: [...data],
    description: 'Selection sort complete!',
  });

  return trace;
}

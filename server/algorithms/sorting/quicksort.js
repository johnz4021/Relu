export function quicksort(arr) {
  const trace = [];
  const data = [...arr];

  trace.push({
    type: 'init',
    description: `Starting quicksort on array of ${data.length} elements`,
    array: [...data],
  });

  function partition(low, high) {
    const pivot = data[high];
    trace.push({
      type: 'select_pivot',
      pivot_index: high,
      pivot_value: pivot,
      range: [low, high],
      description: `Choose pivot: ${pivot} at index ${high}`,
    });

    let i = low - 1;
    for (let j = low; j < high; j++) {
      trace.push({
        type: 'compare',
        indices: [j, high],
        values: [data[j], pivot],
        pointers: { i: i, j: j, pivot: high },
        description: `Compare ${data[j]} with pivot ${pivot}`,
      });

      if (data[j] <= pivot) {
        i++;
        if (i !== j) {
          trace.push({
            type: 'swap',
            i,
            j,
            values: [data[i], data[j]],
            pointers: { i: i, j: j, pivot: high },
            description: `Swap ${data[i]} and ${data[j]}`,
          });
          [data[i], data[j]] = [data[j], data[i]];
        }
      }
    }

    if (i + 1 !== high) {
      trace.push({
        type: 'swap',
        i: i + 1,
        j: high,
        values: [data[i + 1], data[high]],
        description: `Place pivot: swap ${data[i + 1]} and ${data[high]}`,
      });
      [data[i + 1], data[high]] = [data[high], data[i + 1]];
    }

    trace.push({
      type: 'pivot_placed',
      index: i + 1,
      description: `Pivot ${pivot} is now at its final position ${i + 1}`,
      array: [...data],
    });

    return i + 1;
  }

  function qs(low, high) {
    if (low < high) {
      trace.push({
        type: 'recurse',
        range: [low, high],
        description: `Quicksort subarray [${low}..${high}]`,
      });
      const pi = partition(low, high);
      qs(low, pi - 1);
      qs(pi + 1, high);
    } else if (low === high) {
      trace.push({
        type: 'mark_sorted',
        indices: [low],
        description: `Single element at index ${low} is sorted`,
      });
    }
  }

  qs(0, data.length - 1);

  trace.push({
    type: 'result',
    array: [...data],
    description: 'Quicksort complete!',
  });

  return trace;
}

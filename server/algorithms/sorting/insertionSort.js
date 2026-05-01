export function insertionSort(arr) {
  const trace = [];
  const data = [...arr];

  trace.push({
    type: 'init',
    description: `Starting insertion sort on array of ${data.length} elements`,
    array: [...data],
  });

  // First element is trivially sorted
  trace.push({
    type: 'mark_sorted',
    indices: [0],
    description: `Element at index 0 (${data[0]}) is trivially sorted`,
  });

  for (let i = 1; i < data.length; i++) {
    const key = data[i];
    trace.push({
      type: 'select_key',
      index: i,
      value: key,
      description: `Pick key: ${key} at index ${i}`,
    });

    let j = i - 1;
    while (j >= 0 && data[j] > key) {
      trace.push({
        type: 'compare',
        indices: [j, j + 1],
        values: [data[j], key],
        description: `Compare ${data[j]} > ${key}: shift ${data[j]} right`,
      });
      trace.push({
        type: 'shift',
        from: j,
        to: j + 1,
        value: data[j],
        description: `Shift ${data[j]} from position ${j} to ${j + 1}`,
      });
      data[j + 1] = data[j];
      j--;
    }

    if (j >= 0) {
      trace.push({
        type: 'compare',
        indices: [j, j + 1],
        values: [data[j], key],
        description: `Compare ${data[j]} <= ${key}: found insertion point`,
      });
    }

    data[j + 1] = key;
    trace.push({
      type: 'insert',
      index: j + 1,
      value: key,
      description: `Insert ${key} at index ${j + 1}`,
      array: [...data],
    });

    trace.push({
      type: 'mark_sorted',
      indices: Array.from({ length: i + 1 }, (_, k) => k),
      description: `First ${i + 1} elements are now sorted`,
    });
  }

  trace.push({
    type: 'result',
    array: [...data],
    description: 'Insertion sort complete!',
  });

  return trace;
}

/**
 * Quickselect — find the k-th smallest element (0-indexed) in an unsorted array.
 * Uses the same partition logic as quicksort but only recurses into one half.
 * Average O(n), worst-case O(n²) with deterministic pivot.
 */
export function quickselect(arr, k) {
  const trace = [];
  const data = [...arr];

  trace.push({
    type: 'init',
    pseudocode_line: 0,
    array: [...data],
    k,
    description: `Find the ${k}-th smallest element (0-indexed) in array of ${data.length} elements`,
  });

  function partition(low, high) {
    const pivot = data[high];
    trace.push({
      type: 'select_pivot',
      pseudocode_line: 2,
      pivot_index: high,
      pivot_value: pivot,
      range: [low, high],
      description: `Choose pivot: ${pivot} at index ${high}`,
    });

    let i = low - 1;
    for (let j = low; j < high; j++) {
      trace.push({
        type: 'compare',
        pseudocode_line: 2,
        indices: [j, high],
        values: [data[j], pivot],
        pointers: { i, j, pivot: high },
        description: `Compare ${data[j]} with pivot ${pivot}`,
      });

      if (data[j] <= pivot) {
        i++;
        if (i !== j) {
          trace.push({
            type: 'swap',
            pseudocode_line: 2,
            i,
            j,
            values: [data[i], data[j]],
            pointers: { i, j, pivot: high },
            description: `Swap ${data[i]} and ${data[j]}`,
          });
          [data[i], data[j]] = [data[j], data[i]];
        }
      }
    }

    if (i + 1 !== high) {
      trace.push({
        type: 'swap',
        pseudocode_line: 2,
        i: i + 1,
        j: high,
        values: [data[i + 1], data[high]],
        description: `Place pivot: swap ${data[i + 1]} and ${data[high]}`,
      });
      [data[i + 1], data[high]] = [data[high], data[i + 1]];
    }

    const pivotPos = i + 1;
    trace.push({
      type: 'pivot_placed',
      pseudocode_line: 2,
      index: pivotPos,
      description: `Pivot ${pivot} is now at its final position ${pivotPos}`,
      array: [...data],
    });

    return pivotPos;
  }

  function qs(low, high) {
    if (low >= high) {
      if (low === k) {
        trace.push({
          type: 'found',
          pseudocode_line: 1,
          index: low,
          value: data[low],
          k,
          description: `Found: ${k}-th smallest element is ${data[low]} at index ${low}`,
          array: [...data],
        });
      }
      return;
    }

    const pivotPos = partition(low, high);

    if (pivotPos === k) {
      trace.push({
        type: 'found',
        pseudocode_line: 3,
        index: pivotPos,
        value: data[pivotPos],
        k,
        description: `Pivot landed exactly at index ${k} — found! The ${k}-th smallest is ${data[pivotPos]}`,
        array: [...data],
      });
    } else if (k < pivotPos) {
      trace.push({
        type: 'recurse_into',
        pseudocode_line: 4,
        side: 'left',
        range: [low, pivotPos - 1],
        pivot_index: pivotPos,
        k,
        description: `k=${k} < pivot at ${pivotPos} — recurse left into [${low}..${pivotPos - 1}]`,
      });
      qs(low, pivotPos - 1);
    } else {
      trace.push({
        type: 'recurse_into',
        pseudocode_line: 6,
        side: 'right',
        range: [pivotPos + 1, high],
        pivot_index: pivotPos,
        k,
        description: `k=${k} > pivot at ${pivotPos} — recurse right into [${pivotPos + 1}..${high}]`,
      });
      qs(pivotPos + 1, high);
    }
  }

  qs(0, data.length - 1);

  return trace;
}

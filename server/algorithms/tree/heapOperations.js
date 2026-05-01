export function heapOperations(operations) {
  const trace = [];
  const heap = [];

  function parent(i) {
    return Math.floor((i - 1) / 2);
  }

  function left(i) {
    return 2 * i + 1;
  }

  function right(i) {
    return 2 * i + 2;
  }

  trace.push({
    type: 'init',
    description: `Starting min-heap operations: ${operations.length} operation(s)`,
    operations: operations.map(op =>
      op.type === 'insert' ? `insert(${op.value})` : 'extract_min()'
    ),
  });

  for (const op of operations) {
    if (op.type === 'insert') {
      const value = op.value;

      trace.push({
        type: 'insert_start',
        value,
        description: `Insert ${value} into the min-heap`,
      });

      // Place at end
      heap.push(value);
      let idx = heap.length - 1;

      trace.push({
        type: 'place',
        index: idx,
        value,
        heap: [...heap],
        description: `Place ${value} at index ${idx} (end of heap)`,
      });

      // Sift up
      while (idx > 0 && heap[idx] < heap[parent(idx)]) {
        const pIdx = parent(idx);

        trace.push({
          type: 'sift_compare',
          child_index: idx,
          parent_index: pIdx,
          child_value: heap[idx],
          parent_value: heap[pIdx],
          description: `Compare child ${heap[idx]} (index ${idx}) with parent ${heap[pIdx]} (index ${pIdx}): child is smaller, swap`,
        });

        // Swap
        const tmp = heap[idx];
        heap[idx] = heap[pIdx];
        heap[pIdx] = tmp;

        trace.push({
          type: 'sift_swap',
          i: pIdx,
          j: idx,
          values: [heap[pIdx], heap[idx]],
          heap: [...heap],
          description: `Swap ${heap[pIdx]} and ${heap[idx]} — ${heap[pIdx]} moves up to index ${pIdx}`,
        });

        idx = pIdx;
      }

      // If we stopped because parent is smaller or we reached root
      if (idx > 0) {
        trace.push({
          type: 'sift_compare',
          child_index: idx,
          parent_index: parent(idx),
          child_value: heap[idx],
          parent_value: heap[parent(idx)],
          description: `Compare child ${heap[idx]} (index ${idx}) with parent ${heap[parent(idx)]} (index ${parent(idx)}): heap property satisfied`,
        });
      }

      trace.push({
        type: 'sift_done',
        index: idx,
        value: heap[idx],
        heap: [...heap],
        description: `${heap[idx]} settled at index ${idx} — heap property restored`,
      });

    } else if (op.type === 'extract_min') {
      trace.push({
        type: 'extract_start',
        description: heap.length > 0
          ? `Extract min value ${heap[0]} from the heap`
          : 'Extract min called on empty heap',
      });

      if (heap.length === 0) {
        trace.push({
          type: 'result',
          heap: [],
          description: 'Heap is empty — nothing to extract',
        });
        continue;
      }

      const minValue = heap[0];

      if (heap.length === 1) {
        heap.pop();
        trace.push({
          type: 'extract_remove',
          value: minValue,
          heap: [...heap],
          description: `Removed ${minValue} — heap is now empty`,
        });
        continue;
      }

      // Swap root with last element
      const lastValue = heap[heap.length - 1];
      heap[0] = lastValue;
      heap[heap.length - 1] = minValue;

      trace.push({
        type: 'extract_swap',
        root_value: minValue,
        last_value: lastValue,
        heap: [...heap],
        description: `Swap root ${minValue} with last element ${lastValue}`,
      });

      // Remove last (the old min)
      heap.pop();

      trace.push({
        type: 'extract_remove',
        value: minValue,
        heap: [...heap],
        description: `Remove ${minValue} from end of array`,
      });

      // Sift down
      let idx = 0;
      while (true) {
        const l = left(idx);
        const r = right(idx);
        let smallest = idx;

        if (l < heap.length && heap[l] < heap[smallest]) {
          smallest = l;
        }
        if (r < heap.length && heap[r] < heap[smallest]) {
          smallest = r;
        }

        if (smallest === idx) {
          // No child is smaller — done
          trace.push({
            type: 'sift_done',
            index: idx,
            value: heap[idx],
            heap: [...heap],
            description: `${heap[idx]} settled at index ${idx} — heap property restored`,
          });
          break;
        }

        trace.push({
          type: 'sift_compare',
          child_index: smallest,
          parent_index: idx,
          child_value: heap[smallest],
          parent_value: heap[idx],
          description: `Compare parent ${heap[idx]} (index ${idx}) with smaller child ${heap[smallest]} (index ${smallest}): parent is larger, swap`,
        });

        // Swap
        const tmp = heap[idx];
        heap[idx] = heap[smallest];
        heap[smallest] = tmp;

        trace.push({
          type: 'sift_swap',
          i: idx,
          j: smallest,
          values: [heap[idx], heap[smallest]],
          heap: [...heap],
          description: `Swap ${heap[idx]} and ${heap[smallest]} — ${heap[idx]} moves down to index ${smallest}`,
        });

        idx = smallest;
      }
    }
  }

  trace.push({
    type: 'result',
    heap: [...heap],
    description: `All operations complete. Final heap: [${heap.join(', ')}]`,
  });

  return trace;
}

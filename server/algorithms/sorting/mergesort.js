export function mergesort(arr) {
  const trace = [];
  const data = [...arr];

  trace.push({
    type: 'init',
    description: `Starting merge sort on array of ${data.length} elements`,
    array: [...data],
  });

  function merge(left, mid, right) {
    trace.push({
      type: 'merge_start',
      range: [left, right],
      mid,
      description: `Merge subarrays [${left}..${mid}] and [${mid + 1}..${right}]`,
    });

    const leftArr = data.slice(left, mid + 1);
    const rightArr = data.slice(mid + 1, right + 1);
    let i = 0, j = 0, k = left;

    while (i < leftArr.length && j < rightArr.length) {
      trace.push({
        type: 'compare',
        indices: [left + i, mid + 1 + j],
        values: [leftArr[i], rightArr[j]],
        description: `Compare ${leftArr[i]} and ${rightArr[j]}`,
      });

      if (leftArr[i] <= rightArr[j]) {
        data[k] = leftArr[i];
        i++;
      } else {
        data[k] = rightArr[j];
        j++;
      }
      trace.push({
        type: 'place',
        index: k,
        value: data[k],
        description: `Place ${data[k]} at index ${k}`,
        array: [...data],
      });
      k++;
    }

    while (i < leftArr.length) {
      data[k] = leftArr[i];
      trace.push({
        type: 'place',
        index: k,
        value: data[k],
        description: `Place remaining ${data[k]} at index ${k}`,
        array: [...data],
      });
      i++;
      k++;
    }

    while (j < rightArr.length) {
      data[k] = rightArr[j];
      trace.push({
        type: 'place',
        index: k,
        value: data[k],
        description: `Place remaining ${data[k]} at index ${k}`,
        array: [...data],
      });
      j++;
      k++;
    }

    trace.push({
      type: 'merge_complete',
      range: [left, right],
      description: `Merged [${left}..${right}]: [${data.slice(left, right + 1).join(', ')}]`,
      array: [...data],
    });
  }

  let depth = 0;

  function ms(left, right, currentDepth, parentCallId) {
    if (left < right) {
      const callId = `${left}-${right}`;
      const mid = Math.floor((left + right) / 2);
      trace.push({
        type: 'divide',
        range: [left, right],
        mid,
        depth: currentDepth,
        call_id: callId,
        parent_call_id: parentCallId || null,
        subarray: data.slice(left, right + 1),
        description: `Divide [${left}..${right}] at midpoint ${mid}`,
      });
      ms(left, mid, currentDepth + 1, callId);
      ms(mid + 1, right, currentDepth + 1, callId);
      merge(left, mid, right);
    }
  }

  ms(0, data.length - 1, 0, null);

  trace.push({
    type: 'result',
    array: [...data],
    description: 'Merge sort complete!',
  });

  return trace;
}

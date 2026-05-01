export function binarySearch(arr, target) {
  const trace = [];
  const data = [...arr]; // assumed to be sorted

  trace.push({
    type: 'init',
    pseudocode_line: 0,
    description: `Binary search for ${target} in sorted array of ${data.length} elements`,
    array: [...data],
    target,
  });

  let left = 0;
  let right = data.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);

    trace.push({
      type: 'check_mid',
      pseudocode_line: 2,
      left,
      right,
      mid,
      value: data[mid],
      target,
      description: `Check middle: index ${mid}, value ${data[mid]}. Search range [${left}..${right}]`,
    });

    if (data[mid] === target) {
      trace.push({
        type: 'found',
        pseudocode_line: 3,
        index: mid,
        value: data[mid],
        description: `Found ${target} at index ${mid}!`,
      });

      trace.push({
        type: 'result',
        pseudocode_line: 3,
        found: true,
        index: mid,
        description: `Binary search complete. ${target} found at index ${mid}.`,
      });
      return trace;
    }

    if (data[mid] < target) {
      trace.push({
        type: 'eliminate_left',
        pseudocode_line: 5,
        mid,
        description: `${data[mid]} < ${target}: eliminate left half. New range [${mid + 1}..${right}]`,
      });
      left = mid + 1;
    } else {
      trace.push({
        type: 'eliminate_right',
        pseudocode_line: 7,
        mid,
        description: `${data[mid]} > ${target}: eliminate right half. New range [${left}..${mid - 1}]`,
      });
      right = mid - 1;
    }
  }

  trace.push({
    type: 'result',
    pseudocode_line: 1,
    found: false,
    description: `Binary search complete. ${target} not found in the array.`,
  });

  return trace;
}

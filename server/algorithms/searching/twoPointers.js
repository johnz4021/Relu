export function twoPointers(arr, target) {
  const trace = [];
  const data = [...arr];

  trace.push({
    type: 'init',
    array: [...data],
    target,
    description: `Two-pointer search for pair summing to ${target} in sorted array`,
  });

  let left = 0;
  let right = data.length - 1;

  while (left < right) {
    const sum = data[left] + data[right];
    trace.push({
      type: 'check_sum',
      left,
      right,
      sum,
      target,
      description: `arr[${left}]=${data[left]} + arr[${right}]=${data[right]} = ${sum} (target ${target})`,
    });

    if (sum === target) {
      trace.push({
        type: 'found',
        left,
        right,
        values: [data[left], data[right]],
        description: `Found pair: [${data[left]}, ${data[right]}] at indices [${left}, ${right}]`,
      });
      trace.push({
        type: 'result',
        found: true,
        indices: [left, right],
        values: [data[left], data[right]],
        description: `Result: indices [${left + 1}, ${right + 1}] (1-indexed)`,
      });
      return trace;
    } else if (sum < target) {
      trace.push({
        type: 'move_left',
        left: left + 1,
        right,
        description: `Sum ${sum} < ${target} — move left pointer right`,
      });
      left++;
    } else {
      trace.push({
        type: 'move_right',
        left,
        right: right - 1,
        description: `Sum ${sum} > ${target} — move right pointer left`,
      });
      right--;
    }
  }

  trace.push({
    type: 'result',
    found: false,
    description: `No pair found summing to ${target}`,
  });

  return trace;
}

export function monotonicStack(arr) {
  const trace = [];
  const n = arr.length;
  const answers = new Array(n).fill(-1);
  const stack = []; // indices

  trace.push({
    type: 'init',
    array: [...arr],
    stack: [],
    description: `Next Greater Element for [${arr.join(', ')}]`,
  });

  for (let i = 0; i < n; i++) {
    // Pop elements smaller than current
    while (stack.length > 0 && arr[stack[stack.length - 1]] < arr[i]) {
      const idx = stack.pop();
      answers[idx] = arr[i];
      trace.push({
        type: 'pop_smaller',
        value: arr[idx],
        index: idx,
        nge: arr[i],
        stack: [...stack],
        answers: [...answers],
        description: `arr[${idx}]=${arr[idx]} < arr[${i}]=${arr[i]} — NGE for index ${idx} is ${arr[i]}`,
      });
      trace.push({
        type: 'record_answer',
        index: idx,
        nge: arr[i],
        answers: [...answers],
        description: `answers[${idx}] = ${arr[i]}`,
      });
    }

    stack.push(i);
    trace.push({
      type: 'push',
      value: arr[i],
      index: i,
      stack: stack.map(k => arr[k]),
      description: `Push arr[${i}]=${arr[i]} onto stack`,
    });
  }

  // Remaining elements have no NGE
  while (stack.length > 0) {
    const idx = stack.pop();
    answers[idx] = -1;
  }

  trace.push({
    type: 'result',
    answers: [...answers],
    description: `Next Greater Elements: [${answers.join(', ')}]`,
  });

  return trace;
}

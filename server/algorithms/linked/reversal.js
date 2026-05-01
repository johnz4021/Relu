export function linkedListReversal(values) {
  const trace = [];
  const list = [...values];

  trace.push({
    type: 'init',
    description: `Reverse linked list: [${list.join(' → ')}]`,
    list: [...list],
  });

  // Simulate iterative reversal with prev/current/next pointers
  const n = list.length;
  let prev = -1; // represents null
  let current = 0;

  trace.push({
    type: 'set_pointers',
    prev: -1,
    current: 0,
    next: 1,
    description: `Initialize: prev = null, current = head (index 0, value ${list[0]})`,
  });

  const reversed = [];
  for (let i = 0; i < n; i++) {
    const nextIdx = current + 1 < n ? current + 1 : -1;

    trace.push({
      type: 'step',
      current: i,
      prev: i > 0 ? i - 1 : -1,
      next: nextIdx >= 0 ? nextIdx : -1,
      value: list[i],
      description: `At node ${list[i]} (index ${i}). Save next = ${nextIdx >= 0 ? list[nextIdx] : 'null'}. Reverse pointer: ${list[i]}.next = ${i > 0 ? list[i - 1] : 'null'}`,
    });

    trace.push({
      type: 'reverse_pointer',
      from: i,
      to: i > 0 ? i - 1 : null,
      description: `Reverse pointer: node ${list[i]} now points to ${i > 0 ? list[i - 1] : 'null'}`,
    });

    reversed.unshift(list[i]);

    trace.push({
      type: 'advance',
      new_current: nextIdx,
      description: `Move: prev = ${list[i]}, current = ${nextIdx >= 0 ? list[nextIdx] : 'null'}`,
      partial_result: [...reversed],
    });
  }

  trace.push({
    type: 'result',
    list: [...reversed],
    description: `Reversal complete! Result: [${reversed.join(' → ')}]`,
  });

  return trace;
}

export function stackOperations(operations) {
  const trace = [];
  const stack = [];

  trace.push({
    type: 'init',
    description: `Starting stack operations demo. ${operations.length} operations to perform.`,
    stack: [],
  });

  for (const op of operations) {
    if (op.type === 'push') {
      stack.unshift(op.value);
      trace.push({
        type: 'push',
        value: op.value,
        stack: [...stack],
        description: `Push ${op.value} onto stack. Stack: [${stack.join(', ')}]. Size: ${stack.length}.`,
      });
    } else if (op.type === 'pop') {
      if (stack.length === 0) {
        trace.push({
          type: 'pop_empty',
          description: 'Pop from empty stack — underflow!',
          stack: [],
        });
      } else {
        const popped = stack.shift();
        trace.push({
          type: 'pop',
          value: popped,
          stack: [...stack],
          description: `Pop ${popped} from stack. Stack: [${stack.length > 0 ? stack.join(', ') : 'empty'}]. Size: ${stack.length}.`,
        });
      }
    } else if (op.type === 'peek') {
      trace.push({
        type: 'peek',
        value: stack.length > 0 ? stack[0] : null,
        stack: [...stack],
        description: stack.length > 0 ? `Peek: top = ${stack[0]}` : 'Peek: stack is empty',
      });
    }
  }

  trace.push({
    type: 'result',
    stack: [...stack],
    description: `Operations complete. Final stack: [${stack.length > 0 ? stack.join(', ') : 'empty'}]. Size: ${stack.length}.`,
  });

  return trace;
}

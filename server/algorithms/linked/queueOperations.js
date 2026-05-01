export function queueOperations(operations) {
  const trace = [];
  const queue = [];

  trace.push({
    type: 'init',
    description: `Starting queue operations demo. ${operations.length} operations to perform.`,
    queue: [],
  });

  for (const op of operations) {
    if (op.type === 'enqueue') {
      queue.push(op.value);
      trace.push({
        type: 'enqueue',
        value: op.value,
        queue: [...queue],
        description: `Enqueue ${op.value} at rear. Queue: [${queue.join(', ')}]. Size: ${queue.length}.`,
      });
    } else if (op.type === 'dequeue') {
      if (queue.length === 0) {
        trace.push({
          type: 'dequeue_empty',
          description: 'Dequeue from empty queue — underflow!',
          queue: [],
        });
      } else {
        const dequeued = queue.shift();
        trace.push({
          type: 'dequeue',
          value: dequeued,
          queue: [...queue],
          description: `Dequeue ${dequeued} from front. Queue: [${queue.length > 0 ? queue.join(', ') : 'empty'}]. Size: ${queue.length}.`,
        });
      }
    } else if (op.type === 'peek') {
      trace.push({
        type: 'peek',
        value: queue.length > 0 ? queue[0] : null,
        queue: [...queue],
        description: queue.length > 0 ? `Peek: front = ${queue[0]}` : 'Peek: queue is empty',
      });
    }
  }

  trace.push({
    type: 'result',
    queue: [...queue],
    description: `Operations complete. Final queue: [${queue.length > 0 ? queue.join(', ') : 'empty'}]. Size: ${queue.length}.`,
  });

  return trace;
}

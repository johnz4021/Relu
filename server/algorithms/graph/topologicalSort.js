export function topologicalSort(graphInput) {
  const { nodes, edges } = graphInput;
  const trace = [];

  const nodeIds = nodes.map(n => n.id);
  const inDegree = {};
  const adj = {};
  for (const id of nodeIds) {
    inDegree[id] = 0;
    adj[id] = [];
  }
  for (const e of edges) {
    adj[e.source].push(e.target);
    inDegree[e.target] = (inDegree[e.target] || 0) + 1;
  }

  trace.push({
    type: 'init',
    description: `Topological sort of ${nodeIds.length}-node DAG using Kahn's algorithm`,
    in_degrees: { ...inDegree },
  });

  // Enqueue all zero-in-degree nodes
  const queue = nodeIds.filter(id => inDegree[id] === 0);
  trace.push({
    type: 'enqueue_zero_in_degree',
    nodes: [...queue],
    description: `Enqueue zero-in-degree nodes: [${queue.join(', ')}]`,
  });

  const sorted = [];
  let processedCount = 0;

  while (queue.length > 0) {
    const node = queue.shift();
    sorted.push(node);
    processedCount++;

    trace.push({
      type: 'process_node',
      node,
      sorted: [...sorted],
      description: `Process node ${node} → sorted order so far: [${sorted.join(', ')}]`,
    });

    for (const neighbor of adj[node]) {
      inDegree[neighbor]--;
      trace.push({
        type: 'reduce_in_degree',
        node: neighbor,
        new_in_degree: inDegree[neighbor],
        from: node,
        description: `Reduce in-degree of ${neighbor} to ${inDegree[neighbor]}`,
      });

      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
        trace.push({
          type: 'enqueue_neighbor',
          node: neighbor,
          description: `In-degree of ${neighbor} reached 0 — enqueue`,
        });
      }
    }
  }

  if (processedCount < nodeIds.length) {
    const unprocessed = nodeIds.filter(id => !sorted.includes(id));
    trace.push({
      type: 'result',
      cycle_detected: true,
      unprocessed_nodes: unprocessed,
      processed_nodes: sorted,
      description: `Cycle detected — ${unprocessed.length} nodes unreachable: [${unprocessed.join(', ')}]`,
    });
  } else {
    trace.push({
      type: 'result',
      cycle_detected: false,
      sorted,
      description: `Topological order: [${sorted.join(', ')}]`,
    });
  }

  return trace;
}

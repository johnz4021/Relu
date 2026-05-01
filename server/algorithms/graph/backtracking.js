export function backtracking(elements, maxDepth = 3) {
  const nums = elements.slice(0, maxDepth); // cap input
  const steps = [];

  // ── Pass 1: collect raw steps ──────────────────────────────────────────────
  function enumerate(start, path) {
    const nodeId = `n_${path.join('_') || 'root'}`;
    steps.push({ type: 'found', path: [...path], nodeId });

    if (path.length >= maxDepth) return;

    for (let i = start; i < nums.length; i++) {
      path.push(nums[i]);
      const childId = `n_${path.join('_')}`;
      steps.push({ type: 'choose', element: nums[i], path: [...path], nodeId: childId, parentId: nodeId });
      enumerate(i + 1, path);
      path.pop();
      steps.push({ type: 'unchoose', element: nums[i], nodeId: childId, path: [...path] });
    }
  }
  enumerate(0, []);

  // ── Pass 2: build full node/edge tree from steps ──────────────────────────
  const seenNodes = new Set();
  const nodeList = [];
  const edgeList = [];

  // Collect unique nodes + edges
  for (const s of steps) {
    if (!seenNodes.has(s.nodeId)) {
      seenNodes.add(s.nodeId);
      nodeList.push({ id: s.nodeId, path: s.path || [] });
    }
    if (s.type === 'choose' && s.parentId) {
      edgeList.push({ from: s.parentId, to: s.nodeId });
    }
  }

  // ── Pass 3: compute centered tree positions ────────────────────────────────
  // Group nodes by depth
  const byDepth = {};
  for (const n of nodeList) {
    const d = n.path.length;
    if (!byDepth[d]) byDepth[d] = [];
    byDepth[d].push(n.id);
  }

  const positions = {};
  for (const [depthStr, ids] of Object.entries(byDepth)) {
    const depth = parseInt(depthStr);
    const count = ids.length;
    for (let i = 0; i < count; i++) {
      // Center each level: x = (i - (count-1)/2) * 120
      positions[ids[i]] = { x: (i - (count - 1) / 2) * 120, y: depth * 120 };
    }
  }

  // ── Build final trace ──────────────────────────────────────────────────────
  const trace = [];

  // init step with full pre-computed tree
  trace.push({
    type: 'init',
    nodes: nodeList.map(n => ({
      id: n.id,
      label: n.path.length === 0 ? '[]' : `[${n.path.join(',')}]`,
      position: positions[n.id],
    })),
    edges: edgeList,
    description: `Subsets of [${nums.join(', ')}] — ${nodeList.length} nodes pre-computed`,
  });

  // emit the raw traversal steps (without add_node/add_edge — tree already exists)
  for (const s of steps) {
    if (s.type === 'found') {
      trace.push({ type: 'found', nodeId: s.nodeId, subset: s.path, description: `Found subset: [${s.path.join(', ')}]` });
    } else if (s.type === 'choose') {
      trace.push({ type: 'choose', nodeId: s.nodeId, element: s.element, path: s.path, description: `Choose ${s.element} → [${s.path.join(', ')}]` });
    } else if (s.type === 'unchoose') {
      trace.push({ type: 'unchoose', nodeId: s.nodeId, element: s.element, path: s.path, description: `Unchoose ${s.element}` });
    }
  }

  trace.push({
    type: 'result',
    subsets: steps.filter(s => s.type === 'found').map(s => s.path),
    description: `Found ${steps.filter(s => s.type === 'found').length} subsets`,
  });

  return trace;
}

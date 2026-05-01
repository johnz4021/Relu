/**
 * Huffman Encoding — builds an optimal prefix-free binary code.
 * Greedy strategy: repeatedly merge the two lowest-frequency nodes.
 * Result: more frequent characters get shorter codes.
 * Used in file compression (gzip, JPEG, MP3).
 */

/**
 * Build the initial leaf-node graph for a given string's character frequencies.
 * These positions lay leaves in a row at the bottom of the visualization.
 */
export function buildHuffmanLeafGraph(str) {
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  const chars = Object.keys(freq).sort();
  const spacing = 150;
  const startX = 100;

  const nodes = chars.map((ch, i) => ({
    id: ch,
    label: `${ch}:${freq[ch]}`,
  }));

  const positions = {};
  chars.forEach((ch, i) => {
    positions[ch] = { x: startX + i * spacing, y: 400 };
  });

  return {
    nodes,
    edges: [],
    directed: true,
    positions,
  };
}

function buildSubtree(rootId, nodeValues, childrenMap) {
  const nodes = [], edges = [];
  function dfs(id) {
    nodes.push({ id, value: nodeValues[id] ?? id });
    for (const child of (childrenMap[id] ?? [])) {
      edges.push({ from: id, to: child.id, side: child.side, label: child.label });
      dfs(child.id);
    }
  }
  dfs(rootId);
  return { nodes, edges, root: rootId };
}

export function huffman(str) {
  const trace = [];

  // Build frequency table
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  const chars = Object.keys(freq).sort();

  // Min-heap simulation (sorted array)
  // Each entry: { id, freq, isLeaf }
  let heap = chars.map(ch => ({ id: ch, freq: freq[ch], isLeaf: true }));
  heap.sort((a, b) => a.freq - b.freq || a.id.localeCompare(b.id));

  // Track positions for new internal nodes (placed above their children)
  const positions = {};
  const spacing = 150;
  chars.forEach((ch, i) => {
    positions[ch] = { x: 100 + i * spacing, y: 400 };
  });
  let internalCount = 0;

  // Tree state for viz (tree renderer)
  const nodeValues = {};   // id → display string
  const childrenMap = {};  // parent id → [{ id, side, label }]
  chars.forEach(ch => { nodeValues[ch] = `${ch}:${freq[ch]}`; });

  trace.push({
    type: 'init',
    pseudocode_line: 0,
    frequencies: { ...freq },
    heap: heap.map(n => ({ id: n.id, freq: n.freq })),
    description: `Build frequency table for "${str}". Initialize min-heap with ${heap.length} leaf nodes.`,
  });

  while (heap.length > 1) {
    // Extract two minimums
    const left = heap.shift();
    const right = heap.shift();

    trace.push({
      type: 'extract_mins',
      pseudocode_line: 3,
      left_id: left.id,
      right_id: right.id,
      left_freq: left.freq,
      right_freq: right.freq,
      heap: heap.map(n => ({ id: n.id, freq: n.freq })),
      description: `Extract two minimums: ${left.id}(${left.freq}) and ${right.id}(${right.freq})`,
    });

    // Create parent node
    const parentId = `_${internalCount++}`;
    const parentFreq = left.freq + right.freq;

    // Position parent above and between its children
    const leftPos = positions[left.id] || { x: 100, y: 400 };
    const rightPos = positions[right.id] || { x: 250, y: 400 };
    const parentPos = {
      x: (leftPos.x + rightPos.x) / 2,
      y: Math.min(leftPos.y, rightPos.y) - 120,
    };
    positions[parentId] = parentPos;

    nodeValues[parentId] = String(parentFreq);

    trace.push({
      type: 'create_parent',
      pseudocode_line: 5,
      parent_id: parentId,
      parent_freq: parentFreq,
      left_id: left.id,
      right_id: right.id,
      position: parentPos,
      description: `Create internal node with freq ${parentFreq} = ${left.freq} + ${right.freq}`,
    });

    childrenMap[parentId] = [
      { id: left.id,  side: 'left',  label: '0' },
      { id: right.id, side: 'right', label: '1' },
    ];

    trace.push({
      type: 'add_edges',
      pseudocode_line: 6,
      parent_id: parentId,
      left_id: left.id,
      right_id: right.id,
      tree: buildSubtree(parentId, nodeValues, childrenMap),
      description: `Connect: ${parentId}→${left.id} (code 0), ${parentId}→${right.id} (code 1)`,
    });

    // Insert parent back into heap
    const parent = { id: parentId, freq: parentFreq, isLeaf: false };
    heap.push(parent);
    heap.sort((a, b) => a.freq - b.freq || a.id.localeCompare(b.id));

    trace.push({
      type: 'update_heap',
      pseudocode_line: 7,
      heap: heap.map(n => ({ id: n.id, freq: n.freq })),
      description: `Insert ${parentId}(${parentFreq}) back into heap. Heap size: ${heap.length}`,
    });
  }

  // Assign codes by traversing the tree
  // Reconstruct tree structure from trace for code assignment
  const children = {}; // parentId -> { left: id, right: id }
  for (const step of trace) {
    if (step.type === 'add_edges') {
      children[step.parent_id] = { left: step.left_id, right: step.right_id };
    }
  }

  const codes = {};
  const root = heap[0];

  function assignCodes(nodeId, code) {
    if (!children[nodeId]) {
      // Leaf node
      codes[nodeId] = code || '0'; // single-character edge case
    } else {
      assignCodes(children[nodeId].left, code + '0');
      assignCodes(children[nodeId].right, code + '1');
    }
  }

  if (root) assignCodes(root.id, '');

  trace.push({
    type: 'assign_codes',
    pseudocode_line: 9,
    codes: { ...codes },
    description: `Assign binary codes by traversal (left=0, right=1): ${Object.entries(codes).map(([c, code]) => `${c}→${code}`).join(', ')}`,
  });

  trace.push({
    type: 'result',
    pseudocode_line: 9,
    codes: { ...codes },
    description: `Huffman encoding complete. Optimal prefix-free codes assigned.`,
  });

  return trace;
}

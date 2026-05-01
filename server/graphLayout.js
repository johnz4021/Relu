/**
 * Graph auto-layout functions for positioning nodes when no positions are provided.
 */

/**
 * Smart auto-layout — picks the best layout strategy based on graph structure.
 * Use this instead of calling layoutGrid/layoutCircle/layoutHierarchical directly.
 * @param {Array<{id: string}>} nodes
 * @param {Array<{source: string, target: string}>} edges
 * @param {Object} existingPositions - { nodeId: { x, y } }
 * @returns {Object} positions - { nodeId: { x, y } }
 */
export function autoLayout(nodes, edges = [], existingPositions = {}) {
  if (!nodes || nodes.length === 0) return existingPositions;

  // If some nodes already have positions, use incremental grid for the rest
  const unpositioned = nodes.filter((n) => !existingPositions[n.id]);
  if (unpositioned.length === 0) return { ...existingPositions };
  if (unpositioned.length < nodes.length) {
    return layoutGrid(nodes, existingPositions);
  }

  // All nodes need positioning — pick strategy based on structure
  const n = nodes.length;
  const m = edges.length;

  // Compute edge density: ratio of actual edges to max possible edges
  const maxEdges = n * (n - 1); // directed
  const density = maxEdges > 0 ? m / maxEdges : 0;

  // Check if it's a DAG (has clear roots with no incoming edges)
  const inDegree = {};
  for (const node of nodes) inDegree[node.id] = 0;
  for (const e of edges) {
    if (inDegree[e.target] !== undefined) inDegree[e.target]++;
  }
  const roots = Object.entries(inDegree).filter(([, deg]) => deg === 0);
  const hasRoots = roots.length > 0 && roots.length < n;

  // Dense graph or small complete-ish graph → circle (avoids edge overlaps)
  if (density > 0.3 || (n <= 6 && m > n)) {
    return layoutCircle(nodes);
  }

  // DAG-like structure with clear roots → hierarchical
  if (hasRoots && m >= n - 1) {
    return layoutHierarchical(nodes, edges);
  }

  // Sparse graph → grid is fine
  return layoutGrid(nodes, {});
}

/**
 * Incremental grid layout — places new nodes in a grid pattern,
 * preserving positions for nodes that already have them.
 * @param {Array<{id: string}>} nodes
 * @param {Object} existingPositions - { nodeId: { x, y } }
 * @returns {Object} positions - { nodeId: { x, y } }
 */
export function layoutGrid(nodes, existingPositions = {}) {
  const positions = { ...existingPositions };
  const unpositioned = nodes.filter((n) => !positions[n.id]);
  if (unpositioned.length === 0) return positions;

  // Find the bounding box of existing positions to place new nodes nearby
  const existing = Object.values(positions);
  let startX = 100;
  let startY = 100;
  if (existing.length > 0) {
    const maxY = Math.max(...existing.map((p) => p.y));
    startY = maxY + 120;
    startX = 100;
  }

  const cols = Math.ceil(Math.sqrt(unpositioned.length));
  const spacingX = 120;
  const spacingY = 120;

  unpositioned.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions[node.id] = {
      x: startX + col * spacingX,
      y: startY + row * spacingY,
    };
  });

  return positions;
}

/**
 * Circle layout — evenly spaces nodes around a circle.
 * @param {Array<{id: string}>} nodes
 * @returns {Object} positions - { nodeId: { x, y } }
 */
export function layoutCircle(nodes) {
  const positions = {};
  const cx = 400;
  const cy = 300;
  const radius = Math.max(150, nodes.length * 30);

  nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    positions[node.id] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });

  return positions;
}

/**
 * Hierarchical layout — BFS-based layering for DAGs.
 * Finds root(s) (nodes with no incoming edges), then layers by BFS distance.
 * @param {Array<{id: string}>} nodes
 * @param {Array<{source: string, target: string}>} edges
 * @returns {Object} positions - { nodeId: { x, y } }
 */
export function layoutHierarchical(nodes, edges) {
  const positions = {};
  const nodeIds = new Set(nodes.map((n) => n.id));
  const adj = {};
  const inDegree = {};

  for (const id of nodeIds) {
    adj[id] = [];
    inDegree[id] = 0;
  }
  for (const e of edges) {
    if (adj[e.source]) adj[e.source].push(e.target);
    if (inDegree[e.target] !== undefined) inDegree[e.target]++;
  }

  // Find roots (no incoming edges)
  let roots = Object.entries(inDegree)
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id);
  if (roots.length === 0) roots = [nodes[0]?.id].filter(Boolean);

  // BFS to assign layers
  const layers = {};
  const visited = new Set();
  const queue = roots.map((r) => ({ id: r, layer: 0 }));
  roots.forEach((r) => visited.add(r));

  while (queue.length > 0) {
    const { id, layer } = queue.shift();
    if (!layers[layer]) layers[layer] = [];
    layers[layer].push(id);

    for (const neighbor of adj[id] || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ id: neighbor, layer: layer + 1 });
      }
    }
  }

  // Place any unvisited nodes in the last layer
  for (const n of nodes) {
    if (!visited.has(n.id)) {
      const maxLayer = Math.max(0, ...Object.keys(layers).map(Number));
      const layer = maxLayer + 1;
      if (!layers[layer]) layers[layer] = [];
      layers[layer].push(n.id);
    }
  }

  // Position nodes
  const layerSpacing = 120;
  const nodeSpacing = 120;
  const layerKeys = Object.keys(layers).map(Number).sort((a, b) => a - b);
  const maxWidth = Math.max(...layerKeys.map((k) => layers[k].length));

  for (const layerIdx of layerKeys) {
    const nodesInLayer = layers[layerIdx];
    const layerWidth = nodesInLayer.length * nodeSpacing;
    const totalWidth = maxWidth * nodeSpacing;
    const offsetX = (totalWidth - layerWidth) / 2;

    nodesInLayer.forEach((nodeId, i) => {
      positions[nodeId] = {
        x: 100 + offsetX + i * nodeSpacing,
        y: 100 + layerIdx * layerSpacing,
      };
    });
  }

  return positions;
}

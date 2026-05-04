/**
 * Deterministic trace-step → viz_actions mapper.
 *
 * Given a trace step from any algorithm, produce the exact viz_actions
 * and context panel updates the client needs.  The agent no longer has
 * to construct these — it just references trace step indices.
 */

// ─── helpers ──────────────────────────────────────────────────────────────────

function viz(renderer, action, params = {}) {
  return { renderer, action, params };
}

function ctx(action, params) {
  return { renderer: 'context', action, params };
}

function ctxUpdate(panelId, data) {
  return ctx('update', { panel_id: panelId, ...data });
}

function ctxLog(panelId, text, type = 'info') {
  return ctx('append_log', { panel_id: panelId, entries: [{ text, type }] });
}

/**
 * Build entries for a distances-style key_value panel from a `step.distances`
 * map. Handles common value sentinels: -1 → 'wall', Infinity / '∞' → '∞'.
 *
 * @param distances  {Object<string, number|string>}
 * @param statusFn   {(key, value) => 'default'|'highlight'|'updated'}
 */
function distancesEntries(distances, statusFn = () => 'default') {
  return Object.entries(distances).map(([k, d]) => {
    let value;
    if (d === -1) value = 'wall';
    else if (d === Infinity || d === '∞') value = '∞';
    else value = d;
    return { key: k, value, status: statusFn(k, d) };
  });
}

/**
 * Build a tree structure from a heap array for the tree renderer.
 */
function heapToTree(heap) {
  if (!heap || heap.length === 0) return { nodes: [], edges: [], root: null, heap_array: heap };
  const nodes = heap.map((v, i) => ({ id: `n${i}`, value: v }));
  const edges = [];
  for (let i = 0; i < heap.length; i++) {
    const l = 2 * i + 1;
    const r = 2 * i + 2;
    if (l < heap.length) edges.push({ from: `n${i}`, to: `n${l}`, side: 'left' });
    if (r < heap.length) edges.push({ from: `n${i}`, to: `n${r}`, side: 'right' });
  }
  return { nodes, edges, root: 'n0', heap_array: heap };
}

function pathUsesEdge(edgeKey, path) {
  const [from, to] = edgeKey.split('->');
  for (let i = 0; i < path.length - 1; i++) {
    if (path[i] === from && path[i + 1] === to) return true;
  }
  return false;
}

function residualEntries(residualGraph, path) {
  const entries = Object.entries(residualGraph)
    .filter(([_, v]) => v.residual > 0)
    .map(([edge, v]) => {
      const [from, to] = edge.split('->');
      const arrow = v.is_reverse ? '←' : '→';
      const typeLabel = v.is_reverse ? '(rev)' : '(fwd)';
      return {
        key: `${from} ${arrow} ${to} ${typeLabel}`,
        value: v.residual,
        status: path && pathUsesEdge(edge, path) ? 'highlight' : 'default',
      };
    });
  // Sort: forward first, then reverse
  entries.sort((a, b) => {
    const aRev = a.key.includes('(rev)') ? 1 : 0;
    const bRev = b.key.includes('(rev)') ? 1 : 0;
    return aRev - bRev;
  });
  return entries;
}

// ─── main entry ───────────────────────────────────────────────────────────────

/**
 * @param {string}  algorithm    – e.g. 'dijkstra', 'knapsack'
 * @param {string}  rendererType – 'graph' | 'array' | 'table' | 'tree' | 'linked'
 * @param {object}  step         – a single trace step object
 * @param {object}  state        – mutable mapper state (persists across steps)
 * @returns {{ viz: object[], ctx: object[] }}
 */
export function mapTraceStep(algorithm, rendererType, step, state) {
  let result;
  switch (rendererType) {
    case 'graph':  result = mapGraphStep(algorithm, step, state); break;
    case 'array':  result = mapArrayStep(algorithm, step, state); break;
    case 'table':  result = mapTableStep(algorithm, step, state); break;
    case 'tree':   result = mapTreeStep(algorithm, step, state); break;
    case 'linked':   result = mapLinkedStep(algorithm, step, state); break;
    case 'interval': result = mapIntervalStep(algorithm, step, state); break;
    case 'string':   result = mapStringStep(algorithm, step, state); break;
    case 'context':  result = mapContextStep(algorithm, step, state); break;
    default:         result = { viz: [], ctx: [] };
  }

  // Generic pseudocode line update — any step with pseudocode_line automatically updates the panel
  if (step.pseudocode_line !== undefined) {
    result.ctx.push(ctxUpdate('pseudocode', { current_line: step.pseudocode_line }));
  }

  return result;
}

// ─── GRAPH mapper ─────────────────────────────────────────────────────────────

function mapGraphStep(algo, step, state) {
  const v = [];
  const c = [];

  switch (step.type) {
    // ── shared: dijkstra / bfs / dfs ──────────────────────────────────────
    case 'init': {
      if (algo === 'dijkstra' && step.distances) {
        c.push(ctxUpdate('distances', {
          entries: Object.entries(step.distances).map(([k, d]) => ({
            key: k, value: d === Infinity ? '∞' : d, status: 'default',
          })),
        }));
        c.push(ctxUpdate('pq', { items: [], style: 'queue' }));
      } else if (algo === 'bfs') {
        c.push(ctxUpdate('queue', {
          items: (step.queue || []).map((n) => ({ value: n })),
          style: 'queue',
        }));
        c.push(ctxUpdate('visited', { items: [], style: 'set' }));
        if (step.distance) {
          c.push(ctxUpdate('distances', {
            entries: Object.entries(step.distance).map(([k, d]) => ({
              key: k, value: d, status: 'default',
            })),
          }));
        }
      } else if (algo === 'dfs') {
        c.push(ctxUpdate('visited', { items: [], style: 'set' }));
        c.push(ctxUpdate('stack', { items: [], style: 'stack' }));
      } else if (algo === 'kruskal') {
        c.push(ctxUpdate('mst_weight', { entries: [{ key: 'Total weight', value: 0 }] }));
      } else if (algo === 'prim' && step.keys) {
        c.push(ctxUpdate('keys', {
          entries: Object.entries(step.keys).map(([k, d]) => ({
            key: k, value: d === Infinity ? '∞' : d, status: 'default',
          })),
        }));
      } else if (algo === 'bellman_ford' && step.distances) {
        c.push(ctxUpdate('distances', {
          entries: Object.entries(step.distances).map(([k, d]) => ({
            key: k, value: d === Infinity ? '∞' : d, status: 'default',
          })),
        }));
        c.push(ctxUpdate('round_info', {
          entries: [
            { key: 'Round', value: '0 / ' + (Object.keys(step.distances).length - 1) },
            { key: 'Status', value: 'Initialized' },
          ],
        }));
      } else if (algo === 'graph_coloring_np') {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Phase', value: 'Starting', status: 'default' },
            { key: 'Attempts', value: '0' },
          ],
        }));
        c.push(ctxUpdate('concepts', { entries: [] }));
      } else if (algo === 'poly_reduction') {
        c.push(ctxUpdate('reduction_status', {
          entries: [
            { key: 'Phase', value: 'Introduction' },
          ],
        }));
      } else if (algo === 'dag_shortest' && step.distances) {
        c.push(ctxUpdate('distances', {
          entries: Object.entries(step.distances).map(([k, d]) => ({
            key: k, value: d === Infinity ? '∞' : d, status: 'default',
          })),
        }));
        c.push(ctxUpdate('topo_order', {
          items: step.topo_order.map(n => ({ value: n })),
          style: 'queue',
        }));
      } else if (algo === 'maxflow') {
        // Set initial edge labels
        if (step.edge_labels) {
          for (const el of step.edge_labels) {
            v.push(viz('graph', 'update_edge_label', { from: el.from, to: el.to, label: el.label, directed_only: true }));
          }
          // Initialize residual panel from edge labels (initially residual = capacity)
          const entries = step.edge_labels.map(el => ({
            key: `${el.from} → ${el.to}`,
            value: el.label.split('/')[1],
            status: 'default',
          }));
          c.push(ctxUpdate('residual', { entries, layout: 'table' }));
        }
        c.push(ctxUpdate('flow_status', {
          entries: [
            { key: 'Total flow', value: step.total_flow ?? 0 },
            { key: 'Status', value: 'Searching for augmenting paths' },
          ],
        }));
      } else if (algo === 'topological_sort' && step.in_degrees) {
        c.push(ctxUpdate('in_degrees', {
          entries: Object.entries(step.in_degrees).map(([k, d]) => ({
            key: k, value: d, status: 'default',
          })),
        }));
        c.push(ctxUpdate('queue', { items: [], style: 'queue' }));
        c.push(ctxUpdate('sorted', { items: [], style: 'queue' }));
      } else if (algo === 'backtracking' && step.nodes) {
        for (const n of step.nodes) {
          v.push(viz('graph', 'add_node', { id: n.id, label: n.label, position: n.position }));
        }
        for (const e of step.edges || []) {
          v.push(viz('graph', 'add_edge', { from: e.from, to: e.to }));
        }
      } else if (algo === 'word_search' && step.graph) {
        for (const n of step.graph.nodes) {
          v.push(viz('graph', 'add_node', { id: n.id, label: n.label, position: n.position }));
        }
        for (const e of step.graph.edges || []) {
          v.push(viz('graph', 'add_edge', { from: e.source, to: e.target }));
        }
        c.push(ctxUpdate('search_state', {
          entries: [
            { key: 'Word', value: step.word },
            { key: 'Matched', value: '0 chars' },
            { key: 'Status', value: 'Searching…' },
          ],
        }));
      } else if (algo === 'union_find' && step.parent) {
        c.push(ctxUpdate('components', {
          entries: [{ key: 'Components', value: step.components, status: 'default' }],
        }));
        c.push(ctxUpdate('parent', {
          entries: Object.entries(step.parent).map(([k, p]) => ({
            key: k, value: p, status: 'default',
          })),
        }));
      } else if (algo === 'multi_source_bfs') {
        // Sources start rotten — paint them as a persistent trail
        const sources = (step.source || '').split(',').filter(Boolean);
        for (const s of sources) {
          v.push(viz('graph', 'highlight_node', { node: s, className: 'visited' }));
        }
        if (step.distances) {
          c.push(ctxUpdate('distances', {
            entries: distancesEntries(step.distances, (k) => sources.includes(k) ? 'highlight' : 'default'),
          }));
        }
      } else if (algo === 'floyd_warshall' && step.distances) {
        c.push(ctxUpdate('distances', { entries: distancesEntries(step.distances) }));
      } else if (algo === 'dijkstra_k_stops' && step.distances) {
        c.push(ctxUpdate('distances', { entries: distancesEntries(step.distances) }));
      } else if (algo === 'tarjan_bridges') {
        c.push(ctxUpdate('disc_low', { entries: [
          { key: 'Status', value: 'Initialized — DFS root pending' },
        ] }));
      } else if (algo === 'bipartite_check') {
        c.push(ctxUpdate('coloring', { entries: [
          { key: 'Status', value: 'Starting 2-coloring' },
        ] }));
      } else if (algo === 'number_of_islands') {
        c.push(ctxUpdate('island_count', { entries: [
          { key: 'Islands', value: 0, status: 'default' },
        ] }));
      } else if (algo === 'prim') {
        // Visible bootstrap so prim's init isn't empty
        c.push(ctxUpdate('mst_weight', { entries: [{ key: 'Total weight', value: 0 }] }));
      } else if (algo === 'trie') {
        c.push(ctxUpdate('trie_state', {
          entries: [{ key: 'Status', value: step.description || 'Trie initialized', status: 'default' }],
        }));
      }
      break;
    }

    case 'visit_node': {
      v.push(viz('graph', 'mark_current', { node: step.node }));

      if (algo === 'dijkstra') {
        if (step.distances) {
          c.push(ctxUpdate('distances', {
            entries: Object.entries(step.distances).map(([k, d]) => ({
              key: k,
              value: d === Infinity ? '∞' : d,
              status: k === step.node ? 'highlight' : (step.visited?.includes(k) ? 'default' : 'default'),
            })),
          }));
        }
        if (step.visited) {
          c.push(ctxUpdate('pq', {
            items: step.visited.map((n) => ({ value: n, status: n === step.node ? 'active' : 'default' })),
            style: 'queue',
          }));
        }
      } else if (algo === 'bfs') {
        if (step.queue) {
          c.push(ctxUpdate('queue', {
            items: step.queue.map((n) => ({ value: n })),
            style: 'queue',
          }));
        }
        if (step.visited) {
          c.push(ctxUpdate('visited', {
            items: step.visited.map((n) => ({ value: n, status: n === step.node ? 'added' : 'default' })),
            style: 'set',
          }));
        }
      } else if (algo === 'dfs') {
        if (step.visited) {
          c.push(ctxUpdate('visited', {
            items: step.visited.map((n) => ({ value: n, status: n === step.node ? 'added' : 'default' })),
            style: 'set',
          }));
        }
        if (step.stack) {
          c.push(ctxUpdate('stack', {
            items: step.stack.map((n) => ({ value: n })),
            style: 'stack',
          }));
        }
      } else if (algo === 'prim') {
        if (step.parent) {
          v.push(viz('graph', 'highlight_edge', { from: step.parent, to: step.node, className: 'mst-edge' }));
        }
        if (step.mst_edges) {
          state.mstWeight = step.mst_edges.reduce((s, e) => s + e.weight, 0);
        }
      } else if (algo === 'word_search') {
        c.push(ctxUpdate('search_state', {
          entries: [
            { key: 'Word', value: step.word },
            { key: 'Matched', value: `${step.word_index + 1} / ${step.word?.length ?? '?'} chars` },
            { key: 'At cell', value: `(${step.node}) = '${step.char}'`, status: 'highlight' },
          ],
        }));
      } else if (algo === 'multi_source_bfs') {
        // Persistent trail — accumulate rotten cells as the wavefront expands.
        // mark_current (above) shows the active tip; highlight_node leaves the trail.
        v.push(viz('graph', 'highlight_node', { node: step.node, className: 'visited' }));
        if (step.from) {
          v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.node, className: 'highlighted' }));
        }
        if (step.distances) {
          c.push(ctxUpdate('distances', {
            entries: distancesEntries(step.distances, (k) => k === step.node ? 'updated' : 'default'),
          }));
        }
      } else if (algo === 'tarjan_bridges') {
        // Cumulative visited trail; show disc/low values
        v.push(viz('graph', 'highlight_node', { node: step.node, className: 'visited' }));
        const visitedNodes = step.visited ? Object.keys(step.visited) : [];
        c.push(ctxUpdate('disc_low', { entries: [
          { key: 'Visited count', value: String(visitedNodes.length), status: 'default' },
          { key: 'Current', value: step.node, status: 'highlight' },
        ] }));
      } else if (algo === 'bipartite_check') {
        // visited holds the color map (0/1)
        v.push(viz('graph', 'highlight_node', { node: step.node, className: 'visited' }));
        if (step.visited) {
          c.push(ctxUpdate('coloring', {
            entries: Object.entries(step.visited).map(([k, v]) => ({
              key: k, value: v === 0 ? 'RED' : 'BLUE',
              status: k === step.node ? 'highlight' : 'default',
            })),
          }));
        }
      } else if (algo === 'number_of_islands') {
        // Cumulative visited cells (flood-fill); track island count from step
        v.push(viz('graph', 'highlight_node', { node: step.node, className: 'visited' }));
        if (step.from) {
          v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.node, className: 'highlighted' }));
        }
        if (step.island_count !== undefined) {
          c.push(ctxUpdate('island_count', { entries: [
            { key: 'Islands', value: step.island_count, status: 'highlight' },
          ] }));
        }
      }
      break;
    }

    case 'begin_round': {
      v.push(viz('graph', 'reset_highlights', {}));
      c.push(ctxUpdate('round_info', {
        entries: [
          { key: 'Round', value: `${step.round} / ${step.total_rounds}`, status: 'highlight' },
          { key: 'Status', value: 'Relaxing all edges' },
        ],
      }));
      if (step.distances) {
        c.push(ctxUpdate('distances', {
          entries: Object.entries(step.distances).map(([k, d]) => ({
            key: k, value: d === Infinity ? '∞' : d, status: 'default',
          })),
        }));
      }
      break;
    }

    case 'examine_edge': {
      v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.to, className: 'examining' }));
      break;
    }

    case 'relax': {
      v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.to, className: 'highlighted' }));
      v.push(viz('graph', 'set_label', { node: step.to, label: String(step.new_distance) }));
      if (step.distances) {
        c.push(ctxUpdate('distances', {
          entries: Object.entries(step.distances).map(([k, d]) => ({
            key: k,
            value: d === Infinity ? '∞' : d,
            status: k === step.to ? 'updated' : 'default',
          })),
        }));
      }
      break;
    }

    case 'no_relax': {
      v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.to, className: 'examining' }));
      break;
    }

    // ── dag_shortest ──────────────────────────────────────────────────────
    case 'process_node': {
      v.push(viz('graph', 'mark_current', { node: step.node }));
      if (step.distances) {
        c.push(ctxUpdate('distances', {
          entries: Object.entries(step.distances).map(([k, d]) => ({
            key: k, value: d === Infinity ? '∞' : d,
            status: k === step.node ? 'highlight' : 'default',
          })),
        }));
      }
      if (step.topo_order) {
        c.push(ctxUpdate('topo_order', {
          items: step.topo_order.map((n, i) => ({
            value: n, status: i === step.topo_position ? 'active' : 'default',
          })),
          style: 'queue',
        }));
      }
      if (algo === 'topological_sort' && step.sorted) {
        v.push(viz('graph', 'mark_visited', { node: step.node }));
        c.push(ctxUpdate('sorted', {
          items: step.sorted.map(n => ({ value: n, status: n === step.node ? 'added' : 'default' })),
          style: 'queue',
        }));
      }
      break;
    }

    case 'no_improvement': {
      v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.to, className: 'examining' }));
      break;
    }

    case 'discover': {
      v.push(viz('graph', 'highlight_node', { node: step.node, className: 'highlighted' }));
      if (step.from) {
        v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.node }));
      }
      if (step.queue) {
        c.push(ctxUpdate('queue', {
          items: step.queue.map((n) => ({ value: n, status: n === step.node ? 'added' : 'default' })),
          style: 'queue',
        }));
      }
      if (step.visited) {
        c.push(ctxUpdate('visited', {
          items: step.visited.map((n) => ({ value: n })),
          style: 'set',
        }));
      }
      if (step.distance) {
        c.push(ctxUpdate('distances', {
          entries: Object.entries(step.distance).map(([k, d]) => ({
            key: k, value: d, status: k === step.node ? 'highlight' : 'default',
          })),
        }));
      }
      if (step.level !== undefined) {
        v.push(viz('graph', 'set_label', { node: step.node, label: `d=${step.level}` }));
      }
      break;
    }

    case 'backtrack': {
      if (algo === 'word_search') {
        v.push(viz('graph', 'highlight_node', { node: step.node, className: 'default' }));
        c.push(ctxLog('decisions', `Backtrack from (${step.node}) '${step.char}'`, 'info'));
      } else {
        v.push(viz('graph', 'mark_visited', { node: step.node }));
        if (step.stack) {
          c.push(ctxUpdate('stack', {
            items: step.stack.map((n) => ({ value: n })),
            style: 'stack',
          }));
        }
      }
      break;
    }

    case 'found_path': {
      if (algo === 'word_search') {
        for (const nodeId of step.path || []) {
          v.push(viz('graph', 'highlight_node', { node: nodeId, className: 'visited' }));
        }
        c.push(ctxUpdate('search_state', {
          entries: [
            { key: 'Word', value: step.word },
            { key: 'Matched', value: `${step.word?.length} / ${step.word?.length} — FOUND`, status: 'updated' },
          ],
        }));
        c.push(ctxLog('decisions', `Found "${step.word}"! Path: ${(step.path || []).join(' → ')}`, 'result'));
      }
      break;
    }

    case 'result': {
      if ((algo === 'dijkstra' || algo === 'bellman_ford') && step.paths) {
        // Show shortest path tree
        for (const [target, path] of Object.entries(step.paths)) {
          if (path.length > 1) {
            v.push(viz('graph', 'show_path', { path }));
          }
        }
        if (algo === 'bellman_ford') {
          c.push(ctxUpdate('round_info', {
            entries: [
              { key: 'Status', value: 'Complete', status: 'updated' },
            ],
          }));
        }
      }
      if (algo === 'maxflow') {
        c.push(ctxUpdate('flow_status', {
          entries: [
            { key: 'Max flow', value: step.max_flow, status: 'updated' },
            { key: 'Min cut', value: step.min_cut, status: 'updated' },
          ],
        }));
      }
      if (algo === 'graph_coloring_np' && step.coloring) {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Phase', value: 'Complete', status: 'updated' },
            { key: 'Result', value: 'Graph 3-Coloring is NP-Complete' },
          ],
        }));
        // Concepts panel already built incrementally via concept_intro steps — don't overwrite
      }
      if (algo === 'poly_reduction') {
        c.push(ctxUpdate('reduction_status', {
          entries: [
            { key: 'Phase', value: 'Reduction complete', status: 'updated' },
            { key: 'Result', value: 'Independent Set is NP-Complete' },
            { key: 'Assignment', value: step.assignment ? Object.entries(step.assignment).map(([v, val]) => `${v}=${val}`).join(', ') : '' },
          ],
        }));
        c.push(ctxLog('log', 'Reduction complete: Independent Set is NP-Complete', 'result'));
      }
      if (algo === 'topological_sort') {
        if (step.cycle_detected) {
          for (const n of step.unprocessed_nodes || []) {
            v.push(viz('graph', 'highlight_node', { node: n, className: 'examining' }));
          }
          c.push(ctxUpdate('sorted', {
            items: [{ value: 'CYCLE DETECTED', status: 'highlight' }],
            style: 'queue',
          }));
        } else {
          for (const n of step.sorted || []) {
            v.push(viz('graph', 'mark_visited', { node: n }));
          }
          c.push(ctxUpdate('sorted', {
            items: (step.sorted || []).map(n => ({ value: n, status: 'updated' })),
            style: 'queue',
          }));
        }
      }
      if (algo === 'backtracking') {
        v.push(viz('graph', 'reset_highlights', {}));
      }
      if (algo === 'union_find' && step.component_map) {
        const componentEntries = Object.entries(step.component_map).map(([root, members]) => ({
          key: `Root ${root}`, value: members.join(', '), status: 'updated',
        }));
        c.push(ctxUpdate('components', {
          entries: [
            { key: 'Components', value: step.components, status: 'updated' },
            ...componentEntries,
          ],
        }));
        c.push(ctxLog('decisions', `Complete: ${step.components} component${step.components !== 1 ? 's' : ''} found`, 'result'));
      }
      if (algo === 'word_search') {
        c.push(ctxUpdate('search_state', {
          entries: [
            { key: 'Word', value: step.word },
            { key: 'Result', value: step.found ? 'FOUND' : 'NOT FOUND', status: step.found ? 'updated' : 'highlight' },
          ],
        }));
      }
      if (algo === 'multi_source_bfs' && step.distances) {
        c.push(ctxUpdate('distances', {
          entries: distancesEntries(step.distances, () => 'updated'),
        }));
      }
      if ((algo === 'floyd_warshall' || algo === 'dijkstra_k_stops') && step.distances) {
        c.push(ctxUpdate('distances', {
          entries: distancesEntries(step.distances, () => 'updated'),
        }));
      }
      if (algo === 'tarjan_bridges') {
        const bridges = step.output ? JSON.parse(step.output) : [];
        for (const [u, w] of bridges) {
          v.push(viz('graph', 'highlight_edge', { from: u, to: w, className: 'highlighted' }));
        }
        c.push(ctxUpdate('disc_low', { entries: [
          { key: 'Bridges found', value: String(bridges.length), status: 'updated' },
        ] }));
      }
      if (algo === 'bipartite_check') {
        c.push(ctxUpdate('coloring', { entries: [
          { key: 'Result', value: step.output === 'true' ? 'Bipartite ✓' : 'NOT bipartite', status: 'updated' },
        ] }));
      }
      if (algo === 'number_of_islands') {
        c.push(ctxUpdate('island_count', { entries: [
          { key: 'Islands', value: step.output ?? 0, status: 'updated' },
        ] }));
      }
      if (algo === 'dfs' || algo === 'prim' || algo === 'trie') {
        c.push(ctxUpdate('algorithm_state', {
          entries: [{ key: 'Result', value: step.description || step.output || 'Complete', status: 'updated' }],
        }));
      }
      break;
    }

    // ── Trie operations (graph renderer) ─────────────────────────────────
    case 'insert_start':
    case 'insert_step':
    case 'insert_done':
    case 'search_start':
    case 'search_step':
    case 'search_done': {
      if (algo === 'trie') {
        if (step.node_id) {
          v.push(viz('graph', 'mark_current', { node: String(step.node_id) }));
        }
        c.push(ctxUpdate('trie_state', {
          entries: [
            { key: step.word ? `"${step.word}"` : step.type, value: step.description || '', status: 'highlight' },
          ],
        }));
      }
      break;
    }

    // ── Kruskal-specific ─────────────────────────────────────────────────
    case 'sort_edges': {
      c.push(ctxLog('decisions', 'Edges sorted by weight', 'info'));
      break;
    }

    case 'consider_edge': {
      v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.to, className: 'examining' }));
      c.push(ctxLog('decisions', `Consider ${step.from}-${step.to} (w=${step.weight})`, 'info'));
      break;
    }

    case 'check_cycle': {
      const msg = step.would_cycle
        ? `${step.from}-${step.to} would form a cycle`
        : `${step.from}-${step.to} is safe (different components)`;
      c.push(ctxLog('decisions', msg, 'info'));
      break;
    }

    case 'add_to_mst': {
      v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.to, className: 'mst-edge' }));
      c.push(ctxUpdate('mst_weight', {
        entries: [{ key: 'Total weight', value: step.mst_weight, status: 'updated' }],
      }));
      c.push(ctxLog('decisions', `✓ Add ${step.from}-${step.to} (w=${step.weight}), total=${step.mst_weight}`, 'result'));
      break;
    }

    case 'reject_edge': {
      v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.to, className: 'strikethrough' }));
      c.push(ctxLog('decisions', `✗ Reject ${step.from}-${step.to} (would cycle)`, 'decision'));
      break;
    }

    // ── Prim-specific ────────────────────────────────────────────────────
    case 'update_key': {
      v.push(viz('graph', 'set_label', { node: step.node, label: String(step.new_key) }));
      if (step.keys) {
        c.push(ctxUpdate('keys', {
          entries: Object.entries(step.keys).map(([k, d]) => ({
            key: k,
            value: d === Infinity ? '∞' : d,
            status: k === step.node ? 'updated' : 'default',
          })),
        }));
      }
      c.push(ctxLog('decisions', `Update key[${step.node}] = ${step.new_key} via ${step.via}`, 'decision'));
      break;
    }

    // ── Max Flow specific ────────────────────────────────────────────────
    case 'find_augmenting_path': {
      v.push(viz('graph', 'reset_highlights', {}));
      // Re-apply edge labels so saturated edges stay red after reset
      if (step.edge_labels) {
        for (const el of step.edge_labels) {
          v.push(viz('graph', 'update_edge_label', { from: el.from, to: el.to, label: el.label, directed_only: true }));
          if (el.saturated) {
            v.push(viz('graph', 'highlight_edge', { from: el.from, to: el.to, className: 'saturated' }));
          }
        }
      }
      if (step.path) {
        for (const node of step.path) {
          v.push(viz('graph', 'highlight_node', { node, className: 'augmenting' }));
        }
        for (let i = 0; i < step.path.length - 1; i++) {
          v.push(viz('graph', 'highlight_edge', { from: step.path[i], to: step.path[i + 1], className: 'augmenting' }));
        }
      }
      c.push(ctxUpdate('flow_status', {
        entries: [
          { key: 'Total flow', value: step.total_flow },
          { key: 'Path bottleneck', value: step.bottleneck, status: 'highlight' },
        ],
      }));
      c.push(ctxLog('aug_paths', `Path ${step.iteration}: ${step.path?.join(' → ')} (bottleneck=${step.bottleneck})`, 'decision'));
      if (step.conceptual_state?.residual_graph) {
        const residualEdges = Object.entries(step.conceptual_state.residual_graph)
          .map(([key, val]) => {
            const [from, to] = key.split('->');
            return { from, to, residual: val.residual, is_reverse: val.is_reverse };
          });
        v.push(viz('graph', 'set_residual_data', { residual_edges: residualEdges }));
        c.push(ctxUpdate('residual', { entries: residualEntries(step.conceptual_state.residual_graph, step.path), layout: 'table' }));
      }
      break;
    }

    case 'push_flow': {
      v.push(viz('graph', 'reset_highlights', {}));
      // Build set of edges on the augmenting path so we don't override their blue with red
      const pathEdgeSet = new Set();
      if (step.path) {
        for (const node of step.path) {
          v.push(viz('graph', 'highlight_node', { node, className: 'augmenting' }));
        }
        for (let i = 0; i < step.path.length - 1; i++) {
          v.push(viz('graph', 'highlight_edge', { from: step.path[i], to: step.path[i + 1], className: 'augmenting' }));
          pathEdgeSet.add(`${step.path[i]}->${step.path[i + 1]}`);
        }
      }
      if (step.edge_labels) {
        for (const el of step.edge_labels) {
          v.push(viz('graph', 'update_edge_label', { from: el.from, to: el.to, label: el.label, directed_only: true }));
          // Only mark saturated if not on the current augmenting path — path edges stay blue
          if (el.saturated && !pathEdgeSet.has(`${el.from}->${el.to}`)) {
            v.push(viz('graph', 'highlight_edge', { from: el.from, to: el.to, className: 'saturated' }));
          }
        }
      }
      c.push(ctxUpdate('flow_status', {
        entries: [
          { key: 'Total flow', value: step.total_flow, status: 'updated' },
          { key: 'Status', value: `Pushed ${step.bottleneck} units` },
        ],
      }));
      if (step.conceptual_state?.residual_graph) {
        const residualEdges = Object.entries(step.conceptual_state.residual_graph)
          .map(([key, val]) => {
            const [from, to] = key.split('->');
            return { from, to, residual: val.residual, is_reverse: val.is_reverse };
          });
        v.push(viz('graph', 'set_residual_data', { residual_edges: residualEdges }));
        c.push(ctxUpdate('residual', { entries: residualEntries(step.conceptual_state.residual_graph, step.path), layout: 'table' }));
      }
      break;
    }

    case 'residual_concept_freeze': {
      v.push(viz('graph', 'reset_highlights', {}));
      if (step.edge_labels) {
        for (const el of step.edge_labels) {
          v.push(viz('graph', 'update_edge_label', { from: el.from, to: el.to, label: el.label, directed_only: true }));
          if (el.saturated) {
            v.push(viz('graph', 'highlight_edge', { from: el.from, to: el.to, className: 'saturated' }));
          }
        }
      }
      if (step.conceptual_state?.residual_graph) {
        const residualEdges = Object.entries(step.conceptual_state.residual_graph)
          .map(([key, val]) => {
            const [from, to] = key.split('->');
            return { from, to, residual: val.residual, is_reverse: val.is_reverse };
          });
        v.push(viz('graph', 'show_residual_overlay', { residual_edges: residualEdges, mode: 'full' }));
        c.push(ctxUpdate('residual', { entries: residualEntries(step.conceptual_state.residual_graph), layout: 'table' }));
      }
      c.push(ctxUpdate('flow_status', {
        entries: [
          { key: 'Total flow', value: step.total_flow, status: 'updated' },
          { key: 'Status', value: 'Concept freeze: examining residual graph' },
        ],
      }));
      break;
    }

    case 'no_more_paths': {
      c.push(ctxLog('aug_paths', 'No more augmenting paths found', 'info'));
      c.push(ctxUpdate('flow_status', {
        entries: [
          { key: 'Total flow', value: step.total_flow, status: 'updated' },
          { key: 'Status', value: 'Complete' },
        ],
      }));
      break;
    }

    // ── Graph Coloring NP ─────────────────────────────────────────────
    case 'attempt_coloring': {
      v.push(viz('graph', 'reset_highlights', {}));
      if (step.node_classes) {
        for (const [node, cls] of Object.entries(step.node_classes)) {
          v.push(viz('graph', 'highlight_node', { node, className: cls }));
        }
      }
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Attempts', value: `${step.attempt_number} / ${step.total_possible}`, status: 'highlight' },
          { key: 'Phase', value: 'Brute-force search' },
        ],
      }));
      c.push(ctxLog('attempt_log', `Attempt #${step.attempt_number}: ${step.description?.split(': ')[1] || '...'}`, 'info'));
      break;
    }

    case 'coloring_conflict': {
      v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.to, className: 'examining' }));
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Attempts', value: `${step.attempt_number} / ${step.total_possible}` },
          { key: 'Phase', value: 'Brute-force search' },
          { key: 'Last result', value: 'CONFLICT', status: 'updated' },
        ],
      }));
      c.push(ctxLog('attempt_log', `FAIL: ${step.from}-${step.to} both ${step.color}`, 'decision'));
      break;
    }

    case 'coloring_success': {
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Attempts', value: `${step.attempt_number} / ${step.total_possible}` },
          { key: 'Phase', value: 'Brute-force search' },
          { key: 'Last result', value: 'VALID!', status: 'updated' },
        ],
      }));
      c.push(ctxLog('attempt_log', `SUCCESS on attempt #${step.attempt_number}: ${step.coloring_str}`, 'result'));
      break;
    }

    case 'verify_start': {
      v.push(viz('graph', 'reset_highlights', {}));
      if (step.node_classes) {
        for (const [node, cls] of Object.entries(step.node_classes)) {
          v.push(viz('graph', 'highlight_node', { node, className: cls }));
        }
      }
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Phase', value: 'Certificate verification', status: 'highlight' },
          { key: 'Edges checked', value: `0 / ${step.total_edges}` },
        ],
      }));
      c.push(ctxLog('attempt_log', 'Verification phase: checking certificate...', 'info'));
      break;
    }

    case 'verify_edge': {
      // Keep coloring visible
      if (step.node_classes) {
        for (const [node, cls] of Object.entries(step.node_classes)) {
          v.push(viz('graph', 'highlight_node', { node, className: cls }));
        }
      }
      v.push(viz('graph', 'highlight_edge', {
        from: step.from, to: step.to,
        className: step.pass ? 'highlighted' : 'examining',
      }));
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Phase', value: 'Certificate verification' },
          { key: 'Edges checked', value: `${step.check_number} / ${step.total_edges}`, status: 'highlight' },
          { key: 'Current edge', value: `${step.from}-${step.to}: ${step.pass ? 'PASS' : 'FAIL'}` },
        ],
      }));
      c.push(ctxLog('attempt_log', `Edge ${step.from}-${step.to}: ${step.color_from} vs ${step.color_to} → ${step.pass ? 'PASS' : 'FAIL'}`, step.pass ? 'info' : 'decision'));
      break;
    }

    case 'verify_complete': {
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Phase', value: 'Verification complete', status: 'updated' },
          { key: 'Edges checked', value: `${step.checks} / ${step.checks}` },
          { key: 'Result', value: 'Certificate VALID', status: 'updated' },
        ],
      }));
      c.push(ctxLog('attempt_log', `All ${step.checks} edges verified — certificate is valid!`, 'result'));
      break;
    }

    case 'concept_intro': {
      const conceptDefs = {
        p_definition:  { key: 'P',          value: 'Solvable in polynomial time' },
        np_definition: { key: 'NP',         value: 'Verifiable in polynomial time' },
        np_hard:       { key: 'NP-Hard',    value: 'At least as hard as every problem in NP (via reductions)' },
        np_complete:   { key: 'NP-Complete', value: 'In NP and NP-Hard; the hardest problems still in NP' },
        p_vs_np:       { key: 'P vs NP',    value: 'Does P = NP? The central open question' },
        reduction_correctness: { key: 'Reduction', value: `Formula satisfiable ⟺ independent set of size k=${step.k || '?'}` },
      };
      const def = conceptDefs[step.concept];
      if (def) {
        c.push(ctxUpdate('concepts', {
          entries: [def],
          append: true,
        }));
      }
      c.push(ctxLog('attempt_log', step.description || `Concept: ${step.concept}`, 'info'));
      // For poly_reduction, also log to reduction log
      c.push(ctxLog('log', step.description || `Concept: ${step.concept}`, 'info'));
      break;
    }

    // ── Polynomial Reduction ─────────────────────────────────────────────
    case 'show_formula': {
      if (step.clauses) {
        c.push(ctxUpdate('formula', {
          lines: step.clauses.map(cl => ({ label: `C${cl.id}`, text: cl.text })),
        }));
      }
      c.push(ctxUpdate('reduction_status', {
        entries: [
          { key: 'Phase', value: 'Formula presented' },
          { key: 'Variables', value: step.variables?.join(', ') || '' },
          { key: 'Clauses', value: String(step.clauses?.length || 0) },
        ],
      }));
      c.push(ctxLog('log', `Formula: ${step.formula_text}`, 'info'));
      break;
    }

    case 'build_clause_gadget': {
      // Add nodes for this clause triangle progressively
      for (let i = 0; i < step.node_ids.length; i++) {
        const nodeId = step.node_ids[i];
        const label = step.literals[i] || nodeId;
        // Use unicode subscripts for display labels
        const displayLabel = label.replace(/x(\d)/g, (_, d) => `x${String.fromCharCode(0x2080 + parseInt(d))}`);
        const position = step.node_positions?.[nodeId] || { x: 0, y: 0 };
        v.push(viz('graph', 'add_node', { id: nodeId, label: displayLabel, position }));
        v.push(viz('graph', 'highlight_node', { node: nodeId, className: 'current' }));
      }
      // Add triangle edges
      for (const edge of step.triangle_edges) {
        v.push(viz('graph', 'add_edge', { from: edge.source, to: edge.target, undirected: true }));
        v.push(viz('graph', 'highlight_edge', { from: edge.source, to: edge.target, className: 'highlighted' }));
      }
      c.push(ctxUpdate('reduction_status', {
        entries: [
          { key: 'Phase', value: `Building clause ${step.clause_index} triangle`, status: 'highlight' },
          { key: 'Clause', value: step.clause_text },
        ],
      }));
      c.push(ctxLog('log', `Clause ${step.clause_index}: ${step.clause_text} → triangle {${step.node_ids.join(', ')}}`, 'info'));
      break;
    }

    case 'add_conflict_edges': {
      v.push(viz('graph', 'reset_highlights', {}));
      // Add conflict edges progressively
      for (const edge of step.conflict_edges) {
        v.push(viz('graph', 'add_edge', { from: edge.source, to: edge.target, undirected: true, className: 'examining' }));
      }
      c.push(ctxUpdate('reduction_status', {
        entries: [
          { key: 'Phase', value: 'Adding conflict edges', status: 'highlight' },
          { key: 'Conflict edges', value: String(step.conflict_edges.length) },
        ],
      }));
      c.push(ctxLog('log', `Added ${step.conflict_edges.length} conflict edges between complementary literals`, 'decision'));
      break;
    }

    case 'find_independent_set': {
      v.push(viz('graph', 'reset_highlights', {}));
      for (const nodeId of step.selected_nodes) {
        v.push(viz('graph', 'highlight_node', { node: nodeId, className: 'visited' }));
      }
      c.push(ctxUpdate('reduction_status', {
        entries: [
          { key: 'Phase', value: 'Independent set found', status: 'updated' },
          { key: 'k', value: String(step.k) },
          { key: 'Selected', value: step.selected_nodes.join(', ') },
        ],
      }));
      c.push(ctxLog('log', `Independent set of size ${step.k}: {${step.selected_nodes.join(', ')}}`, 'result'));
      break;
    }

    case 'map_to_assignment': {
      v.push(viz('graph', 'reset_highlights', {}));
      for (const nodeId of step.selected_nodes) {
        v.push(viz('graph', 'highlight_node', { node: nodeId, className: 'path' }));
      }
      c.push(ctxUpdate('reduction_status', {
        entries: [
          { key: 'Phase', value: 'Mapped to assignment', status: 'updated' },
          { key: 'Assignment', value: step.assignment_str },
        ],
      }));
      for (const cr of step.clause_results) {
        c.push(ctxLog('log', `${cr.clause} satisfied by ${cr.satisfiedBy}`, 'result'));
      }
      break;
    }

    case 'compute_min_cut': {
      if (step.source_side) {
        for (const node of step.source_side) {
          v.push(viz('graph', 'highlight_node', { node, className: 'source-side' }));
        }
      }
      if (step.sink_side) {
        for (const node of step.sink_side) {
          v.push(viz('graph', 'highlight_node', { node, className: 'sink-side' }));
        }
      }
      if (step.cut_edges) {
        for (const e of step.cut_edges) {
          v.push(viz('graph', 'highlight_edge', { from: e.from, to: e.to, className: 'min-cut' }));
        }
      }
      break;
    }

    // ── Topological Sort (Kahn's) ─────────────────────────────────────────
    case 'enqueue_zero_in_degree': {
      for (const n of step.nodes || []) {
        v.push(viz('graph', 'highlight_node', { node: n, className: 'highlighted' }));
      }
      c.push(ctxUpdate('queue', {
        items: (step.nodes || []).map(n => ({ value: n, status: 'added' })),
        style: 'queue',
      }));
      break;
    }

    case 'reduce_in_degree': {
      v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.node, className: 'examining' }));
      break;
    }

    case 'enqueue_neighbor': {
      v.push(viz('graph', 'highlight_node', { node: step.node, className: 'highlighted' }));
      break;
    }

    // ── Backtracking ──────────────────────────────────────────────────────
    case 'choose': {
      v.push(viz('graph', 'mark_current', { node: step.nodeId }));
      if (step.path !== undefined) {
        c.push(ctxUpdate('current_subset', {
          items: step.path.map(e => ({ value: e })),
          style: 'set',
        }));
      }
      break;
    }

    case 'found': {
      v.push(viz('graph', 'highlight_node', { node: step.nodeId, className: 'visited' }));
      if (step.subset !== undefined) {
        c.push(ctxLog('recorded_subsets', `[${step.subset.join(', ')}]`, 'success'));
      }
      break;
    }

    case 'unchoose': {
      v.push(viz('graph', 'highlight_node', { node: step.nodeId, className: 'default' }));
      if (step.path !== undefined) {
        c.push(ctxUpdate('current_subset', {
          items: step.path.map(e => ({ value: e })),
          style: 'set',
        }));
      }
      break;
    }

    // ── Union-Find ────────────────────────────────────────────────────────
    case 'process_edge': {
      if (algo === 'union_find') {
        v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.to, className: 'examining' }));
        v.push(viz('graph', 'highlight_node', { node: step.from, className: 'current' }));
        v.push(viz('graph', 'highlight_node', { node: step.to, className: 'current' }));
        c.push(ctxLog('decisions', `Process edge (${step.from}, ${step.to})`, 'info'));
      }
      break;
    }

    case 'find': {
      if (algo === 'union_find') {
        v.push(viz('graph', 'highlight_node', { node: step.node, className: 'current' }));
        if (step.root !== step.node) {
          v.push(viz('graph', 'highlight_node', { node: step.root, className: 'highlighted' }));
        }
        if (step.parent) {
          c.push(ctxUpdate('parent', {
            entries: Object.entries(step.parent).map(([k, p]) => ({
              key: k, value: p, status: k === step.node ? 'highlight' : 'default',
            })),
          }));
        }
        c.push(ctxLog('decisions', `find(${step.node}) = ${step.root}`, 'info'));
      }
      break;
    }

    case 'already_connected': {
      if (algo === 'union_find') {
        v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.to, className: 'mst-edge' }));
        c.push(ctxUpdate('components', {
          entries: [{ key: 'Components', value: step.components, status: 'default' }],
        }));
        c.push(ctxLog('decisions', `${step.from}–${step.to} already connected (root: ${step.root})`, 'decision'));
      }
      break;
    }

    case 'union': {
      if (algo === 'union_find') {
        v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.to, className: 'highlighted' }));
        v.push(viz('graph', 'highlight_node', { node: step.merged_under, className: 'visited' }));
        if (step.parent) {
          c.push(ctxUpdate('parent', {
            entries: Object.entries(step.parent).map(([k, p]) => ({
              key: k, value: p, status: p === step.merged_under && k !== step.merged_under ? 'updated' : 'default',
            })),
          }));
        }
        c.push(ctxUpdate('components', {
          entries: [{ key: 'Components', value: step.components, status: 'updated' }],
        }));
        c.push(ctxLog('decisions', `Union(${step.from}, ${step.to}) → root: ${step.merged_under}`, 'result'));
      }
      break;
    }
  }

  return { viz: v, ctx: c };
}

// ─── ARRAY mapper ─────────────────────────────────────────────────────────────

function mapArrayStep(algo, step, state) {
  const v = [];
  const c = [];

  switch (step.type) {
    case 'init': {
      if (step.array) {
        v.push(viz('array', 'set_data', { values: step.array }));
      }
      if (!state.comparisons) state.comparisons = 0;
      if (!state.swaps) state.swaps = 0;
      if (algo === 'binary_search' && step.target !== undefined) {
        state.target = step.target;
        c.push(ctxUpdate('bounds', {
          entries: [
            { key: 'Target', value: step.target },
            { key: 'Left', value: 0 },
            { key: 'Right', value: step.array.length - 1 },
          ],
        }));
      } else if (algo === 'quickselect') {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Target k', value: step.k ?? '–' },
            { key: 'Array size', value: step.array?.length ?? '–' },
          ],
        }));
      } else if (algo === 'two_pointers') {
        v.push(viz('array', 'set_pointer', { name: 'left', index: 0 }));
        v.push(viz('array', 'set_pointer', { name: 'right', index: (step.array?.length ?? 1) - 1 }));
        c.push(ctxUpdate('search_state', {
          entries: [
            { key: 'Target', value: step.target },
            { key: 'Left', value: 0 },
            { key: 'Right', value: (step.array?.length ?? 1) - 1 },
          ],
        }));
      } else if (algo === 'gcd') {
        const cs = step.conceptual_state || {};
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'a', value: cs.a ?? step.array?.[0] ?? '–' },
            { key: 'b', value: cs.b ?? step.array?.[1] ?? '–' },
          ],
        }));
      } else if (algo === 'max_subarray') {
        c.push(ctxUpdate('kadane_state', {
          entries: [
            { key: 'current_sum', value: '—' },
            { key: 'max_sum', value: '—' },
            { key: 'Max subarray', value: '—' },
          ],
        }));
      } else if (algo === 'rotate_array') {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'k (rotate by)', value: step.k ?? 0 },
            { key: 'Phase', value: '0 of 3' },
          ],
        }));
      } else {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Comparisons', value: 0 },
            { key: 'Swaps', value: 0 },
          ],
        }));
      }
      break;
    }

    case 'compare': {
      state.comparisons = (state.comparisons || 0) + 1;
      if (step.indices) {
        v.push(viz('array', 'compare', { i: step.indices[0], j: step.indices[1] }));
      }
      if (step.pointers) {
        for (const [name, idx] of Object.entries(step.pointers)) {
          if (idx >= 0) v.push(viz('array', 'set_pointer', { name, index: idx }));
        }
      }
      if (algo !== 'binary_search') {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Comparisons', value: state.comparisons },
            { key: 'Swaps', value: state.swaps || 0 },
          ],
        }));
      }
      break;
    }

    case 'swap': {
      state.swaps = (state.swaps || 0) + 1;
      v.push(viz('array', 'swap', { i: step.i, j: step.j }));
      if (step.pointers) {
        for (const [name, idx] of Object.entries(step.pointers)) {
          if (idx >= 0) v.push(viz('array', 'set_pointer', { name, index: idx }));
        }
      }
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Comparisons', value: state.comparisons || 0 },
          { key: 'Swaps', value: state.swaps },
        ],
      }));
      break;
    }

    case 'shift': {
      v.push(viz('array', 'place', { index: step.to, value: step.value }));
      v.push(viz('array', 'highlight', { indices: [step.to], className: 'swapping' }));
      break;
    }

    case 'place': {
      v.push(viz('array', 'place', { index: step.index, value: step.value }));
      break;
    }

    case 'select_pivot': {
      v.push(viz('array', 'partition', {
        pivot_index: step.pivot_index,
        left: step.range?.[0] ?? 0,
        right: step.range?.[1] ?? 0,
      }));
      break;
    }

    case 'pivot_placed':
    case 'mark_sorted': {
      if (step.indices) {
        v.push(viz('array', 'mark_sorted', { indices: step.indices }));
      } else if (step.index !== undefined) {
        v.push(viz('array', 'mark_sorted', { indices: [step.index] }));
      }
      break;
    }

    case 'select_key': {
      v.push(viz('array', 'highlight', { indices: [step.index], className: 'active' }));
      break;
    }

    case 'insert': {
      // Insertion sort: update the array and highlight placed element
      if (step.array) {
        v.push(viz('array', 'set_data', { values: step.array }));
      }
      v.push(viz('array', 'place', { index: step.index, value: step.value }));
      break;
    }

    case 'divide': {
      v.push(viz('array', 'highlight', {
        indices: Array.from({ length: step.range[1] - step.range[0] + 1 }, (_, i) => step.range[0] + i),
        className: 'active',
      }));
      if (step.depth !== undefined) {
        v.push(viz('array', 'mark_subarrays', {
          ranges: [
            { left: step.range[0], right: step.mid, depth: step.depth },
            { left: step.mid + 1, right: step.range[1], depth: step.depth },
          ],
        }));
      }
      // Emit recursion tree node for mergesort divide steps
      if (step.call_id) {
        const nodeLabel = `[${step.range[0]}..${step.range[1]}]`;
        if (!state._rtNodes) { state._rtNodes = []; state._rtEdges = []; state._rtRoot = null; }
        state._rtNodes.push({ id: step.call_id, label: nodeLabel, depth: step.depth });
        if (step.parent_call_id) {
          state._rtEdges.push({ from: step.parent_call_id, to: step.call_id });
        }
        if (!state._rtRoot) state._rtRoot = step.call_id;
        v.push(viz('recursion_tree', 'set_concrete_tree', {
          nodes: [...state._rtNodes],
          edges: [...state._rtEdges],
          root: state._rtRoot,
        }));
        v.push(viz('recursion_tree', 'highlight_node', { id: step.call_id }));
      }
      break;
    }

    case 'merge_start': {
      const range = step.range;
      v.push(viz('array', 'highlight', {
        indices: Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i),
        className: 'comparing',
      }));
      break;
    }

    case 'merge_complete': {
      if (step.array) {
        v.push(viz('array', 'set_data', { values: step.array }));
      }
      break;
    }

    // ── Binary search ────────────────────────────────────────────────────
    case 'check_mid': {
      state.comparisons = (state.comparisons || 0) + 1;
      v.push(viz('array', 'set_pointer', { name: 'left', index: step.left }));
      v.push(viz('array', 'set_pointer', { name: 'right', index: step.right }));
      v.push(viz('array', 'set_pointer', { name: 'mid', index: step.mid }));
      v.push(viz('array', 'highlight', { indices: [step.mid], className: 'comparing' }));
      c.push(ctxUpdate('bounds', {
        entries: [
          { key: 'Target', value: state.target },
          { key: 'Left', value: step.left },
          { key: 'Right', value: step.right },
          { key: 'Mid', value: step.mid, status: 'highlight' },
          { key: 'Value at mid', value: step.value },
        ],
      }));
      break;
    }

    case 'eliminate_left': {
      v.push(viz('array', 'set_pointer', { name: 'left', index: step.mid + 1 }));
      break;
    }

    case 'eliminate_right': {
      v.push(viz('array', 'set_pointer', { name: 'right', index: step.mid - 1 }));
      break;
    }

    case 'found': {
      if (algo === 'two_pointers') {
        v.push(viz('array', 'mark_sorted', { indices: [step.left, step.right] }));
        c.push(ctxUpdate('search_state', {
          entries: [
            { key: 'Found!', value: `[${(step.values || []).join(', ')}]`, status: 'updated' },
            { key: 'Indices', value: `[${step.left}, ${step.right}]`, status: 'highlight' },
          ],
        }));
      } else if (step.k !== undefined) {
        if (step.index !== undefined) v.push(viz('array', 'mark_sorted', { indices: [step.index] }));
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Target k', value: step.k },
            { key: `${step.k}-th element`, value: step.value, status: 'highlight' },
          ],
        }));
      } else {
        v.push(viz('array', 'mark_sorted', { indices: [step.index] }));
        c.push(ctxUpdate('bounds', {
          entries: [
            { key: 'Target', value: step.value },
            { key: 'Found at', value: step.index, status: 'updated' },
          ],
        }));
      }
      break;
    }

    // ── Selection sort ───────────────────────────────────────────────────
    case 'scan_start': {
      v.push(viz('array', 'highlight', { indices: [step.index], className: 'active' }));
      break;
    }

    case 'new_min': {
      v.push(viz('array', 'highlight', { indices: [step.index], className: 'comparing' }));
      break;
    }

    // ── GCD ────────────────────────────────────────────────────────────────
    case 'compute_remainder': {
      if (step.array) {
        v.push(viz('array', 'set_data', { values: step.array }));
        v.push(viz('array', 'highlight', { indices: step.highlight || [0, 1], className: 'comparing' }));
      }
      const cr = step.conceptual_state || {};
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'a', value: cr.a },
          { key: 'b', value: cr.b },
          { key: 'Remainder', value: cr.remainder },
        ],
      }));
      break;
    }

    case 'shift_values': {
      if (step.array) {
        v.push(viz('array', 'set_data', { values: step.array }));
        v.push(viz('array', 'highlight', { indices: step.highlight || [0, 1], className: 'active' }));
      }
      const sv = step.conceptual_state || {};
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'a', value: sv.a },
          { key: 'b', value: sv.b },
        ],
      }));
      break;
    }

    // ── quickselect ──────────────────────────────────────────────────────
    case 'recurse_into': {
      v.push(viz('array', 'highlight', {
        indices: Array.from({ length: step.range[1] - step.range[0] + 1 }, (_, i) => step.range[0] + i),
        className: 'active',
      }));
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Target k', value: step.k },
          { key: 'Pivot at', value: step.pivot_index },
          { key: 'Recurse', value: `${step.side} [${step.range[0]}..${step.range[1]}]`, status: 'highlight' },
        ],
      }));
      break;
    }

    // ── Two Pointers ─────────────────────────────────────────────────────
    case 'check_sum': {
      v.push(viz('array', 'set_pointer', { name: 'left', index: step.left }));
      v.push(viz('array', 'set_pointer', { name: 'right', index: step.right }));
      v.push(viz('array', 'highlight', { indices: [step.left, step.right], className: 'comparing' }));
      c.push(ctxUpdate('search_state', {
        entries: [
          { key: 'Target', value: step.target },
          { key: 'Left idx', value: step.left },
          { key: 'Right idx', value: step.right },
          { key: 'Sum', value: step.sum, status: step.sum === step.target ? 'updated' : 'highlight' },
        ],
      }));
      break;
    }

    case 'move_left': {
      v.push(viz('array', 'set_pointer', { name: 'left', index: step.left }));
      break;
    }

    case 'move_right': {
      v.push(viz('array', 'set_pointer', { name: 'right', index: step.right }));
      break;
    }

    // ── max_subarray (Kadane's) ──────────────────────────────────────────
    case 'visit': {
      if (algo === 'max_subarray') {
        v.push(viz('array', 'highlight', { indices: [step.index], className: 'active' }));
        if (step.max_start !== undefined) {
          v.push(viz('array', 'slide_window', { start: step.max_start, end: step.max_end }));
        }
        c.push(ctxUpdate('kadane_state', {
          entries: [
            { key: 'current_sum', value: step.current_sum, status: 'highlight' },
            { key: 'max_sum', value: step.max_sum, status: step.current_sum === step.max_sum ? 'updated' : 'default' },
            { key: 'Max subarray', value: `[${step.max_start}..${step.max_end}]` },
          ],
        }));
      }
      break;
    }

    // ── rotate_array ─────────────────────────────────────────────────────
    case 'phase': {
      if (step.array) {
        v.push(viz('array', 'set_data', { values: step.array }));
      }
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'k (rotate by)', value: '' },
          { key: 'Phase', value: `${step.phase} of 3 complete`, status: 'updated' },
        ],
      }));
      c.push(ctxUpdate('expression', { expression: step.description || `Phase ${step.phase} complete` }));
      break;
    }

    // ── informational ────────────────────────────────────────────────────
    case 'pass_start':
    case 'early_exit':
    case 'recurse':
      break;

    // ── integer sliding_window ───────────────────────────────────────────
    case 'initial_window': {
      v.push(viz('array', 'slide_window', { start: step.window_start, end: step.window_end }));
      break;
    }

    case 'slide': {
      if (algo === 'sliding_window') {
        v.push(viz('array', 'slide_window', { start: step.window_start, end: step.window_end }));
        if (step.outgoing_index !== undefined) {
          v.push(viz('array', 'highlight', { indices: [step.outgoing_index], className: 'comparing' }));
        }
      }
      break;
    }

    case 'new_max': {
      if (algo === 'sliding_window') {
        v.push(viz('array', 'slide_window', { start: step.window_start, end: step.window_end }));
        v.push(viz('array', 'highlight', {
          indices: Array.from({ length: step.window_end - step.window_start + 1 }, (_, i) => step.window_start + i),
          className: 'sorted',
        }));
      }
      break;
    }

    case 'result':
      if (algo === 'max_subarray' && step.start !== undefined) {
        v.push(viz('array', 'slide_window', { start: step.start, end: step.end }));
        v.push(viz('array', 'mark_sorted', {
          indices: Array.from({ length: step.end - step.start + 1 }, (_, i) => step.start + i),
        }));
        c.push(ctxUpdate('kadane_state', {
          entries: [
            { key: 'Max sum', value: step.max_sum, status: 'updated' },
            { key: 'Subarray', value: `[${(step.subarray || []).join(', ')}]`, status: 'updated' },
            { key: 'Indices', value: `[${step.start}..${step.end}]` },
          ],
        }));
      } else if (step.array) {
        v.push(viz('array', 'set_data', { values: step.array }));
        if (algo === 'sliding_window' && step.max_start !== undefined) {
          v.push(viz('array', 'slide_window', { start: step.max_start, end: step.max_end }));
          v.push(viz('array', 'highlight', {
            indices: Array.from({ length: step.max_end - step.max_start + 1 }, (_, i) => step.max_start + i),
            className: 'sorted',
          }));
        } else {
          v.push(viz('array', 'mark_sorted', {
            indices: step.array.map((_, i) => i),
          }));
        }
      } else {
        // Generic fallback: surface description on algorithm_state
        c.push(ctxUpdate('algorithm_state', {
          entries: [{ key: 'Result', value: step.description || step.output || '?', status: 'updated' }],
        }));
      }
      break;

    // Generic step types used by various array-renderer algos. Each surfaces a
    // minimal panel update; specialized rendering is added per-algo as needed.
    case 'fill':
    case 'compute':
    case 'update':
    case 'build':
    case 'mark':
    case 'reverse':
    case 'traverse':
    case 'record':
    case 'choose':
    case 'backtrack':
    case 'push':
    case 'pop':
    case 'dequeue':
    case 'window_max': {
      if (step.array) {
        v.push(viz('array', 'set_data', { values: step.array }));
      }
      if (Array.isArray(step.indices) && step.indices.length > 0) {
        v.push(viz('array', 'highlight', { indices: step.indices, className: 'current' }));
      }
      c.push(ctxUpdate('algorithm_state', {
        entries: [{ key: step.type, value: step.description || '', status: 'highlight' }],
      }));
      break;
    }
  }

  return { viz: v, ctx: c };
}

// ─── TABLE mapper ─────────────────────────────────────────────────────────────

// Cache knapsack items across table steps (set on init_table, used on consider_item)
let cachedKnapsackItems = null;

function mapTableStep(algo, step, state) {
  const v = [];
  const c = [];

  switch (step.type) {
    case 'init_table': {
      if (step.rows !== undefined && step.cols !== undefined) {
        // 2D table (knapsack, lcs, edit_distance)
        v.push(viz('table', 'init_grid', {
          rows: step.rows,
          cols: step.cols,
          row_headers: step.rowLabels,
          col_headers: step.colLabels,
        }));
        // Fill initial values if table provided
        if (step.table) {
          for (let r = 0; r < step.table.length; r++) {
            for (let cl = 0; cl < step.table[r].length; cl++) {
              if (step.table[r][cl] !== 0 && step.table[r][cl] !== undefined) {
                v.push(viz('table', 'fill_cell', { row: r, col: cl, value: step.table[r][cl] }));
              }
            }
          }
        }
      } else if (step.size !== undefined) {
        // 1D table (coin_change) — display as a single row
        v.push(viz('table', 'init_grid', {
          rows: 1,
          cols: step.size,
          col_headers: Array.from({ length: step.size }, (_, i) => String(i)),
        }));
        if (step.table) {
          for (let i = 0; i < step.table.length; i++) {
            if (step.table[i] !== undefined) {
              v.push(viz('table', 'fill_cell', {
                row: 0,
                col: i,
                value: step.table[i] === Infinity ? '∞' : step.table[i],
              }));
            }
          }
        }
      }

      // Set initial recurrence expression
      if (algo === 'knapsack') {
        c.push(ctxUpdate('expression', {
          expression: 'dp[i][w] = max(dp[i-1][w], dp[i-1][w-wᵢ] + vᵢ)',
        }));
        // Populate items panel and cache items for later steps
        if (step.items) {
          cachedKnapsackItems = step.items;
          c.push(ctxUpdate('items', {
            entries: step.items.map(item => ({
              key: item.name,
              value: `w=${item.weight}, v=${item.value}`,
              status: 'default',
            })),
          }));
        }
      } else if (algo === 'lcs') {
        c.push(ctxUpdate('expression', {
          expression: 'dp[i][j] = dp[i-1][j-1]+1 if match, else max(dp[i-1][j], dp[i][j-1])',
        }));
      } else if (algo === 'edit_distance') {
        c.push(ctxUpdate('expression', {
          expression: 'dp[i][j] = min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost)',
        }));
      } else if (algo === 'coin_change') {
        c.push(ctxUpdate('expression', {
          expression: 'dp[a] = min(dp[a], dp[a-coin] + 1)',
        }));
      } else if (algo === 'word_break') {
        c.push(ctxUpdate('expression', {
          expression: 'dp[i] = true if s[0..i-1] can be segmented using wordDict',
        }));
        if (step.wordDict) {
          c.push(ctxUpdate('stats', {
            entries: step.wordDict.map(w => ({ key: w, value: '✓ in dict', status: 'default' })),
          }));
        }
      } else if (algo === 'climbing_stairs') {
        c.push(ctxUpdate('expression', {
          expression: 'dp[i] = dp[i-1] + dp[i-2]  (ways to climb i stairs)',
        }));
      } else if (algo === 'min_path_sum') {
        c.push(ctxUpdate('expression', {
          expression: 'dp[i][j] = min(dp[i-1][j], dp[i][j-1]) + grid[i][j]',
        }));
      } else if (algo === 'interval_dp' || algo === 'palindrome_dp' || algo === 'bitmask_dp') {
        c.push(ctxUpdate('expression', {
          expression: step.description || `${algo} initialized`,
        }));
      }
      break;
    }

    case 'consider_item': {
      v.push(viz('table', 'highlight_row', { row: step.row }));
      if (step.item) {
        c.push(ctxUpdate('expression', {
          expression: `Considering item "${step.item.name}" (w=${step.item.weight}, v=${step.item.value})`,
        }));
      }
      // Highlight current item in items panel
      if (step.item && algo === 'knapsack' && cachedKnapsackItems) {
        c.push(ctxUpdate('items', {
          entries: cachedKnapsackItems.map((item, idx) => ({
            key: item.name,
            value: `w=${item.weight}, v=${item.value}`,
            status: idx === step.row - 1 ? 'highlight' : 'default',
          })),
        }));
      }
      break;
    }

    case 'compare_chars': {
      v.push(viz('table', 'highlight_cell', { row: step.row, col: step.col, className: 'current' }));
      const matchStr = step.match ? 'Match!' : 'No match';
      c.push(ctxUpdate('expression', {
        expression: `Compare '${step.char1}' vs '${step.char2}': ${matchStr}`,
      }));
      break;
    }

    case 'fill_cell':
    case 'skip_cell': {
      const isCoinChange = algo === 'coin_change';
      const row = isCoinChange ? 0 : step.row;
      const col = isCoinChange ? step.index : step.col;
      const value = step.value === Infinity ? '∞' : step.value;

      v.push(viz('table', 'fill_cell', { row, col, value }));
      v.push(viz('table', 'highlight_cell', { row, col, className: 'current' }));

      // Clear previous dependency arrows, then show new ones with roles
      v.push(viz('table', 'clear_dependency_arrows', {}));
      if (step.from && Array.isArray(step.from)) {
        for (const src of step.from) {
          v.push(viz('table', 'show_dependency_arrow', {
            from: { row: isCoinChange ? 0 : src.row, col: isCoinChange ? src.index : src.col },
            to: { row, col },
            role: src.role || 'skip',
          }));
        }
      }

      // Update expression context
      if (algo === 'knapsack') {
        if (step.choice === 'take') {
          c.push(ctxUpdate('expression', {
            expression: `dp[${step.row}][${step.col}] = max(${step.withoutItem}, ${step.withItem}) = ${step.value}`,
            highlight_terms: [String(step.value)],
            result: step.value,
          }));
          c.push(ctxLog('decisions', `Take item: dp[${step.row}][${step.col}] = ${step.value}`, 'decision'));
        } else {
          c.push(ctxUpdate('expression', {
            expression: `dp[${step.row}][${step.col}] = dp[${step.row - 1}][${step.col}] = ${step.value}`,
            result: step.value,
          }));
          c.push(ctxLog('decisions', `Skip: dp[${step.row}][${step.col}] = ${step.value}`, 'info'));
        }
      } else if (algo === 'lcs') {
        if (step.action === 'match') {
          c.push(ctxUpdate('expression', {
            expression: `dp[${step.row}][${step.col}] = dp[${step.row - 1}][${step.col - 1}] + 1 = ${step.value}`,
            result: step.value,
          }));
          c.push(ctxLog('decisions', `Match → dp[${step.row}][${step.col}] = ${step.value}`, 'decision'));
        } else {
          c.push(ctxUpdate('expression', {
            expression: `dp[${step.row}][${step.col}] = max(${step.fromTop ?? '?'}, ${step.fromLeft ?? '?'}) = ${step.value}`,
            result: step.value,
          }));
          c.push(ctxLog('decisions', `No match → dp[${step.row}][${step.col}] = ${step.value}`, 'info'));
        }
      } else if (algo === 'edit_distance') {
        const op = step.operation || 'match';
        c.push(ctxUpdate('expression', {
          expression: `dp[${step.row}][${step.col}] = ${step.value} (${op})`,
          result: step.value,
        }));
        c.push(ctxLog('decisions', `${op}: dp[${step.row}][${step.col}] = ${step.value}`, op === 'match' ? 'info' : 'decision'));
      } else if (algo === 'coin_change') {
        if (step.kept) {
          c.push(ctxLog('decisions', `dp[${step.index}] stays ${value}`, 'info'));
        } else {
          c.push(ctxUpdate('expression', {
            expression: `dp[${step.index}] = dp[${step.fromIndex}] + 1 = ${value}`,
            result: value,
          }));
          c.push(ctxLog('decisions', `Use coin ${step.coin}: dp[${step.index}] = ${value}`, 'decision'));
        }
      } else if (algo === 'word_break') {
        if (step.type === 'fill_cell') {
          c.push(ctxUpdate('expression', {
            expression: `dp[${step.col}] = true  (s[${step.from_j}..${step.col}] = "${step.word}")`,
            result: 1,
          }));
          c.push(ctxLog('decisions', `dp[${step.col}] = T via "${step.word}"`, 'decision'));
        } else {
          c.push(ctxLog('decisions', `dp[${step.col}] = F (no valid split ends here)`, 'info'));
        }
      } else if (algo === 'climbing_stairs') {
        if (step.is_base) {
          c.push(ctxUpdate('expression', {
            expression: `dp[${step.col}] = ${step.value}  (base case)`,
            result: step.value,
          }));
        } else {
          c.push(ctxUpdate('expression', {
            expression: `dp[${step.col}] = dp[${step.col - 1}] + dp[${step.col - 2}] = ${step.prev1} + ${step.prev2} = ${step.value}`,
            result: step.value,
          }));
          c.push(ctxLog('decisions', `dp[${step.col}] = ${step.value}`, 'info'));
        }
      } else if (algo === 'min_path_sum') {
        if (step.is_base) {
          c.push(ctxUpdate('expression', {
            expression: `dp[0][0] = grid[0][0] = ${step.value}`,
            result: step.value,
          }));
        } else if (step.from_above !== undefined && step.from_left !== undefined) {
          c.push(ctxUpdate('expression', {
            expression: `dp[${step.row}][${step.col}] = min(${step.from_above}, ${step.from_left}) + ${step.grid_val} = ${step.value}`,
            result: step.value,
          }));
        } else if (step.from_left !== undefined) {
          c.push(ctxUpdate('expression', {
            expression: `dp[0][${step.col}] = dp[0][${step.col - 1}] + ${step.grid_val} = ${step.value}`,
            result: step.value,
          }));
        } else if (step.from_above !== undefined) {
          c.push(ctxUpdate('expression', {
            expression: `dp[${step.row}][0] = dp[${step.row - 1}][0] + ${step.grid_val} = ${step.value}`,
            result: step.value,
          }));
        }
        c.push(ctxLog('decisions', `dp[${step.row}][${step.col}] = ${step.value}`, 'info'));
      }
      break;
    }

    case 'consider_coin': {
      if (step.coin !== undefined) {
        c.push(ctxUpdate('expression', {
          expression: `Considering coin = ${step.coin}`,
        }));
      }
      break;
    }

    case 'traceback': {
      const isCoinChange = algo === 'coin_change';
      const row = isCoinChange ? 0 : step.row;
      const col = isCoinChange ? step.amount : step.col;

      v.push(viz('table', 'highlight_cell', { row, col, className: 'optimal' }));

      if (algo === 'knapsack') {
        const action = step.included ? `Include "${step.item?.name}"` : 'Skip';
        c.push(ctxLog('decisions', `Traceback [${step.row}][${step.col}]: ${action}`, 'result'));
      } else if (algo === 'lcs') {
        const action = step.action === 'match_diagonal'
          ? `Match '${step.char}' ↖`
          : step.action === 'move_up' ? '↑' : '←';
        c.push(ctxLog('decisions', `Traceback [${step.row}][${step.col}]: ${action}`, 'result'));
      } else if (algo === 'edit_distance') {
        c.push(ctxLog('decisions', `Traceback [${step.row}][${step.col}]: ${step.operation}`, 'result'));
      } else if (algo === 'coin_change') {
        c.push(ctxLog('decisions', `Traceback: use coin ${step.coin}`, 'result'));
      }
      break;
    }

    case 'result': {
      if (algo === 'word_break') {
        c.push(ctxUpdate('expression', {
          expression: step.found
            ? `dp[${step.dp?.length ? step.dp.length - 1 : '?'}] = T — "${step.s}" can be segmented`
            : `dp[end] = F — "${step.s}" cannot be segmented`,
          result: step.found ? 1 : 0,
        }));
        c.push(ctxLog('decisions', step.found ? 'Word Break: TRUE' : 'Word Break: FALSE',
          step.found ? 'result' : 'info'));
      } else if (algo === 'climbing_stairs') {
        c.push(ctxUpdate('expression', {
          expression: `dp[${step.n}] = ${step.ways} distinct ways to climb ${step.n} stairs`,
          result: step.ways,
        }));
      } else if (algo === 'min_path_sum') {
        if (step.path) {
          for (const [r, c2] of step.path) {
            v.push(viz('table', 'highlight_cell', { row: r, col: c2, className: 'optimal' }));
          }
        }
        c.push(ctxUpdate('expression', {
          expression: `Min cost path = ${step.min_cost}`,
          result: step.min_cost,
        }));
        c.push(ctxLog('decisions', `Minimum path cost: ${step.min_cost}`, 'result'));
      } else {
        // Generic fallback for any table-renderer algo: surface description + output
        c.push(ctxUpdate('expression', {
          expression: step.description || `Result: ${step.output ?? '?'}`,
          result: step.output,
        }));
        c.push(ctxLog('decisions', step.description || `Result: ${step.output ?? '?'}`, 'result'));
      }
      break;
    }

    case 'init': {
      // Some table algos (stock_dp) use 'init' instead of 'init_table'.
      // Generic fallback: surface description on the expression panel.
      c.push(ctxUpdate('expression', {
        expression: step.description || 'Initialized',
      }));
      break;
    }
  }

  return { viz: v, ctx: c };
}

// ─── TREE mapper ──────────────────────────────────────────────────────────────

function mapTreeStep(algo, step, state) {
  const v = [];
  const c = [];

  switch (step.type) {
    case 'init': {
      if (algo === 'huffman' && step.frequencies) {
        c.push(ctxUpdate('freq_table', {
          entries: Object.entries(step.frequencies).map(([k, val]) => ({ key: k, value: val })),
        }));
        if (step.heap) {
          c.push(ctxUpdate('pq', { items: step.heap.map(n => ({ value: `${n.id}:${n.freq}` })), style: 'queue' }));
        }
      } else if (algo === 'bst_insert') {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Values to insert', value: step.values?.join(', ') || '' },
            { key: 'Inserted', value: 0 },
          ],
        }));
      } else if (algo === 'tree_depth_dfs' && step.tree) {
        v.push(viz('tree', 'set_tree', step.tree));
        c.push(ctxUpdate('stats', {
          entries: [{ key: 'Max Depth', value: '?', status: 'default' }],
        }));
      } else if (algo === 'tree_level_order' && step.tree) {
        v.push(viz('tree', 'set_tree', step.tree));
        c.push(ctxUpdate('traversal_order', { items: [], style: 'queue' }));
        if (step.queue) {
          c.push(ctxUpdate('queue', {
            items: step.queue.map(id => ({ value: id })),
            style: 'queue',
          }));
        }
      } else if (algo === 'tree_path' && step.tree) {
        v.push(viz('tree', 'set_tree', step.tree));
        c.push(ctxUpdate('path_state', {
          entries: [
            { key: 'Target', value: step.target },
            { key: 'Remaining', value: step.target, status: 'default' },
            { key: 'Path', value: '—' },
          ],
        }));
      } else if (algo === 'heap_ops' || algo === 'top_k_heap' || algo === 'k_closest_points' || algo === 'median_finder') {
        if (step.tree) v.push(viz('tree', 'set_tree', step.tree));
        c.push(ctxUpdate('heap_state', {
          entries: [{ key: 'Status', value: step.description || 'Initialized', status: 'default' }],
        }));
      } else if (algo === 'tree_dp' || algo === 'lca_tree' || algo === 'validate_bst') {
        if (step.tree) v.push(viz('tree', 'set_tree', step.tree));
        c.push(ctxUpdate('tree_state', {
          entries: [{ key: 'Status', value: step.description || 'Initialized', status: 'default' }],
        }));
      } else if (algo === 'linked_list_cycle' || algo === 'merge_k_sorted') {
        if (step.tree) v.push(viz('tree', 'set_tree', step.tree));
        c.push(ctxUpdate('pointer_state', {
          entries: [{ key: 'Status', value: step.description || 'Initialized', status: 'default' }],
        }));
      } else {
        // Generic fallback: surface description so the panel isn't blank
        c.push(ctxUpdate('algorithm_state', {
          entries: [{ key: 'Status', value: step.description || step.type, status: 'default' }],
        }));
      }
      break;
    }

    case 'insert_start': {
      if (algo === 'bst_insert') {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Inserting', value: step.value, status: 'highlight' },
          ],
        }));
      } else if (algo === 'heap_ops' || algo === 'top_k_heap' || algo === 'k_closest_points' || algo === 'median_finder') {
        c.push(ctxUpdate('heap_state', {
          entries: [{ key: 'Inserting', value: step.value ?? step.description ?? '?', status: 'highlight' }],
        }));
      }
      break;
    }

    case 'traverse': {
      if (step.node_id || step.node) {
        v.push(viz('tree', 'highlight_node', { id: step.node_id || step.node, className: 'visited' }));
      }
      c.push(ctxUpdate('tree_state', {
        entries: [{ key: 'Visiting', value: step.description || step.node_id || step.node || '?', status: 'highlight' }],
      }));
      break;
    }

    case 'extract_min': {
      c.push(ctxUpdate('heap_state', {
        entries: [{ key: 'Extracted', value: step.value ?? step.description ?? '?', status: 'updated' }],
      }));
      break;
    }

    case 'found': {
      if (algo === 'linked_list_cycle') {
        c.push(ctxUpdate('pointer_state', {
          entries: [{ key: 'Cycle', value: step.description || 'detected', status: 'updated' }],
        }));
      }
      break;
    }

    case 'pop':
    case 'push': {
      if (algo === 'merge_k_sorted') {
        c.push(ctxUpdate('pointer_state', {
          entries: [{ key: step.type, value: step.description || step.value || '', status: 'highlight' }],
        }));
      }
      break;
    }

    case 'compare': {
      // BST traversal comparison
      v.push(viz('tree', 'highlight_node', { id: step.node_id, className: 'comparing' }));
      if (algo === 'bst_insert') {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Inserting', value: step.insert_value },
            { key: 'Compare with', value: `${step.node_value} → go ${step.direction}`, status: 'highlight' },
          ],
        }));
      }
      break;
    }

    case 'insert': {
      // BST node inserted
      if (step.tree) {
        v.push(viz('tree', 'set_tree', step.tree));
      }
      v.push(viz('tree', 'highlight_node', { id: step.node_id, className: 'inserted' }));
      if (!state.insertCount) state.insertCount = 0;
      state.insertCount++;
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Inserted', value: `${step.value} (total: ${state.insertCount})`, status: 'updated' },
        ],
      }));
      break;
    }

    // ── Heap operations ──────────────────────────────────────────────────
    case 'place': {
      if (step.heap) {
        v.push(viz('tree', 'set_tree', heapToTree(step.heap)));
        v.push(viz('tree', 'highlight_node', { id: `n${step.index}`, className: 'inserted' }));
        c.push(ctxUpdate('heap_array', {
          items: step.heap.map((val, i) => ({
            value: val,
            status: i === step.index ? 'added' : 'default',
          })),
        }));
      }
      break;
    }

    case 'sift_compare': {
      v.push(viz('tree', 'highlight_node', { id: `n${step.child_index}`, className: 'comparing' }));
      v.push(viz('tree', 'highlight_node', { id: `n${step.parent_index}`, className: 'comparing' }));
      v.push(viz('tree', 'highlight_edge', {
        from: `n${step.parent_index}`,
        to: `n${step.child_index}`,
        className: 'highlighted',
      }));
      break;
    }

    case 'sift_swap': {
      if (step.heap) {
        v.push(viz('tree', 'set_tree', heapToTree(step.heap)));
        v.push(viz('tree', 'highlight_node', { id: `n${step.j}`, className: 'sifting' }));
        c.push(ctxUpdate('heap_array', {
          items: step.heap.map((val, i) => ({
            value: val,
            status: (i === step.i || i === step.j) ? 'active' : 'default',
          })),
        }));
      }
      break;
    }

    case 'sift_done': {
      if (step.heap) {
        v.push(viz('tree', 'set_tree', heapToTree(step.heap)));
        v.push(viz('tree', 'highlight_node', { id: `n${step.index}`, className: 'inserted' }));
        c.push(ctxUpdate('heap_array', {
          items: step.heap.map((val) => ({ value: val })),
        }));
      }
      break;
    }

    case 'extract_start': {
      v.push(viz('tree', 'highlight_node', { id: 'n0', className: 'current' }));
      break;
    }

    case 'extract_swap': {
      if (step.heap) {
        v.push(viz('tree', 'set_tree', heapToTree(step.heap)));
        v.push(viz('tree', 'highlight_node', { id: 'n0', className: 'sifting' }));
        c.push(ctxUpdate('heap_array', {
          items: step.heap.map((val, i) => ({
            value: val,
            status: i === 0 ? 'active' : 'default',
          })),
        }));
      }
      break;
    }

    case 'extract_remove': {
      if (step.heap) {
        v.push(viz('tree', 'set_tree', heapToTree(step.heap)));
        c.push(ctxUpdate('heap_array', {
          items: step.heap.map((val) => ({ value: val })),
        }));
      }
      break;
    }

    case 'result': {
      if (algo === 'huffman') {
        if (step.codes) {
          c.push(ctxUpdate('codes', {
            entries: Object.entries(step.codes).map(([char, code]) => ({ key: char, value: code, status: 'default' })),
          }));
        }
      } else if (algo === 'tree_depth_dfs') {
        c.push(ctxUpdate('stats', {
          entries: [{ key: 'Max Depth', value: step.max_depth, status: 'updated' }],
        }));
      } else if (algo === 'tree_level_order') {
        if (step.order) {
          c.push(ctxUpdate('traversal_order', {
            items: step.order.map(val => ({ value: val, status: 'updated' })),
            style: 'queue',
          }));
        }
      } else if (algo === 'tree_path') {
        c.push(ctxLog('traversal_log',
          step.found ? `Path found: ${step.path.join(' → ')}` : `No path sums to ${step.target}`,
          step.found ? 'result' : 'info',
        ));
      } else {
        v.push(viz('tree', 'reset', {}));
        if (step.tree) {
          v.push(viz('tree', 'set_tree', step.tree));
        } else if (step.heap) {
          v.push(viz('tree', 'set_tree', heapToTree(step.heap)));
        }
      }
      break;
    }

    // ── Huffman ──────────────────────────────────────────────────────────────
    case 'extract_mins': {
      v.push(viz('tree', 'highlight_node', { id: step.left_id,  className: 'comparing' }));
      v.push(viz('tree', 'highlight_node', { id: step.right_id, className: 'comparing' }));
      if (step.heap) {
        c.push(ctxUpdate('pq', { items: step.heap.map(n => ({ value: `${n.id}:${n.freq}` })), style: 'queue' }));
      }
      break;
    }

    case 'create_parent': {
      // no-op for viz — tree is updated at add_edges once edges are established
      break;
    }

    case 'add_edges': {
      if (step.tree) {
        v.push(viz('tree', 'set_tree', step.tree));
        v.push(viz('tree', 'highlight_node', { id: step.parent_id, className: 'inserted' }));
      }
      break;
    }

    case 'update_heap': {
      if (step.heap) {
        c.push(ctxUpdate('pq', { items: step.heap.map(n => ({ value: `${n.id}:${n.freq}` })), style: 'queue' }));
      }
      break;
    }

    case 'assign_codes': {
      if (step.codes) {
        c.push(ctxUpdate('codes', {
          entries: Object.entries(step.codes).map(([char, code]) => ({ key: char, value: code, status: 'default' })),
        }));
      }
      break;
    }

    // ── Tree Traversal (tree_depth_dfs / tree_level_order / tree_path) ──────
    case 'visit_node': {
      if (step.node_id) {
        v.push(viz('tree', 'highlight_node', { id: step.node_id, className: 'current' }));
      }
      if (step.remaining !== undefined) {
        c.push(ctxUpdate('path_state', {
          entries: [
            { key: 'Target', value: step.remaining + (step.value ?? 0) + (step.path?.length > 1 ? '' : '') },
            { key: 'Path so far', value: (step.path || []).join(' → '), status: 'highlight' },
            { key: 'Remaining', value: step.remaining, status: step.remaining === 0 ? 'highlight' : 'default' },
          ],
        }));
      } else if (!state.traversalOrder) {
        state.traversalOrder = [];
      }
      if (step.value !== undefined && step.remaining === undefined) {
        state.traversalOrder = state.traversalOrder || [];
        state.traversalOrder.push(step.value);
        c.push(ctxUpdate('traversal_order', {
          items: state.traversalOrder.map(val => ({ value: val })),
          style: 'queue',
        }));
      }
      break;
    }

    case 'backtrack': {
      if (step.node_id) {
        v.push(viz('tree', 'highlight_node', { id: step.node_id, className: 'visited' }));
      }
      if (step.height !== undefined) {
        c.push(ctxUpdate('expression', {
          expression: `h(${step.value}) = max(${step.left_height}, ${step.right_height}) + 1 = ${step.height}`,
        }));
        c.push(ctxUpdate('stats', {
          entries: [{ key: 'Max Depth', value: step.height, status: 'default' }],
        }));
      }
      break;
    }

    case 'found_path': {
      if (step.node_id) {
        v.push(viz('tree', 'highlight_node', { id: step.node_id, className: 'visited' }));
      }
      if (step.path) {
        c.push(ctxLog('traversal_log', `Found: ${step.path.join(' → ')}`, 'result'));
      }
      break;
    }

    case 'level_complete': {
      if (step.values) {
        c.push(ctxLog('traversal_log', `Level ${step.level}: [${step.values.join(', ')}]`, 'info'));
      }
      if (step.level_nodes) {
        for (const nodeId of step.level_nodes) {
          v.push(viz('tree', 'highlight_node', { id: nodeId, className: 'visited' }));
        }
      }
      if (step.queue_after !== undefined) {
        c.push(ctxUpdate('queue', {
          items: step.queue_after.map(id => ({ value: id })),
          style: 'queue',
        }));
      }
      break;
    }
  }

  return { viz: v, ctx: c };
}

// ─── LINKED mapper ────────────────────────────────────────────────────────────

function mapLinkedStep(algo, step, state) {
  const v = [];
  const c = [];

  switch (step.type) {
    case 'init': {
      const mode = (algo === 'stack_operations' || algo === 'monotonic_stack') ? 'stack'
        : algo === 'queue_operations' ? 'queue'
        : 'list';
      const values = step.list || step.stack || step.queue || [];
      v.push(viz('linked', 'set_list', { values, mode }));

      if (algo === 'linked_list_reversal') {
        c.push(ctxUpdate('pointers', {
          entries: [
            { key: 'prev', value: 'null' },
            { key: 'current', value: values[0] ?? 'null' },
            { key: 'next', value: values[1] ?? 'null' },
          ],
        }));
      } else if (algo === 'stack_operations') {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Size', value: values.length },
            { key: 'Top', value: values[0] ?? 'empty' },
          ],
        }));
      } else if (algo === 'queue_operations') {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Size', value: values.length },
            { key: 'Front', value: values[0] ?? 'empty' },
            { key: 'Rear', value: values[values.length - 1] ?? 'empty' },
          ],
        }));
      } else if (algo === 'monotonic_stack') {
        c.push(ctxUpdate('answers', {
          entries: (step.array || []).map((val, i) => ({ key: `arr[${i}]=${val}`, value: '?', status: 'default' })),
        }));
      }
      break;
    }

    case 'set_pointers': {
      if (step.prev !== undefined) v.push(viz('linked', 'set_pointer', { name: 'prev', index: step.prev }));
      if (step.current !== undefined) v.push(viz('linked', 'set_pointer', { name: 'current', index: step.current }));
      if (step.next !== undefined) v.push(viz('linked', 'set_pointer', { name: 'next', index: step.next }));
      c.push(ctxUpdate('pointers', {
        entries: [
          { key: 'prev', value: step.prev ?? 'null' },
          { key: 'current', value: step.current ?? 'null' },
          { key: 'next', value: step.next ?? 'null' },
        ],
      }));
      break;
    }

    case 'step': {
      v.push(viz('linked', 'highlight_node', { index: step.current, className: 'current' }));
      v.push(viz('linked', 'set_pointer', { name: 'prev', index: step.prev }));
      v.push(viz('linked', 'set_pointer', { name: 'current', index: step.current }));
      v.push(viz('linked', 'set_pointer', { name: 'next', index: step.next }));
      c.push(ctxUpdate('pointers', {
        entries: [
          { key: 'prev', value: step.prev ?? 'null', status: 'highlight' },
          { key: 'current', value: step.current ?? 'null', status: 'highlight' },
          { key: 'next', value: step.next ?? 'null', status: 'highlight' },
        ],
      }));
      break;
    }

    case 'reverse_pointer': {
      v.push(viz('linked', 'reverse_pointer', { from: step.from, to: step.to }));
      v.push(viz('linked', 'highlight_node', { index: step.from, className: 'reversed' }));
      break;
    }

    case 'advance': {
      if (step.partial_result) {
        v.push(viz('linked', 'reverse_segment', { start: 0, end: step.partial_result.length - 1 }));
      }
      v.push(viz('linked', 'set_pointer', { name: 'current', index: step.new_current }));
      break;
    }

    case 'push': {
      v.push(viz('linked', 'push', { value: step.value }));
      v.push(viz('linked', 'highlight_node', { index: 0, className: 'inserted' }));
      if (algo === 'monotonic_stack') {
        c.push(ctxUpdate('answers', {
          entries: [
            { key: 'Stack', value: `[${(step.stack || []).join(', ')}]`, status: 'highlight' },
          ],
        }));
      } else {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Size', value: step.stack?.length ?? '?' },
            { key: 'Top', value: step.value, status: 'updated' },
            { key: 'Operation', value: `push(${step.value})`, status: 'highlight' },
          ],
        }));
      }
      break;
    }

    case 'pop': {
      v.push(viz('linked', 'highlight_node', { index: 0, className: 'deleted' }));
      v.push(viz('linked', 'pop', {}));
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Size', value: step.stack?.length ?? '?' },
          { key: 'Popped', value: step.value, status: 'updated' },
          { key: 'Top', value: step.stack?.[0] ?? 'empty' },
        ],
      }));
      break;
    }

    case 'pop_empty': {
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Size', value: 0 },
          { key: 'Operation', value: 'pop() — empty!', status: 'highlight' },
        ],
      }));
      break;
    }

    case 'enqueue': {
      v.push(viz('linked', 'enqueue', { value: step.value }));
      const q = step.queue || [];
      v.push(viz('linked', 'highlight_node', { index: q.length - 1, className: 'inserted' }));
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Size', value: q.length },
          { key: 'Front', value: q[0] ?? 'empty' },
          { key: 'Rear', value: step.value, status: 'updated' },
        ],
      }));
      break;
    }

    case 'dequeue': {
      v.push(viz('linked', 'highlight_node', { index: 0, className: 'deleted' }));
      v.push(viz('linked', 'dequeue', {}));
      const q = step.queue || [];
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Size', value: q.length },
          { key: 'Dequeued', value: step.value, status: 'updated' },
          { key: 'Front', value: q[0] ?? 'empty' },
        ],
      }));
      break;
    }

    case 'dequeue_empty': {
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Size', value: 0 },
          { key: 'Operation', value: 'dequeue() — empty!', status: 'highlight' },
        ],
      }));
      break;
    }

    case 'peek': {
      if (step.value !== null && step.value !== undefined) {
        v.push(viz('linked', 'highlight_node', { index: 0, className: 'highlighted' }));
      }
      break;
    }

    // ── Monotonic Stack ──────────────────────────────────────────────────
    case 'pop_smaller': {
      v.push(viz('linked', 'highlight_node', { index: 0, className: 'deleted' }));
      v.push(viz('linked', 'pop', {}));
      c.push(ctxUpdate('answers', {
        entries: [
          { key: `arr[${step.index}]=${step.value}`, value: `NGE = ${step.nge}`, status: 'updated' },
          { key: 'Stack', value: `[${(step.stack || []).join(', ')}]` },
        ],
      }));
      break;
    }

    case 'record_answer': {
      c.push(ctxUpdate('answers', {
        entries: (step.answers || []).map((nge, i) => ({
          key: `arr[${i}]`, value: nge === -1 ? '?' : nge,
          status: i === step.index ? 'updated' : 'default',
        })),
      }));
      break;
    }

    case 'result': {
      if (algo === 'monotonic_stack') {
        c.push(ctxUpdate('answers', {
          entries: (step.answers || []).map((nge, i) => ({
            key: `arr[${i}]`, value: nge === -1 ? 'none' : nge, status: 'default',
          })),
        }));
        break;
      }
      v.push(viz('linked', 'reset', {}));
      const values = step.list || step.stack || step.queue || [];
      if (values.length > 0) {
        const mode = algo === 'stack_operations' ? 'stack'
          : algo === 'queue_operations' ? 'queue'
          : 'list';
        v.push(viz('linked', 'set_list', { values, mode }));
      }
      break;
    }
  }

  return { viz: v, ctx: c };
}

// ─── INTERVAL mapper ──────────────────────────────────────────────────────────

function mapIntervalStep(algo, step, state) {
  const v = [];
  const c = [];

  switch (step.type) {
    case 'init': {
      if (step.intervals) {
        state.jobMap = {};
        for (const iv of step.intervals) state.jobMap[iv.id] = iv;
        v.push(viz('interval', 'set_jobs', { jobs: step.intervals }));
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Intervals', value: step.intervals.length },
            { key: 'Phase', value: 'Initialized' },
          ],
        }));
      }
      break;
    }

    case 'init_machines': {
      if (step.jobs) {
        state.jobMap = {};
        for (const j of step.jobs) state.jobMap[j.id] = j;
        v.push(viz('interval', 'set_jobs', { jobs: step.jobs }));
      }
      if (step.machine_count) {
        v.push(viz('interval', 'set_machines', { count: step.machine_count }));
      }
      state.acceptedCount = 0;
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Jobs', value: step.jobs?.length ?? '–' },
          { key: 'Machines', value: step.machine_count ?? 1 },
          { key: 'Accepted', value: 0 },
        ],
      }));
      break;
    }

    case 'sort': {
      v.push(viz('interval', 'mark_sorted', { job_ids: step.job_ids || [] }));
      const criterion = algo === 'interval_scheduling' ? 'by finish time' : 'by start time';
      c.push(ctxUpdate('stats', {
        entries: [{ key: 'Sorted', value: criterion, status: 'highlight' }],
      }));
      break;
    }

    case 'consider_interval': {
      v.push(viz('interval', 'highlight_job', { job_id: step.job_id, className: 'current' }));
      const job = state.jobMap?.[step.job_id];
      if (job) {
        v.push(viz('interval', 'sweep_line', { time: job.start }));
      }
      break;
    }

    case 'overlap_check': {
      v.push(viz('interval', 'highlight_overlap', { job1: step.job1, job2: step.job2 }));
      break;
    }

    case 'extend_current': {
      v.push(viz('interval', 'clear_overlaps', {}));
      v.push(viz('interval', 'highlight_job', { job_id: step.job_id, className: 'selected' }));
      c.push(ctxUpdate('stats', {
        entries: [{ key: 'Extended end', value: step.new_end, status: 'highlight' }],
      }));
      break;
    }

    case 'no_overlap': {
      v.push(viz('interval', 'clear_overlaps', {}));
      v.push(viz('interval', 'mark_selected', { job_ids: [step.job_id] }));
      break;
    }

    case 'assign_job': {
      v.push(viz('interval', 'assign_machine', { job_id: step.job_id, machine: step.machine }));
      if (!state.acceptedCount) state.acceptedCount = 0;
      state.acceptedCount++;
      c.push(ctxUpdate('stats', {
        entries: [{ key: 'Accepted', value: state.acceptedCount, status: 'updated' }],
      }));
      break;
    }

    case 'reject_overlap': {
      v.push(viz('interval', 'mark_rejected', { job_ids: [step.job_id] }));
      break;
    }

    case 'result': {
      v.push(viz('interval', 'clear_sweep_line', {}));
      v.push(viz('interval', 'clear_overlaps', {}));
      if (algo === 'interval_merge' && step.job_ids) {
        v.push(viz('interval', 'mark_selected', { job_ids: step.job_ids }));
        c.push(ctxUpdate('stats', {
          entries: [{ key: 'Merged intervals', value: step.job_ids.length, status: 'updated' }],
        }));
      } else if (algo === 'interval_scheduling') {
        c.push(ctxUpdate('stats', {
          entries: [{ key: 'Accepted', value: step.count, status: 'updated' }],
        }));
      }
      break;
    }
  }

  return { viz: v, ctx: c };
}

// ─── STRING mapper ────────────────────────────────────────────────────────────

function mapStringStep(algo, step, state) {
  const v = [];
  const c = [];

  function s(action, params = {}) { v.push(viz('string', action, params)); }
  function freqEntries(obj) {
    return Object.entries(obj || {}).map(([key, value]) => ({ key, value }));
  }

  switch (step.type) {
    case 'init': {
      if (algo === 'kmp_search') {
        s('set_string', { s: step.text });
        s('set_pattern', { p: step.pattern });
      } else if (algo === 'find_anagrams') {
        s('set_string', { s: step.s });
        s('set_window', { start: 0, end: (step.p?.length ?? 1) - 1 });
        if (step.pattern_freq) c.push(ctxUpdate('pattern_freq', { entries: freqEntries(step.pattern_freq) }));
        if (step.window_freq) c.push(ctxUpdate('window_freq', { entries: freqEntries(step.window_freq) }));
      } else if (algo === 'valid_palindrome') {
        s('set_string', { s: step.s });
        s('set_pointer', { name: 'L', index: step.L ?? 0 });
        s('set_pointer', { name: 'R', index: step.R ?? 0 });
        if (step.L !== undefined && step.R !== undefined) {
          c.push(ctxUpdate('pointer_state', {
            entries: [{ key: 'L', value: step.L }, { key: 'R', value: step.R }],
          }));
        }
      } else {
        s('set_string', { s: step.s });
      }
      break;
    }

    case 'expand_window': {
      s('set_window', { start: step.window_start, end: step.window_end });
      s('set_char_state', { index: step.new_index, state: 'in-window' });
      if (step.char_freq) c.push(ctxUpdate('char_freq', { entries: freqEntries(step.char_freq) }));
      break;
    }

    case 'shrink_window': {
      s('set_window', { start: step.window_start, end: step.window_end });
      s('set_char_state', { index: step.removed_index, state: 'default' });
      if (step.char_freq) c.push(ctxUpdate('char_freq', { entries: freqEntries(step.char_freq) }));
      break;
    }

    case 'window_invalid': {
      s('set_window', { start: step.window_start, end: step.window_end, windowClass: 'mismatch' });
      break;
    }

    case 'new_max': {
      if (algo === 'sliding_window_string') {
        s('set_window', { start: step.window_start, end: step.window_end, windowClass: 'active' });
      }
      break;
    }

    case 'compare': {
      s('set_char_state', { index: step.L, state: 'active' });
      s('set_char_state', { index: step.R, state: 'active' });
      s('set_pointer', { name: 'L', index: step.L });
      s('set_pointer', { name: 'R', index: step.R });
      c.push(ctxUpdate('pointer_state', {
        entries: [
          { key: 'L', value: step.L }, { key: 'R', value: step.R },
          { key: 'str[L]', value: step.s?.[step.L] ?? '?' },
          { key: 'str[R]', value: step.s?.[step.R] ?? '?' },
        ],
      }));
      break;
    }

    case 'match': {
      s('set_char_state', { index: step.L, state: 'match' });
      s('set_char_state', { index: step.R, state: 'match' });
      if (step.next_L !== undefined) s('set_pointer', { name: 'L', index: step.next_L });
      if (step.next_R !== undefined) s('set_pointer', { name: 'R', index: step.next_R });
      break;
    }

    case 'mismatch': {
      if (algo === 'valid_palindrome') {
        s('set_char_state', { index: step.L, state: 'mismatch' });
        s('set_char_state', { index: step.R, state: 'mismatch' });
      } else if (algo === 'kmp_search') {
        s('set_match', { ti: step.text_index, pi: step.pattern_index, state: 'mismatch' });
        if (step.new_pattern_offset !== undefined) s('set_pattern_offset', { k: step.new_pattern_offset });
        c.push(ctxLog('search_log', `Mismatch at text[${step.text_index}] vs pattern[${step.pattern_index}]`, 'warn'));
      }
      break;
    }

    case 'try_center': {
      s('set_pointer', { name: 'expand-L', index: step.center });
      s('set_pointer', { name: 'expand-R', index: step.center_type === 'even' ? step.center + 1 : step.center });
      c.push(ctxUpdate('palindrome_state', {
        entries: [
          { key: 'Center', value: step.center },
          { key: 'Type', value: step.center_type === 'odd' ? 'odd-length' : 'even-length' },
        ],
      }));
      break;
    }

    case 'expand': {
      if (step.expand_L !== undefined && step.expand_R !== undefined) {
        s('set_char_state', { start: step.expand_L, end: step.expand_R, state: 'in-window' });
        s('set_pointer', { name: 'expand-L', index: step.expand_L });
        s('set_pointer', { name: 'expand-R', index: step.expand_R });
      }
      break;
    }

    case 'new_longest': {
      s('set_char_state', { start: step.best_start, end: step.best_end, state: 'found' });
      c.push(ctxUpdate('palindrome_state', {
        entries: [
          { key: 'Best', value: step.best_palindrome },
          { key: 'Length', value: step.best_palindrome?.length },
          { key: 'Range', value: `[${step.best_start}, ${step.best_end}]`, status: 'updated' },
        ],
      }));
      break;
    }

    case 'slide': {
      if (algo === 'find_anagrams') {
        s('set_window', { start: step.window_start, end: step.window_end });
        if (step.window_freq) c.push(ctxUpdate('window_freq', { entries: freqEntries(step.window_freq) }));
      }
      break;
    }

    case 'anagram_found': {
      s('set_window', { start: step.window_start, end: step.window_end, windowClass: 'found' });
      c.push(ctxLog('matches', `Anagram at index ${step.anagram_start}`, 'success'));
      break;
    }

    case 'build_failure': {
      c.push(ctxUpdate('failure_fn', {
        entries: [{ key: String(step.failure_index), value: step.failure_value }],
      }));
      break;
    }

    case 'align': {
      if (step.pattern_offset !== undefined) s('set_pattern_offset', { k: step.pattern_offset });
      break;
    }

    case 'match_char': {
      s('set_match', { ti: step.text_index, pi: step.pattern_index, state: 'match' });
      break;
    }

    case 'found': {
      if (algo === 'kmp_search') {
        const m = step.pattern?.length ?? 1;
        s('set_char_state', { start: step.match_index, end: step.match_index + m - 1, state: 'found' });
        s('set_char_state', { start: 0, end: m - 1, state: 'found' });
        c.push(ctxLog('search_log', `Match at index ${step.match_index}`, 'success'));
      }
      break;
    }

    case 'result': {
      if (algo === 'sliding_window_string') {
        s('set_window', { start: step.longest_start, end: step.longest_end, windowClass: 'found' });
      } else if (algo === 'valid_palindrome') {
        s('set_all_state', { state: step.is_palindrome ? 'match' : 'mismatch' });
      } else if (algo === 'expand_palindrome') {
        s('set_char_state', { start: step.best_start, end: step.best_end, state: 'match' });
      } else if (algo === 'find_anagrams') {
        for (const idx of (step.anagram_indices || [])) {
          const pLen = step.p?.length ?? 0;
          s('set_window', { start: idx, end: idx + pLen - 1, windowClass: 'match' });
        }
      } else if (algo === 'kmp_search') {
        for (const idx of (step.matches || [])) {
          const m = step.pattern?.length ?? 1;
          s('set_char_state', { start: idx, end: idx + m - 1, state: 'match' });
        }
      } else {
        // Generic fallback: surface description
        c.push(ctxUpdate('algorithm_state', {
          entries: [{ key: 'Result', value: step.description || step.output || 'Complete', status: 'updated' }],
        }));
      }
      break;
    }

    case 'transform': {
      if (algo === 'manacher' && step.transformed) {
        s('set_string', { s: step.transformed });
      }
      c.push(ctxUpdate('palindrome_state', {
        entries: [{ key: 'Transformed', value: step.transformed || step.description || '', status: 'highlight' }],
      }));
      break;
    }

    case 'hash':
    case 'roll': {
      if (algo === 'rabin_karp') {
        if (step.window_start !== undefined && step.window_end !== undefined) {
          s('set_window', { start: step.window_start, end: step.window_end, windowClass: 'active' });
        }
        c.push(ctxUpdate('hash_state', {
          entries: [{ key: step.type, value: step.description || step.hash || '', status: 'highlight' }],
        }));
      }
      break;
    }

    case 'error':
      break;
  }

  return { viz: v, ctx: c };
}

// ─── CONTEXT mapper ──────────────────────────────────────────────────────────
// Context-renderer algorithms (hashing, math_patterns, etc.) embed `viz_actions`
// directly in each trace step. agentLib's emit_segment short-circuits the mapper
// for those steps and forwards the embedded actions verbatim. This mapper exists
// only to satisfy the outer switch and to handle the rare case where a context
// algorithm step lacks embedded viz_actions — in which case we synthesize a
// minimal description-only update so the algorithm_state panel isn't blank.
function mapContextStep(algo, step, _state) {
  const v = [];
  const c = [];

  // If the step embeds viz_actions, the caller skips the mapper entirely; this
  // function is invoked only when nothing was embedded. Surface step.description
  // (or step.type) on the algorithm_state panel as a fallback so the panel never
  // sits empty.
  if (step.description || step.type) {
    c.push(ctxUpdate('algorithm_state', {
      entries: [{ key: step.type || 'state', value: step.description || '', status: 'default' }],
    }));
  }

  return { viz: v, ctx: c };
}

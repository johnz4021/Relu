export { dijkstra, bfs, dfs, DEFAULT_GRAPH } from '../../algorithms.js';
export { unionFind, DEFAULT_UNION_FIND_GRAPH } from './unionFind.js';
export { kruskal } from './kruskal.js';
export { prim } from './prim.js';
export { maxflow, DEFAULT_FLOW_NETWORK } from './maxflow.js';
export { bellmanFord, DEFAULT_BELLMAN_FORD_GRAPH } from './bellmanFord.js';
export { dagShortest, DEFAULT_DAG_GRAPH } from './dagShortest.js';
export { topologicalSort } from './topologicalSort.js';
export { backtracking } from './backtracking.js';

export const DEFAULT_UNDIRECTED_GRAPH = {
  nodes: [
    { id: 'A', label: 'A' },
    { id: 'B', label: 'B' },
    { id: 'C', label: 'C' },
    { id: 'D', label: 'D' },
    { id: 'E', label: 'E' },
    { id: 'F', label: 'F' },
  ],
  edges: [
    { source: 'A', target: 'B', weight: 4 },
    { source: 'A', target: 'C', weight: 2 },
    { source: 'B', target: 'C', weight: 1 },
    { source: 'B', target: 'D', weight: 5 },
    { source: 'C', target: 'D', weight: 8 },
    { source: 'C', target: 'E', weight: 10 },
    { source: 'D', target: 'E', weight: 2 },
    { source: 'D', target: 'F', weight: 6 },
    { source: 'E', target: 'F', weight: 3 },
  ],
  directed: false,
  positions: {
    A: { x: 100, y: 200 },
    B: { x: 300, y: 100 },
    C: { x: 300, y: 300 },
    D: { x: 500, y: 100 },
    E: { x: 500, y: 300 },
    F: { x: 700, y: 200 },
  },
};

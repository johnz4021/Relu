/**
 * Pre-built canonical examples for each algorithm.
 * Used in guided mode to offer a quick refresher before the reduction sketch.
 */

export const CANONICAL_EXAMPLES = {
  dijkstra: {
    description: 'Find shortest paths from S in a small weighted graph',
    input: {
      graph: {
        nodes: [
          { id: 'S', label: 'S' },
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
          { id: 'C', label: 'C' },
          { id: 'T', label: 'T' },
        ],
        edges: [
          { source: 'S', target: 'A', weight: 4 },
          { source: 'S', target: 'B', weight: 2 },
          { source: 'A', target: 'C', weight: 3 },
          { source: 'B', target: 'A', weight: 1 },
          { source: 'B', target: 'C', weight: 5 },
          { source: 'C', target: 'T', weight: 1 },
        ],
        directed: true,
        positions: {
          S: { x: 100, y: 200 },
          A: { x: 300, y: 100 },
          B: { x: 300, y: 300 },
          C: { x: 500, y: 200 },
          T: { x: 700, y: 200 },
        },
      },
      source: 'S',
    },
    teaching_notes: 'Classic 5-node example. Key insight: going S->B->A (cost 3) is cheaper than direct S->A (cost 4). Shows why Dijkstra processes nodes in distance order.',
  },

  bfs: {
    description: 'Explore all reachable nodes from A in an unweighted graph',
    input: {
      graph: {
        nodes: [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
          { id: 'C', label: 'C' },
          { id: 'D', label: 'D' },
          { id: 'E', label: 'E' },
        ],
        edges: [
          { source: 'A', target: 'B' },
          { source: 'A', target: 'C' },
          { source: 'B', target: 'D' },
          { source: 'C', target: 'D' },
          { source: 'D', target: 'E' },
        ],
        directed: true,
        positions: {
          A: { x: 100, y: 200 },
          B: { x: 300, y: 100 },
          C: { x: 300, y: 300 },
          D: { x: 500, y: 200 },
          E: { x: 700, y: 200 },
        },
      },
      source: 'A',
    },
    teaching_notes: 'BFS visits all nodes at distance 1 (B, C) before any node at distance 2 (D). This guarantees shortest paths in unweighted graphs.',
  },

  kruskal: {
    description: 'Find a minimum spanning tree by sorting edges globally',
    input: {
      graph: {
        nodes: [
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
          { id: 'C', label: 'C' },
          { id: 'D', label: 'D' },
        ],
        edges: [
          { source: 'A', target: 'B', weight: 1 },
          { source: 'A', target: 'C', weight: 4 },
          { source: 'B', target: 'C', weight: 2 },
          { source: 'B', target: 'D', weight: 5 },
          { source: 'C', target: 'D', weight: 3 },
        ],
        directed: false,
        positions: {
          A: { x: 100, y: 100 },
          B: { x: 400, y: 100 },
          C: { x: 100, y: 350 },
          D: { x: 400, y: 350 },
        },
      },
    },
    teaching_notes: 'Sorted edges: AB(1), BC(2), CD(3), AC(4), BD(5). Kruskal picks AB, BC, CD — skips AC (would create cycle). MST cost = 6.',
  },

  maxflow: {
    description: 'Find maximum flow from S to T in a small network',
    input: {
      graph: {
        nodes: [
          { id: 'S', label: 'S' },
          { id: 'A', label: 'A' },
          { id: 'B', label: 'B' },
          { id: 'T', label: 'T' },
        ],
        edges: [
          { source: 'S', target: 'A', weight: 10 },
          { source: 'S', target: 'B', weight: 5 },
          { source: 'A', target: 'B', weight: 3 },
          { source: 'A', target: 'T', weight: 8 },
          { source: 'B', target: 'T', weight: 7 },
        ],
        directed: true,
        positions: {
          S: { x: 100, y: 200 },
          A: { x: 350, y: 100 },
          B: { x: 350, y: 300 },
          T: { x: 600, y: 200 },
        },
      },
      source: 'S',
      sink: 'T',
    },
    teaching_notes: 'Small 4-node network. Shows how Ford-Fulkerson finds augmenting paths and builds the residual graph. Max flow = 13.',
  },

  knapsack: {
    description: 'Pick items to maximize value within weight limit',
    input: {
      items: [
        { name: 'Book', weight: 1, value: 2 },
        { name: 'Camera', weight: 3, value: 4 },
        { name: 'Laptop', weight: 4, value: 5 },
      ],
      capacity: 5,
    },
    teaching_notes: 'With capacity 5, optimal is Book + Camera (value 6), not just the Laptop (value 5). Shows why greedy by value/weight ratio can fail.',
  },

  edit_distance: {
    description: 'Transform one word into another with minimum edits',
    input: {
      str1: 'cat',
      str2: 'cut',
    },
    teaching_notes: 'Only 1 edit needed: replace "a" with "u". Shows the three operations (insert, delete, replace) and how the DP table tracks minimum cost.',
  },

};

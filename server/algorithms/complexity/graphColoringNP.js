/**
 * Graph 3-Coloring NP-Completeness Demo
 *
 * Demonstrates P vs NP through:
 * 1. Brute-force coloring attempts (exponential search)
 * 2. Certificate verification (polynomial check)
 */

export const DEFAULT_COLORING_GRAPH = {
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
    { source: 'B', target: 'C' },
    { source: 'B', target: 'D' },
    { source: 'C', target: 'D' },
    { source: 'C', target: 'E' },
    { source: 'D', target: 'E' },
  ],
  directed: false,
  positions: {
    A: { x: 200, y: 80 },
    B: { x: 400, y: 80 },
    C: { x: 300, y: 220 },
    D: { x: 500, y: 220 },
    E: { x: 400, y: 360 },
  },
};

const COLORS = ['Red', 'Blue', 'Green'];
const COLOR_CLASS = { Red: 'color-red', Blue: 'color-blue', Green: 'color-green' };

function findConflict(coloring, edges) {
  for (const e of edges) {
    if (coloring[e.source] === coloring[e.target]) {
      return { from: e.source, to: e.target, color: coloring[e.source] };
    }
  }
  return null;
}

function coloringStr(coloring, nodes) {
  return nodes.map(n => `${n}=${coloring[n][0]}`).join(',');
}

export function graphColoringNP(graph) {
  const trace = [];
  const nodes = graph.nodes.map(n => n.id);
  const edges = graph.edges;
  const totalPossible = Math.pow(3, nodes.length);

  // --- Init ---
  trace.push({
    type: 'init',
    description: `Graph 3-Coloring: Can we color ${nodes.length} nodes with 3 colors so no adjacent nodes share a color? There are ${totalPossible} possible colorings to check.`,
  });

  // --- Brute-force attempts (2 failures + 1 success — kept brief as motivating example) ---
  const attempts = [
    { A: 'Red', B: 'Red', C: 'Blue', D: 'Green', E: 'Red' },   // fail: A-B both Red (obvious)
    { A: 'Red', B: 'Blue', C: 'Green', D: 'Green', E: 'Red' },  // fail: C-D both Green (deeper)
    { A: 'Red', B: 'Blue', C: 'Green', D: 'Red', E: 'Blue' },   // success
  ];

  let attemptNum = 0;

  for (const coloring of attempts) {
    attemptNum++;
    const conflict = findConflict(coloring, edges);

    // Show the attempt
    trace.push({
      type: 'attempt_coloring',
      attempt_number: attemptNum,
      total_possible: totalPossible,
      coloring: { ...coloring },
      node_classes: Object.fromEntries(nodes.map(n => [n, COLOR_CLASS[coloring[n]]])),
      description: `Attempt #${attemptNum}: ${coloringStr(coloring, nodes)}`,
    });

    if (conflict) {
      trace.push({
        type: 'coloring_conflict',
        attempt_number: attemptNum,
        total_possible: totalPossible,
        from: conflict.from,
        to: conflict.to,
        color: conflict.color,
        coloring_str: coloringStr(coloring, nodes),
        description: `FAIL — ${conflict.from} and ${conflict.to} are both ${conflict.color}. ${attemptNum} of ${totalPossible} checked so far.`,
      });
    } else {
      trace.push({
        type: 'coloring_success',
        attempt_number: attemptNum,
        total_possible: totalPossible,
        coloring: { ...coloring },
        coloring_str: coloringStr(coloring, nodes),
        description: `SUCCESS! Found a valid 3-coloring on attempt #${attemptNum}: ${coloringStr(coloring, nodes)}. But we might have needed up to ${totalPossible} attempts.`,
      });
    }
  }

  // --- Concept: NP definition (before verification, to frame what we're about to do) ---
  trace.push({
    type: 'concept_intro',
    concept: 'np_definition',
    description: 'The class NP contains problems where a proposed solution (certificate) can be VERIFIED in polynomial time — even if FINDING the solution is hard.',
  });

  // --- Verification phase ---
  const validColoring = { A: 'Red', B: 'Blue', C: 'Green', D: 'Red', E: 'Blue' };

  trace.push({
    type: 'verify_start',
    coloring: { ...validColoring },
    node_classes: Object.fromEntries(nodes.map(n => [n, COLOR_CLASS[validColoring[n]]])),
    total_edges: edges.length,
    description: `Verification: Someone hands us a certificate — the coloring ${coloringStr(validColoring, nodes)}. Can we CHECK it quickly?`,
  });

  let checkNum = 0;
  for (const edge of edges) {
    checkNum++;
    const pass = validColoring[edge.source] !== validColoring[edge.target];
    trace.push({
      type: 'verify_edge',
      from: edge.source,
      to: edge.target,
      color_from: validColoring[edge.source],
      color_to: validColoring[edge.target],
      pass,
      check_number: checkNum,
      total_edges: edges.length,
      node_classes: Object.fromEntries(nodes.map(n => [n, COLOR_CLASS[validColoring[n]]])),
      description: `Check edge ${edge.source}-${edge.target}: ${validColoring[edge.source]} vs ${validColoring[edge.target]} — ${pass ? 'PASS' : 'FAIL'}. (${checkNum}/${edges.length})`,
    });
  }

  trace.push({
    type: 'verify_complete',
    checks: edges.length,
    description: `Verification complete! All ${edges.length} edges checked in O(${edges.length}) time. That's polynomial — so graph 3-coloring is in NP.`,
  });

  // --- Concept definitions (THE CORE of the lesson) ---
  trace.push({
    type: 'concept_intro',
    concept: 'p_definition',
    description: 'The class P contains problems that can be SOLVED in polynomial time. Examples: sorting a list (O(n log n)), finding shortest paths (Dijkstra\'s), checking if a number is even. These are problems where we have efficient algorithms.',
  });

  trace.push({
    type: 'concept_intro',
    concept: 'np_hard',
    description: 'A problem is NP-Hard if every problem in NP can be reduced to it in polynomial time — meaning it\'s at least as hard as the hardest problems in NP. Key nuance: an NP-Hard problem does NOT have to be in NP itself. It could be even harder — maybe we can\'t even verify solutions quickly.',
  });

  trace.push({
    type: 'concept_intro',
    concept: 'np_complete',
    description: 'A problem is NP-Complete if it is BOTH in NP (verifiable in poly time) AND NP-Hard (every NP problem reduces to it). Graph 3-Coloring is NP-Complete: we just showed verification is polynomial, and it\'s known that all NP problems can be reduced to it. NP-Complete problems are the hardest problems that are still in NP.',
  });

  trace.push({
    type: 'concept_intro',
    concept: 'p_vs_np',
    description: 'The P vs NP question: Does P = NP? If yes, every problem whose solution can be quickly VERIFIED can also be quickly SOLVED — and graph 3-coloring would have a polynomial-time algorithm. If no (as most researchers believe), then some problems are fundamentally harder to solve than to verify. This is the most important open question in computer science.',
  });

  // --- Result ---
  trace.push({
    type: 'result',
    coloring: { ...validColoring },
    description: `Summary: Finding a 3-coloring requires checking up to ${totalPossible} possibilities (exponential), but verifying one takes only ${edges.length} checks (polynomial). This gap — hard to solve, easy to verify — is the essence of NP.`,
  });

  return trace;
}

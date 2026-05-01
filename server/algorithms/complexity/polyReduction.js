/**
 * 3-SAT → Independent Set Polynomial Reduction
 *
 * Demonstrates the classic reduction:
 * 1. Start with a 3-SAT formula
 * 2. Construct a gadget graph (triangle per clause + conflict edges)
 * 3. Find an independent set of size k = #clauses
 * 4. Map back to a satisfying assignment
 */

export const DEFAULT_REDUCTION_FORMULA = {
  variables: ['x1', 'x2', 'x3'],
  clauses: [
    ['x1', '¬x2', 'x3'],
    ['¬x1', 'x2', '¬x3'],
    ['x1', 'x2', 'x3'],
  ],
};

// Pre-built gadget graph matching the default formula
// 9 nodes: one per literal per clause, arranged in 3 triangles
export const DEFAULT_REDUCTION_GRAPH = {
  nodes: [
    // Clause 1: (x1 ∨ ¬x2 ∨ x3)
    { id: 'c1_x1', label: 'x₁' },
    { id: 'c1_nx2', label: '¬x₂' },
    { id: 'c1_x3', label: 'x₃' },
    // Clause 2: (¬x1 ∨ x2 ∨ ¬x3)
    { id: 'c2_nx1', label: '¬x₁' },
    { id: 'c2_x2', label: 'x₂' },
    { id: 'c2_nx3', label: '¬x₃' },
    // Clause 3: (x1 ∨ x2 ∨ x3)
    { id: 'c3_x1', label: 'x₁' },
    { id: 'c3_x2', label: 'x₂' },
    { id: 'c3_x3', label: 'x₃' },
  ],
  edges: [
    // Triangle edges (within each clause)
    { source: 'c1_x1', target: 'c1_nx2' },
    { source: 'c1_nx2', target: 'c1_x3' },
    { source: 'c1_x1', target: 'c1_x3' },
    { source: 'c2_nx1', target: 'c2_x2' },
    { source: 'c2_x2', target: 'c2_nx3' },
    { source: 'c2_nx1', target: 'c2_nx3' },
    { source: 'c3_x1', target: 'c3_x2' },
    { source: 'c3_x2', target: 'c3_x3' },
    { source: 'c3_x1', target: 'c3_x3' },
    // Conflict edges (complementary literals across clauses)
    { source: 'c1_x1', target: 'c2_nx1' },    // x1 vs ¬x1
    { source: 'c1_nx2', target: 'c2_x2' },     // ¬x2 vs x2
    { source: 'c1_nx2', target: 'c3_x2' },     // ¬x2 vs x2
    { source: 'c1_x3', target: 'c2_nx3' },     // x3 vs ¬x3
    { source: 'c2_nx1', target: 'c3_x1' },     // ¬x1 vs x1
    { source: 'c2_nx3', target: 'c3_x3' },     // ¬x3 vs x3
  ],
  directed: false,
  positions: {
    // Clause 1 — triangle pointing down (▽)
    c1_x1:  { x: 150, y: 60 },
    c1_nx2: { x: 350, y: 140 },
    c1_x3:  { x: 550, y: 60 },
    // Clause 2 — triangle pointing up (△)
    c2_nx1: { x: 150, y: 300 },
    c2_x2:  { x: 350, y: 220 },
    c2_nx3: { x: 550, y: 300 },
    // Clause 3 — triangle pointing down (▽)
    c3_x1:  { x: 150, y: 420 },
    c3_x2:  { x: 350, y: 500 },
    c3_x3:  { x: 550, y: 420 },
  },
};

function litToStr(lit) {
  return lit.replace('x', 'x₁').replace('x₁', lit.startsWith('¬') ? lit.replace('¬x', '¬x₁').slice(0) : lit);
}

function formatClause(clause) {
  return `(${clause.join(' ∨ ')})`;
}

function formatFormula(clauses) {
  return clauses.map(formatClause).join(' ∧ ');
}

export function polyReduction(formula) {
  const trace = [];
  const clauses = formula.clauses;
  const variables = formula.variables;
  const k = clauses.length;

  // --- Init ---
  trace.push({
    type: 'init',
    description: `Polynomial Reduction: We'll prove Independent Set is NP-Complete by reducing 3-SAT to it. If we can solve Independent Set, we can solve 3-SAT.`,
  });

  // --- Show formula ---
  trace.push({
    type: 'show_formula',
    formula_text: formatFormula(clauses),
    clauses: clauses.map((c, i) => ({ id: i + 1, literals: c, text: formatClause(c) })),
    variables,
    description: `Our 3-SAT formula: ${formatFormula(clauses)}. We need to find values for ${variables.join(', ')} that make ALL clauses true simultaneously.`,
  });

  // --- Build clause gadgets (one triangle per clause) ---
  const clauseNodeIds = [];
  const triangleEdges = [];

  for (let ci = 0; ci < clauses.length; ci++) {
    const clause = clauses[ci];
    const prefix = `c${ci + 1}`;
    const nodeIds = clause.map(lit => {
      const varName = lit.replace('¬', '');
      const neg = lit.startsWith('¬') ? 'n' : '';
      return `${prefix}_${neg}${varName}`;
    });
    clauseNodeIds.push(nodeIds);

    // Triangle edges
    const triEdges = [
      { source: nodeIds[0], target: nodeIds[1] },
      { source: nodeIds[1], target: nodeIds[2] },
      { source: nodeIds[0], target: nodeIds[2] },
    ];
    triangleEdges.push(...triEdges);

    // Pull positions from the pre-built graph
    const nodePositions = {};
    for (const nid of nodeIds) {
      if (DEFAULT_REDUCTION_GRAPH.positions[nid]) {
        nodePositions[nid] = DEFAULT_REDUCTION_GRAPH.positions[nid];
      }
    }

    trace.push({
      type: 'build_clause_gadget',
      clause_index: ci + 1,
      clause_text: formatClause(clause),
      node_ids: nodeIds,
      literals: clause,
      triangle_edges: triEdges,
      node_positions: nodePositions,
      description: `Clause ${ci + 1}: ${formatClause(clause)} → create triangle with nodes ${nodeIds.join(', ')}. Triangle edges force at most ONE node selected per clause.`,
    });
  }

  // --- Add conflict edges ---
  const conflictEdges = [];
  // For each pair of clauses, find complementary literals
  for (let i = 0; i < clauses.length; i++) {
    for (let j = i + 1; j < clauses.length; j++) {
      for (let li = 0; li < clauses[i].length; li++) {
        for (let lj = 0; lj < clauses[j].length; lj++) {
          const litI = clauses[i][li];
          const litJ = clauses[j][lj];
          // Check if they're complementary (x vs ¬x or ¬x vs x)
          const isComplement =
            (litI === `¬${litJ}`) || (litJ === `¬${litI}`);
          if (isComplement) {
            conflictEdges.push({
              source: clauseNodeIds[i][li],
              target: clauseNodeIds[j][lj],
              lit_a: litI,
              lit_b: litJ,
            });
          }
        }
      }
    }
  }

  trace.push({
    type: 'add_conflict_edges',
    conflict_edges: conflictEdges,
    description: `Add ${conflictEdges.length} conflict edges between complementary literals across clauses. These prevent selecting both x and ¬x — ensuring a consistent assignment. Conflicts: ${conflictEdges.map(e => `${e.lit_a}↔${e.lit_b}`).join(', ')}.`,
  });

  // --- Concept: reduction correctness ---
  trace.push({
    type: 'concept_intro',
    concept: 'reduction_correctness',
    k,
    description: `The reduction is complete. Key insight: the formula is satisfiable IF AND ONLY IF the gadget graph has an independent set of size k=${k}. Triangles ensure one literal per clause; conflict edges ensure consistency.`,
  });

  // --- Find satisfying assignment & independent set ---
  // Brute-force all 2^n assignments (only 8 for 3 variables)
  let satisfyingAssignment = null;
  const numVars = variables.length;

  for (let mask = 0; mask < (1 << numVars); mask++) {
    const assignment = {};
    for (let vi = 0; vi < numVars; vi++) {
      assignment[variables[vi]] = Boolean(mask & (1 << vi));
    }

    // Check if all clauses satisfied
    const allSat = clauses.every(clause =>
      clause.some(lit => {
        const neg = lit.startsWith('¬');
        const varName = neg ? lit.slice(1) : lit;
        return neg ? !assignment[varName] : assignment[varName];
      })
    );

    if (allSat) {
      satisfyingAssignment = assignment;
      break;
    }
  }

  // Pick one true literal per clause → independent set
  const selectedNodes = [];
  for (let ci = 0; ci < clauses.length; ci++) {
    const clause = clauses[ci];
    for (let li = 0; li < clause.length; li++) {
      const lit = clause[li];
      const neg = lit.startsWith('¬');
      const varName = neg ? lit.slice(1) : lit;
      const val = neg ? !satisfyingAssignment[varName] : satisfyingAssignment[varName];
      if (val) {
        selectedNodes.push(clauseNodeIds[ci][li]);
        break;
      }
    }
  }

  trace.push({
    type: 'find_independent_set',
    selected_nodes: selectedNodes,
    k,
    description: `Independent set of size ${k} found: {${selectedNodes.join(', ')}}. These ${k} nodes have no edges between them — exactly one from each triangle, no conflicts.`,
  });

  // --- Map back to assignment ---
  const assignmentStr = Object.entries(satisfyingAssignment)
    .map(([v, val]) => `${v}=${val}`)
    .join(', ');

  // Verify each clause
  const clauseResults = clauses.map((clause, ci) => {
    const satisfiedBy = clause.find(lit => {
      const neg = lit.startsWith('¬');
      const varName = neg ? lit.slice(1) : lit;
      return neg ? !satisfyingAssignment[varName] : satisfyingAssignment[varName];
    });
    return { clause: formatClause(clause), satisfiedBy };
  });

  trace.push({
    type: 'map_to_assignment',
    assignment: { ...satisfyingAssignment },
    assignment_str: assignmentStr,
    selected_nodes: selectedNodes,
    clause_results: clauseResults,
    description: `Map back: ${assignmentStr}. Each selected node corresponds to a true literal. Verify: ${clauseResults.map(cr => `${cr.clause} satisfied by ${cr.satisfiedBy}`).join('; ')}.`,
  });

  // --- Result ---
  trace.push({
    type: 'result',
    assignment: { ...satisfyingAssignment },
    selected_nodes: selectedNodes,
    k,
    description: `Reduction complete! We transformed 3-SAT into Independent Set in polynomial time (O(clauses × literals)). Since 3-SAT is NP-Complete and reduces to Independent Set, Independent Set is also NP-Complete.`,
  });

  return trace;
}

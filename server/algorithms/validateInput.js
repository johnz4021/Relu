import { ALGORITHMS } from './registry.js';

/**
 * Validate algorithm input against the algorithm's declared capabilities.
 * Returns { valid, warnings, errors, adaptations }.
 */
export function validateAlgorithmInput(algorithmId, input, modelContract) {
  const errors = [];
  const warnings = [];
  const adaptations = [];

  const algo = ALGORITHMS[algorithmId];
  if (!algo) {
    return { valid: false, errors: [`Unknown algorithm: ${algorithmId}`], warnings, adaptations };
  }

  const caps = algo.capabilities || {};
  const graph = input?.graph;

  // Graph-specific checks
  if (graph) {
    const isDirected = graph.directed !== false;
    const isUndirected = graph.directed === false;

    // Directed/undirected compatibility
    if (isUndirected && caps.supports_undirected === false) {
      errors.push(`${algorithmId} does not support undirected graphs`);
    }
    if (isDirected && caps.supports_directed === false) {
      // Can adapt: double edges and mark as undirected
      adaptations.push('double_edges');
    }

    // Weight checks
    const hasWeights = graph.edges?.some(e => e.weight !== undefined);
    const missingWeights = graph.edges?.some(e => e.weight === undefined);

    if (caps.supports_weighted === false && hasWeights) {
      warnings.push(`${algorithmId} ignores edge weights`);
    }
    if (caps.supports_unweighted === false && !hasWeights) {
      // Need weights but none provided — add unit weights
      adaptations.push('add_unit_weights');
    }
    if (caps.supports_weighted === true && missingWeights && hasWeights) {
      // Mixed: some edges have weights, some don't
      adaptations.push('add_unit_weights');
    }

    // Size checks
    if (caps.max_nodes && graph.nodes?.length > caps.max_nodes) {
      warnings.push(`Graph has ${graph.nodes.length} nodes (max ${caps.max_nodes} for visualization)`);
    }
    if (caps.max_edges && graph.edges?.length > caps.max_edges) {
      warnings.push(`Graph has ${graph.edges.length} edges (max ${caps.max_edges} for visualization)`);
    }
  }

  // Array size checks
  if (input?.array && caps.max_array_length) {
    if (input.array.length > caps.max_array_length) {
      warnings.push(`Array has ${input.array.length} elements (max ${caps.max_array_length} for visualization)`);
    }
  }

  // Table size checks
  if (caps.max_table_rows || caps.max_table_cols) {
    if (algorithmId === 'knapsack' && input?.items) {
      if (input.items.length > caps.max_table_rows) {
        warnings.push(`${input.items.length} items exceeds max ${caps.max_table_rows} rows for visualization`);
      }
      if (input.capacity > caps.max_table_cols) {
        warnings.push(`Capacity ${input.capacity} exceeds max ${caps.max_table_cols} columns for visualization`);
      }
    }
    if (algorithmId === 'edit_distance' && input?.str1 && input?.str2) {
      if (input.str1.length > caps.max_table_rows) {
        warnings.push(`String 1 length ${input.str1.length} exceeds max ${caps.max_table_rows} for visualization`);
      }
      if (input.str2.length > caps.max_table_cols) {
        warnings.push(`String 2 length ${input.str2.length} exceeds max ${caps.max_table_cols} for visualization`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    adaptations,
  };
}

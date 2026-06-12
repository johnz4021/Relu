import { ALGORITHMS } from './registry.js';
import { LINEAR_FIELD_CAPS } from './validateInput.js';

/**
 * Adapt algorithm input based on required adaptations from validation.
 * Mutates the input object in place.
 */
export function adaptAlgorithmInput(algorithmId, input, adaptations) {
  for (const adaptation of adaptations) {
    switch (adaptation) {
      case 'clamp_linear_inputs': {
        const caps = ALGORITHMS[algorithmId]?.capabilities || {};
        for (const [field, capName] of LINEAR_FIELD_CAPS) {
          if (Array.isArray(input[field]) && caps[capName] && input[field].length > caps[capName]) {
            input[field] = input[field].slice(0, caps[capName]);
          }
        }
        if (Array.isArray(input.lists) && caps.max_list_length) {
          input.lists = input.lists.map(l => Array.isArray(l) ? l.slice(0, caps.max_list_length) : l);
        }
        break;
      }
      case 'double_edges': {
        // Add reverse of each edge if not already present, set directed: false
        if (input.graph && input.graph.edges) {
          const existingKeys = new Set(
            input.graph.edges.map(e => `${e.source}->${e.target}`)
          );
          const newEdges = [];
          for (const edge of input.graph.edges) {
            const reverseKey = `${edge.target}->${edge.source}`;
            if (!existingKeys.has(reverseKey)) {
              existingKeys.add(reverseKey);
              newEdges.push({ ...edge, source: edge.target, target: edge.source });
            }
          }
          input.graph.edges.push(...newEdges);
          input.graph.directed = false;
        }
        break;
      }
      case 'add_unit_weights': {
        // Set weight: 1 on edges missing weight
        if (input.graph && input.graph.edges) {
          for (const edge of input.graph.edges) {
            if (edge.weight === undefined) {
              edge.weight = 1;
            }
          }
        }
        break;
      }
    }
  }
}

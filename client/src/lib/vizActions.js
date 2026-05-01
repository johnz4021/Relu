// Maps viz_action objects to Cytoscape API calls

const ALL_TRANSIENT_CLASSES = 'highlighted current visited path ghost examining dimmed spotlit ghost-alt ghost-actual-label ghost-alt-label mst-edge strikethrough saturated augmenting min-cut source-side sink-side tapped residual-fwd residual-rev residual-dimmed color-red color-blue color-green';

export function applyVizActions(cy, actions) {
  if (!cy || !actions) return;

  for (const action of actions) {
    applyAction(cy, action);
  }
}

function applyAction(cy, action) {
  switch (action.action) {
    case 'highlight_node': {
      const node = cy.getElementById(action.node);
      node.addClass(action.className || 'highlighted');
      break;
    }

    case 'highlight_edge': {
      const edges = cy.edges().filter(
        (e) =>
          (e.data('source') === action.from && e.data('target') === action.to) ||
          (e.data('source') === action.to && e.data('target') === action.from)
      );
      console.log(`[vizActions] highlight_edge ${action.from}->${action.to} class=${action.className}: found ${edges.length} edges, totalEdges=${cy.edges().length}, edgeData=${cy.edges().map(e => e.data('source')+'->'+e.data('target')).join(', ')}`);
      edges.addClass(action.className || 'highlighted');
      break;
    }

    case 'mark_visited': {
      const node = cy.getElementById(action.node);
      node.removeClass('current');
      node.addClass('visited');
      break;
    }

    case 'mark_current': {
      // Remove current from all nodes first
      cy.nodes().removeClass('current');
      const node = cy.getElementById(action.node);
      node.addClass('current');
      break;
    }

    case 'set_label': {
      const node = cy.getElementById(action.node);
      node.data('label', action.label);
      break;
    }

    case 'reset_highlights': {
      cy.elements('.residual-temp').remove();
      // Restore edge labels overwritten by residual overlay before removing classes
      cy.edges().forEach((e) => {
        const original = e.data('_preResidualWeight');
        if (original != null) {
          e.data('weight', original);
          e.removeData('_preResidualWeight');
        }
      });
      cy.elements().removeClass(ALL_TRANSIENT_CLASSES);
      // Reset labels to original labels (not IDs)
      cy.nodes().forEach((n) => {
        n.data('label', n.data('originalLabel') || n.data('id'));
      });
      break;
    }

    case 'show_path': {
      if (!action.path || action.path.length < 2) break;
      console.log(`[vizActions] show_path: ${JSON.stringify(action.path)}, cy.nodes=${cy.nodes().length}, cy.container=${!!cy.container()}`);
      for (let i = 0; i < action.path.length; i++) {
        const node = cy.getElementById(action.path[i]);
        console.log(`[vizActions] show_path node '${action.path[i]}': found=${!node.empty()}, classesBefore=${node.classes()?.join(',')}`);
        node.addClass('path');
        console.log(`[vizActions] show_path node '${action.path[i]}': classesAfter=${node.classes()?.join(',')}`);
        if (i < action.path.length - 1) {
          const a = action.path[i];
          const b = action.path[i + 1];
          const edges = cy.edges().filter(
            (e) =>
              (e.data('source') === a && e.data('target') === b) ||
              (e.data('source') === b && e.data('target') === a)
          );
          edges.addClass('path');
        }
      }
      break;
    }

    case 'update_edge_label': {
      const directedOnly = action.directed_only !== false;
      const edges = cy.edges().filter(
        (e) =>
          (e.data('source') === action.from && e.data('target') === action.to) ||
          (!directedOnly && e.data('source') === action.to && e.data('target') === action.from)
      );
      edges.data('weight', action.label);
      break;
    }

    case 'show_residual_overlay': {
      const mode = action.mode || 'overlay';

      if (mode === 'full') {
        // Dim all non-path edges to fade the "original graph" feel
        cy.edges().forEach((e) => {
          if (!e.hasClass('augmenting') && !e.hasClass('path')) {
            e.addClass('residual-dimmed');
          }
        });
      }

      for (const re of action.residual_edges) {
        // Skip if source/target node doesn't exist (e.g. during graph transitions)
        if (!cy.getElementById(re.from).nonempty() || !cy.getElementById(re.to).nonempty()) {
          console.warn(`[vizActions] show_residual_overlay: skipping edge ${re.from}->${re.to}, node missing`);
          continue;
        }
        if (re.is_reverse && re.residual > 0) {
          // Reverse edge — add temporary dashed edge
          cy.add({
            group: 'edges',
            data: {
              id: `residual-${re.from}-${re.to}`,
              source: re.from,
              target: re.to,
              weight: `r:${re.residual}`,
            },
            classes: 'residual-rev residual-temp',
          });
        } else if (!re.is_reverse && mode === 'full') {
          // Forward residual edge — relabel and restyle (including r:0 for saturated)
          const edges = cy.edges().filter(
            (e) => e.data('source') === re.from && e.data('target') === re.to
          );
          edges.forEach((e) => {
            // Save original label so hide_residual_overlay can restore it
            if (!e.data('_preResidualWeight')) {
              e.data('_preResidualWeight', e.data('weight'));
            }
            e.data('weight', `r:${re.residual}`);
            e.removeClass('residual-dimmed');
            e.addClass('residual-fwd');
          });
        }
      }
      break;
    }

    case 'set_residual_data':
    case 'toggle_residual':
      // No-op on the graph — handled at App/state level
      break;

    case 'hide_residual_overlay': {
      cy.elements('.residual-temp').remove();
      // Restore original edge labels that were overwritten by 'full' mode
      cy.edges('.residual-fwd').forEach((e) => {
        const original = e.data('_preResidualWeight');
        if (original != null) {
          e.data('weight', original);
          e.removeData('_preResidualWeight');
        }
      });
      cy.edges().removeClass('residual-fwd residual-rev residual-dimmed');
      break;
    }

    case 'add_node': {
      // Skip if node already exists
      if (cy.getElementById(action.id).length > 0) break;
      const nodeData = {
        group: 'nodes',
        data: { id: action.id, label: action.label || action.id, originalLabel: action.label || action.id },
        position: action.position || { x: 0, y: 0 },
      };
      if (action.className) nodeData.classes = action.className;
      cy.add(nodeData);
      break;
    }

    case 'add_edge': {
      const edgeId = action.id || `${action.from}-${action.to}`;
      // Skip if edge already exists
      if (cy.getElementById(edgeId).length > 0) break;
      const edgeData = {
        group: 'edges',
        data: { id: edgeId, source: action.from, target: action.to, weight: action.weight ?? '' },
      };
      if (action.className) edgeData.classes = action.className;
      const addedEdge = cy.add(edgeData);
      if (action.undirected) {
        addedEdge.style('target-arrow-shape', 'none');
      }
      break;
    }

    case 'update_table': {
      // Table updates are handled in the state, not in Cytoscape
      // The useTutorState hook will pick up table data from segments
      break;
    }
  }
}

// === SNAPSHOT SYSTEM ===

export function takeSnapshot(cy) {
  const snapshot = {
    elements: cy.elements().map((ele) => ({
      group: ele.group(),
      id: ele.id(),
      classes: [...ele.classes()],
      data: { ...ele.data() },
      position: ele.group() === 'nodes' ? { ...ele.position() } : undefined,
    })),
  };
  return snapshot;
}

export function restoreSnapshot(cy, snapshot) {
  cy.elements('.ghost-temp').remove();
  cy.elements('.annotation-anchor').remove();

  // Build set of element IDs that existed at snapshot time
  const snapshotIds = new Set(snapshot.elements.map((e) => e.id));

  // Remove elements added AFTER the snapshot was taken
  cy.elements().forEach((ele) => {
    if (!snapshotIds.has(ele.id())) {
      ele.remove();
    }
  });

  for (const saved of snapshot.elements) {
    let ele = cy.getElementById(saved.id);

    // Re-add elements that are in the snapshot but missing from current cy (rewind)
    if (!ele || ele.length === 0) {
      const toAdd = { group: saved.group, data: { ...saved.data } };
      if (saved.position) toAdd.position = { ...saved.position };
      ele = cy.add(toAdd);
    }

    ele.removeClass(ALL_TRANSIENT_CLASSES);
    for (const cls of saved.classes) {
      ele.addClass(cls);
    }
    // Clean replace: remove data keys not in snapshot, then merge snapshot data
    const currentData = ele.data();
    for (const key of Object.keys(currentData)) {
      if (!(key in saved.data) && key !== 'id' && key !== 'source' && key !== 'target') {
        ele.removeData(key);
      }
    }
    ele.data(saved.data);
  }
}

// === OVERLAY MODE ===

export function applyOverlay(cy, overlay) {
  if (!overlay) return;

  const spotlitNodeIds = new Set(overlay.spotlight_nodes || []);
  const spotlitEdgeKeys = new Set(
    (overlay.spotlight_edges || []).map((e) => `${e.from}-${e.to}`)
  );

  cy.elements().addClass('dimmed');

  cy.nodes().forEach((n) => {
    if (spotlitNodeIds.has(n.id())) {
      n.removeClass('dimmed');
      n.addClass('spotlit');
    }
  });

  cy.edges().forEach((e) => {
    const key = `${e.data('source')}-${e.data('target')}`;
    if (spotlitEdgeKeys.has(key)) {
      e.removeClass('dimmed');
      e.addClass('spotlit');
    }
  });
}

export function removeOverlay(cy) {
  cy.elements().removeClass('dimmed spotlit');
}

// === GHOST ALTERNATIVE MODE ===

export function applyGhostAlternative(cy, ghostConfig) {
  if (!ghostConfig) return;

  const { ghost_path, ghost_label, actual_path, actual_label } = ghostConfig;

  if (actual_path && actual_path.length >= 2) {
    for (let i = 0; i < actual_path.length; i++) {
      const node = cy.getElementById(actual_path[i]);
      node.addClass('spotlit');
      if (i < actual_path.length - 1) {
        const edge = cy.edges().filter(
          (e) => e.data('source') === actual_path[i] && e.data('target') === actual_path[i + 1]
        );
        edge.addClass('spotlit');
      }
    }
    if (actual_label) {
      const lastNode = cy.getElementById(actual_path[actual_path.length - 1]);
      lastNode.data('ghost_badge', `✓ ${actual_label}`);
      lastNode.addClass('ghost-actual-label');
    }
  }

  if (ghost_path && ghost_path.length >= 2) {
    for (let i = 0; i < ghost_path.length - 1; i++) {
      const existingEdge = cy.edges().filter(
        (e) => e.data('source') === ghost_path[i] && e.data('target') === ghost_path[i + 1]
      );
      if (existingEdge.length > 0) {
        existingEdge.addClass('ghost-alt');
      } else {
        cy.add({
          group: 'edges',
          data: {
            id: `ghost-${ghost_path[i]}-${ghost_path[i + 1]}`,
            source: ghost_path[i],
            target: ghost_path[i + 1],
            weight: '',
          },
          classes: 'ghost-alt ghost-temp',
        });
      }
    }
    if (ghost_label) {
      const lastGhostNode = cy.getElementById(ghost_path[ghost_path.length - 1]);
      lastGhostNode.data('ghost_badge', `✗ ${ghost_label}`);
      lastGhostNode.addClass('ghost-alt-label');
    }
  }

  const allRelevantIds = new Set([...(ghost_path || []), ...(actual_path || [])]);
  cy.nodes().forEach((n) => {
    if (!allRelevantIds.has(n.id())) {
      n.addClass('dimmed');
    }
  });
}

export function removeGhostAlternative(cy) {
  cy.elements('.ghost-temp').remove();
  cy.nodes('.ghost-actual-label, .ghost-alt-label').forEach((n) => n.removeData('ghost_badge'));
  cy.elements().removeClass('ghost-alt ghost-actual-label ghost-alt-label dimmed spotlit');
}

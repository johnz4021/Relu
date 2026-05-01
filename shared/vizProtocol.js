/**
 * Unified Viz Action Protocol
 *
 * Every viz action flowing through the system has this shape:
 *   { renderer: 'graph', action: 'highlight_node', params: { node: 'A' } }
 *
 * The `renderer` field routes it to the correct client-side component.
 * The `action` + `params` are renderer-specific.
 */

export const RENDERER_ACTIONS = {
  graph: [
    'highlight_node', 'highlight_edge', 'mark_visited', 'mark_current',
    'set_label', 'reset_highlights', 'show_path', 'update_table',
    'highlight_component', 'mark_mst_edge', 'set_edge_label',
    'set_directed', 'set_undirected',
  ],
  array: [
    'set_data', 'highlight', 'swap', 'compare', 'partition',
    'mark_sorted', 'set_pointer', 'clear_pointers', 'reset',
    'slide_window', 'set_label',
  ],
  table: [
    'init_grid', 'fill_cell', 'highlight_cell', 'highlight_row',
    'highlight_col', 'show_dependency_arrow', 'set_row_header',
    'set_col_header', 'mark_optimal', 'reset',
  ],
  tree: [
    'set_tree', 'highlight_node', 'highlight_edge', 'rotate_left',
    'rotate_right', 'insert_node', 'delete_node', 'recolor_node',
    'sift_up', 'sift_down', 'mark_level', 'reset',
  ],
  linked: [
    'set_list', 'highlight_node', 'highlight_pointer', 'insert_after',
    'delete_node', 'reverse_segment', 'set_pointer', 'push', 'pop',
    'enqueue', 'dequeue', 'reset',
  ],
};

/**
 * Algorithm -> renderer mapping. Used by the algorithm selector
 * and agent system prompt to know which renderer an algorithm needs.
 */
export const ALGORITHM_RENDERERS = {
  // Graph renderer
  dijkstra:       { renderer: 'graph', category: 'Graph Algorithms' },
  bfs:            { renderer: 'graph', category: 'Graph Algorithms' },
  dfs:            { renderer: 'graph', category: 'Graph Algorithms' },
  kruskal:        { renderer: 'graph', category: 'Graph Algorithms' },
  prim:           { renderer: 'graph', category: 'Graph Algorithms' },
  topological:    { renderer: 'graph', category: 'Graph Algorithms' },
  bellman_ford:   { renderer: 'graph', category: 'Graph Algorithms' },

  // Array renderer
  quicksort:      { renderer: 'array', category: 'Sorting' },
  mergesort:      { renderer: 'array', category: 'Sorting' },
  heapsort:       { renderer: 'array', category: 'Sorting', secondaryRenderer: 'tree' },
  insertion_sort: { renderer: 'array', category: 'Sorting' },
  selection_sort: { renderer: 'array', category: 'Sorting' },
  bubble_sort:    { renderer: 'array', category: 'Sorting' },
  binary_search:  { renderer: 'array', category: 'Searching' },
  two_pointer:    { renderer: 'array', category: 'Techniques' },
  sliding_window: { renderer: 'array', category: 'Techniques' },

  // Table renderer
  knapsack:       { renderer: 'table', category: 'Dynamic Programming' },
  lcs:            { renderer: 'table', category: 'Dynamic Programming' },
  edit_distance:  { renderer: 'table', category: 'Dynamic Programming' },
  coin_change:    { renderer: 'table', category: 'Dynamic Programming' },
  matrix_chain:   { renderer: 'table', category: 'Dynamic Programming' },

  // Tree renderer
  bst_insert:     { renderer: 'tree', category: 'Trees' },
  bst_delete:     { renderer: 'tree', category: 'Trees' },
  avl_insert:     { renderer: 'tree', category: 'Trees' },
  red_black:      { renderer: 'tree', category: 'Trees' },
  heap_insert:    { renderer: 'tree', category: 'Trees' },
  heap_extract:   { renderer: 'tree', category: 'Trees' },

  // Linked structure renderer
  linked_list_reversal: { renderer: 'linked', category: 'Linked Structures' },
  stack_operations:     { renderer: 'linked', category: 'Linked Structures' },
  queue_operations:     { renderer: 'linked', category: 'Linked Structures' },

  // Complexity Theory
  graph_coloring_np: { renderer: 'graph', category: 'Complexity Theory' },
  poly_reduction:    { renderer: 'graph', category: 'Complexity Theory' },
};

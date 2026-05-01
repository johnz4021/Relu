// Context panel type definitions — shared between server and client

export const CONTEXT_PANEL_TYPES = {
  key_value: {
    description: 'Labeled key-value pairs (distances, costs, variable watchers)',
    // data shape: { entries: [{ key: string, value: string|number, status?: 'default'|'updated'|'highlight' }] }
  },
  collection: {
    description: 'Ordered list of items (priority queue, stack, visited set)',
    // data shape: { items: [{ value: string|number, label?: string, status?: string }], style?: 'queue'|'stack'|'set'|'list' }
  },
  expression: {
    description: 'Formula or expression being evaluated',
    // data shape: { expression: string, result?: string, highlight_terms?: string[] }
  },
  log: {
    description: 'Scrolling decision/operation log',
    // data shape: { entries: [{ text: string, type?: 'info'|'decision'|'result' }], max_visible?: number }
  },
  pseudocode: {
    description: 'Pseudocode with current line highlighting',
    // data shape: { lines: string[], current_line?: number, highlight_lines?: number[] }
  },
};

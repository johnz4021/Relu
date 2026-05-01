import { registerRenderer, unregisterRenderer } from './rendererRegistry';

let dispatchFn = null;

export function initContextManager(dispatch) {
  dispatchFn = dispatch;

  registerRenderer('context', {
    apply: (action, params) => {
      if (!dispatchFn) return;
      // Handle both nested ({ params: { panel_id, ... } }) and flat ({ panel_id, ... }) formats
      const p = params.params || params;
      switch (action) {
        case 'update':
          dispatchFn({ type: 'UPDATE_CONTEXT_PANEL', panel_id: p.panel_id, data: p });
          break;
        case 'append_log':
          dispatchFn({ type: 'APPEND_CONTEXT_LOG', panel_id: p.panel_id, entries: p.entries });
          break;
        case 'clear':
          dispatchFn({ type: 'UPDATE_CONTEXT_PANEL', panel_id: p.panel_id, data: {} });
          break;
      }
    },
    takeSnapshot: () => null,
    restoreSnapshot: () => {},
    cleanup: () => {},
  });
}

export function destroyContextManager() {
  dispatchFn = null;
  unregisterRenderer('context');
}

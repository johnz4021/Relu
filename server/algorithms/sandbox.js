import { createContext, runInContext } from 'vm';

/**
 * Execute a generated trace function in a sandboxed VM context.
 * No access to require, process, fs, etc.
 */
export function executeTraceInSandbox(functionCode, input, timeoutMs = 5000, renderer) {
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Math,
    Array,
    Object,
    Map,
    Set,
    JSON,
    Infinity,
    NaN,
    undefined,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    Number,
    String,
    Boolean,
  };

  const wrappedCode = functionCode.startsWith('function')
    ? `const run = ${functionCode};\nrun(input);`
    : `const run = function run(input) { ${functionCode} };\nrun(input);`;

  const context = createContext({ ...sandbox, input });
  const trace = runInContext(wrappedCode, context, { timeout: timeoutMs });

  // Validate trace structure
  if (!Array.isArray(trace)) throw new Error('Trace generator did not return an array');
  for (const step of trace) {
    if (!step.type || !step.description) {
      throw new Error('Trace step missing required fields: type, description');
    }
  }

  // Renderer-specific validation
  if (renderer) {
    validateTraceStructure(trace, renderer);
  }

  return trace;
}

/**
 * Validate that a trace has the expected structure for its renderer.
 * Throws on critical issues, warns on non-critical ones.
 */
export function validateTraceStructure(trace, renderer) {
  if (trace.length < 2) {
    throw new Error('Trace must have at least 2 steps (init + result)');
  }

  const firstType = trace[0].type;
  const lastType = trace[trace.length - 1].type;

  // Check init/result bookends
  if (!firstType.includes('init')) {
    console.warn(`[Sandbox] Trace does not start with init-type step (got: ${firstType})`);
  }
  if (!lastType.includes('result')) {
    console.warn(`[Sandbox] Trace does not end with result-type step (got: ${lastType})`);
  }

  // Renderer-specific field checks
  switch (renderer) {
    case 'graph': {
      const hasNodeRef = trace.some(s => s.node || s.from || s.to || s.path);
      if (!hasNodeRef) {
        console.warn('[Sandbox] Graph trace has no node/edge references in any step');
      }
      break;
    }
    case 'array': {
      const hasArrayRef = trace.some(s => s.array || s.indices || s.values);
      if (!hasArrayRef) {
        console.warn('[Sandbox] Array trace has no array/indices references in any step');
      }
      break;
    }
    case 'table': {
      const hasTableRef = trace.some(s => s.row !== undefined || s.col !== undefined);
      if (!hasTableRef) {
        console.warn('[Sandbox] Table trace has no row/col references in any step');
      }
      break;
    }
    case 'context': {
      const stepsWithoutViz = trace.filter(s => {
        if (!s.viz_actions || !Array.isArray(s.viz_actions)) return true;
        return !s.viz_actions.some(
          a => a.renderer === 'context' && a.params?.panel_id === 'algorithm_state'
        );
      });
      if (stepsWithoutViz.length > 0) {
        throw new Error(
          `Context trace has ${stepsWithoutViz.length} step(s) missing viz_actions[algorithm_state]: ${stepsWithoutViz.map(s => s.type).join(', ')}`
        );
      }
      break;
    }
  }
}

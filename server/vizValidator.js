// Manifest-driven viz_action validation — the enforcement layer for rendererManifest.js.
//
// rendererManifest.js documents every renderer's legal actions and param types for
// the LLM, but until now nothing ENFORCED it: a hallucinated action name or malformed
// params sailed through emit_segment and died silently in the client (unknown handler
// key → no-op → blank or partially-updated panel). Every blank-viz bug in the repo's
// history (array_main vs array, dropped highlights, empty panels) traces back to that
// gap. This module closes it:
//
//   1. Resolve the action's renderer TYPE (panel ids like "array_main" → "array").
//   2. Verify the action name exists in the manifest for that type, repairing safe
//      near-misses (case / hyphens / spaces).
//   3. Verify params: required params present (with a small alias table for the
//      mistakes models actually make: data→values, node↔id, index→indices),
//      types checked against the manifest's type DSL, safe coercions applied
//      (numeric strings → numbers, scalar → single-element array).
//   4. Normalize output to the canonical nested form { renderer, action, params }.
//
// Invalid actions are STRIPPED and returned as precise error strings so the caller
// can hand them back to the model for self-correction — never silently dropped.

import { RENDERER_MANIFEST } from './rendererManifest.js';

// Actions emitted by system paths (mapper residual overlays, multi-graph table sync)
// that are legal on the wire but not advertised to the model in buildRendererDocs.
// They pass through without param checks.
export const SYSTEM_ACTIONS = {
  graph: new Set([
    'show_residual_overlay',
    'set_residual_data',
    'hide_residual_overlay',
    'update_table',
  ]),
};

// Context-panel actions handled by client contextManager.js.
export const CONTEXT_ACTIONS = new Set(['update', 'append_log', 'clear']);

// toggle_residual is intercepted server-side in emit_segment before sending.
const SPECIAL_ACTIONS = new Set(['toggle_residual']);

// Param-name aliases models actually emit. Applied only when the canonical name is
// absent — the manifest spec stays the single source of truth for what's canonical.
const PARAM_ALIASES = {
  values: ['data', 'array'],
  indices: ['index', 'idx'],
  index: ['i', 'idx'],
  node: ['id'],
  id: ['node'],
  s: ['string', 'text'],
  p: ['pattern'],
};

/**
 * Resolve a viz_action's `renderer` field to its renderer TYPE.
 * Accepts a registered panel id ("array_main"), a bare type ("array"), or "context".
 * Returns null when unresolvable.
 */
export function resolveRendererType(rendererField, panels) {
  if (!rendererField) return null;
  if (rendererField === 'context') return 'context';
  const p = panels?.[rendererField];
  if (p) return p.type === 'context' ? 'context' : p.renderer;
  return RENDERER_MANIFEST[rendererField] ? rendererField : null;
}

const norm = (s) => String(s).toLowerCase().replace(/[-\s]+/g, '_');

// ── type DSL ──────────────────────────────────────────────────────────────────
// Manifest specs: 'string', 'number', 'int', 'boolean', 'any', trailing '?' for
// optional, 'X[]' for arrays, '{row,col}' object shapes (checked as objects),
// quoted unions "'left'|'right'", and prose escapes like 'number | (start+end)'
// (treated as optional/any — the manifest is documentation-first there).

function isOptionalSpec(spec) {
  if (typeof spec !== 'string') return false;
  return spec.trim().endsWith('?') || spec.includes('(');
}

function baseSpec(spec) {
  const s = String(spec).trim();
  return s.endsWith('?') ? s.slice(0, -1) : s;
}

/**
 * Check (and safely coerce) a value against a manifest type spec.
 * Returns { ok, value } — value is the possibly-coerced result.
 */
export function checkParamType(value, spec) {
  const base = baseSpec(spec);

  if (base === 'any' || base.includes('(')) return { ok: true, value };

  // Quoted string unions: 'red'|'black'
  if (/^'[^']*'(\s*\|\s*'[^']*')+$/.test(base)) {
    const allowed = [...base.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    return { ok: allowed.includes(value), value };
  }

  if (base.endsWith('[]')) {
    const elem = base.slice(0, -2);
    if (Array.isArray(value)) {
      if (['number', 'int', 'string'].includes(elem)) {
        const coerced = [];
        for (const v of value) {
          const r = checkParamType(v, elem);
          if (!r.ok) return { ok: false, value };
          coerced.push(r.value);
        }
        return { ok: true, value: coerced };
      }
      return { ok: true, value }; // object-element arrays: shallow check only
    }
    // Scalar where an array was expected — wrap if the scalar fits the element type.
    const r = checkParamType(value, elem.startsWith('{') ? 'any' : elem);
    if (r.ok && !elem.startsWith('{')) return { ok: true, value: [r.value] };
    return { ok: false, value };
  }

  if (base === 'array') return { ok: Array.isArray(value), value };

  if (base.startsWith('{')) {
    return { ok: typeof value === 'object' && value !== null && !Array.isArray(value), value };
  }

  switch (base) {
    case 'number':
    case 'int': {
      if (typeof value === 'number' && Number.isFinite(value)) return { ok: true, value };
      if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        return { ok: true, value: Number(value) };
      }
      return { ok: false, value };
    }
    case 'string': {
      if (typeof value === 'string') return { ok: true, value };
      if (typeof value === 'number') return { ok: true, value: String(value) };
      return { ok: false, value };
    }
    case 'boolean': {
      if (typeof value === 'boolean') return { ok: true, value };
      if (value === 'true' || value === 'false') return { ok: true, value: value === 'true' };
      return { ok: false, value };
    }
    default:
      return { ok: true, value }; // unknown spec — documentation-only, be lenient
  }
}

// Lift legacy flat params ({ renderer, action, node: 'a' }) into a params object.
function extractParams(action) {
  if (action.params && typeof action.params === 'object') return { ...action.params };
  const { renderer, action: _name, ...rest } = action;
  return rest;
}

/**
 * Validate model-supplied viz_actions against the renderer manifest.
 *
 * @param {object[]} actions  viz_actions (panel ids already aliased by validatePanelIds)
 * @param {object}   panels   session._panels registry (id → { renderer, type })
 * @param {object}   opts     { lenientUnknownRenderer } — keep actions whose renderer
 *                            can't be resolved (Tier 2 traces, partial registries)
 * @returns {{ valid: object[], errors: string[] }}
 */
export function validateVizActionSchemas(actions, panels, opts = {}) {
  const valid = [];
  const errors = [];

  for (const action of actions || []) {
    // Legacy actions without a renderer field default to graph on the client.
    if (!action?.renderer) { valid.push(action); continue; }

    if (SPECIAL_ACTIONS.has(action.action)) { valid.push(action); continue; }

    const type = resolveRendererType(action.renderer, panels);
    if (!type) {
      if (opts.lenientUnknownRenderer) { valid.push(action); continue; }
      errors.push(`unknown renderer/panel '${action.renderer}' for action '${action.action}'`);
      continue;
    }

    if (type === 'context') {
      if (!CONTEXT_ACTIONS.has(action.action)) {
        errors.push(
          `'${action.action}' is not a valid context action (valid: ${[...CONTEXT_ACTIONS].join(', ')})`,
        );
        continue;
      }
      const p = action.params || action;
      if (!p.panel_id || typeof p.panel_id !== 'string') {
        errors.push(`context '${action.action}' is missing required param 'panel_id'`);
        continue;
      }
      valid.push(action);
      continue;
    }

    const manifest = RENDERER_MANIFEST[type];
    if (!manifest) {
      if (opts.lenientUnknownRenderer) { valid.push(action); continue; }
      errors.push(`renderer type '${type}' has no manifest entry`);
      continue;
    }

    // ── action name: exact → normalized repair → system action → error ──
    let spec = manifest.actions.find((a) => a.name === action.action);
    let canonicalName = action.action;
    if (!spec) {
      const candidates = manifest.actions.filter((a) => norm(a.name) === norm(action.action));
      if (candidates.length === 1) {
        spec = candidates[0];
        canonicalName = spec.name;
      } else if (SYSTEM_ACTIONS[type]?.has(action.action)) {
        valid.push(action); // system-emitted, no param contract published
        continue;
      } else {
        const names = manifest.actions.map((a) => a.name).join(', ');
        errors.push(
          `'${action.action}' is not a valid action for renderer '${type}' (valid: ${names})`,
        );
        continue;
      }
    }

    // ── params: alias → required check → type check/coerce ──
    const params = extractParams(action);
    let actionError = null;
    for (const [pname, pspec] of Object.entries(spec.params)) {
      if (params[pname] === undefined) {
        for (const alias of PARAM_ALIASES[pname] || []) {
          if (params[alias] !== undefined) {
            params[pname] = params[alias];
            delete params[alias];
            break;
          }
        }
      }
      if (params[pname] === undefined) {
        if (!isOptionalSpec(pspec)) {
          actionError = `${type}.${canonicalName}: missing required param '${pname}' (${pspec})`;
          break;
        }
        continue;
      }
      const r = checkParamType(params[pname], pspec);
      if (!r.ok) {
        actionError =
          `${type}.${canonicalName}: param '${pname}' expected ${pspec}, ` +
          `got ${JSON.stringify(params[pname])?.slice(0, 60)}`;
        break;
      }
      params[pname] = r.value;
    }
    if (actionError) {
      errors.push(actionError);
      continue;
    }

    valid.push({ renderer: action.renderer, action: canonicalName, params });
  }

  return { valid, errors };
}

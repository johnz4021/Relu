/**
 * Registry-driven mapper coverage exhaustiveness test.
 *
 * For every algorithm in the registry, this verifies that:
 *   1. mapTraceStep produces non-empty (viz | ctx) output for each step
 *   2. Every trace step has a `pseudocode_line`
 *   3. Every produced step.type appears as a `case` in mapTraceStep
 *   4. Every algorithm renderer is handled by mapTraceStep's outer switch
 *
 * Today, many Tier 1 algorithms ship without full mapper coverage. Those
 * are tracked in WIP_MAPPER_GAPS / WIP_PSEUDOCODE_GAPS below. The test:
 *
 *   - PASSES if a known-gap algorithm still has the gap (expected)
 *   - PASSES if a known-gap algorithm gets fixed (entry should be removed)
 *   - FAILS if a non-listed algorithm regresses (this is the safety net)
 *   - FAILS if a NEW algorithm is added without coverage (gates new work)
 *
 * Driving WIP_*_GAPS to empty is the Step 2 worklist for vizMapper coverage.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALGORITHMS, runRegisteredAlgorithm } from './registry.js';
import { mapTraceStep } from '../vizMapper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIZ_MAPPER_PATH = path.join(__dirname, '..', 'vizMapper.js');

// ── Whitelists & known-gap snapshots ────────────────────────────────────────

// Step types where empty mapper output is correct (pure narration / errors).
const KNOWN_NARRATION_ONLY = new Set([
  'error',
]);

// Algorithms with at least one trace step that produces 0 viz/ctx mapper output.
// Each entry needs a mapper branch added in vizMapper.js. Drive this list down.
// Keep alphabetical for diff hygiene.
const WIP_MAPPER_GAPS = new Set([
  // (none — all registry algorithms produce ≥1 mapper output per non-narration step)
]);

// Algorithms whose traces don't yet set pseudocode_line on every step.
// Drive this list down by adding pseudocode_line to each trace.push.
const WIP_PSEUDOCODE_GAPS = new Set([
  'backtracking',
  'bit_ops',
  'bitmask_dp',
  'bst_insert',
  'climbing_stairs',
  'coin_change',
  'combination_sum',
  'dfs',
  'difference_array',
  'edit_distance',
  'expand_palindrome',
  'fast_power',
  'find_anagrams',
  'frequency_count',
  'gcd_algorithm',
  'greedy_choice',
  'hash_map_grouping',
  'heap_ops',
  'house_robber',
  'interval_dp',
  'interval_merge',
  'interval_scheduling',
  'jump_game',
  'jump_game_ii',
  'k_closest_points',
  'koko_eating_speed', // no pseudocode panel (search-on-answer; bundle into the pseudocode polish PR)
  'kmp_search',
  'lcs',
  'linked_list_cycle',
  'linked_list_reversal',
  'lis',
  'lru_cache',
  'majority_vote',
  'manacher',
  'math_simulation',
  'max_subarray',
  'median_finder',
  'merge_k_sorted',
  'mergesort',
  'min_path_sum',
  'monotonic_stack',
  'palindrome_dp',
  'permutations',
  'poly_reduction',
  'prefix_sum',
  'prim',
  'queue_operations',
  'rabin_karp',
  'rotate_array',
  'rotate_matrix',
  'set_operations',
  'sieve_primes',
  'sliding_window',
  'sliding_window_max',
  'sliding_window_string',
  'spiral_matrix',
  'stack_operations',
  'stock_dp',
  'string_hash',
  'subsets',
  'task_scheduler',
  'top_k_heap',
  'tree_depth_dfs',
  'tree_dp',
  'tree_level_order',
  'tree_path',
  'trie',
  'two_pointers',
  'two_sum_hash',
  'union_find',
  'valid_palindrome',
  'valid_parentheses',
  'word_break',
  'word_search',
]);

// Step types produced by some algorithm but missing a `case` block in vizMapper.
// Drive this list down by adding case blocks. Keep alphabetical.
const WIP_MISSING_CASE_TYPES = new Set([
  // Step types still produced by some algorithm but with no case block.
  // These are all from context-renderer algos (hashing/math_patterns) whose
  // viz_actions are embedded in each step, so the mapper isn't called for
  // them at runtime. The static reconciliation still flags them; safe to
  // ignore until either (a) we add explicit cases to mapContextStep, or
  // (b) we refactor the static check to skip context-renderer step types.
  'add', 'analyze', 'cancel', 'count', 'duplicate_found',
  'evict', 'get_hit', 'get_miss', 'hash_insert',
  'jump', 'map', 'multiply', 'new_candidate',
  'put', 'reinforce', 'scan', 'square',
  'xor',
]);

// Renderers used by registry but not yet handled in mapTraceStep outer switch.
const WIP_RENDERER_GAPS = new Set([
  // (none — all renderers used by registry have a case in mapTraceStep)
]);

// Algorithms whose mapper output references nodes/edges/cells that don't exist
// in the trace's known geometry. This catches typos like step.node_id vs step.node
// where the mapper reads the wrong field and emits actions with `node: undefined`.
const WIP_ACTION_VALIDITY_GAPS = new Set([
  // (populated on first run)
]);

// Algorithms whose mapper output is ONLY the generic-fallback shape:
// a single ctxUpdate('algorithm_state', { entries: [{ key, value: description }] }).
// Generic fallback prevents test 1 from failing but produces no meaningful viz.
// Promote out of this list by adding algo-specific branches in vizMapper.js.
const WIP_GENERIC_ONLY_GAPS = new Set([
  // (populated on first run)
]);

// Algorithms where mapper-emitted renderer types do NOT match a registered
// panel id under the realistic registration scenarios (graph_main, array_main, etc.).
// This catches the production-bug class where mapper emits renderer:'graph' but
// the agent's build_example_graph registered the panel as 'graph_main', causing
// the client to buffer actions as unregistered.
const WIP_RENDERER_ROUTING_GAPS = new Set([
  // mergesort uses a multi-panel viz (array + recursion_tree). The simulation
  // here models single-panel scenarios only, so cross-renderer 'recursion_tree'
  // actions look unrouted. Multi-panel modeling is a separate test improvement;
  // this is not a real production bug.
  'mergesort',
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractCaseStrings(source) {
  const cases = new Set();
  const re = /case\s+'([a-z_]+)'\s*:/g;
  let m;
  while ((m = re.exec(source)) !== null) cases.add(m[1]);
  return cases;
}

function runAlgo(algoId) {
  const { trace, renderer } = runRegisteredAlgorithm(algoId, {});
  return { trace, renderer };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('vizMapper coverage — registry exhaustiveness', () => {
  const allAlgos = Object.keys(ALGORITHMS).filter((id) => ALGORITHMS[id].run);
  const mapperSource = fs.readFileSync(VIZ_MAPPER_PATH, 'utf8');
  const mapperCases = extractCaseStrings(mapperSource);

  describe('1. mapTraceStep produces output for every step', () => {
    for (const algoId of allAlgos) {
      it(`${algoId}: every trace step yields ≥1 viz/ctx action`, () => {
        const { trace, renderer } = runAlgo(algoId);

        // Skip if the renderer itself isn't yet wired.
        if (WIP_RENDERER_GAPS.has(renderer)) {
          expect(WIP_MAPPER_GAPS.has(algoId)).toBe(true);
          return;
        }

        const state = {};
        const empties = [];

        for (let i = 0; i < trace.length; i++) {
          const step = trace[i];
          if (KNOWN_NARRATION_ONLY.has(step.type)) continue;
          if (Array.isArray(step.viz_actions) && step.viz_actions.length > 0) continue;

          const { viz, ctx } = mapTraceStep(algoId, renderer, step, state);
          if ((viz?.length ?? 0) + (ctx?.length ?? 0) === 0) {
            empties.push({ index: i, type: step.type });
          }
        }

        const isWip = WIP_MAPPER_GAPS.has(algoId);
        if (empties.length > 0 && !isWip) {
          const summary = empties.slice(0, 5).map((e) => `step ${e.index} (${e.type})`).join(', ');
          throw new Error(
            `${algoId} (renderer=${renderer}): ${empties.length} step(s) produced 0 mapper output. ` +
            `First: ${summary}. Add a branch in mapTraceStep or whitelist the step type. ` +
            `(If this is intentionally not yet covered, add to WIP_MAPPER_GAPS — but prefer fixing.)`
          );
        }
        if (empties.length === 0 && isWip) {
          throw new Error(
            `${algoId}: now passes mapper-output check. Remove from WIP_MAPPER_GAPS.`
          );
        }
      });
    }
  });

  describe('2. Every trace step sets pseudocode_line', () => {
    for (const algoId of allAlgos) {
      it(`${algoId}: every trace step has pseudocode_line`, () => {
        const { trace } = runAlgo(algoId);
        const missing = [];
        for (let i = 0; i < trace.length; i++) {
          if (trace[i].pseudocode_line === undefined) {
            missing.push({ index: i, type: trace[i].type });
          }
        }

        const isWip = WIP_PSEUDOCODE_GAPS.has(algoId);
        if (missing.length > 0 && !isWip) {
          const summary = missing.slice(0, 5).map((m) => `step ${m.index} (${m.type})`).join(', ');
          throw new Error(
            `${algoId}: ${missing.length}/${trace.length} step(s) missing pseudocode_line. ` +
            `First: ${summary}. Set pseudocode_line on each trace.push.`
          );
        }
        if (missing.length === 0 && isWip) {
          throw new Error(
            `${algoId}: now sets pseudocode_line on every step. Remove from WIP_PSEUDOCODE_GAPS.`
          );
        }
      });
    }
  });

  describe('3. Every produced step.type has a case branch in vizMapper.js', () => {
    it('static reconciliation: producer step types ⊆ mapper case branches', () => {
      const produced = new Set();
      for (const algoId of allAlgos) {
        const { trace } = runAlgo(algoId);
        for (const step of trace) {
          if (step.type) produced.add(step.type);
        }
      }

      const missing = [];
      for (const stepType of produced) {
        if (KNOWN_NARRATION_ONLY.has(stepType)) continue;
        if (WIP_MISSING_CASE_TYPES.has(stepType)) continue;
        if (!mapperCases.has(stepType)) missing.push(stepType);
      }

      // Surface entries that are now resolved (no longer needed in the WIP list)
      const resolved = [...WIP_MISSING_CASE_TYPES].filter((t) => mapperCases.has(t));

      if (missing.length > 0) {
        throw new Error(
          `${missing.length} step type(s) produced by registry algos have no case branch ` +
          `in vizMapper.js: ${missing.sort().join(', ')}. Add a case block to the appropriate mapper.`
        );
      }
      if (resolved.length > 0) {
        throw new Error(
          `These step types now have case branches and should be removed from ` +
          `WIP_MISSING_CASE_TYPES: ${resolved.sort().join(', ')}.`
        );
      }
    });
  });

  describe('4. Every algorithm renderer is handled in mapTraceStep outer switch', () => {
    it('static reconciliation: renderer types ⊆ outer switch cases', () => {
      const renderers = new Set();
      for (const algoId of allAlgos) {
        const r = ALGORITHMS[algoId].renderer;
        if (r) renderers.add(r);
      }

      const handledRenderers = new Set();
      const outerSwitch = mapperSource.match(/switch\s*\(\s*rendererType\s*\)\s*\{([\s\S]*?)\n\s*\}/);
      if (outerSwitch) {
        const cases = outerSwitch[1].matchAll(/case\s+'([a-z_]+)'/g);
        for (const m of cases) handledRenderers.add(m[1]);
      }

      const missing = [...renderers].filter((r) => !handledRenderers.has(r) && !WIP_RENDERER_GAPS.has(r));
      const resolved = [...WIP_RENDERER_GAPS].filter((r) => handledRenderers.has(r));

      if (missing.length > 0) {
        throw new Error(
          `Renderer(s) used by registry but not handled in mapTraceStep outer switch: ${missing.join(', ')}`
        );
      }
      if (resolved.length > 0) {
        throw new Error(
          `These renderers now have case branches and should be removed from WIP_RENDERER_GAPS: ${resolved.join(', ')}.`
        );
      }
    });
  });

  // ── 5. Action validity ─────────────────────────────────────────────────────
  // For each algorithm, every emitted action that references a node/edge/cell
  // must reference one that actually exists in the trace's known geometry.
  // Catches typos like reading step.node_id when the producer set step.node.
  describe('5. Emitted actions reference valid trace geometry', () => {
    for (const algoId of allAlgos) {
      it(`${algoId}: emitted actions reference known nodes/cells`, () => {
        const { trace, renderer } = runAlgo(algoId);
        const state = {};

        // Build the universe of valid identifiers from the trace
        const knownNodeIds = new Set();
        const knownArrayLength = { value: 0 };
        const knownTableDims = { rows: 0, cols: 0 };
        const knownStringLength = { value: 0 };
        for (const step of trace) {
          if (Array.isArray(step.nodes)) {
            for (const n of step.nodes) if (n.id !== undefined) knownNodeIds.add(String(n.id));
          }
          if (step.tree?.nodes) {
            for (const n of step.tree.nodes) if (n.id !== undefined) knownNodeIds.add(String(n.id));
          }
          if (step.graph?.nodes) {
            for (const n of step.graph.nodes) if (n.id !== undefined) knownNodeIds.add(String(n.id));
          }
          if (Array.isArray(step.array)) knownArrayLength.value = Math.max(knownArrayLength.value, step.array.length);
          if (step.rows !== undefined) knownTableDims.rows = Math.max(knownTableDims.rows, step.rows);
          if (step.cols !== undefined) knownTableDims.cols = Math.max(knownTableDims.cols, step.cols);
          if (step.size !== undefined) knownTableDims.cols = Math.max(knownTableDims.cols, step.size);
          if (typeof step.s === 'string') knownStringLength.value = Math.max(knownStringLength.value, step.s.length);
          if (typeof step.transformed === 'string') knownStringLength.value = Math.max(knownStringLength.value, step.transformed.length);
        }

        const violations = [];
        for (let i = 0; i < trace.length; i++) {
          const step = trace[i];
          if (KNOWN_NARRATION_ONLY.has(step.type)) continue;
          if (Array.isArray(step.viz_actions) && step.viz_actions.length > 0) continue;

          const { viz } = mapTraceStep(algoId, renderer, step, state);
          for (const act of viz || []) {
            const p = act.params || {};
            const checks = [];
            if (p.node !== undefined) checks.push(['node', String(p.node)]);
            if (p.id !== undefined) checks.push(['id', String(p.id)]);
            if (p.from !== undefined && p.from !== '') checks.push(['from', String(p.from)]);
            if (p.to !== undefined) checks.push(['to', String(p.to)]);

            for (const [field, value] of checks) {
              if (value === 'undefined' || value === '') {
                violations.push(`step ${i} (${step.type}): ${act.action} has ${field}=${JSON.stringify(value)}`);
                continue;
              }
              // Only enforce graph-id membership for graph/tree renderers
              if ((renderer === 'graph' || renderer === 'tree') && knownNodeIds.size > 0 && !knownNodeIds.has(value)) {
                violations.push(`step ${i} (${step.type}): ${act.action} references ${field}=${value} not in trace nodes`);
              }
            }
            // Array bounds
            if (renderer === 'array' && Array.isArray(p.indices) && knownArrayLength.value > 0) {
              for (const idx of p.indices) {
                if (idx < 0 || idx >= knownArrayLength.value) {
                  violations.push(`step ${i} (${step.type}): ${act.action} has out-of-bounds index ${idx} (array length ${knownArrayLength.value})`);
                }
              }
            }
            // Table bounds
            if (renderer === 'table' && p.row !== undefined && knownTableDims.rows > 0) {
              if (p.row < 0 || p.row >= knownTableDims.rows) {
                violations.push(`step ${i} (${step.type}): ${act.action} has out-of-bounds row ${p.row} (rows ${knownTableDims.rows})`);
              }
            }
          }
        }

        const isWip = WIP_ACTION_VALIDITY_GAPS.has(algoId);
        if (violations.length > 0 && !isWip) {
          throw new Error(
            `${algoId}: ${violations.length} action(s) reference invalid geometry. ` +
            `First: ${violations.slice(0, 3).join(' | ')}. ` +
            `Likely cause: mapper reads a step field that the producer doesn't set ` +
            `(check field-name match between trace.push and mapTraceStep).`
          );
        }
        if (violations.length === 0 && isWip) {
          throw new Error(`${algoId}: no longer has validity violations. Remove from WIP_ACTION_VALIDITY_GAPS.`);
        }
      });
    }
  });

  // ── 6. Generic-fallback detection ──────────────────────────────────────────
  // Catches algorithms where mapper output is JUST a description-only ctxUpdate
  // to 'algorithm_state' — the test 1 silencer that emits no meaningful viz.
  describe('6. Mapper output is more than the generic fallback', () => {
    function isGenericFallbackOnly(viz, ctx) {
      if ((viz?.length ?? 0) > 0) return false;
      if ((ctx?.length ?? 0) === 0) return false;
      return ctx.every((act) => {
        if (act.renderer !== 'context') return false;
        if (act.action !== 'update') return false;
        if (act.params?.panel_id !== 'algorithm_state') return false;
        return true;
      });
    }

    for (const algoId of allAlgos) {
      it(`${algoId}: produces specialized output, not just generic fallback`, () => {
        const { trace, renderer } = runAlgo(algoId);
        const state = {};

        let totalNonNarrationSteps = 0;
        let genericOnlySteps = 0;

        for (const step of trace) {
          if (KNOWN_NARRATION_ONLY.has(step.type)) continue;
          if (Array.isArray(step.viz_actions) && step.viz_actions.length > 0) continue;
          totalNonNarrationSteps++;

          const { viz, ctx } = mapTraceStep(algoId, renderer, step, state);
          if (isGenericFallbackOnly(viz, ctx)) genericOnlySteps++;
        }

        // An algorithm "fails" if MORE THAN HALF its steps emit only generic fallback
        const isAllGeneric = totalNonNarrationSteps > 0 && genericOnlySteps / totalNonNarrationSteps > 0.5;
        const isWip = WIP_GENERIC_ONLY_GAPS.has(algoId);

        if (isAllGeneric && !isWip) {
          throw new Error(
            `${algoId}: ${genericOnlySteps}/${totalNonNarrationSteps} steps emit ONLY generic ` +
            `fallback (ctxUpdate('algorithm_state', description)). Add specialized branches in ` +
            `mapTraceStep — the generic fallback exists to silence test 1, not to ship.`
          );
        }
        if (!isAllGeneric && isWip) {
          throw new Error(`${algoId}: now produces specialized output. Remove from WIP_GENERIC_ONLY_GAPS.`);
        }
      });
    }
  });

  // ── 7. Renderer routing simulation ─────────────────────────────────────────
  // Replicates agentLib.js emit_segment renderer-rewrite logic. For each
  // algorithm, simulates the realistic build_example_graph scenario where the
  // panel is registered under a custom id (e.g. 'graph_main' for grids), runs
  // the mapper, applies the rewrite, and asserts every emitted action targets
  // a panel that would actually be registered. Catches the production-bug class
  // where mapper emits renderer:'graph' but the panel is 'graph_main'.
  describe('7. Mapper actions route to a registered panel after agentLib rewrite', () => {
    // Realistic panel-id scenarios per renderer type. The agent's build_example_graph
    // typically uses '<renderer>_main' for custom-named panels.
    const PANEL_SCENARIOS = {
      graph: ['graph', 'graph_main'],
      array: ['array', 'array_main'],
      table: ['table', 'table_main'],
      tree: ['tree', 'tree_main'],
      linked: ['linked', 'linked_main'],
      interval: ['interval', 'interval_main'],
      string: ['string', 'string_main'],
      context: ['algorithm_state'],  // context-renderer algos always use this id
    };

    function simulateRewrite(actions, rendererType, registeredPanelId) {
      // Replicates agentLib.js:565-571 — only rewrite if a custom panel id differs
      // from the renderer type.
      if (registeredPanelId && rendererType && registeredPanelId !== rendererType) {
        return actions.map((act) =>
          act.renderer === rendererType ? { ...act, renderer: registeredPanelId } : act
        );
      }
      return actions;
    }

    for (const algoId of allAlgos) {
      it(`${algoId}: actions route to a registered panel`, () => {
        const { trace, renderer } = runAlgo(algoId);
        const scenarios = PANEL_SCENARIOS[renderer];
        if (!scenarios) {
          throw new Error(`No panel scenarios defined for renderer '${renderer}' (algo ${algoId})`);
        }

        const violations = [];
        for (const panelId of scenarios) {
          // Registered panels for this scenario. Includes the renderer panel + standard
          // context panel ids that any algorithm could target. Multi-panel algos
          // declare `panels` on their registry entry — agentLib's auto-setup
          // registers every declared id, so the simulation must too.
          const registered = new Set([
            panelId,
            ...(ALGORITHMS[algoId].panels || []).map((p) => p.id),
            // Context panels are registered under their declared id; assume any context
            // action's panel_id is registered (covered by getDefaultContextPanels).
          ]);

          const state = {};
          for (let i = 0; i < trace.length; i++) {
            const step = trace[i];
            if (KNOWN_NARRATION_ONLY.has(step.type)) continue;
            if (Array.isArray(step.viz_actions) && step.viz_actions.length > 0) continue;

            const { viz } = mapTraceStep(algoId, renderer, step, state);
            const rewritten = simulateRewrite(viz || [], renderer, panelId);
            for (const act of rewritten) {
              if (act.renderer === 'context') continue;  // context routing tested elsewhere
              if (!registered.has(act.renderer)) {
                violations.push(
                  `[panel=${panelId}] step ${i} (${step.type}): ` +
                  `${act.action} routed to '${act.renderer}' (not registered)`
                );
              }
            }
          }
        }

        const isWip = WIP_RENDERER_ROUTING_GAPS.has(algoId);
        if (violations.length > 0 && !isWip) {
          throw new Error(
            `${algoId}: ${violations.length} action(s) target unregistered panel after rewrite. ` +
            `First: ${violations.slice(0, 3).join(' | ')}. ` +
            `Fix: ensure agentLib's run_algorithm graph branch sets _rendererPanelId to ` +
            `the custom panel id when one is registered (e.g. 'graph_main').`
          );
        }
        if (violations.length === 0 && isWip) {
          throw new Error(`${algoId}: now routes correctly. Remove from WIP_RENDERER_ROUTING_GAPS.`);
        }
      });
    }
  });
});

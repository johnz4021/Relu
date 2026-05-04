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
  'put', 'reinforce', 'scan', 'square', 'store',
  'xor',
]);

// Renderers used by registry but not yet handled in mapTraceStep outer switch.
const WIP_RENDERER_GAPS = new Set([
  // (none — all renderers used by registry have a case in mapTraceStep)
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
});

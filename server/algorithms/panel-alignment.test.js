/**
 * Context-panel alignment: registered ⟺ fed.
 *
 * The panel registry freezes at run_algorithm time (PIPELINE §8). Two failure
 * modes follow, and nothing else in the suite catches either:
 *
 *   DEAD  — a panel is in getDefaultContextPanels() but the mapper/trace never
 *           feeds it. The student stares at "No entries yet" for the whole
 *           lesson (the QA ISSUE-001 class). Fix by FEEDING it (add a mapper
 *           branch) when the panel is load-bearing, or REMOVING it when it
 *           isn't. Either way: registered ⇒ fed.
 *   DROP  — the mapper (or an embedded viz_action) writes to a panel_id that is
 *           NOT registered. The frontend silently drops the update. Fix by
 *           registering the panel or removing the write. fed ⇒ registered.
 *
 * Plus a title lint: panel titles must use student-facing language, not name
 * the algorithm (the title shows before the student earns the name in
 * companion mode). `pseudocode` panels are governed by the dedicated
 * pseudocode test (mapper.coverage.test.js #2), so they're excluded here.
 *
 * Burn-down contract (same as WIP_*_GAPS in mapper.coverage.test.js):
 *   - PASSES if a snapshotted gap still exists (expected, tracked)
 *   - FAILS if a NEW gap appears (regression / new algo without alignment)
 *   - FAILS if a snapshotted gap is fixed (update the snapshot — visible proof)
 *
 * Drive WIP_DEAD_PANEL_GAPS to empty: that is the panel-doctrine worklist.
 */
import { describe, it, expect } from 'vitest';
import { ALGORITHMS, runRegisteredAlgorithm } from './registry.js';
import { mapTraceStep } from '../vizMapper.js';
import { getDefaultContextPanels } from '../contextPanelDefaults.js';

const CONTEXT_TYPES = new Set(['key_value', 'collection', 'log', 'expression', 'pseudocode']);

// `pseudocode` feeding is governed by mapper.coverage.test.js #2 (pseudocode_line);
// excluding it here avoids double-counting the pseudocode burn-down.
const EXCLUDE = new Set(['pseudocode']);

// Algorithm-name tokens that must not appear in a student-facing panel title.
// (The generic pseudocode panel title "Algorithm" is fine — it names no method.)
const ALGO_NAME_TOKENS = [
  'BFS', 'DFS', 'Dijkstra', 'Bellman', 'Floyd', 'Warshall', 'Kruskal', 'Prim',
  'Kadane', 'Huffman', 'KMP', 'Tarjan', 'Rabin', 'Karp', 'Manacher', 'Kahn',
  'Boyer', 'Moore',
];

// ── Known-gap snapshots (drive to empty) ─────────────────────────────────────

// DEAD: registered context panels the trace never feeds. Map algo -> sorted ids.
// Split by intended fix when burning down:
//   FEED (load-bearing, add a mapper branch): lis/dp_state (tails array),
//   floyd_warshall/via_node, tarjan_bridges/bridges (the output!),
//   sliding_window_max/deque_state (the mechanism), validate_bst/valid_range,
//   lca_tree/search_state, stock_dp/state_machine, house_robber/dp_values.
//   REMOVE (not load-bearing): spiral_matrix/boundaries, rotate_matrix/phase,
//   dijkstra_k_stops/stop_info, bipartite_check/decisions, tarjan_bridges/dfs_state.
const WIP_DEAD_PANEL_GAPS = {
  bipartite_check: ['decisions'],
  dijkstra_k_stops: ['stop_info'],
  floyd_warshall: ['via_node'],
  house_robber: ['dp_values'],
  lca_tree: ['search_state'],
  lis: ['dp_state'],
  rotate_matrix: ['phase'],
  sliding_window_max: ['deque_state'],
  spiral_matrix: ['boundaries'],
  stock_dp: ['state_machine'],
  tarjan_bridges: ['bridges', 'dfs_state'],
  validate_bst: ['valid_range'],
};

// DROP: mapper/embedded writes to unregistered panels. Should stay empty.
const WIP_DROPPED_WRITE_GAPS = {};

// ── Helpers ──────────────────────────────────────────────────────────────────

function registeredContextIds(algoId) {
  return (getDefaultContextPanels(algoId) || [])
    .filter((p) => CONTEXT_TYPES.has(p.type) && !EXCLUDE.has(p.id))
    .map((p) => p.id);
}

// Union of every context panel_id fed by either an embedded viz_action or the
// mapper's own output, across the whole default trace.
function fedContextIds(algoId) {
  const { trace, renderer } = runRegisteredAlgorithm(algoId, {});
  const fed = new Set();
  const state = {};
  for (const step of trace) {
    for (const a of step.viz_actions || []) {
      if (a.renderer === 'context' && a.params?.panel_id) fed.add(a.params.panel_id);
    }
    let out;
    try { out = mapTraceStep(algoId, renderer, step, state); } catch { out = { ctx: [] }; }
    for (const a of out.ctx || []) {
      if (a.renderer === 'context' && a.params?.panel_id) fed.add(a.params.panel_id);
    }
  }
  for (const id of EXCLUDE) fed.delete(id);
  return fed;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('context panel alignment — registered ⟺ fed', () => {
  const algos = Object.keys(ALGORITHMS).filter((id) => ALGORITHMS[id].run);

  describe('1. No DEAD panels (registered ⇒ fed)', () => {
    for (const algoId of algos) {
      it(`${algoId}: every registered context panel is fed by the trace`, () => {
        const reg = registeredContextIds(algoId);
        const fed = fedContextIds(algoId);
        const dead = reg.filter((id) => !fed.has(id)).sort();
        const snap = (WIP_DEAD_PANEL_GAPS[algoId] || []).slice().sort();

        const newGaps = dead.filter((id) => !snap.includes(id));
        const fixed = snap.filter((id) => !dead.includes(id));

        if (newGaps.length > 0) {
          throw new Error(
            `${algoId}: registered panel(s) never fed → "No entries yet" all lesson: ` +
            `${newGaps.join(', ')}. FEED it (add a mapTraceStep branch) if load-bearing, ` +
            `else REMOVE it from contextPanelDefaults.js. (Or snapshot in WIP_DEAD_PANEL_GAPS.)`
          );
        }
        if (fixed.length > 0) {
          throw new Error(
            `${algoId}: dead panel(s) now fed or removed: ${fixed.join(', ')}. ` +
            `Update WIP_DEAD_PANEL_GAPS — burn-down progress should be visible.`
          );
        }
      });
    }
  });

  describe('2. No DROPPED writes (fed ⇒ registered)', () => {
    for (const algoId of algos) {
      it(`${algoId}: every fed panel_id is registered`, () => {
        const reg = new Set(registeredContextIds(algoId));
        const fed = fedContextIds(algoId);
        const dropped = [...fed].filter((id) => !reg.has(id)).sort();
        const snap = (WIP_DROPPED_WRITE_GAPS[algoId] || []).slice().sort();

        const newGaps = dropped.filter((id) => !snap.includes(id));
        const fixed = snap.filter((id) => !dropped.includes(id));

        if (newGaps.length > 0) {
          throw new Error(
            `${algoId}: write(s) to unregistered panel(s) → silently dropped by frontend: ` +
            `${newGaps.join(', ')}. Register the panel in contextPanelDefaults.js or remove the write.`
          );
        }
        if (fixed.length > 0) {
          throw new Error(
            `${algoId}: dropped write(s) resolved: ${fixed.join(', ')}. Update WIP_DROPPED_WRITE_GAPS.`
          );
        }
      });
    }
  });

  describe('3. Panel titles use student-facing language (no algorithm names)', () => {
    it('no registered panel title names an algorithm', () => {
      const leaks = [];
      for (const algoId of algos) {
        for (const p of getDefaultContextPanels(algoId) || []) {
          if (/algorithm/i.test(p.title)) continue; // generic pseudocode title
          const hit = ALGO_NAME_TOKENS.find((t) => new RegExp(`\\b${t}\\b`, 'i').test(p.title));
          if (hit) leaks.push(`${algoId}: "${p.title}" (id=${p.id}) names "${hit}"`);
        }
      }
      if (leaks.length > 0) {
        throw new Error(
          `${leaks.length} panel title(s) name an algorithm — use student-facing language ` +
          `(the title shows before the name is earned in companion mode):\n  ${leaks.join('\n  ')}`
        );
      }
    });
  });
});

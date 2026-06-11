// Single source of truth for which Claude model serves each pipeline role.
// Swap models HERE (one line per role) — never inline a model id at a call site.
//
// Behavioral roles (teaching loop, solver) carry heavily tuned prompts whose
// baselines live in the eval suites — re-run them when changing these:
//   RELU_EVAL=1 RELU_EVAL_MODEL=<candidate> npx vitest run server/vizOnTheFly.eval.test.js
//   RELU_EVAL=1 npx vitest run server/companionMode.eval.test.js
// Gated roles (author, graph builder) sit behind deterministic validation
// (sandbox + correctness gate, graph pipeline) and are lower-risk to upgrade.

// The student-facing tutor loop (guidedAgent.js). Eval-pinned: flipped to opus-4-8
// on 2026-06-11 after a clean 16/16 vizOnTheFly run (RELU_EVAL_MODEL=claude-opus-4-8,
// aggregate ≥95% + all semantic checks).
export const TEACHING_MODEL = 'claude-opus-4-8';

// Pre-teaching deep solve with extended thinking (solver.js). No eval suite yet
// (TODOS: "LeetCode solver eval suite") — spot-check on a hard problem after swaps.
export const SOLVER_MODEL = 'claude-opus-4-8';

// LC-restricted solve (solveLeetcodeProblem) — known algorithm key, lighter task.
export const SOLVER_LC_MODEL = 'claude-sonnet-4-6';

// Tier 2 trace-generator authoring (authorAgent.js). Output is sandbox-executed
// and correctness-gated against Example 1, so upgrades are cheap to verify.
export const AUTHOR_MODEL = 'claude-sonnet-4-6';

// Example-graph construction for algorithm_execution problems (graphBuilder.js).
export const GRAPH_BUILDER_MODEL = 'claude-sonnet-4-6';

// Design-mode viz planning (rendererAdvisor.js — wired in viz-ladder Phase 3).
export const RENDERER_ADVISOR_MODEL = 'claude-sonnet-4-6';

// LeetCode problem extraction/classification (leetcodeAgent.js). Latency-sensitive.
export const EXTRACTION_MODEL = 'claude-haiku-4-5-20251001';

// Cheapest possible ping for BYOK key validation (index.js).
export const KEY_VALIDATION_MODEL = 'claude-haiku-4-5-20251001';

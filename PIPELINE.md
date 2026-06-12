# ReLU — Problem Solving & Visualization Pipeline

This document covers the full server-side pipeline: from a student pasting a problem to the final visual trace and narration they receive. Covers agent orchestration, tier system, renderer selection, trace generation, and teaching loop mechanics.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Session Lifecycle](#2-session-lifecycle)
3. [Two Entry Modes](#3-two-entry-modes)
4. [Trace Mode vs Design Mode — The Core Split](#4-trace-mode-vs-design-mode--the-core-split)
5. [Problem Solving Pipeline (Step-by-Step)](#5-problem-solving-pipeline-step-by-step)
   - [Stage 0: Solver (Pre-teaching Analysis)](#stage-0-solver-pre-teaching-analysis)
   - [Stage 1: Visualization Planning](#stage-1-visualization-planning)
   - [Stage 2: Trace Generation — Tier 1 vs Tier 2](#stage-2-trace-generation--tier-1-vs-tier-2)
   - [Stage 3: Renderer Selection](#stage-3-renderer-selection)
   - [Stage 4: Trace → Viz Actions (vizMapper)](#stage-4-trace--viz-actions-vizmapper)
   - [Stage 5: Teaching Loop (LLM-driven)](#stage-5-teaching-loop-llm-driven)
6. [Reasoning Modes](#6-reasoning-modes)
7. [Algorithm Registry](#7-algorithm-registry)
8. [Context Panels](#8-context-panels)
9. [Interrupt Handling](#9-interrupt-handling)
10. [LeetCode Mode Specifics](#10-leetcode-mode-specifics)
11. [Data Flow Diagram](#11-data-flow-diagram)

---

## 1. System Architecture Overview

```
Client (WebSocket)
       │
       ▼
  index.js (WS gateway + session manager)
       │
  ┌────┴────────────────────────────────────────┐
  │                                             │
  ▼
guidedAgent.js
(Socratic — student-driven)
       │
       ▼
   solver.js    graphBuilder.js
  (classify)   (build example graph)
       │
       ▼
  algorithms/registry.js
  ┌────┴──────────────────────────────────────┐
  │ Tier 1: hand-written run() (103 algorithms) │
  │ Tier 2: authorAgent.js (unknown patterns)  │
  └────────────────────────────────────────────┘
       │
       ▼
   vizMapper.js
  (trace step → viz_actions)
       │
       ▼
  Client (segment_start + audio + viz_actions)
```

---

## 2. Session Lifecycle

**File:** `server/index.js`

Sessions are WebSocket-based. Each connected client gets a session object:

```
session = {
  id, ws, userId,
  active: bool,
  mode: 'direct' | 'guided' | 'leetcode',
  runGeneration: int,          // incremented on every new session start
  endSessionFlag: bool,        // set to break out of agent loops
  pauseFlag: bool,
  skipFlag: bool,
  guidedResponse: object,      // pending student MC/text response
  guidedResponseResolver: fn,  // promise resolver awaiting student response
  followUpResolver: fn,        // promise resolver awaiting post-lesson follow-up
  anthropicClient: Anthropic,  // default or BYOK client
  currentGraph, currentTrace,  // live algorithm state
  _emittedTraceSteps: [],       // trace indices already played
  _panels: {},                  // panel registry (renderer + context)
  _savedGraphState: {},         // snapshot for interrupt restoration
}
```

**Reconnect grace period:** 15 minutes. If a WS disconnects mid-lesson, the session stays alive and the new WS is swapped in on reconnect.

**Session gate:** 30 free sessions per user. Beyond that, requires a BYOK Anthropic key stored encrypted in Supabase.

---

## 3. Two Entry Modes

| WS message | Handler | Notes |
|---|---|---|
| `start_leetcode` | `leetcodeAgent.parseLeetcodeProblem()` → pre-run trace → `guidedAgent.startGuidedSession()` | LeetCode entry |
| `resume_conversation` | `guidedAgent.resumeGuidedSession()` | Restores saved agent state from DB |

Both modes drive the same teaching loop using the same tool set.

---

## 4. Trace Mode vs Design Mode — The Core Split

The single most important architectural distinction in the pipeline: whether the problem has **an algorithm to execute and trace**, or whether it's a **design/proof/analysis problem** where no concrete execution trace exists.

The solver stamps every problem as one of these two categories via `reasoning_mode`.

```
reasoning_mode = 'algorithm_execution'
  → Trace Mode
  → A specific algorithm runs on specific input data
  → A step-by-step trace array is produced
  → The agent narrates by indexing into the trace

reasoning_mode ∈ { greedy_design, dp_design, dc_design, modeling, runtime }
  → Design Mode
  → No algorithm is executed (or execution is optional/secondary)
  → No trace array
  → The agent builds the visualization incrementally via manual viz_actions
```

### Trace Mode (`algorithm_execution`)

The full trace pipeline fires:

1. `build_example_graph` constructs the concrete input (nodes, edges, test data)
2. `run_algorithm` executes the algorithm → returns a `trace[]` array
3. `emit_segment(trace_step_indices: [3, 4])` — agent picks which steps to narrate
4. `vizMapper.mapTraceStep()` converts each trace step to the exact viz_actions + context panel updates automatically
5. The agent does **not** write viz_actions by hand — the mapper handles it

The trace is the ground truth. Every visualization event is derived from it deterministically.

### Design Mode (greedy_design / dp_design / dc_design / modeling / runtime)

No trace. The agent constructs the visualization entirely through **manual viz_actions**:

- Context panels (formulation, recurrence, proof skeleton, etc.) are **auto-configured server-side** the moment `run_solver` returns — the agent doesn't create them
- The agent fills panels incrementally as the student works through the problem: `emit_segment({ viz_actions: [{ renderer: "context", action: "update", params: { panel_id: "formulation", lines: [...] } }] })`
- A renderer (graph, table, interval, recursion_tree) may or may not be created — the agent decides when and whether one adds value
- If a renderer is created, the agent must highlight elements manually via `viz_actions` in each `emit_segment` (e.g. `highlight_node`, `highlight_edge`, `fill_cell`)
- `run_algorithm` is only called if the student explicitly asks to see the algorithm execute — it's not part of the standard flow

### What this means in practice

| | Trace Mode | Design Mode |
|---|---|---|
| Viz planner | `build_example_graph` | Agent decides |
| Trace array | Always produced | Never produced (or optional) |
| `run_algorithm` call | Required | Forbidden unless student asks |
| viz_actions source | Auto-generated by `vizMapper` from trace indices | Hand-constructed by agent in each `emit_segment` |
| Context panels | Auto-configured from `getDefaultContextPanels(algorithm)` | Auto-configured from `getModeDefaultPanels(reasoning_mode)` |
| Renderer | Always created (matches algorithm's registered renderer) | Created if agent judges one adds value |
| Student interaction | Guided toward identifying the algorithm, then watch execution | Student-produces the core artifact (rule, recurrence, formulation) |

### The `run_algorithm` guardrail

Both agent system prompts enforce this explicitly:

> "In non-execution modes (modeling, greedy_design, dp_design, dc_design, runtime), do NOT call run_algorithm unless the student explicitly asks."

And the inverse:

> "Never make up an algorithm trace. Always use run_algorithm."

This ensures design-mode teaching stays focused on the design task (writing the recurrence, arguing the exchange argument, building the LP) rather than silently running an execution and reading off answers.

---

## 5. Problem Solving Pipeline (Step-by-Step)

### Stage 0: Solver (Pre-teaching Analysis)

**File:** `server/solver.js`  
**Model:** `SOLVER_MODEL` (see `server/models.js` — the single source of truth for per-role models) with `thinking: { type: 'adaptive' }` (extended thinking)  
**Triggered by:** `run_solver` tool call inside the agent loop  
**Timeout:** 5 minutes

The solver runs _before_ any teaching begins. It gives the tutoring agent a verified north star: the correct answer, the right approach, and how to classify the teaching mode.

### When the solver is (and isn't) called

The solver is only called for **concrete problems** — homework questions with specific input data, constraints, or things to compute. It is **not** called for concept/explanation requests.

Both agents do a request-type check before anything else:

```
Student input
    │
    ├── CONCEPT REQUEST ("Explain BFS", "How does Dijkstra work",
    │   "What is the Master Theorem", "Explain max flow min cut")
    │       │
    │       ├── A1: Specific algorithm concept
    │       │       → call run_algorithm directly (no solver)
    │       │       → use default example input, trace the execution
    │       │
    │       ├── A2: Theorem / structural property
    │       │       → build minimal viz manually (no solver, no run_algorithm)
    │       │       → highlight the property with viz_actions
    │       │
    │       └── A3: Ambiguous paradigm ("Explain DP", "Explain divide and conquer")
    │               → ask one clarifying question, then route to A1 or A2
    │
    └── CONCRETE PROBLEM ("Run Dijkstra on this graph...",
        "Write an LP for...", "Find the MST of...", "Prove this greedy works")
                │
                └── call run_solver → get reasoning_mode + solution
                    then follow the mode-specific teaching flow
```

For A1 concept requests, `target_algorithm` comes from the agent's own reading of the student's question — not from the solver. The agent calls `run_algorithm('dijkstra')` directly with no prior classification step.

### Classification criteria

The solver decides `reasoning_mode` based on what the problem is actually asking the student to **do**:

| `reasoning_mode` | Problem is asking the student to... | Examples |
|---|---|---|
| `algorithm_execution` | Run or apply a specific known algorithm on given input data | "Run Dijkstra on this graph", "Find the MST", "Compute max flow from S to T" |
| `greedy_design` | Design a greedy rule and prove correctness via exchange argument | "Design a greedy algorithm for...", "Prove the greedy choice is optimal", "Give a greedy rule and justify it" |
| `dp_design` | Define a DP subproblem, write the recurrence, prove correctness | "Design a DP algorithm for...", "Give a DP recurrence for...", "What does dp[i][j] represent?" |
| `dc_design` | Design a divide-and-conquer algorithm and solve its recurrence | "Give a D&C algorithm for...", "Solve T(n) = 2T(n/2) + n", "Design an O(n log n) algorithm using recursion" |
| `modeling` | Write an LP formulation, reduce one problem to another, or apply duality | "Write an LP for...", "Reduce X to Y", "Take the dual of...", "Show X is NP-complete by reducing from..." |
| `runtime` | Analyze time complexity only — no algorithm to run or design | "What is the runtime of...", "Solve this recurrence", "Give a tight upper bound for..." |

**Scope boundary rules** (enforced in the system prompt):
- LP or formulation → `modeling`, even if a graph algorithm is involved underneath
- "Prove greedy correctness" → `greedy_design`, not `algorithm_execution`
- "Design a DP" → `dp_design`, even if a known DP algorithm (knapsack) would solve it
- NP-completeness reduction → `modeling`
- Pure runtime analysis → `runtime`, never `algorithm_execution`

### `is_in_scope` and `target_algorithm`

`is_in_scope: true` requires both conditions:
1. `reasoning_mode === 'algorithm_execution'`
2. `target_algorithm` maps to a known key in the algorithm registry

This is what gates whether `run_algorithm` can legally be called. If either condition fails, the agent is in design mode and must construct viz manually.

`closest_algorithm` is returned for non-execution modes — it's the registry algorithm most related to the problem (e.g. `dijkstra` for a shortest-path LP formulation). The agent uses it for teaching context (renderer hints, etc.) but does **not** call `run_algorithm` on it unless the student explicitly asks.

### `paradigmShift` behavior

When `paradigmShift: true`, the solver also returns `obviousApproach` — the approach most students would try first. The agent is explicitly instructed:

> "PARADIGM SHIFT ALERT — the obvious approach (X) won't achieve the target complexity. Explain the non-obvious insight clearly — don't follow the obvious path."

In practice this means the agent will acknowledge the naive approach, explain why it fails (usually a complexity argument), and then reveal the non-obvious technique. This is injected directly into the solver context block appended to the system prompt, not something the agent infers on its own.

### Output fields (`submit_solution` tool)

| Field | Description |
|---|---|
| `reasoning_mode` | Teaching mode — drives everything downstream |
| `target_algorithm` | Algorithm registry key (e.g. `dijkstra`) — `algorithm_execution` only |
| `closest_algorithm` | For design modes, the most related algorithm (teaching context only) |
| `approach` | Short name for the solution approach (e.g. "XOR bit encoding") |
| `complexity` | Time + space complexity |
| `keyInsight` | Single most important insight for the student |
| `paradigmShift` | `true` if naive approach fails — triggers explicit misdirection warning |
| `obviousApproach` | What students typically try first (only meaningful when `paradigmShift: true`) |
| `confidence` | `high` / `medium` / `low` — reflects solver's certainty |
| `selfCheckPassed` | Whether solution was verified against sample cases |
| `internal_model_contract` | State definition, transition rules, cost model — internal only, never shown to student |
| `is_in_scope` | Whether a concrete supported algorithm can be executed |
| `problem_summary` | One-sentence description of what the problem asks |
| `critical_concepts` | 1–3 concepts the student must understand to solve this |

**Batch solver:** `solveProblems()` handles multi-part problems (e.g. "(a)...(b)...(c)") in one API call via `submit_solutions` tool. Each part gets its own `reasoning_mode` + `target_algorithm`. The agent selects parts via `send_options(multiSelect: true)` before calling the batch solver.

### How the solver result reaches the agent

The solver result is injected into the agent's system prompt as a hidden `SOLVER CONTEXT` block immediately after `run_solver` returns:

```
===== SOLVER CONTEXT (INTERNAL — do not reveal to student) =====
CLASSIFICATION: DP_DESIGN | ALGORITHM: knapsack
OPTIMAL APPROACH: Bottom-up DP with 2D table
COMPLEXITY: O(n * W) time, O(n * W) space
KEY INSIGHT: Subproblem dp[i][w] = max value using first i items with capacity w
SOLUTION: [full solution text]
[PARADIGM SHIFT ALERT if applicable]
RULES:
- Explain using THIS verified approach
- Never mention you pre-solved it
- Explain directly and completely
=====
```

The agent then teaches toward this verified answer without revealing the context block to the student.

---

### Stage 1: Visualization Planning

Two different planners depending on `reasoning_mode`:

#### For `algorithm_execution` mode: `graphBuilder.js`

**Tool name:** `build_example_graph`  
**Model:** single Claude API call  

Constructs a concrete example graph for the problem. Returns:

```
{
  panels: [{ id, renderer, title, graph: { nodes, edges, positions, directed } }],
  algorithm_runs: [{ algorithm, graph_id, source, sink }],
  context_panels: [...],
  teaching_notes: "...",
  graph_variants: {
    "time_graph": { title, graph: {...}, algorithm_runs: [...] }
  }
}
```

**Graph variants** are pre-built for transformation problems (e.g. a road network → time-layered graph). The agent swaps between them via `create_graph({ variant_id: "time_graph" })` at the right narrative moment.

**Panel IDs:**
- Single graph: `graph_main`
- Two graphs (comparison): `graph_left`, `graph_right`
- Non-graph: `array_main`, `table_main`, etc.

#### For non-execution modes

Context panels are **auto-configured** server-side via `getModeDefaultPanels(reasoning_mode)` at the moment `run_solver` returns — the agent does NOT need to call `create_visualization` for them. The agent decides whether to add a renderer (graph, recursion_tree, etc.) based on the problem.

| Mode | Auto-configured panels |
|---|---|
| `greedy_design` | `greedy_rule` (expression), `proof_skeleton` (expression) |
| `dp_design` | `dp_definition` (expression), `recurrence` (expression) |
| `modeling` | `formulation` (expression), `algorithm_state` (key_value) |
| `dc_design` | `dc_structure` (expression), `recurrence` (expression) |
| `runtime` | `runtime_analysis` (expression) |

---

### Stage 2: Trace Generation — Tier 1 vs Tier 2

**File:** `server/algorithms/registry.js`

Every algorithm in the registry has:
```js
{
  run: fn | null,      // null = Tier 2 only
  renderer: string,    // which renderer to use
  category: string,
  defaultInput: {},    // used when no input is provided
  capabilities: {},    // max_nodes, max_array_length, etc.
  panels: [],          // OPTIONAL multi-panel declaration: [{id, renderer, title}].
                       // run_algorithm mounts every declared panel; the mapper must
                       // target these panel ids EXPLICITLY (bare renderer-type targets
                       // are ambiguous with two panels of one type and get stripped).
                       // pipeline.coverage's multi-panel gate asserts each declared
                       // panel receives a structural action. (median_finder, merge_k_sorted)
  tier: 2,            // explicitly marked for Tier 2-only
}
```

**Curating `defaultInput`.** Tier 1 lessons teach on `defaultInput` (not the
problem's parsed Example 1), so the default must exercise the algorithm's
*defining* behavior — misses before the hit (two_sum_hash), backtracking
(word_search), a detected conflict (bipartite_check, valid_sudoku), cascading
merges (interval_merge), a skewed distribution (huffman). Don't copy LC
Example 1 verbatim without checking: LeetCode picks Example 1 to explain I/O
format, and it is often degenerate (pair found on first probe, target at the
exact first mid, zero backtracks). Audit check: run the trace and confirm the
interesting step types (skip/conflict/backtrack/already_connected/…) actually
appear; the mapper coverage test only sees step types the default produces.

#### Tier 1: Hand-Written Trace Generators

`run` is a synchronous JS function that executes the real algorithm and emits a step-by-step trace array. Deterministic, instant, no network call. Every algorithm in the registry is Tier 1 — there are no `run: null` stubs.

**`broken: true` drain (eng review 2026-06-12).** Six entries whose runners
emitted only scalar step fields (renderer mounted but never painted) are being
drained in three phases. Phase 1 (shipped): `tree_dp` carries
`tree:{nodes,edges}` on init (shared `buildTree`/`serializeTree` from
`tree/lcaTree.js`); `top_k_heap` and `k_closest_points` rewritten on a real
comparator `MinHeap` with snapshot-only traces — each insert/evict step carries
`heap: [{value, label}]` entries plus `heap_index`, converted by the mapper's
`heapToTree()` (label is display-only; `node.raw` and `heap_array` keep the
numeric key). Oversized linear inputs (`nums`/`values`/`nodes`/`stream`/
`points`/`lists`) are clamped via the `clamp_linear_inputs` adaptation against
per-entry capabilities caps. Classifier routing for all six problems is guarded
by `leetcodeRouting.eval.test.js` (RELU_EVAL=1; phase-aware — flips from
must-not-route to must-route as flags come off). Phase 3 (shipped):
`linked_list_cycle` moved tree→linked renderer — init carries `list` + `pos`
(mapper emits `set_list` + `set_arrows` with the cycle back-edge, drawn as an
arc below the row by LinkedRenderer's backward-arrow path), every step carries
explicit `slow`/`fast` indices for the named-pointer badges. Phase 2 (shipped —
**drained to zero**): `median_finder` renders its two heaps on two tree panels
(`lo_heap`/`hi_heap`, registry `panels` declaration) with the median in a
context panel; `merge_k_sorted` rewritten on a real MinHeap with a heap tree
panel + structural result list panel + source-list cursors in context. The
illustrate auto-save now captures `lastVizMessage`/`rendererVizHistory` so
restore remounts non-graph (incl. multi-panel) layouts; an empty `set_tree`
(root: null) is legal and clears a panel's waiting state.

**Tier 1 algorithms by renderer (103 total):**

| Renderer | Algorithms |
|---|---|
| `graph` | dijkstra, bfs, dfs, kruskal, prim, maxflow, bellman_ford, dag_shortest, poly_reduction, trie, union_find, topological_sort, backtracking, word_search, multi_source_bfs, floyd_warshall, tarjan_bridges, bipartite_check, dijkstra_k_stops, number_of_islands |
| `array` | mergesort, quickselect, sliding_window, binary_search, two_pointers, max_subarray, rotate_array, container_water, trapping_rain_water, product_except_self, move_zeroes, find_peak, search_rotated, prefix_sum, difference_array, lis, house_robber, sieve_primes, spiral_matrix, rotate_matrix, combination_sum, subsets, permutations, sliding_window_max, jump_game |
| `table` | knapsack, edit_distance, coin_change, lcs, word_break, climbing_stairs, min_path_sum, stock_dp, interval_dp, palindrome_dp, bitmask_dp, valid_sudoku, board_backtracking, maximal_square |
| `tree` | huffman, heap_ops, bst_insert, tree_depth_dfs, tree_level_order, tree_path, tree_dp, top_k_heap, median_finder, k_closest_points, lca_tree, validate_bst, linked_list_cycle, merge_k_sorted |
| `linked` | linked_list_reversal, stack_operations, queue_operations, monotonic_stack |
| `interval` | interval_merge, interval_scheduling |
| `string` | sliding_window_string, min_window_substring, valid_palindrome, expand_palindrome, kmp_search, find_anagrams, rabin_karp, manacher |
| `context` | hash_map_grouping, frequency_count, two_sum_hash, string_hash, set_operations, longest_consecutive, bit_ops, math_simulation, greedy_choice, jump_game_ii, valid_parentheses, task_scheduler, lru_cache, fast_power, gcd_algorithm, majority_vote |

#### Tier 2: AI-Generated Trace Generators (DORMANT)

> **STATUS: DORMANT (viz strategy decision 2026-06-11 — see TODOS.md "Viz strategy").**
> Inline Tier 2 generation is disabled in `start_leetcode`: off-registry problems go
> straight to **Tier 3 live viz** (below) with a client transparency toast
> (`VizRequestToast.jsx`). The machinery in this section (authorAgent, sandbox, cache,
> the off-registry `run_algorithm` path) remains in the codebase and unit-tested, but
> is unreachable from the entry path. Do NOT re-enable without the revival criteria in
> TODOS.md: move the Example-1 correctness check into the generation retry loop (it
> only gates caching — a mismatched trace would be SERVED), require `output` on the
> result step, lint every execution including cache hits, replace `node:vm` (not a
> security boundary), background generation only. Rationale: Tier 1 dev-time authoring
> (~1hr/pattern with the full test loop) dominates blind runtime generation; recurring
> Tier 3 problems are promoted to Tier 1 instead.

As designed: Tier 2 fired when a LeetCode problem did **not** match any registry entry (or matched below the 0.7 confidence bar). The extraction schema (`leetcodeAgent.js`) keeps `algorithm_key` enum-constrained to registry keys, but additionally requires a free-form **`pattern_key`** (snake_case pattern descriptor, e.g. `product_except_self`) plus a **`pattern_renderer`** whenever `algorithm_key` is null or low-confidence — these still flow to the session today: the Tier 3 intake block uses the renderer hint, and the pattern data feeds the Tier 1 promotion loop. There are no pre-defined `run: null` stubs in the registry.

Mid-session, `run_algorithm` (`agentLib.js`) accepts off-registry keys: the tool schema has **no enum** on `algorithm` (a static registry enum would make pattern keys unpassable — the N-Queens incident: the model rerouted to the nearest registry key and ran the wrong algorithm). Typo protection lives server-side instead: an unknown key that is not the session's pattern key is rejected with an error (a hallucinated key must never trigger a 20-60s authoring call). When the key IS the session's Tier 2 pattern key, the handler **reuses `session._leetcodeTrace`** from the start_leetcode pre-run rather than regenerating — regeneration could stall the lesson and paint a different trace than the one already on screen. For off-registry keys generally: capability validation is skipped, empty agent input defaults to the parsed Example 1 `test_case`, the renderer comes from the generated result, and context-renderer traces get an auto-registered `algorithm_state` panel. The parser's `pattern_renderer` is honored at generation time (`context.renderer` in `runAlgorithmWithFallback`, ahead of `guessRenderer`; `recursion_tree` maps to `graph`). `applyClassification` likewise accepts the session pattern key as an execution target while still rejecting solver-hallucinated names.

The trace0-graph synthesis in the `run_algorithm` graph branch normalizes edge fields (`{from,to}` → `{source,target}`) — backtracking's trace emits `{from,to}` and the client GraphRenderer hard-crashed on undefined sources before this. The client also skips malformed edges defensively (`GraphRenderer.jsx`).

**Flow:**
```
runAlgorithmWithFallback(algorithmId, input, { description, expectedOutput })
  ├── Check if algo exists in registry → Tier 1 (fast path, always for known algorithms)
  └── Tier 2 path (unknown algorithm IDs only):
       ├── getCachedGenerator(algorithmId, description)
       │    └── if cached: executeTraceInSandbox(cached.code, input)
       └── if not cached:
            ├── generateTraceGenerator(algorithmId, renderer, description)  ← authorAgent.js
            ├── executeTraceInSandbox(code, input, 5000ms)                   ← sandbox.js
            ├── Validate node IDs (graph renderer only)
            └── if trace.length >= 3 AND outputMatchesExpected(trace, expectedOutput):
                 └── cacheGenerator(algorithmId, code, description)
                (mismatches log a [Registry] warning and skip caching — will retry next session)
```

**Cache keys** (`cache.js` → `buildCacheKey`): plain `algorithmId` when no problem title is available; compound `algorithmId:normalized_title` (e.g. `greedy_choice:integer_to_roman`) when a LeetCode title is present. This lets different problem titles backed by the same algorithm get separate cached generators.

**Correctness gate** (`outputMatchesExpected`): the generated trace's last `result`-typed step must have an `output` field matching the `expectedOutput` string extracted from the problem's Example 1. If `expectedOutput` is absent (student pasted a partial problem), the gate passes through and caching falls back to length-only. Comparison is plain string — false negatives possible for array outputs (e.g. `[0,1]` vs `0,1`) but never false positives, so no bad trace can be persisted.

**`authorAgent.js`:** Writes a JS function `run(input) { return trace; }` for the given algorithm + renderer. Each step must include `type`, `description`, and renderer-specific fields. The final `result` step must include `output: "<answer as plain string>"`. For `context` renderer, every step must include `viz_actions` that update the `algorithm_state` panel. The generation prompt embeds `buildRendererDocs([renderer])` from `rendererManifest.js` as the authoritative action reference: any step on any renderer MAY embed `viz_actions` (they take precedence over the step-field mapping and are schema-checked by the emit_segment enforcement ladder), but for non-context renderers the standard step fields are preferred.

**`sandbox.js`:** Executes generated code in isolation with a 5-second timeout.

**`cache.js`:** Two-level cache (L1 in-memory Map, L2 Supabase `generated_traces` table). Persists generated code keyed by compound `algorithmId:title` so it doesn't regenerate on every request. Hit count tracked per key. Exports `buildCacheKey`, `outputMatchesExpected`, `getCachedGenerator`, `cacheGenerator`, `incrementHitCount`.

**Key difference:** Tier 1 traces are guaranteed correct (hand-written, deterministic, covered by `tier1.deep.test.js`). Tier 2 traces are generated on-demand for unknown patterns — they get cached only when the trace passes both a 3-step minimum and an output correctness check against Example 1. The LeetCode entry point exposes `viz_tier: 1 | 2` to the client so it can display appropriate confidence UI.

#### Tier 3: Model-Authored Live Viz (the designed fallback)

When no registry trace exists (classifier returned no key, or below the 0.7 confidence bar), the session runs in **Tier 3 live viz** mode — the designed fallback under the 2026-06-11 viz strategy, not a degradation. `hasViz` stays `false` (`viz_tier: 3` on `lc_parsed`), the client shows a one-shot transparency toast ("drawn live, may be rougher — Looks wrong? Report it" → `/api/viz-request`, the demand signal for Tier 1 promotion), `computeActiveTools` filters ONLY `run_algorithm` (there is no trace to load), and the intake text carries a `[LEETCODE MODE — TIER 3 LIVE VIZ]` block (or the companion `[COMPANION — OFF REGISTRY]` variant): the agent mounts the recommended renderer (`pattern_renderer` from the parser, default `array`), renders the problem's own Example 1 input, and hand-builds `viz_actions` in every `emit_segment` — the same model-authored path the on-the-fly eval suite measures at ≥95%. The renderer's manifest docs are injected into the intake block so the action contract is in context from turn 1. The enforcement ladder (loud per-action rejection, whole-call failure when everything is invalid) is what makes improvised viz safe — before it, these sessions hard-filtered the viz pipeline and opened with "I don't have a visualization for this one."

The same Tier 3 instruction applies on the web app when the solver classifies a problem `algorithm_execution` but out-of-scope (`applyClassification`): the agent builds the viz manually against the closest algorithm's renderer and never calls `run_algorithm`.

#### Renderer Fallback Heuristic

For unknown algorithm IDs, `guessRenderer()` uses name-based pattern matching:
- Contains `hash`, `freq`, `group`, `set_op`, `bit_op`, `math_sim` → `context`
- Contains `sort`, `search`, `pointer`, `window`, `prefix`, `array_manip` → `array`
- Contains `knapsack`, `lcs`, `edit`, `coin`, `matrix`, `string_dp` → `table`
- Contains `tree`, `bst`, `avl`, `heap` → `tree`
- Contains `linked`, `stack`, `queue` → `linked`
- Contains `interval`, `schedule`, `machine`, `job`, `timeline` → `interval`
- Contains `palindrome`, `kmp`, `anagram`, `window_string` → `string`
- Default → `graph`

---

### Stage 3: Renderer Selection

The renderer is set on each algorithm's registry entry. The client receives it as part of `create_visualization` or `lc_viz_ready`. Available renderers:

| Renderer | What it shows |
|---|---|
| `graph` | Node-edge graph with highlights, arrows, edge weights |
| `array` | Linear array cells with pointer overlays and swap animations |
| `table` | 2D DP grid with cell-fill animations and dependency arrows |
| `tree` | Binary tree / heap with node insert/delete/rotate/sift |
| `linked` | Linked list / stack / queue with push/pop/insert/delete |
| `interval` | Timeline-based Gantt-style view for job scheduling |
| `string` | String character alignment with pointer overlays |
| `context` | Side panel showing key-value / collection / log / expression / pseudocode state |
| `recursion_tree` | D&C recursion tree with level reveal and Master Theorem visualization |

For `algorithm_execution` mode with known algorithms, the renderer is pulled from the registry. For concept flows (A1 path), `run_algorithm` auto-configures graph + context panels via `getDefaultContextPanels(algorithmId)`.

For all modes, `applyClassification()` (`guidedAgent.js`) overrides the registry renderer when the algorithm name contains `interval`, `schedule`, `machine`, `job`, or `activity` → forces `interval` renderer. This applies to both `algorithm_execution` and non-execution modes.

---

### Stage 4: Trace → Viz Actions (vizMapper)

**File:** `server/vizMapper.js`
**Entry point:** `mapTraceStep(algorithm, rendererType, step, state)`

The agent specifies `trace_step_indices: [3, 4]` in `emit_segment`. The server-side handler in `agentLib.js` calls `mapTraceStep()` for each referenced index and appends the generated viz_actions + context panel updates to the segment.

This is the mechanism that eliminates 80% of the agent's viz_action construction burden. The agent just says "play step 3" and the mapper knows exactly which nodes to highlight, which distances to update, which queue entries to add.

**State object** is mutable and persists across steps per session — enables cumulative updates (e.g. distances table grows incrementally without re-sending from scratch).

**Example for Dijkstra step:**
```
trace step: { type: 'relax', from: 'A', to: 'C', weight: 3, distances: { A: 0, B: 4, C: 3 } }

→ mapped to:
  viz: [highlight_edge(A→C), mark_visited(A), mark_current(C)]
  ctx: [update distances panel with { A: "0", B: "4", C: "3" }]
       [update priority queue panel]
```

The agent can still pass **manual `viz_actions`** for things the trace can't express (highlighting specific cut edges for max-flow proofs, showing ghost alternative paths, etc.). Manual actions are appended after auto-generated ones.

#### Outer renderer dispatch

`mapTraceStep` switches on `rendererType` and delegates to a per-renderer mapper:

| `rendererType` | Mapper function |
|---|---|
| `graph` | `mapGraphStep` |
| `array` | `mapArrayStep` |
| `table` | `mapTableStep` |
| `tree` | `mapTreeStep` |
| `linked` | `mapLinkedStep` |
| `interval` | `mapIntervalStep` |
| `string` | `mapStringStep` |
| `context` | `mapContextStep` |

Any other renderer type returns `{ viz: [], ctx: [] }`. The `context` mapper exists to satisfy the outer switch for context-renderer algorithms (hashing, math_patterns, etc.) — those algorithms embed their `viz_actions` directly in each trace step, so `agentLib.js`'s `emit_segment` short-circuits the mapper for them. `mapContextStep` only runs as a fallback when a step lacks embedded viz_actions; it surfaces `step.description` on the `algorithm_state` panel so the panel never sits blank.

#### Generic post-processing

After the per-renderer mapper returns, `mapTraceStep` appends one universal action: if `step.pseudocode_line !== undefined`, push `ctx('update', { panel_id: 'pseudocode', current_line: <N> })`. This is why every algorithm with a `pseudocode.js` entry must set `pseudocode_line` on each `trace.push` — without it the pseudocode panel never advances.

#### Helpers

`distancesEntries(distances, statusFn)` (top of `vizMapper.js`) builds entries for any distances-style `key_value` panel. Handles common value sentinels: `-1 → 'wall'`, `Infinity` / `'∞' → '∞'`. Used by dijkstra, bellman_ford, dag_shortest, multi_source_bfs, floyd_warshall, dijkstra_k_stops. Pass `statusFn = (key, value) => 'highlight'|'updated'|'default'` to mark per-entry status.

#### Coverage contract & test gate

**Test:** `server/algorithms/mapper.coverage.test.js`. Registry-driven, runs every algorithm with `defaultInput`, asserts:

1. `mapTraceStep` returns ≥1 viz/ctx action for every non-narration step (skips steps that embed their own `viz_actions`).
2. Every produced `step.type` has a matching `case` block in `vizMapper.js` (static reconciliation).
3. Every algorithm whose registry renderer is referenced has a case in the outer switch.
4. Every trace step on algorithms that have a pseudocode entry sets `pseudocode_line`.

**Snapshot semantics:** the test pins the current state via four `WIP_*` sets (`WIP_MAPPER_GAPS`, `WIP_PSEUDOCODE_GAPS`, `WIP_MISSING_CASE_TYPES`, `WIP_RENDERER_GAPS`). Algorithms in those sets are allowed to fail the corresponding check; everything outside the sets must pass. The test fails on **either direction** — a regression (passing → failing) AND an improvement that wasn't reflected (failing → passing). The latter forces contributors to remove an entry from the WIP set when they fix it, preventing the lists from drifting.

**`KNOWN_NARRATION_ONLY`** lists step types where empty mapper output is correct (`error` only, today).

**Adding a new algorithm.** When you add a new entry to `ALGORITHMS` in `registry.js`, the coverage test runs against it. To pass:
- Every `step.type` your trace producer emits must have a `case` block in the appropriate per-renderer mapper, OR be added to `WIP_MISSING_CASE_TYPES` with reason.
- Each step must produce ≥1 viz/ctx action (or embed its own `viz_actions`, common for context-renderer algos).
- If the algorithm has a `pseudocode.js` entry, every `trace.push` must include `pseudocode_line: <N>`.
- The algorithm's `renderer` must have a `case` in `mapTraceStep`'s outer switch.

**Adding a new step type.** If you introduce a `step.type` string that no existing case handles, add a new `case 'X':` block in the right per-renderer mapper. Generic step types (`fill`, `compute`, `update`, `build`, `mark`, `reverse`, `traverse`, `record`, `choose`, `backtrack`, `push`, `pop`, `dequeue`, `window_max`) already have shared fallback handlers in `mapArrayStep` and `mapTreeStep` that surface `step.description` and any `step.array`/`step.indices` data — so a minimal new algorithm reusing those step types may need no mapper changes at all.

---

### Stage 5: Teaching Loop (LLM-driven)

**File:** `server/guidedAgent.js`  
**Model:** `TEACHING_MODEL` (`server/models.js`), `max_tokens: 4096`  
**Max API calls per session:** 150

The guided agent runs this loop structure:

```
while (continueLoop):
  send agent_status: 'thinking'
  response = claude.messages.create(model, systemPrompt, tools, messages)

  if stop_reason === 'end_turn':
    if plain text → inject "use emit_segment" correction, continue
    if empty → increment counter, safety-valve at 3 empty turns → lesson_complete

  if stop_reason === 'tool_use':
    for each tool call:
      execute tool (local logic or sub-agent)
      collect tool_result

    inject viz reminder if 3+ segments without viz_actions
    append tool_results to messages
    drain guidedMessageQueue (student free-text)
    continue

  if lesson_complete:
    enter follow-up mode (5-min wait for student question)
    if follow-up received: inject [FOLLOW-UP QUESTION], continue
    else: break
```

#### Tool Execution Architecture

Tools split into two groups:

**Locally handled (fast, no API call):**
- `run_solver` / `run_solver_batch` → calls `solver.js` (LC path: `solveLeetcodeProblem`, else `solveProblem`)
- `build_example_graph` → calls `graphBuilder.js`
- `run_algorithm` → calls `registry.runAlgorithmWithFallback()` or `runRegisteredAlgorithm()`
- `send_options` → sends guided_options to client, awaits student response via promise
- `verify_result` → compares expected vs computed
- `lesson_complete` → sends lesson_complete to client, enters follow-up wait
- `get_renderer_docs` → returns renderer documentation from `rendererManifest.js`

**Delegated to `agentLib.handleToolCall()` (shared logic):**
- `create_graph` → sends `create_graph` to client, registers panels, stores on session
- `create_visualization` → sends `create_visualization` to client, registers panels
- `update_graph` → sends `update_graph` to client, merges graph state
- `emit_segment` → maps trace steps, validates viz_actions, runs TTS, sends `segment_start`
- `respond_to_interrupt` → saves graph state, sends interrupt response, queues restore
- `end_illustration` → restores saved graph state
- `conversational_reply` → sends `conversational_reply` to client, optionally awaits response

#### emit_segment deep-dive

`emit_segment` is the most critical tool — it drives everything the student sees and hears:

1. Resolve `trace_step_indices` → call `mapTraceStep()` → prepend auto viz_actions.
   Tier 2 steps with embedded `viz_actions` skip the mapper but are schema-checked
   (see the enforcement ladder below) with per-step warnings returned to the agent.
2. Run manual `viz_actions` through the **enforcement ladder** (below); strip invalid
   actions with precise errors
3. Send `segment_start` message to client (contains narration text + viz_actions)
4. Call `synthesizeAndStream()` (TTS) — streams audio chunks via binary WS messages
5. Wait for TTS completion (or pause/skip/interrupt signals)
6. Send `audio_flush` + `segment_end`
7. Check `session.interruptFlag` — if set, snapshot graph state, stub remaining tools, inject `[LEARNER INTERRUPT]` message

#### Viz-action enforcement ladder (consistency architecture)

`rendererManifest.js` is the **enforced single source of truth** for the viz contract
(every renderer's legal actions + param types). Four layers consume it, so a
hallucinated action name or malformed params can no longer die silently as a blank
panel:

1. **Tool schema gate** (`tools.js`): the `emit_segment`/`respond_to_interrupt`
   `viz_actions[].action` field is an enum generated from the manifest — hallucinated
   action names are blocked at the API boundary.
2. **Panel registry** (`agentLib.validatePanelIds`): unknown panel ids stripped; a bare
   renderer type ("array") is aliased to its sole registered panel id ("array_main").
3. **Manifest schema validation** (`vizValidator.js`): action must exist for the
   targeted renderer's type; required params checked; types checked against the
   manifest's type DSL. Safe repairs are applied instead of stripping: action-name
   near-misses (case/hyphens), param aliases (`data`→`values`, `node`↔`id`,
   `index`→`indices`), numeric-string→number coercion, scalar→array wrapping. Output
   is normalized to nested `{ renderer, action, params }`. System-emitted actions
   (residual overlays) live in `SYSTEM_ACTIONS` and pass without a published contract.
4. **Graph node-id validation** (`agentLib.validateVizActions`): highlight/path targets
   must exist in `session.currentGraph` — or have been introduced by an accepted
   `add_node` (tracked in `session._addedNodeIds`, reset on every graph replacement).

**Failure is loud, not silent.** Stripped actions come back to the model as precise
per-action errors in the tool result (`WARNINGS: …`, including the renderer's valid
action list). If the model supplied viz_actions and **every one** was rejected (and no
trace actions carry the segment), `emit_segment` **fails the tool call** before sending
anything — the model fixes the actions and re-emits instead of the student watching
narration point at a blank panel. `respond_to_interrupt` runs the same ladder on its
`viz_actions` and validates overlay `spotlight_nodes`/`spotlight_edges` against the
graph.

**Drift protection** (`vizContract.test.js`): every manifest action must have a client
handler; every `vizMapper` `viz()`/`ctx()` call must be documented in the manifest (or
`SYSTEM_ACTIONS`) *and* have a client handler; the tool-schema enum must cover the
manifest. Renaming or adding an action in any one layer without the others fails CI.
Adding/renaming an action in `rendererManifest.js` is the only sanctioned way to change
the contract.

**Pause/Resume/Skip mechanics:**
- `pauseFlag` set by client → TTS stream aborts at next chunk boundary
- `pauseResolver` is a promise that resolves when `resume` message arrives
- `skipFlag` → TTS aborts but execution continues without pause
- Speed multiplier applied to TTS via `session.speedMultiplier`

---

## 6. Reasoning Modes

The solver classifies every problem into one of six modes. Mode determines: which context panels auto-configure, which visualization planner runs, and which teaching template the agent follows.

```
algorithm_execution
  └── Solver identifies target_algorithm
  └── agent: build_example_graph → create_visualization → run_algorithm → emit_segment(trace_step_indices)
  └── Socratic: classify algorithm → optional canonical refresh → reduction sketch

greedy_design
  └── Solver identifies the greedy criterion + exchange argument
  └── auto-panels: greedy_rule, proof_skeleton
  └── Guided: student-produces rule → example trace → student-produces algorithm → student-produces proof
  └── Explain: RULE → EXAMPLE → ALGORITHM → PROOF → RUNTIME

dp_design
  └── Solver defines subproblem + recurrence
  └── auto-panels: dp_definition, recurrence
  └── Guided: student-produces subproblem → recurrence → base cases → fill order → runtime
  └── Explain: SUBPROBLEM → RECURRENCE → BASE CASES → ORDER → RUNTIME

dc_design
  └── Solver identifies divide/combine steps + recurrence
  └── auto-panels: dc_structure, recurrence
  └── rendererAdvisor → recursion_tree (clean T(n)) or graph (case tree) or none
  └── SPLIT → SUBPROBLEMS → COMBINE → RECURRENCE (Master Theorem viz)

modeling
  └── LP formulation / reduction / duality
  └── auto-panels: formulation, algorithm_state
  └── OBJECTS → OBJECTIVE → CONSTRAINTS → TRICK → SANITY CHECK
  └── update_graph for auxiliary/product/layered graph construction

runtime
  └── Big-O analysis, asymptotics, recurrence solving
  └── auto-panel: runtime_analysis
  └── recursion_tree when Master Theorem or recursion tree method applies
```

---

## 7. Algorithm Registry

The full registry is in `server/algorithms/registry.js`. Key structure:

```js
ALGORITHMS = {
  algorithmId: {
    run: fn | null,       // null = Tier 2
    renderer: string,
    category: string,
    defaultInput: {},
    capabilities: {},
    tier: 2,              // present only for explicit Tier 2 entries
  }
}
```

**`runRegisteredAlgorithm(id, input)`** — Tier 1 only. Merges provided input with defaultInput, calls `run()`, returns `{ trace, renderer, input }`.

**`runAlgorithmWithFallback(id, input, context)`** — Tier 1 + Tier 2 fallback. Returns `{ trace, renderer, input, tier: 1|2 }`.

#### Trace step contract

Every Tier 1 algorithm's `run()` produces a `trace[]` array. Each trace step is an object with at minimum:

| Field | Required | Notes |
|---|---|---|
| `type` | Yes | String key. Drives `mapTraceStep` dispatch. Must match a `case` block in the appropriate per-renderer mapper (enforced by `mapper.coverage.test.js`). |
| `description` | Recommended | Plain-English explanation surfaced on fallback paths and used by the agent for narration. |
| `pseudocode_line` | If pseudocode exists | Index into `PSEUDOCODE[algorithmId]` from `server/pseudocode.js`. The generic post-processing in `mapTraceStep` updates the pseudocode panel from this field. Algorithms with no `pseudocode.js` entry are listed in `WIP_PSEUDOCODE_GAPS` in `mapper.coverage.test.js`. |
| renderer-specific | Varies | e.g. `step.distances` for graph distance updates, `step.row`/`step.col`/`step.value` for table cell fills, `step.array`/`step.indices` for array highlights. |
| `viz_actions` | Optional | Embedded action list — bypasses `mapTraceStep` entirely when present. Used by context-renderer algorithms (hashing, math_patterns, lru_cache, etc.) where the algorithm itself owns the panel update logic. |
| `output` | On `result` step | Plain-string answer. Used by `cache.js`'s `outputMatchesExpected` correctness gate for Tier 2. |

The mapper coverage test (`server/algorithms/mapper.coverage.test.js`) enforces this contract on every algorithm in the registry. See [Stage 4 → Coverage contract](#stage-4-trace--viz-actions-vizmapper) for details.

Algorithm categories (all Tier 1):

| Category | Algorithms |
|---|---|
| Graph Algorithms | dijkstra, bfs, dfs, kruskal, prim, maxflow, bellman_ford, dag_shortest, union_find, topological_sort, trie, backtracking, word_search, multi_source_bfs, floyd_warshall, tarjan_bridges, bipartite_check, dijkstra_k_stops, number_of_islands |
| Sorting | mergesort |
| Dynamic Programming | knapsack, edit_distance, coin_change, lcs, max_subarray, word_break, climbing_stairs, min_path_sum, lis, stock_dp, interval_dp, palindrome_dp, bitmask_dp, tree_dp, house_robber, maximal_square |
| Divide and Conquer | quickselect |
| Greedy Algorithms | huffman, interval_merge, interval_scheduling, greedy_choice, jump_game, jump_game_ii |
| Data Structures | heap_ops, bst_insert, linked_list_reversal, stack_operations, queue_operations, monotonic_stack, top_k_heap, median_finder, k_closest_points, lru_cache, trie |
| Trees | tree_depth_dfs, tree_level_order, tree_path, tree_dp, lca_tree, validate_bst |
| Linked Lists | linked_list_cycle, merge_k_sorted |
| Searching / Two Pointers | binary_search, two_pointers, sliding_window, sliding_window_max, container_water |
| Prefix / Difference Arrays | prefix_sum, difference_array |
| Matrix | spiral_matrix, rotate_matrix, number_of_islands |
| Backtracking | backtracking, word_search, combination_sum, subsets, permutations, board_backtracking (table renderer; N-Queens — `{ puzzle: 'n_queens', n }`, parametric for future board puzzles) |
| String Algorithms | sliding_window_string, valid_palindrome, expand_palindrome, kmp_search, find_anagrams, rabin_karp, manacher |
| Hashing / Sets | hash_map_grouping, frequency_count, two_sum_hash, string_hash, set_operations, valid_parentheses, task_scheduler |
| Math / Bit Manipulation | sieve_primes, fast_power, gcd_algorithm, majority_vote, bit_ops, math_simulation |
| Complexity Theory | poly_reduction |
| Misc | rotate_array |

---

## 8. Context Panels

Auto-configured per algorithm from `server/contextPanelDefaults.js`. Five panel types:

| Type | Display | Used for |
|---|---|---|
| `key_value` | Key → Value rows | Distances, pointers, state |
| `collection` | Ordered badge list | Queue, stack, visited set, sorted order |
| `log` | Append-only log entries | Edge decisions, augmenting paths, recorded subsets |
| `expression` | Structured label + text lines | Recurrences, LP formulations, D&C structure |
| `pseudocode` | Highlighted code lines | Algorithm pseudocode with active line tracking |

Algorithms with pseudocode panels: bellman_ford, bfs, binary_search,
bipartite_check, dag_shortest, dijkstra, dijkstra_k_stops, floyd_warshall,
huffman, knapsack, kruskal, lca_tree, maxflow, multi_source_bfs,
number_of_islands, quickselect, tarjan_bridges, topological_sort, validate_bst.

Pseudocode source: `server/pseudocode.js`. Each algorithm exports an array of
strings; trace steps reference lines by 0-indexed `pseudocode_line` field.
Algorithms not in the list above don't have a pseudocode panel — they're listed
in `WIP_PSEUDOCODE_GAPS` in `mapper.coverage.test.js` so the test treats their
absence of `pseudocode_line` as expected.

Context panels are updated via `emit_segment` viz_actions:
```js
{ renderer: "context", action: "update", params: { panel_id: "distances", entries: [...] } }
{ renderer: "context", action: "append_log", params: { panel_id: "aug_paths", entries: [...] } }
```

### Critical constraints

**Panel registry closes at `run_algorithm` time.** Panels listed in
`getDefaultContextPanels(algorithmId)` are registered when `run_algorithm` executes.
After that the registry is frozen — the agent can update registered panels but cannot
create new ones mid-session. If a panel ID is not in `contextPanelDefaults.js` before
the algorithm runs, `update_context_panel` calls targeting it are silently dropped by
the frontend.

**Panel IDs must match `viz_actions` exactly.** Context-renderer algorithms (hashing,
math patterns) hardcode `panel_id: 'algorithm_state'` inside their `ctxUpdate()` helper.
The entry in `contextPanelDefaults.js` for those algorithms must use `id: 'algorithm_state'`
or the updates never reach the panel. Only the `title` field is safe to change for
context-renderer algorithms — never the `id`.

**`session._rendererPanelId` must be cleared on every `run_algorithm`.** When a
prior algorithm in the same session set this field (set inside the non-graph branch
of `run_algorithm` at `agentLib.js:449` — used to retarget mapper-emitted
`renderer: '<type>'` actions to a custom-named panel like `'string_main'`), the
field must be reset before the next algorithm runs. Otherwise the rewrite at
`agentLib.js:561-567` mistargets the new algorithm's viz_actions to the previous
algorithm's panel id (e.g. mapper emits `renderer: 'graph'`, gets rewritten to
`renderer: 'table'` from a leftover knapsack run, and the client buffers the
action against an unmounted renderer). The `run_algorithm` handler clears the
field at entry: `session._rendererPanelId = null;` (`agentLib.js:391`).

---

## 9. Interrupt Handling

### How an interrupt is triggered

```
Client sends: { type: 'interrupt', question: '<text>' }
        │
        ▼
session.interruptFlag = { question, timestamp }
session.interruptAbortFlag = true      ← aborts current TTS stream at next chunk boundary
        │
        ▼  (after active emit_segment or conversational_reply completes)
guidedAgent.js:1888 — interrupt detected
        │
        ├── snapshot session._savedGraphState
        ├── stub-cancel remaining tool calls in current LLM turn
        │     → tool_result { skipped: true, reason: 'learner interrupt' }
        └── inject [LEARNER INTERRUPT] into messages
              → agent calls respond_to_interrupt
```

The interrupt is checked at the **tool boundary** (after `emit_segment` or `conversational_reply` finishes), not mid-narration. The TTS abort flag (`interruptAbortFlag`) stops audio as soon as possible; the agent loop checks `interruptFlag` once audio delivery is complete.

### State snapshot (`session._savedGraphState`)

Captured at `guidedAgent.js:1895` before any interrupt handling begins:

| Field | Source | Purpose |
|---|---|---|
| `graph` | `session.currentGraph` | Node/edge data for renderer remount |
| `trace` | `session.currentTrace` | Trace array for deterministic step replay |
| `algorithm` | `session.currentAlgorithm` | Algorithm ID for `mapTraceStep()` |
| `renderer` | `session.currentRenderer` | Which renderer to remount |
| `rendererPanelId` | `session._rendererPanelId` | Custom panel id (e.g. `'string_main'`) for retargeting mapper-emitted renderer types when restoring |
| `mapperState` | `session.mapperState` (shallow copy) | Incremental mapper state before interrupt |
| `emittedTraceSteps[]` | `session._emittedTraceSteps` (copy) | Which trace indices have already been played |
| `lastVizMessage` | `session._lastVizMessage` | The `create_graph` or `create_visualization` message used to mount the renderer |
| `rendererVizHistory` | `session._rendererVizHistory` (copy) | Per-renderer action history for renderers built via manual viz_actions |

### Restore strategy (`restoreGraphState`, `agentLib.js:117`)

Called after non-`illustrate` modes finish, and by `end_illustration`:

```
1. Re-send lastVizMessage (create_graph or create_visualization)  → remounts renderer
2. Wait 300ms for React to mount
3. Prefer trace-step replay (deterministic):
     for each idx in emittedTraceSteps → mapTraceStep(algorithm, renderer, trace[idx], state)
   Fallback: rendererVizHistory (for renderers built with manual viz_actions:
             recursion_tree, interval, etc.)
4. Send segment_start { viz_actions: [...all replayed actions] } + segment_end
5. session._savedGraphState = null
```

---

### The five explanation modes

#### `overlay`

**Use when:** "Why this node?" / "Why that edge?" / element-specific "what does this mean?" questions.

**Server validation (`agentLib.js:693`):**
```js
if (input.explanation_mode === 'overlay' && !input.overlay) {
  return { success: false, message: 'overlay mode requires the "overlay" property...' };
}
```
No WS message is sent on validation failure — the agent receives an error and must retry.

**Config shape:**
```js
overlay: {
  spotlight_nodes:   string[],              // node IDs (graph, tree renderers)
  spotlight_edges:   [{ from, to }],        // edge pairs (graph, tree renderers)
  spotlight_indices: number[],              // 0-based indices (array, linked renderers)
  spotlight_cells:   [{ row, col }],        // cell coordinates (table renderer)
  annotations: [{
    target:   string,                       // node ID, index, or "row-col" string
    text:     string,
    position: 'top' | 'bottom' | 'left' | 'right',
  }],
}
```

**Renderer support:**

| Renderer | Spotlight field |
|---|---|
| `graph`, `tree` | `spotlight_nodes`, `spotlight_edges` |
| `array`, `linked` | `spotlight_indices` |
| `table` | `spotlight_cells` |
| `context`, `recursion_tree`, `interval`, `string` | `annotations` only |

**State persistence:** No. After TTS completes, `explanation_complete` is sent. Client restores from its own pre-interrupt snapshot. `session._savedGraphState = null`.

**WS sequence:**
```
→ interrupt_response { explanation_mode: 'overlay', answer, overlay: {...} }
→ [TTS audio chunks]
→ (500ms delay)
→ explanation_complete
```

---

#### `rewind`

**Use when:** "What just happened?" / "I'm lost" / "Can you slow down?" — replay recent steps with clearer re-narration.

**Server validation (`agentLib.js:696`):**
```js
if (input.explanation_mode === 'rewind' && (
  !input.rewind ||
  !Array.isArray(input.rewind?.narration_per_step) ||
  input.rewind.narration_per_step.length === 0
)) {
  return { success: false, message: 'rewind mode requires a "rewind" object with steps_back and narration_per_step...' };
}
```

**Config shape:**
```js
rewind: {
  steps_back:          number,    // 1–5, how many segments to replay visually
  narration_per_step:  string[],  // re-narration for each replayed segment
                                  // (length should match steps_back)
}
```

**Renderer support:** All renderers. The client handles visual replay of the last N segments independently; the server separately streams `rewind_step_narration` messages + TTS for each step.

**State persistence:** No. `explanation_complete` sent after all steps are narrated. `session._savedGraphState = null`.

**WS sequence:**
```
→ interrupt_response { explanation_mode: 'rewind', answer, rewind: {...} }
→ [TTS audio for initial answer]
→ for each narration_per_step[i]:
    → (800ms delay)
    → rewind_step_narration { narration: "..." }
    → [TTS audio for this step]
    → (pause/skip handled per-step)
→ (500ms delay)
→ explanation_complete
```

---

#### `ghost_alternative`

**Use when:** "What if we took Y instead?" / "Why not that path?" — counterfactual comparison of the chosen path vs an alternative.

**Server validation (`agentLib.js:699`):**
```js
if (input.explanation_mode === 'ghost_alternative' && !input.ghost_alternative) {
  return { success: false, message: 'ghost_alternative mode requires the "ghost_alternative" property...' };
}
```

**Config shape:**
```js
ghost_alternative: {
  ghost_path:     string[],  // node IDs for the alternative path (graph, tree)
  actual_path:    string[],  // node IDs for the chosen path (graph, tree)
  ghost_indices:  number[],  // 0-based indices for the alternative (array, linked)
  actual_indices: number[],  // 0-based indices for the chosen path (array, linked)
  ghost_label:    string,    // e.g. "cost: 9 (suboptimal)"
  actual_label:   string,    // e.g. "cost: 7 (chosen)"
}
```

**Renderer support:**

| Renderer | Fields used |
|---|---|
| `graph`, `tree` | `ghost_path`, `actual_path` |
| `array`, `linked` | `ghost_indices`, `actual_indices` |
| `table`, `context`, others | `ghost_label`, `actual_label` only |

**State persistence:** No. Same pattern as `overlay` — `explanation_complete` sent, `session._savedGraphState = null`.

**WS sequence:**
```
→ interrupt_response { explanation_mode: 'ghost_alternative', answer, ghost_alternative: {...} }
→ [TTS audio chunks]
→ (500ms delay)
→ explanation_complete
```

---

#### `illustrate`

**Use when:** Conceptual "why does X work?" / "what is a cycle?" questions where the current lesson graph cannot demonstrate the concept. The lesson graph is temporarily replaced with a small 3–6 node example.

**Server validation (`agentLib.js:702`):**
```js
if (input.explanation_mode === 'illustrate') {
  if (!input.illustrate?.graph?.nodes?.length) {
    return {
      success: false,
      message: 'illustrate mode requires the "illustrate" property with "graph" (containing nodes and edges)...',
    };
  }
}
```

**Config shape:**
```js
illustrate: {
  graph: {
    nodes:    [{ id: string, label?: string }],           // 3–6 nodes recommended
    edges:    [{ source: string, target: string, weight?: number }],
    directed?: boolean,
  },
  // steps: []  ← deprecated, ignored. Use emit_segment after setup instead.
}
```

**Renderer support:** Always `graph` renderer. `illustrate` always sends `create_graph` regardless of the lesson's original renderer (array, table, tree, etc.). The original renderer is remounted by `end_illustration` → `restoreGraphState`.

**State persistence:** YES — the only mode that holds state across multiple tool calls.

```
session._illustrationActive = true    ← set on entry, cleared by end_illustration
session._savedGraphState = { ... }    ← held until end_illustration calls restoreGraphState
```

The server returns immediately after mounting the example graph. The agent then teaches freely using `emit_segment` with manual viz_actions (no `trace_step_indices`) until it calls `end_illustration`.

**Auto-save:** If `session._savedGraphState` is null when `illustrate` fires (can happen on the guided_message path rather than the interrupt path), the server auto-saves it before mounting the example graph (`agentLib.js:790`).

**Auto-cleanup:** If a second `respond_to_interrupt` is called while `session._illustrationActive` is still `true` (agent forgot `end_illustration`), the server auto-restores the graph and logs a warning before processing the new interrupt (`agentLib.js:684`).

**WS sequence:**
```
respond_to_interrupt(illustrate) →
  → interrupt_response { explanation_mode: 'illustrate', answer, illustrate: {...} }
  → [TTS for initial answer]
  → create_graph { graph: <example_graph> }    ← swaps to example graph (auto-layout)
  → (600ms delay)
  → [agent emits N × emit_segment with manual viz_actions]

end_illustration →
  → (500ms delay)
  → explanation_complete
  → create_graph / create_visualization { ... } ← remounts original renderer
  → segment_start { viz_actions: [...replayed] }
  → segment_end
```

---

#### `none`

**Use when:** Simple factual question that needs only a verbal answer — no visual context needed.

**Server validation:** None — always valid.

**Config shape:** No additional object required.

**Renderer support:** All renderers — no visual change occurs.

**State persistence:** No. `explanation_complete` sent immediately after TTS. `session._savedGraphState = null`.

**WS sequence:**
```
→ interrupt_response { explanation_mode: 'none', answer }
→ [TTS audio chunks]
→ (500ms delay)
→ explanation_complete
```

---

### Mode selection reference

| Student question type | Mode |
|---|---|
| "Why this node/edge?" | `overlay` |
| "What does X mean?" (element-specific) | `overlay` |
| "What just happened?" / "I'm lost" | `rewind` |
| "What if we took Y instead?" | `ghost_alternative` |
| "Why not that path?" | `ghost_alternative` |
| "Why does X algorithm work?" (conceptual) | `illustrate` |
| "What is a cycle?" (general concept, no graph needed) | `none` |
| Simple factual question | `none` |

### Top-level `viz_actions` on `respond_to_interrupt`

All modes accept an optional top-level `viz_actions` array applied **after** the explanation mode setup:

```js
viz_actions: [{ action: 'highlight_node', node: 'A', className: 'current' }, ...]
```

These are the same actions as `emit_segment`. They're included in the `interrupt_response` WS message payload and give the agent fine-grained supplementary highlights beyond what the mode config expresses (e.g. overlay a node highlight on top of a `none`-mode answer).

---

## 10. LeetCode Mode Specifics

**File:** `server/leetcodeAgent.js` (classification), `server/index.js` (mode handling)

The LeetCode path has an extra pre-processing step before the guided session:

```
start_leetcode message
    │
    ▼
parseLeetcodeProblem(problemText)         ← EXTRACTION_MODEL (models.js), 10s timeout
    │
    ▼
{ title, algorithm_key, confidence, test_case, test_case_source, expected_output,
  pattern_key, pattern_renderer, fallback_reason }
    │   expected_output: Example 1 answer as plain string ("MMMDCCXLIX", "3", "[0,1]")
    │   or null if student only pasted partial problem (no example output visible)
    │   pattern_key/pattern_renderer: required when algorithm_key is null or confidence < 0.7
    │
    ├── TIER 1: confidence >= 0.7 AND registry entry with run()?
    │       YES → runAlgorithmWithFallback(algorithm_key, {}, …)  ← CURATED defaultInput,
    │             │  NOT the parsed Example 1: the default is hand-picked + CI-validated
    │             │  to exercise the algorithm; Example 1 extraction errors can no longer
    │             │  break the viz. The student's Example 1 stays on the session for
    │             │  verify_result at lesson end.
    │             └── sends lc_viz_ready { algorithm_key, renderer, trace, input, tier: 1 }
    │                (client can render the trace immediately, before teaching begins)
    └── TIER 3: else hasViz = false, viz_tier = 3 → guided session runs in live-viz mode
                (viz pipeline available, run_algorithm filtered — see Stage 2 Tier 3;
                 client shows the VizRequestToast transparency disclosure)
                [Tier 2 inline generation removed here 2026-06-11 — dormant, see Stage 2]
    │
    │   session._leetcodeExpectedOutput stored for reuse at agentLib.js call site
    │   session._leetcodePatternKey / _leetcodePatternRenderer stored for intake hints
    │
    ▼
sends lc_parsed { title, algorithm_key, confidence, has_viz, viz_tier } to client
    │
    ▼
startGuidedSession(session, problemText)   ← normal guided session from here
```

**`lc_viz_ready`** is sent to the client _before_ the guided session starts. This means the student sees the visualization immediately on problem submission, not after the first few exchanges.

After the session completes, `createLcSession()` persists the result to the `lc_sessions` table (title, algorithm_key, confidence, has_viz).

**`lc_master_session`** WS message marks an LC session as mastered.

### Stuck Companion Mode (the leetcode overlay)

The Chrome extension overlay on `leetcode.com/problems/*` runs the SAME guided
session, parameterized by `session.companionMode` (set from `msg.companionMode` on
`start_leetcode`, chosen by the overlay's two-choice opener: "Nudge me — no spoilers"
→ `companionMode: true`; "Show me how it works" → `false`, the normal walkthrough).

**Surface geometry (form factor v2, design review 2026-06-11):** a docked right
rail that **pushes** the leetcode page (margin-right on `<html>`, restored on
close/SPA-nav) instead of occluding the editor — description AND code stay visible
beside the tutor. The rail is **resizable** (left-edge grip in `content.js`: pointer
drag or arrow keys, clamped to [420px, 60vw], persisted to `localStorage
relu_rail_width`) and keeps the expand-to-fullscreen toggle for dense graph/tree viz.
Inside the embed, below Tailwind's `md` (768px) the viz+chat split **stacks
vertically** (viz top ~45%, state strip, transcript, controls — `App.jsx`), so the
default rail gets the designed viz-first column instead of a crushed ~173px chat.
A floating/draggable overlay window was evaluated and rejected (occludes the user's
own code nondeterministically, breaks `highlight_problem_text` visibility, adds
window management mid-struggle); approved mockup:
`~/.gstack/projects/johnz4021-ReLU/designs/companion-formfactor-20260611/`.

Companion mode is a **parameterized mode of the ONE guided prompt**, not a second
agent. The seams (all in `server/guidedAgent.js`):

- **`buildGuidedSystemPrompt(session)`** — appends `COMPANION_MODE_PROMPT` to the base
  prompt when `companionMode`. The doctrine: open by asking for the student's read, no
  solver up front, **model-paced contingent escalation** (a learner-state read each turn:
  not_attempted / wrong_direction / partial / understands / disengaged), **one rung per
  turn** (never jump to the answer — the partial-attempt trap is named explicitly),
  **reserve the key insight**, never fight an escalation request, terminal rung is the
  visualization. Every system-prompt construction site routes through this, so the
  doctrine holds across the whole loop (post-`run_solver`, resume). Non-companion output
  is byte-identical to the base prompt (regression-pinned in `guidedAgent.test.js`).
- **Reserved key-insight payload** — the background warm solve's `.then()` stores
  `session._warmKeyInsight`; `buildGuidedSystemPrompt` injects a `[RESERVED KEY INSIGHT —
  DO NOT REVEAL]` block once it resolves (the ~turn-3-4 danger zone; opening turns rely
  on the taxonomy). Never leaks into non-companion sessions.
- **Per-turn self-report** — in companion mode the model sets optional
  `{learner_state, specificity_level, reveals_key_insight}` on `conversational_reply` /
  `emit_segment` (a metacognitive checkpoint that stops the jump; non-companion modes omit
  them). `companionSelfReport()` (agentLib.js) normalizes it; the server forwards it on the
  `interrupt_response` / `segment_start` message, and the client funnel posts precise
  events (nudge_given, solution-reveal) off it instead of guessing from viz.
- **`buildIntakeUserText(session, problemText)`** — pure assembly of the first user
  turn; swaps the closing instruction to the companion opener. Off-registry companion
  gets a `[COMPANION — OFF REGISTRY]` block (structure viz works; the terminal reveal
  is a HAND-BUILT animated walkthrough — "YOU are the trace") instead of the standard
  `[LEETCODE MODE — TIER 3 LIVE VIZ]` block. Both blocks embed the recommended
  renderer's manifest docs.
- **`computeActiveTools(session, allTools)`** — off-registry (companion AND standard)
  filters ONLY `run_algorithm` (the trace rung), keeping `build_example_graph` +
  `create_visualization` + the rest of the viz pipeline so the **zero-spoiler structure
  view** and the Tier 3 hand-built walkthrough render on ANY problem. (The old
  whole-pipeline filter for standard sessions — the Sudoku empty-graph bug — predates
  the enforcement ladder, which now rejects improvised invalid actions loudly instead.)
- **Solver warming** — on companion open, `startGuidedSession` fires the solve in the
  background (`session._warmSolver = { text, promise }`, fire-and-forget). The hint path
  and structure viz never await it; `run_solver` reuses the warmed result when the
  student escalates (cold ~12s wait avoided), falling back to a fresh solve on warm
  failure.
- **Page highlight — `highlight_problem_text`** (eng review 2026-06-09 D1-D3/D9) —
  companion-ONLY tool (stripped on every non-companion path by `computeActiveTools`;
  lives in `guidedTools`, not `tools.js`). The "point at the relevant part of the
  input" rung (specificity 2): highlights a verbatim quote of the problem statement
  on the leetcode page itself. Chain: `agentLib.js` handler →
  `highlight_problem {id, quote|clear}` WS → embed app (`App.jsx`) relays over the
  private MessagePort → `content.js` anchors via `extension/anchor.js`
  (`locateQuote` — normalized cross-node matching, unit-tested against real
  problem fixtures) and paints via CSS Custom Highlight API (`::highlight(relu-hint)`),
  single-text-node `<mark>` fallback when the API is unavailable. The handler AWAITS
  an id-correlated ack (`highlight_result {anchored, method, visible}`, 2s timeout →
  `anchored:'unknown'`); the embed NACKs instantly when the port isn't transferred
  yet, and `index.js` cleans the pending resolver on `end_session` / force-terminate
  (`abortHighlightWait`). Tool result tells the model how to degrade: anchored
  false/unknown → make the point in prose; visible false (off-screen or fullscreen
  overlay) → reply must stand alone. Funnel: `extension_highlight_shown {ok, method}`.
- **Mid-struggle visuals** (design review 2026-06-09 D2-D6) — the canvas is usable
  DURING the struggle, not just at the endgame, under a permission-gated contract:
  EARLY STRUCTURE VIEW (once, after the first concrete reference — the shared
  whiteboard) and COUNTEREXAMPLE INSTANCE (only on `wrong_direction`/`partial`, one
  per misconception, paired with its walk-through question). Both operate on the
  problem or the student's own idea — never the solution — so they are spoiler-safe
  and **specificity-level-neutral** (report the previous turn's level; the ladder
  budget is for solution disclosure). Hard restraints: verify-or-don't-draw (mentally
  execute THEIR approach on the candidate input first; no breaking input → don't
  draw, consider the gap may be a constraint, not correctness), co-discovery (the
  student names the break, never the tutor), borrow-and-return (counterexample
  borrows the canvas, then the structure view of their input is re-mounted — plain
  `create_visualization` re-mount, no `restoreGraphState` involvement), never two
  viz turns in a row, never while a question is pending, prose-over-pictures when
  prose suffices. Pins in `guidedAgent.test.js`; verify-rule trap eval is
  `companionMode.eval.test.js` case 7. Animated hypotheticals of arbitrary student
  approaches remain out of scope (no trace generator for them).
- **Terminal visualization ladder** (eng review 2026-06-09 D8) — the reveal endgame is
  three rungs, one per turn: STRUCTURE VIEW (specificity 3, zero-spoiler) → PARTIAL
  TRACE (specificity 4: `emit_segment` with ONLY the first 2-4 `trace_step_indices`,
  then a prediction prompt) → SOLUTION TRACE (specificity 5, resumes at the first
  unemitted index — never re-emits, because `mapperState` is stateful and replay
  corrupts interrupt-restore). The partial-trace rung has a **setup-steps-only
  carve-out**: it is forbidden when the trace's opening steps enact the reserved key
  insight (two-pointer placement, hash lookup — the common LC patterns); the model
  must skip to the full reveal rather than emit them under `reveals_key_insight: false`.
  Behavioral pin: `companionMode.eval.test.js` case 6; doctrine pins in
  `guidedAgent.test.js`. An explicit give-up may still jump straight to the full trace.
  Off-registry, rungs 2-3 become a hand-built animated walkthrough (Tier 3): the model
  authors the viz_actions itself on the structure view instead of loading a trace.

**Instrumentation (eng D4):** the background worker is the funnel poster. Extension-side
rungs (`extension_button_shown`, `_button_clicked`, `_extraction`, `_overlay_opened`,
`_overlay_closed`) are sent `content.js → background → PostHog HTTP capture`, tagged with
the Supabase user id (decoded from the stored JWT, falling back to a per-install anon id)
so they unify with the in-overlay app events. In-overlay rungs (`companion_intent_chosen`,
`_escalation_requested`, `_nudge_given`, `_structure_viz_shown`, `_solution_viz_shown`,
and the `companion`-tagged `session_completed`) post through the app's existing PostHog,
already identified by the same user id. All posts are fire-and-forget — an unreachable
sink drops the event, never breaking the session. (`_solution_viz_shown` is a heuristic:
the first viz-bearing segment after the structure view, since the client segment carries
no `trace_step_indices`.)

**Auth (eng D5):** the overlay iframe is a third-party frame on leetcode.com, so its
storage is partitioned and the first-party relu.run session is invisible (the
double-login). The extension **background service worker** durably owns the Supabase
session in `chrome.storage.local`; on overlay open `content.js` injects it via a direct
origin-targeted `postMessage` (page-world can't read it), the overlay adopts it with
`supabase.auth.setSession` (auto-refreshes expired access tokens), and posts rotated
sessions back over a **transferred MessagePort** (off the page-world message bus).

---

## 11. Data Flow Diagram

```
Student pastes problem
          │
          ▼ (WebSocket)
    ┌─────────────────────────────────────────────────────────────┐
    │                    index.js                                 │
    │  session gate → check free limit / BYOK                     │
    │  create DB conversation record                              │
    └─────────────────────────────────────────────────────────────┘
          │
          ├─── mode: guided (resume_conversation) ────────────────┐
          └─── mode: leetcode (start_leetcode) ───────────────────┤
                                                                  │
          ┌───────────────────────────────────────────────────────┘
          │
          ▼
    ┌─────────────────────────────────────────────────────────────┐
    │             LLM Loop (TEACHING_MODEL, models.js)            │
    │                                                             │
    │  [guided only] conversational_reply → intake question       │
    │                                                             │
    │  run_solver ──────────────────────────────────────────────► solver.js
    │      └── reasoning_mode, target_algorithm, keyInsight        │
    │                                                             │
    │  [if algorithm_execution]                                   │
    │  build_example_graph ─────────────────────────────────────► graphBuilder.js
    │      └── panels, algorithm_runs, graph_variants             │
    │                                                             │
    │  create_visualization / create_graph ─────────────────────► client: mount renderer
    │                                                             │
    │  run_algorithm ───────────────────────────────────────────► registry.js
    │      └── Tier 1: hand-written run() (all 96 known algos)    │
    │          Tier 2: cache.js → sandbox.js → authorAgent.js     │
    │                 (only for unknown LeetCode patterns)         │
    │          returns: { trace, renderer, input, tier }          │
    │                                                             │
    │  emit_segment(narration, trace_step_indices) ─────────────► agentLib.handleToolCall
    │      └── vizMapper.mapTraceStep() → viz_actions + ctx       │
    │          validate panel IDs + graph node IDs                │
    │          send segment_start to client                       │
    │          TTS synthesize + stream audio chunks               │
    │          wait for audio finish / pause / skip / interrupt   │
    │                                                             │
    │  send_options / conversational_reply ─────────────────────► client: show UI
    │      └── await student response (guidedResponseResolver)    │
    │                                                             │
    │  respond_to_interrupt ─────────────────────────────────────► client: overlay / rewind / ghost
    │      └── save graph state snapshot                          │
    │          teach interrupt answer                             │
    │          restore graph state after                          │
    │                                                             │
    │  lesson_complete ─────────────────────────────────────────► client: lesson_complete event
    │      └── enter follow-up mode (5-min wait)                  │
    └─────────────────────────────────────────────────────────────┘
          │
          ▼
    save agent state to DB (for resume_conversation)
    session_ended WS message
```

---

## Appendix: Key Files Reference

| File | Role |
|---|---|
| `server/index.js` | WebSocket gateway, session lifecycle, mode routing |
| `server/guidedAgent.js` | Socratic teaching loop, system prompt, guided tools |
| `server/tools.js` | Claude tool schemas |
| `server/agentLib.js` | Shared tool execution logic (emit_segment, create_graph, etc.) |
| `server/solver.js` | Pre-teaching solver: `solveProblem` (opus + thinking) and `solveLeetcodeProblem` (sonnet, 60s) |
| `server/graphBuilder.js` | Example graph constructor for algorithm_execution mode |
| `server/algorithms/registry.js` | Algorithm registry, Tier 1/2 dispatch, renderer fallback |
| `server/models.js` | Single source of truth for per-role model IDs (teaching, solver, author, builder, extraction) — swap models here only |
| `server/authorAgent.js` | Tier 2 trace generator code writer |
| `server/sandbox.js` | Sandboxed execution for Tier 2 generated code |
| `server/algorithms/cache.js` | Tier 2 code cache — compound keys, correctness gate (`outputMatchesExpected`), L1+L2 storage |
| `server/vizMapper.js` | Trace step → viz_actions + context panel updates |
| `server/algorithms/mapper.coverage.test.js` | Registry-driven exhaustiveness gate for vizMapper. WIP snapshots track what's allowed to be incomplete. New algorithms added to the registry must pass or be added to a WIP set. |
| `server/contextPanelDefaults.js` | Default context panels per algorithm + per reasoning mode |
| `server/rendererManifest.js` | Renderer documentation (action schemas, examples) |
| `server/leetcodeAgent.js` | LeetCode problem classifier (algorithm_key + test_case + expected_output extraction) |
| `server/tts.js` | TTS synthesis + WebSocket audio streaming |
| `server/pseudocode.js` | Pseudocode definitions for pseudocode panels |
| `server/graphLayout.js` | Auto-layout (grid + force-directed) for graphs |
| `server/db.js` | Supabase DB helpers (conversations, agent state, lc_sessions) |

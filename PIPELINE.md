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
  │ Tier 1: hand-written run() (92 algorithms) │
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
**Model:** `claude-opus-4-6` with `thinking: { type: 'adaptive' }` (extended thinking)  
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
  tier: 2,            // explicitly marked for Tier 2-only
}
```

#### Tier 1: Hand-Written Trace Generators

`run` is a synchronous JS function that executes the real algorithm and emits a step-by-step trace array. Deterministic, instant, no network call. Every algorithm in the registry is Tier 1 — there are no `run: null` stubs.

**Tier 1 algorithms by renderer (92 total):**

| Renderer | Algorithms |
|---|---|
| `graph` | dijkstra, bfs, dfs, kruskal, prim, maxflow, bellman_ford, dag_shortest, poly_reduction, trie, union_find, topological_sort, backtracking, word_search, multi_source_bfs, floyd_warshall, tarjan_bridges, bipartite_check, dijkstra_k_stops, number_of_islands |
| `array` | mergesort, quickselect, sliding_window, binary_search, two_pointers, max_subarray, rotate_array, prefix_sum, difference_array, lis, house_robber, sieve_primes, spiral_matrix, rotate_matrix, combination_sum, subsets, permutations, sliding_window_max, jump_game |
| `table` | knapsack, edit_distance, coin_change, lcs, word_break, climbing_stairs, min_path_sum, stock_dp, interval_dp, palindrome_dp, bitmask_dp |
| `tree` | huffman, heap_ops, bst_insert, tree_depth_dfs, tree_level_order, tree_path, tree_dp, top_k_heap, median_finder, k_closest_points, lca_tree, validate_bst, linked_list_cycle, merge_k_sorted |
| `linked` | linked_list_reversal, stack_operations, queue_operations, monotonic_stack |
| `interval` | interval_merge, interval_scheduling |
| `string` | sliding_window_string, valid_palindrome, expand_palindrome, kmp_search, find_anagrams, rabin_karp, manacher |
| `context` | hash_map_grouping, frequency_count, two_sum_hash, string_hash, set_operations, bit_ops, math_simulation, greedy_choice, jump_game_ii, valid_parentheses, task_scheduler, lru_cache, fast_power, gcd_algorithm, majority_vote |

#### Tier 2: AI-Generated Trace Generators (dynamic only)

Tier 2 fires only when a LeetCode problem is submitted with an `algorithm_key` that does **not** match any registry entry — i.e. it's a pattern variant or niche algorithm outside the known 92. There are no pre-defined `run: null` stubs in the registry.

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

**`authorAgent.js`:** Writes a JS function `run(input) { return trace; }` for the given algorithm + renderer. Each step must include `type`, `description`, and renderer-specific fields. The final `result` step must include `output: "<answer as plain string>"`. For `context` renderer, every step must include `viz_actions` that update the `algorithm_state` panel.

**`sandbox.js`:** Executes generated code in isolation with a 5-second timeout.

**`cache.js`:** Two-level cache (L1 in-memory Map, L2 Supabase `generated_traces` table). Persists generated code keyed by compound `algorithmId:title` so it doesn't regenerate on every request. Hit count tracked per key. Exports `buildCacheKey`, `outputMatchesExpected`, `getCachedGenerator`, `cacheGenerator`, `incrementHitCount`.

**Key difference:** Tier 1 traces are guaranteed correct (hand-written, deterministic, covered by `tier1.deep.test.js`). Tier 2 traces are generated on-demand for unknown patterns — they get cached only when the trace passes both a 3-step minimum and an output correctness check against Example 1. The LeetCode entry point exposes `viz_tier: 1 | 2` to the client so it can display appropriate confidence UI.

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

---

### Stage 5: Teaching Loop (LLM-driven)

**File:** `server/guidedAgent.js`  
**Model:** `claude-opus-4-6`, `max_tokens: 4096`  
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

1. Resolve `trace_step_indices` → call `mapTraceStep()` → prepend auto viz_actions
2. Validate manual `viz_actions` against panel registry + graph node IDs
3. Send `segment_start` message to client (contains narration text + viz_actions)
4. Call `synthesizeAndStream()` (TTS) — streams audio chunks via binary WS messages
5. Wait for TTS completion (or pause/skip/interrupt signals)
6. Send `audio_flush` + `segment_end`
7. Check `session.interruptFlag` — if set, snapshot graph state, stub remaining tools, inject `[LEARNER INTERRUPT]` message

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

Algorithm categories (all Tier 1):

| Category | Algorithms |
|---|---|
| Graph Algorithms | dijkstra, bfs, dfs, kruskal, prim, maxflow, bellman_ford, dag_shortest, union_find, topological_sort, trie, backtracking, word_search, multi_source_bfs, floyd_warshall, tarjan_bridges, bipartite_check, dijkstra_k_stops, number_of_islands |
| Sorting | mergesort |
| Dynamic Programming | knapsack, edit_distance, coin_change, lcs, max_subarray, word_break, climbing_stairs, min_path_sum, lis, stock_dp, interval_dp, palindrome_dp, bitmask_dp, tree_dp, house_robber |
| Divide and Conquer | quickselect |
| Greedy Algorithms | huffman, interval_merge, interval_scheduling, greedy_choice, jump_game, jump_game_ii |
| Data Structures | heap_ops, bst_insert, linked_list_reversal, stack_operations, queue_operations, monotonic_stack, top_k_heap, median_finder, k_closest_points, lru_cache, trie |
| Trees | tree_depth_dfs, tree_level_order, tree_path, tree_dp, lca_tree, validate_bst |
| Linked Lists | linked_list_cycle, merge_k_sorted |
| Searching / Two Pointers | binary_search, two_pointers, sliding_window, sliding_window_max |
| Prefix / Difference Arrays | prefix_sum, difference_array |
| Matrix | spiral_matrix, rotate_matrix, number_of_islands |
| Backtracking | backtracking, word_search, combination_sum, subsets, permutations |
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

Algorithms with pseudocode panels: dijkstra, bfs, kruskal, maxflow, knapsack, bellman_ford, dag_shortest, huffman, quickselect.

Context panels are updated via `emit_segment` viz_actions:
```js
{ renderer: "context", action: "update", params: { panel_id: "distances", entries: [...] } }
{ renderer: "context", action: "append_log", params: { panel_id: "aug_paths", entries: [...] } }
```

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
parseLeetcodeProblem(problemText)         ← claude-haiku-4-5-20251001, 10s timeout
    │
    ▼
{ title, algorithm_key, confidence, test_case, test_case_source, expected_output, fallback_reason }
    │   expected_output: Example 1 answer as plain string ("MMMDCCXLIX", "3", "[0,1]")
    │   or null if student only pasted partial problem (no example output visible)
    │
    ├── confidence >= 0.7 AND algo has run/tier2 entry?
    │       YES → runAlgorithmWithFallback(algorithm_key, test_case, { description: title, expectedOutput })
    │             ├── returns { trace, renderer, input, tier }
    │             └── sends lc_viz_ready { algorithm_key, renderer, trace, input, tier } to client
    │                (client can render the trace immediately, before teaching begins)
    │
    │   session._leetcodeExpectedOutput stored for reuse at agentLib.js call site
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
    │             LLM Loop (claude-opus-4-6)                      │
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
    │      └── Tier 1: hand-written run() (all 92 known algos)    │
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
| `server/authorAgent.js` | Tier 2 trace generator code writer |
| `server/sandbox.js` | Sandboxed execution for Tier 2 generated code |
| `server/algorithms/cache.js` | Tier 2 code cache — compound keys, correctness gate (`outputMatchesExpected`), L1+L2 storage |
| `server/vizMapper.js` | Trace step → viz_actions + context panel updates |
| `server/contextPanelDefaults.js` | Default context panels per algorithm + per reasoning mode |
| `server/rendererManifest.js` | Renderer documentation (action schemas, examples) |
| `server/leetcodeAgent.js` | LeetCode problem classifier (algorithm_key + test_case + expected_output extraction) |
| `server/tts.js` | TTS synthesis + WebSocket audio streaming |
| `server/pseudocode.js` | Pseudocode definitions for pseudocode panels |
| `server/graphLayout.js` | Auto-layout (grid + force-directed) for graphs |
| `server/db.js` | Supabase DB helpers (conversations, agent state, lc_sessions) |

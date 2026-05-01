# ReLU — Problem Solving & Visualization Pipeline

This document covers the full server-side pipeline: from a student pasting a problem to the final visual trace and narration they receive. Covers agent orchestration, tier system, renderer selection, trace generation, and teaching loop mechanics.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Session Lifecycle](#2-session-lifecycle)
3. [Three Entry Modes](#3-three-entry-modes)
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
  ▼                                             ▼
guidedAgent.js                         explainAgent.js
(Socratic — student-driven)            (Direct — tutor-driven)
       │                                        │
       └──────────────┬─────────────────────────┘
                      │
              [shared sub-pipeline]
                      │
       ┌──────────────┼─────────────────────────┐
       ▼              ▼                          ▼
   solver.js    graphBuilder.js           rendererAdvisor.js
  (classify)   (build example graph)     (advise renderer)
       │
       ▼
  algorithms/registry.js
  ┌────┴──────────────────────┐
  │ Tier 1: hand-written run()│
  │ Tier 2: authorAgent.js    │
  └───────────────────────────┘
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
  mode: 'direct' | 'guided' | 'explain' | 'leetcode',
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

## 3. Three Entry Modes

| WS message | Handler | Notes |
|---|---|---|
| `start_guided` | `guidedAgent.startGuidedSession()` | Socratic dialogue + viz |
| `start_explain` | `explainAgent.startExplainSession()` | Direct explanation + viz |
| `start_leetcode` | `leetcodeAgent.parseLeetcodeProblem()` → pre-run trace → `guidedAgent.startGuidedSession()` | LeetCode-specific entry |
| `resume_conversation` | `guidedAgent.resumeGuidedSession()` | Restores saved agent state from DB |

All three modes eventually drive the same teaching loop using the same tool set.

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
- A renderer (graph, table, interval, recursion_tree) may or may not be created — `rendererAdvisor` decides when and whether one adds value
- If a renderer is created, the agent must highlight elements manually via `viz_actions` in each `emit_segment` (e.g. `highlight_node`, `highlight_edge`, `fill_cell`)
- `run_algorithm` is only called if the student explicitly asks to see the algorithm execute — it's not part of the standard flow

### What this means in practice

| | Trace Mode | Design Mode |
|---|---|---|
| Viz planner | `build_example_graph` | `rendererAdvisor` |
| Trace array | Always produced | Never produced (or optional) |
| `run_algorithm` call | Required | Forbidden unless student asks |
| viz_actions source | Auto-generated by `vizMapper` from trace indices | Hand-constructed by agent in each `emit_segment` |
| Context panels | Auto-configured from `getDefaultContextPanels(algorithm)` | Auto-configured from `getModeDefaultPanels(reasoning_mode)` |
| Renderer | Always created (matches algorithm's registered renderer) | Created only if `rendererAdvisor` recommends one |
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

#### For non-execution modes: `rendererAdvisor.js`

**Tool name:** `advise_renderer`  
**Model:** single Claude API call  

Returns visualization advice (no graph construction — that's the agent's job):

```
{
  renderer: 'graph' | 'table' | 'interval' | 'recursion_tree' | null,
  create_at_stage: 'immediately' | 'at_recurrence' | 'at_algorithm_design' | 'never',
  viz_stages: [{ stage, description }],
  recurrence_params: { a, b, d }  // for D&C / runtime only
}
```

Context panels for non-execution modes are **auto-configured** server-side via `getModeDefaultPanels(reasoning_mode)` at the moment `run_solver` returns — the agent does NOT need to call `create_visualization` for them:

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

`run != null`. A synchronous JS function that executes the real algorithm and emits a step-by-step trace array. Deterministic, instant, no network call.

**Tier 1 algorithms by renderer:**

| Renderer | Algorithms |
|---|---|
| `graph` | dijkstra, bfs, dfs, kruskal, prim, maxflow, bellman_ford, poly_reduction, dag_shortest, trie, union_find, topological_sort, backtracking |
| `array` | mergesort, quickselect, sliding_window, binary_search, two_pointers, monotonic_stack |
| `table` | knapsack, edit_distance, coin_change, lcs |
| `tree` | huffman, heap_ops, bst_insert |
| `linked` | linked_list_reversal, stack_operations, queue_operations, monotonic_stack |
| `interval` | interval_merge, interval_scheduling |
| `string` | sliding_window_string, valid_palindrome, expand_palindrome, kmp_search, find_anagrams |

#### Tier 2: AI-Generated Trace Generators

`run: null`. Used for algorithms where a hand-written trace isn't available.

**Flow:**
```
runAlgorithmWithFallback(algorithmId, input)
  ├── Check if algo.run exists → Tier 1 (fast path)
  └── Tier 2 path:
       ├── getCachedGenerator(algorithmId)
       │    └── if cached: executeTraceInSandbox(cached.code, input)
       └── if not cached:
            ├── generateTraceGenerator(algorithmId, renderer)  ← authorAgent.js + claude-opus-4-6
            ├── executeTraceInSandbox(code, input, 5000ms)      ← sandbox.js
            ├── Validate node IDs (graph renderer only)
            └── if trace.length >= 3: cacheGenerator(algorithmId, code)
```

**`authorAgent.js`:** Writes a JS function `run(input) { return trace; }` for the given algorithm + renderer. Each step must include `type`, `description`, and renderer-specific fields. For `context` renderer, every step must include `viz_actions` that update the `algorithm_state` panel.

**`sandbox.js`:** Executes generated code in isolation with a 5-second timeout.

**`cache.js`:** Persists generated code to a DB table so it doesn't regenerate on every request. Hit count tracked per algorithm.

**Tier 2 algorithms:**

| Renderer | Algorithms |
|---|---|
| `context` | hash_map_grouping, frequency_count, two_sum_hash, string_hash, greedy_choice, set_operations, bit_ops, math_simulation |
| `array` | prefix_sum, array_manipulation, divide_conquer_array |
| `table` | matrix_dp, string_dp, recursion_memoization |
| `graph` | backtrack_grid |

**Key difference:** Tier 1 traces are guaranteed correct (hand-tested). Tier 2 traces are generated on-demand and may contain minor inaccuracies — they get cached after passing a 3-step minimum bar. The LeetCode entry point exposes `viz_tier: 1 | 2` to the client so it can display appropriate confidence UI.

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

For LeetCode mode, an additional keyword check in `applyClassification()` overrides the registry renderer for algorithms containing `interval`, `schedule`, `machine`, `job`, or `activity` in the name → forces `interval` renderer.

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

**Files:** `server/guidedAgent.js`, `server/explainAgent.js`  
**Model:** `claude-opus-4-6`, `max_tokens: 4096`  
**Max API calls per session:** Guided = 150, Explain = 100

Both agents run the same loop structure:

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
- `run_solver` / `run_solver_batch` → calls `solver.js`
- `build_example_graph` → calls `graphBuilder.js`
- `advise_renderer` → calls `rendererAdvisor.js`
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

Algorithm categories:

| Category | Algorithms |
|---|---|
| Graph Algorithms | dijkstra, bfs, dfs, kruskal, prim, maxflow, bellman_ford, dag_shortest, union_find, topological_sort, trie, backtracking |
| Sorting | mergesort |
| Dynamic Programming | knapsack, edit_distance, coin_change, lcs, dag_shortest |
| Divide and Conquer | quickselect |
| Greedy Algorithms | huffman, interval_merge, interval_scheduling |
| Data Structures | heap_ops, trie, bst_insert, linked_list_reversal, stack_operations, queue_operations, monotonic_stack |
| Searching | binary_search, two_pointers, sliding_window |
| String Algorithms | sliding_window_string, valid_palindrome, expand_palindrome, kmp_search, find_anagrams |
| Complexity Theory | poly_reduction |
| Backtracking | backtracking |
| Tier 2 — Data Structures | hash_map_grouping, frequency_count, two_sum_hash, string_hash, set_operations |
| Tier 2 — Algorithms | prefix_sum, array_manipulation, divide_conquer_array, bit_ops, math_simulation, greedy_choice |
| Tier 2 — DP | matrix_dp, string_dp, recursion_memoization |
| Tier 2 — Backtracking | backtrack_grid |

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

The student can interrupt mid-explanation with a question. The pipeline:

1. Client sends `interrupt` WS message with `question` text
2. `session.interruptFlag` is set
3. After the current `emit_segment` completes, the agent detects the flag
4. **Graph state snapshot** saved to `session._savedGraphState` (graph, trace, algorithm, renderer, mapperState, emittedTraceSteps, lastVizMessage, rendererVizHistory)
5. Remaining tool calls in the current LLM turn are stub-cancelled
6. `[LEARNER INTERRUPT]` injected into messages
7. Agent calls `respond_to_interrupt` tool with one of four modes:

| Mode | When to use | Mechanism |
|---|---|---|
| `overlay` | "Why this node?" questions — highlight a subset | Dims entire graph to 15% opacity, spotlights specified nodes/edges at full brightness + annotations |
| `rewind` | "What just happened?" / "I'm lost" | Replays N recent segments with slower-paced re-narration |
| `ghost_alternative` | "What if we went through Y instead?" | Shows alternative path as translucent ghost overlay alongside actual chosen path |
| `illustrate` | Conceptual "why does X work?" where current graph can't show it | Temporarily replaces lesson graph with a small example graph (3–6 nodes), agent narrates freely, then `end_illustration` restores |
| `none` | Simple factual answer | Just narration, no visual change |

After interrupt handling, `end_illustration` or the built-in restore logic in `agentLib.restoreGraphState()` replays all previously-emitted trace steps to restore the graph to its pre-interrupt state.

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
{ title, algorithm_key, confidence, test_case, test_case_source, fallback_reason }
    │
    ├── confidence >= 0.7 AND algo has run/tier2 entry?
    │       YES → runAlgorithmWithFallback(algorithm_key, test_case)
    │             ├── returns { trace, renderer, input, tier }
    │             └── sends lc_viz_ready { algorithm_key, renderer, trace, input, tier } to client
    │                (client can render the trace immediately, before teaching begins)
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
          ├─── mode: guided ──────────────────────────────────────┐
          ├─── mode: explain ─────────────────────────────────────┤
          └─── mode: leetcode ────────────────────────────────────┤
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
    │  [if non-execution mode]                                    │
    │  advise_renderer ─────────────────────────────────────────► rendererAdvisor.js
    │      └── renderer, create_at_stage, viz_stages              │
    │          (context panels already auto-configured)           │
    │                                                             │
    │  create_visualization / create_graph ─────────────────────► client: mount renderer
    │                                                             │
    │  run_algorithm ───────────────────────────────────────────► registry.js
    │      └── Tier 1: hand-written run()                         │
    │          Tier 2: cache.js → sandbox.js → authorAgent.js    │
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
| `server/explainAgent.js` | Direct explanation loop, system prompt, explain tools |
| `server/tools.js` | Claude tool schemas (shared between both agents) |
| `server/agentLib.js` | Shared tool execution logic (emit_segment, create_graph, etc.) |
| `server/solver.js` | Pre-teaching problem solver (claude-opus-4-6 + extended thinking) |
| `server/graphBuilder.js` | Example graph constructor for algorithm_execution mode |
| `server/rendererAdvisor.js` | Renderer + stage advisor for non-execution modes |
| `server/algorithms/registry.js` | Algorithm registry, Tier 1/2 dispatch, renderer fallback |
| `server/authorAgent.js` | Tier 2 trace generator code writer |
| `server/sandbox.js` | Sandboxed execution for Tier 2 generated code |
| `server/cache.js` | Tier 2 code cache (avoid regenerating) |
| `server/vizMapper.js` | Trace step → viz_actions + context panel updates |
| `server/contextPanelDefaults.js` | Default context panels per algorithm + per reasoning mode |
| `server/rendererManifest.js` | Renderer documentation (action schemas, examples) |
| `server/leetcodeAgent.js` | LeetCode problem classifier (algorithm_key + test_case extraction) |
| `server/tts.js` | TTS synthesis + WebSocket audio streaming |
| `server/pseudocode.js` | Pseudocode definitions for pseudocode panels |
| `server/graphLayout.js` | Auto-layout (grid + force-directed) for graphs |
| `server/db.js` | Supabase DB helpers (conversations, agent state, lc_sessions) |

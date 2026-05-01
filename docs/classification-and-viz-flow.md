# Problem Classification & Visualization Flow

Complete reference for how problems flow through Argmax from submission to teaching.

## Entry Point: Mode Selection

The user clicks one of two buttons before submitting:

| Button | Server Function | System Prompt | Teaching Style |
|--------|----------------|---------------|----------------|
| **Guide Me** | `startGuidedSession()` | `GUIDED_SYSTEM_PROMPT` | Socratic dialogue, comprehension gates, student-produces |
| **Just Explain** | `startExplainSession()` | `EXPLAIN_SYSTEM_PROMPT` | Direct narration, no dialogue, teacher-produces |

Both modes share the same solver, viz planner, and tool infrastructure. The difference is purely in the system prompt's teaching instructions.

## Decision 1: Concept vs. Concrete Problem

The agent's first task (before any tool calls) is to classify the input:

| Type | Examples | Flow |
|------|----------|------|
| **Concept Request** | "Explain BFS", "How does Dijkstra work?", "What is DP?" | CONCEPT FLOW |
| **Concrete Problem** | "Run Dijkstra on this graph: A-B:4...", "Prove this is NP-complete" | CONVERSATIONAL FLOW |

### Concept Flow
```
1. Acknowledge what to learn (1 segment)
2. Identify closest algorithm from registry
3. Call classify_problem
4. Agent constructs its own small example (5-7 nodes for graphs, 6-10 elements for arrays)
5. Call run_algorithm on constructed example → trace
6. Walk through trace interactively (Socratic in Guide Me, direct in Explain)
7. lesson_complete
```
**No solver. No viz planner.** Agent builds everything from scratch.

### Conversational Flow (Concrete Problems)
Continues to Decision 2 below.

## Decision 2: Multi-Part Detection (STAGE -1)

Agent reads the problem and checks for multiple parts.

| Situation | Action |
|-----------|--------|
| Single problem / no parts | `run_solver(problem_text)` |
| Multiple parts detected | `send_options(multiSelect: true)` → student picks parts |
| Student picks 1 part | `run_solver(that_part)` |
| Student picks multiple | `run_solver_batch(all_selected)` |

**Critical rule:** Solver ALWAYS runs BEFORE classification. The solver result becomes the agent's hidden "north star."

## The Solver (Background Process)

`server/solver.js` — runs Claude Opus on the raw problem. Returns:

| Field | Description |
|-------|-------------|
| `solution` | Complete step-by-step solution |
| `approach` | Short name (e.g., "XOR bit encoding") |
| `complexity` | Time/space (e.g., "O(n log n), O(n)") |
| `confidence` | high / medium / low |
| `paradigmShift` | Does the obvious approach fail? |
| `obviousApproach` | What students try first |
| `keyInsight` | Single most important idea |

This is injected into the system prompt as hidden context:
```
===== SOLVER CONTEXT (INTERNAL — NEVER REVEAL TO STUDENT) =====
OPTIMAL APPROACH: [approach]
KEY INSIGHT: [keyInsight]
SOLUTION: [solution]
...
RULES: Guide toward THIS approach. Never mention you pre-solved it.
=====
```

The solver runs in the background while the agent begins teaching (intake question, classification). When it completes, a `[SOLVER COMPLETE]` message is injected into the conversation.

## Decision 3: Reasoning Mode (STAGE 0)

After the intake question, the agent determines the **reasoning mode** using the classification tree and/or the student's intake response.

### Classification Tree Structure
```
"What type of reasoning does this problem require?"
│
├─ Execute a known algorithm → algorithm_execution
│  ├─ Graph problems
│  │  ├─ Shortest path → dijkstra / bfs
│  │  ├─ Spanning tree → prim / kruskal
│  │  ├─ Max flow → maxflow
│  │  └─ Traversal → bfs / dfs
│  ├─ Optimization → knapsack / lcs / edit_distance / coin_change
│  ├─ Sorting → quicksort / mergesort / insertion_sort
│  ├─ Search → binary_search
│  ├─ Data structures → bst_insert / heap_operations / etc.
│  └─ Math → gcd
│
├─ Formal modeling (LP, reduction, duality) → modeling
├─ Greedy algorithm design + proof → greedy_design
├─ DP design → dp_design
├─ Divide-and-conquer design → dc_design
└─ Runtime/asymptotics analysis → runtime
```

The agent calls `classify_problem` with the determined mode. This is the central decision hub.

### classify_problem Output

| Field | Purpose |
|-------|---------|
| `reasoning_mode` | Which of 6 flows to follow |
| `is_in_scope` | Maps to a known algorithm? |
| `target_algorithm` | Algorithm ID (algorithm_execution only) |
| `closest_algorithm` | Fallback algorithm for context |
| `problem_summary` | One-sentence summary |
| `key_insight` | Main modeling insight needed |
| `critical_concepts` | 1-3 concepts that must be comprehension-gated |
| `internal_model_contract` | Hidden: state definition, transitions, cost model, constraints |

## Post-Classification: Six Parallel Flows

### Flow 1: Algorithm Execution (`algorithm_execution`)

```
classify_problem(target_algorithm: "dijkstra")
  → Offer refresher via show_canonical_example (optional)
  → [If solver done] call plan_visualization → panels, algorithm_runs, graph_variants
  → call create_visualization with planner's layout
  → call run_algorithm → trace (array of steps)
  → emit_segment with trace_step_indices → vizMapper auto-maps to viz_actions
  → verify_result if sample I/O available
  → lesson_complete
```

**Agents/processes involved:**
| Agent | Role |
|-------|------|
| Solver (Opus) | Pre-solves problem, provides north star |
| Viz Planner (Sonnet) | Decides layout, builds graphs, plans algorithm runs |
| Guided Agent (Opus) | Teaches via Socratic dialogue |
| vizMapper (code) | Maps trace steps → viz_actions deterministically |

**Auto-configured:** Nothing (viz planner handles everything)

**Visualization:** Graph/array/table/tree/linked/interval — whatever the planner decides

### Flow 2: Modeling (`modeling`)

```
classify_problem(reasoning_mode: "modeling")
  → Auto-creates: graph renderer + Formulation panel
  → Agent guides through Modeling Template:
    1. OBJECTS — decision variables
    2. OBJECTIVE — what's optimized
    3. CONSTRAINTS — what must hold
    4. TRICK — transformations needed
    5. SANITY CHECK — verify coverage
  → lesson_complete
```

**Agents/processes involved:**
| Agent | Role |
|-------|------|
| Solver (Opus) | Pre-solves, provides target formulation |
| Guided Agent (Opus) | Walks student through template |

**Auto-configured:** `graph` renderer + `formulation` context panel

**No viz planner.** Agent fills formulation panel via `renderer:"context"` viz_actions.

### Flow 3: Greedy Design (`greedy_design`)

```
classify_problem(reasoning_mode: "greedy_design")
  → Auto-creates: no renderer + Greedy Rule panel + Proof Skeleton panel
  → Agent guides:
    1. RULE — student proposes greedy criterion
    2. EXAMPLE — trace greedy on concrete example
    3. ALGORITHM — student assembles pseudocode
    4. PROOF — student fills exchange argument (Lower bound / Upper bound / Combining)
    5. RUNTIME — student analyzes
  → lesson_complete
```

**Auto-configured:** No renderer, `greedy_rule` + `proof_skeleton` context panels

### Flow 4: DP Design (`dp_design`)

```
classify_problem(reasoning_mode: "dp_design")
  → Auto-creates: table renderer + DP Definition panel + Recurrence panel
  → Agent guides:
    1. SUBPROBLEM — "What does dp[i] represent?" (hardest part)
    2. RECURRENCE — student writes recurrence
    3. BASE CASES — boundary conditions
    4. ORDER — fill order
    5. RUNTIME — analysis
  → lesson_complete
```

**Auto-configured:** `table` renderer + `dp_definition` + `recurrence` context panels

### Flow 5: Divide-and-Conquer Design (`dc_design`)

```
classify_problem(reasoning_mode: "dc_design")
  → Auto-creates: NO renderer + D&C Structure panel + Recurrence panel
  → Agent CHOOSES visualization:
    A) recursion_tree — if clean T(n) = aT(n/b) + O(n^d) recurrence
    B) graph — if case analysis / branching logic (used as decision tree)
    C) none — if purely structural/proof-based
  → Agent guides:
    1. SPLIT — how to divide input
    2. SUBPROBLEMS — recursive calls
    3. COMBINE — merge results
    4. RECURRENCE — runtime analysis
  → lesson_complete
```

**Auto-configured:** No renderer (agent chooses), `dc_structure` + `recurrence` context panels

### Flow 6: Runtime / Asymptotics (`runtime`)

```
classify_problem(reasoning_mode: "runtime")
  → Auto-creates: recursion_tree renderer + Runtime Analysis panel
  → Agent guides:
    1. Identify bound type (upper, lower, tight)
    2. Identify method (Master Theorem, substitution, recursion tree)
    3. If recursion tree: set_recurrence_tree → reveal_level → show_master_case
    4. Walk proof steps
  → lesson_complete
```

**Auto-configured:** `recursion_tree` renderer + `runtime_analysis` context panel

## Summary: Who Does What

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROBLEM SUBMITTED                            │
│                                                                 │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐               │
│  │  Solver   │     │ Viz Plan │     │ Guided   │               │
│  │  (Opus)   │     │ (Sonnet) │     │  Agent   │               │
│  │           │     │          │     │  (Opus)  │               │
│  │ Pre-solve │     │ Layout + │     │ Teaches  │               │
│  │ problem   │     │ graphs   │     │ student  │               │
│  └─────┬─────┘     └────┬─────┘     └────┬─────┘               │
│        │                │                │                      │
│        ▼                ▼                ▼                      │
│  ┌─────────────────────────────────────────────┐               │
│  │           WHEN IS EACH USED?                 │               │
│  ├─────────────────────────────────────────────┤               │
│  │                                              │               │
│  │  Concept Request:                            │               │
│  │    Solver: ✗  VizPlan: ✗  Agent: builds own  │               │
│  │                                              │               │
│  │  algorithm_execution:                        │               │
│  │    Solver: ✓  VizPlan: ✓  Agent: narrates    │               │
│  │                                              │               │
│  │  modeling:                                   │               │
│  │    Solver: ✓  VizPlan: ✗  Agent: fills panels│               │
│  │                                              │               │
│  │  greedy_design:                              │               │
│  │    Solver: ✓  VizPlan: ✗  Agent: fills panels│               │
│  │                                              │               │
│  │  dp_design:                                  │               │
│  │    Solver: ✓  VizPlan: ✗  Agent: fills panels│               │
│  │                                              │               │
│  │  dc_design:                                  │               │
│  │    Solver: ✓  VizPlan: ✗  Agent: chooses viz │               │
│  │                                              │               │
│  │  runtime:                                    │               │
│  │    Solver: ✓  VizPlan: ✗  Agent: fills tree  │               │
│  └──────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

## Visualization Pipeline (Client Side)

### Message → State → Layout → Renderer

```
Server sends WebSocket message
  ↓
App.jsx onMessage handler
  ├─ create_graph → loadGraphImmediate() (sync, before React)
  ├─ create_visualization → loadGraphImmediate() for each graph panel
  └─ segment_start → normalizeVizActions() + apply
  ↓
processMessage → reducer dispatch
  ├─ CREATE_GRAPH → state.graph + auto vizPanels
  ├─ SET_VIZ_PANELS → state.vizPanels array
  ├─ SET_CONTEXT_PANELS → state.contextPanels
  └─ SEGMENT_START → state.segments + viz_actions applied
  ↓
Layout decision (App.jsx):
  if (no graph AND no vizPanels AND no contextPanels) → transcriptOnly
  if (no graph AND no vizPanels AND has contextPanels) → contextOnly (35%/65% split)
  if (vizPanels.length > 1 OR non-graph renderer) → VizLayout (multi-panel)
  else → single GraphRenderer (60%/40% split)
  ↓
VizLayout dispatches by renderer name:
  graph → GraphRenderer (Cytoscape.js)
  array → ArrayRenderer
  table → TableRenderer
  tree → TreeRenderer
  linked → LinkedRenderer
  interval → IntervalRenderer
  recursion_tree → RecursionTreeRenderer (D3)
  ↓
rendererRegistry routes viz_actions:
  { renderer: "graph", action: "highlight_node", params: {node: "A"} }
    → GraphRenderer.apply("highlight_node", {node: "A"})
  { renderer: "context", action: "update", params: {panel_id: "formulation", ...} }
    → contextManager dispatches to reducer → ContextPanelHost re-renders
```

### Viz Action Application Modes

| Mode | Function | Behavior |
|------|----------|----------|
| Immediate | `applyActions()` | All actions applied at once |
| Sequenced | `applyActionsSequenced()` | Staggered via GSAP timeline (120ms between) |

### Renderer Registry Buffering

If a viz_action arrives before its target renderer is registered (race condition — React hasn't mounted the component yet), the action is buffered in `pendingActions[renderer]` and replayed when the renderer calls `registerRenderer()`.

## Trace-to-VizAction Mapping (Algorithm Execution Only)

`server/vizMapper.js` — deterministic, per-algorithm mapping:

```
emit_segment(trace_step_indices: [0, 1, 2])
  ↓
For each trace step:
  mapTraceStep(algorithm, rendererType, step, mapperState)
    ↓
  Returns { viz: [...], ctx: [...] }
    viz = renderer actions (highlight_node, mark_visited, etc.)
    ctx = context panel updates (distances table, PQ contents, etc.)
  ↓
Merged with any explicit viz_actions from the agent
  ↓
Sent as segment_start message to client
```

This only applies to `algorithm_execution` mode. Design modes use manual viz_actions exclusively.

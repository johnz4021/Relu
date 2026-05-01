# Concept Explanation Flow

What happens when a user asks a general question with no problem attached — e.g. "Explain divide and conquer", "How does Dijkstra work?", "What is dynamic programming?"

---

## Detection

The LLM makes the concept vs. concrete decision. Both agents inject this into the first user message:

> *"First, determine if this is a concept/general explanation request or a concrete problem with specific input. If it's a concept request, follow the CONCEPT FLOW..."*

No regex, no keyword matching. The agent reads the input and decides.

---

## Which Agents Run

| Agent | Runs? | Role |
|-------|-------|------|
| Solver (`solver.js`, Claude Opus) | **NO** | Only called for concrete problems |
| GraphBuilder planner (`graphBuilder.js`, Claude Opus) | **NO** | Only called for `algorithm_execution` concrete problems |
| RendererAdvisor (`rendererAdvisor.js`) | **NO** | Only called for design/proof concrete problems |
| Teaching agent (`explainAgent.js` or `guidedAgent.js`, Claude Opus) | **YES** | Runs the full session |

The teaching agent is the only Claude call for concept requests. ~3–5 API calls total vs. ~6–10 for concrete problems.

---

## System Prompt Instructions

### ExplainAgent (`EXPLAIN_SYSTEM_PROMPT`, lines 43–60)

```
CONCEPT FLOW (for concept/general explanation requests):
1. Acknowledge what the student wants to learn (1 segment via emit_segment).
2. Identify the closest algorithm from the AVAILABLE ALGORITHMS list.
3. Construct a small, clear example input yourself:
   - Graph algorithms: 5–7 nodes with meaningful weights/capacities
   - Sorting/searching: small array (6–10 elements)
   - DP: small instance (e.g., small knapsack, short strings for LCS)
4. Set up the visualization (create_graph or create_visualization).
5. Call run_algorithm with the constructed input.
6. Narrate each step using emit_segment with trace_step_indices, explaining
   WHY each step happens, not just WHAT happens.
7. Summarize key ideas, time complexity, and when to use this algorithm.
8. Call lesson_complete.
```

### GuidedAgent (`GUIDED_SYSTEM_PROMPT`, lines 51–64)

Same steps 1–4 and 6–7, with one difference at step 5:

```
5. Walk through the trace interactively — STILL use the Socratic approach:
   ask the student what they think happens at key steps, use comprehension
   gates on critical concepts, respect the monologue cap.
```

**The only difference between the two agents for concepts is teaching style**: ExplainAgent narrates directly, GuidedAgent asks Socratic questions at each step.

---

## Tools Called

```
✓ emit_segment           narration + viz_actions
✓ create_graph           or create_visualization — agent-constructed
✓ run_algorithm          on the agent's own invented example
✓ lesson_complete        end session
✓ respond_to_interrupt   if student asks mid-lesson

✗ run_solver / run_solver_batch    no problem to pre-solve
✗ send_options                     no sub-problems
✗ build_example_graph              concrete algorithm_execution only
✗ advise_renderer                  concrete design/proof modes only
```

---

## Prebuilt Content vs. LLM Improvisation

| Component | Source |
|-----------|--------|
| Example graph / array / input | **LLM** — invented from scratch |
| Graph node positions | **Code** — `autoLayout()` in `agentLib.js` if agent omits them |
| Algorithm trace | **Code** — `run_algorithm` executes real deterministic code on the agent's example |
| Trace → viz action mapping | **Code** — `vizMapper.js` same deterministic mapper as concrete problems |
| Context panels (pseudocode, distances, PQ…) | **NOT auto-created** — agent must explicitly include them in `create_visualization`; none are injected |
| Narration text | **LLM** |
| Viz actions for non-trace highlights | **LLM** |
| Teaching sequence and structure | **LLM** |

The only "free" structure the agent gets is the algorithm trace and viz mapping after `run_algorithm`. Everything else is LLM output.

---

## What Does NOT Happen (vs. Concrete Problems)

- **No `applyClassification`** → none of the mode-default panels are auto-created
  - No `dp_definition` / `recurrence` panels for a DP concept explanation
  - No `greedy_rule` / `proof_skeleton` panels for a greedy concept explanation
  - No pseudocode panel unless the agent explicitly adds one with specific lines
- **No solver context** injected into the system prompt
- **No `reasoning_mode`** set on the session
- **No viz pre-configuration** of any kind

---

## Flow Diagram

```
User: "Explain divide and conquer"
  ↓
startExplainSession() / startGuidedSession()
  ↓
Initial message with concept-vs-concrete detection text
  ↓
Agent detects: CONCEPT REQUEST
  ↓
emit_segment("Today we'll cover divide and conquer...")
  ↓
create_graph({ nodes: [...5–7 nodes...], edges: [...] })   ← LLM-invented
  ↓
run_algorithm("mergesort", { array: [5, 2, 8, 1, 9, 3] }) ← LLM-invented input
  → server executes real mergesort code → returns trace[]
  ↓
emit_segment({ trace_step_indices: [0,1,2], narration: "First we split..." })
  → vizMapper expands indices → highlight_cell, show_comparison, etc.
  ↓
emit_segment({ trace_step_indices: [3,4,5], narration: "Now we merge..." })
  ↓
... (GuidedAgent: asks Socratic questions at key steps)
  ↓
emit_segment("Key takeaway: D&C gives O(n log n)...")
  ↓
lesson_complete()
```

---

## Known Gap: Design-Mode Concepts

If a user asks about a design/proof topic conceptually — e.g. "explain how to design a DP algorithm" — there is no well-defined path:

- The agent cannot call `run_algorithm` (no algorithm to run)
- No context panels are auto-configured (those only exist post-`applyClassification`)
- `vizMapper` has no mapping for DP design steps

The agent improvises with a `table` renderer, a `graph` decision tree, or plain text narration. Quality is inconsistent.

For **execution-mode concepts** (BFS, Dijkstra, merge sort, etc.) the flow is well-defined and produces good output. For **design-mode concepts** (DP design, greedy design, D&C design), concept requests are a gap.

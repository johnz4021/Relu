# TODOS

Deferred items from /plan-ceo-review (2026-04-24, branch: leetcode-version)
Prerequisite order matters — items marked with [REQUIRES] must follow their dependency.

## LeetCode Mode — Deferred

- [ ] **"Explain my code" mode** — user pastes their code attempt + problem, Argmax analyzes code against the trace. [REQUIRES: core leetcode mode shipped + validated]
- [ ] **Company tags on problems** — tag LeetCode problems by company (Google, Meta, etc.). [REQUIRES: curated problem catalog]
- [ ] **Shareable trace links** — UUID trace snapshot in Supabase → shareable URL. [REQUIRES: lc_sessions table from progress tracking]
- [ ] **Curated problem catalog (Approach B)** — 100-problem DB with guaranteed viz. Replaces LLM extraction for known problems. [REQUIRES: extraction accuracy validated from production data]
- [~] **Browser extension** — IN PROGRESS (chrome-extension branch, /plan-eng-review 2026-06-04). NOTE: original [REQUIRES: core leetcode mode validated with external users] gate was overridden by founder conviction in /office-hours 2026-06-04. Architecture: iframe-embed of relu.run/embed on leetcode.com (see ## Chrome Extension — Eng Review Decisions below).
- [ ] **Mock interview mode** — timed practice sessions with problem sets. [REQUIRES: problem catalog]
- [ ] **Personalized study plan / spaced repetition** — based on lc_sessions history. [REQUIRES: progress tracking + 2+ weeks of user data]

## Algorithm Expansion — Deferred (from /plan-ceo-review 2026-04-27, eng review 2026-04-27)

- [ ] **interval_scheduling v2: multi-machine** — Sort by start time + min-heap of finish times (Meeting Rooms II exact algorithm). v1 (activity selection, single-machine) ships first. [REQUIRES: interval renderer validated from v1 production data]
- [ ] **Backtracking hierarchical layout** — Add `layout: 'tree'` mode to GraphRenderer so decision trees render in a clean top-down hierarchy instead of force-directed. [REQUIRES: backtracking registered + user feedback showing layout is confusing]
- [ ] **Backtracking permutations variant** — Different traversal than subsets (no start-index, full array pass each level). Route to text-only until this is implemented. [REQUIRES: backtracking subsets working]
- [ ] **Container With Most Water (11) / Trapping Rain Water (42)** — Two-pointer variants that need unsorted-array traversal logic. Different algorithm than two_pointers sorted-array. Route to text-only for now. [REQUIRES: two_pointers validated]
- [ ] **Sorting suite (bubble, insertion, quicksort, selection)** — Files exist in server/algorithms/sorting/, array renderer handles compare/swap steps generically. Low LeetCode value; deferred until class-mode is revived. [REQUIRES: none — standalone, low priority]
- [ ] **StackRenderer** — Dedicated renderer for stack-based algorithms. Vertical stack display + animated push/pop + input array cursor (shows what element is currently being processed) + result array panel. Would replace LinkedRenderer for `stack_operations` and `monotonic_stack`. ~200 lines: `client/src/components/renderers/StackRenderer.jsx` + `mapStackStep` in vizMapper + `case 'stack'` dispatch. [REQUIRES: monotonic_stack shipped + user feedback that stack visualization is confusing]
- [x] **sliding_window vizMapper coverage** — Verified complete 2026-05-01. Handlers exist at vizMapper.js:1431-1455 (initial_window, slide, new_max, result cases).
- [x] **union_find vizMapper coverage** — Verified complete 2026-05-01. Handlers exist at vizMapper.js:983-1039 (process_edge, find, already_connected, union cases).

## String Renderer — Deferred (from /plan-ceo-review 2026-04-29, branch: leetcode-version)

- [ ] **rabin_karp** — Rolling hash pattern matching (LC28 alternative). Rabin-Karp concept is hash arithmetic, not string-semantic — less value in StringRenderer context. [REQUIRES: kmp_search shipped + user feedback asking for hashing explanation]
- [ ] **min_window_substring (LC76)** — Variable-size window with character requirement map. Different algorithm from sliding_window_string (LC3 pattern). [REQUIRES: sliding_window_string validated from production data]
- [ ] **Pseudocode panels for 5 string algorithms** — sliding_window_string, valid_palindrome, expand_palindrome, kmp_search, find_anagrams all lack pseudocode panels. Inconsistent with existing algorithms (dijkstra, kruskal, knapsack all have pseudocode). [REQUIRES: algorithm implementations complete — add in follow-up PR]

## Extraction Quality (from Outside Voice review)
- [x] **Few-shot examples in extraction prompt** — BUNDLED INTO THIS PR. Per-algorithm test_case schema examples (including graph adjacency list → {nodes, edges} format) included in parseLeetcodeProblem() extraction prompt. Resolved by /plan-eng-review 2026-04-24.
- [ ] **Extraction accuracy validation** — manually test 20 LeetCode medium problems against parseLeetcodeProblem() before launch. Target: 80% correct routing. Known misses from /qa 2026-04-30: LC53 (Maximum Subarray → should hit array_manipulation, hits dc_design fallback), LC70 (Climbing Stairs → should hit recursion_memoization, hits dp_design fallback). Add few-shot examples for these in parseLeetcodeProblem() extraction prompt.
- [ ] **ISSUE-002: LC53 routing** — Maximum Subarray does not match `array_manipulation` key. Add few-shot example to extraction prompt: `{"problem":"Maximum Subarray","algorithm_key":"array_manipulation","confidence":0.85}`. The Kadane's algorithm pattern (running max, reset on negative) is the Tier 2 trace to show.
- [ ] **ISSUE-003: LC70 routing** — Climbing Stairs does not match `recursion_memoization` key. Add few-shot example to extraction prompt. The fib-style DP memo table is the Tier 2 trace to show.

## Chrome Extension — Eng Review Decisions (from /plan-eng-review 2026-06-04, branch: chrome-extension)

Architecture decided: **iframe-embed** (extension injects `<iframe src="relu.run/embed">` overlay on leetcode.com, reuses the existing React client). Full decision log in the design doc: `~/.gstack/projects/johnz4021-ReLU/johnzhang-chrome-extension-design-20260604-152639.md`.

Deferred items:
- [ ] **Viz auto-play during the solver gap** — fill the ~12s Opus gap by auto-playing the deterministic trace (D8/D12 + /plan-design-review D4). PLAN: server loops `mapTraceStep(algorithm, renderer, step, state)` over the full trace (threading `state`), collects the `{viz, ctx}` sequence, includes it in the `lc_viz_ready` message; client `applyActionsSequenced` the viz after the initial load, then `killActiveTimeline` + reset-to-initial on `guided_start` to hand off to the agent. ENTANGLEMENTS (build with the app running): (1) only the graph renderer is pre-loaded at `lc_viz_ready` via `loadGraphImmediate` — array/string/table/tree panels aren't set up until the agent calls `create_visualization`, so auto-play no-ops for them (incl. Two Sum/array) unless panel setup moves earlier; (2) `vizMapper` is bug-prone (see Pitfalls) — verify per-renderer animation + clean handoff live before deploy. Depends on: app running for live verification. [REQUIRES: live verification session] (files: server/index.js, server/vizMapper.js, client/src/App.jsx, client/src/lib/rendererRegistry.js)
- [ ] **Interactive trace step/scrub in /embed** — let the user manually step/scrub the deterministic animation (beyond v1's auto-play during the solver gap). What: play/step/scrub controls over the already-loaded trace. Why: deepens the viz-first engagement during the ~12s Opus solver wait. Context: v1 ships auto-play of the trace (decided D12); this is the richer interactive version. Depends on: /embed shipped. [REQUIRES: v1 overlay validated]
- [ ] **Live-leetcode extraction canary** — scheduled test that loads a REAL leetcode problem and asserts extraction (slug→GraphQL/__NEXT_DATA__→DOM) still works; alerts on breakage. Why: pinned-fixture Playwright passes even after leetcode redeploys and breaks the extractor — false confidence. Context: leetcode's DOM/data is the most fragile dependency. Depends on: extension shipped + an alerting destination. [REQUIRES: extension shipped]
- [ ] **Socratic opener eval (recognition-vs-reproduction)** — the new guidedAgent opener (replacing "what have you tried?") is a prompt change and a design-doc hard gate. Needs an eval comparing branch correctness + opener quality against the current baseline before it ships. Why: prompt changes need an eval; this one gates activation. Context: separate workstream from the extension architecture — touches server/guidedAgent.js, not the extension. Depends on: eval harness (none exists yet). [REQUIRES: opener implemented]
- [ ] **Overlay narrow-viewport behavior** — define what the sidebar does at narrow widths (~<1100px): width clamp, overlay-vs-push, or auto-nudge to fullscreen. Why: most leetcode grinders are on laptops; a 520px sidebar buries their code and re-creates the friction the overlay removes. Context: form factor decided HYBRID (sidebar default + expand-to-fullscreen, /plan-design-review 2026-06-07); narrow-viewport tuning deferred past v1. Depends on: hybrid sidebar + fullscreen expand shipped. [REQUIRES: sidebar+expand built]

## Infrastructure
- [ ] **lc_sessions Supabase migration** — create table + RLS rules (user_id = auth.uid()) before deploy. Include outcome columns: `solver_succeeded bool`, `viz_rendered bool`, `session_completed bool` (added 2026-05-01 arch review — bundle into same migration, not a separate one).
- [ ] **POST /api/lc-sessions/:id/master** — endpoint or WS message for marking a problem mastered. Accepted scope from CEO plan — implement in this PR alongside lc_sessions write.

## Renderer UX (from /plan-design-review 2026-04-30)

- [ ] **Empty states for all 7 non-String renderers** — Array, Graph, Tree, Linked, Interval, RecursionTree, Table each need ghost placeholder elements matching their renderer type (nodes/bars/intervals) + "Run an algorithm to see the visualization" instructional text. Approved direction: Variant A (ghost cells with dashed borders). Graph empty state shipped in quick-wins PR. [REQUIRES: none — standalone pass]

## Pipeline Efficiency (from /plan-eng-review 2026-05-01)

- [ ] **Auto-generate leetcodeAgent extraction prompt input formats from registry.defaultInput** — SCHEDULED for implementation (arch review 2026-05-01). The 230-line INPUT FORMAT EXAMPLES section in `leetcodeAgent.js:EXTRACTION_SYSTEM_PROMPT` is manually maintained in parallel with `registry.js`. When a new algorithm is added to the registry without updating this prompt, Haiku can't classify it. Fix: `generateInputFormats(ALGORITHMS)` generates the format block at module load. Keep disambiguation rules and "Use for:" guidance hand-authored. CRITICAL: must handle null defaultInput gracefully (crash here breaks all LC classification). Write `server/leetcodeAgent.test.js` covering null-defaultInput case. [REQUIRES: none — in Architecture Cleanup plan]

- [ ] **LeetCode solver eval suite** — Unit tests (T-1, from this PR) cover prompt assembly. What they can't cover: does the restricted-mode solver actually produce better keyInsight? Does hint_algorithm produce more targeted paradigmShift? Create a small eval set: 10-15 representative problems spanning null-key (hard DP, hard greedy), known-key-with-paradigm-shift, and known-key-obvious. Run before/after D1/D2 and persist outputs. [REQUIRES: D1/D2 changes shipped]

## DX Gaps (from /plan-devex-review 2026-04-24)
- [ ] **Auth wall — Google OAuth or skip email verification** — Email verification makes TTHW ~4-5min, putting Argmax in "Needs Work" tier vs VisuAlgo's 30s. Supabase supports Google OAuth in ~30min. Alternatively, disable email verification for beta (Supabase dashboard toggle). [REQUIRES: none — standalone change]
- [ ] **TTHW tracking** — Add `first_viz_shown` PostHog event when the first visualization frame renders in the client. This is the only metric that proves whether TTHW improved. Tie to `lc_session_started` event for funnel analysis.
- [ ] **"Try a sample problem" button** — A student who arrives without a LeetCode URL open can't experience the magic. Add a "Try: Number of Islands" or "Try: Course Schedule" button that pre-fills the textarea with a well-known medium problem. [REQUIRES: core LeetCode mode shipped]
- [ ] **Pre-auth product preview** — The auth modal shows no preview of what the product does. Add a screenshot or 1-sentence description to the AuthModal so students who arrive via a share link understand the value before signing up. Low-effort retention improvement.

## Companion hint escalation (from /plan-eng-review 2026-06-09)

- [ ] **Exhaustive companion-mode behavioral evals** — v1 ships the Standard live-eval suite (turn-1 nudge, partial-attempt no-leak regression, escalation gradient ≤1 rung/turn, explicit show-me reveals, self-report honesty vs keyInsight) across 2-3 problems. Deferred to data-driven follow-up: lazy-user sim (immediate "just tell me" on turn 1 — holds one beat then honors?), adversarial "trick the tutor into leaking the key insight" probe, multi-persona transcripts, and the off-registry text-only reveal path. Real usage should decide which of these actually bite before investing in the flaky live surface. [REQUIRES: Standard companion eval suite shipped]

## Viz pipeline (from companion overlay run 2026-06-09)

- [ ] **Forgiving panel-id alias for improvised viz_actions** — When the agent hand-builds viz_actions (ad-hoc examples, not trace-driven), it targets the generic renderer name (`renderer: "array"`) but panels are registered under ids like `array_main`. `validatePanelIds` then strips every action ("renderer 'array' not declared in create_visualization") and the panel renders BLANK. Repro: companion run on "Search in Rotated Sorted Array II" → ad-hoc ambiguous-case example `[1,1,1,1,1,0,1]` never showed; trace-driven viz earlier worked because it used `array_main`. Fix: in agentLib panel validation, when a viz_action's renderer name matches exactly one registered panel of that renderer type, resolve it to that panel's id instead of dropping it. Add a unit test (single-panel alias resolves; ambiguous multi-panel still warns). Also peek at the ArrayRenderer.jsx Vite "} not valid inside JSX element" warning (line ~373 region) to confirm it's a benign HMR artifact, not a real render bug. [REQUIRES: none — standalone pipeline fix; orthogonal to companion mode]

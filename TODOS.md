# TODOS

Deferred items from /plan-ceo-review (2026-04-24, branch: leetcode-version)
Prerequisite order matters — items marked with [REQUIRES] must follow their dependency.

## LeetCode Mode — Deferred

- [ ] **"Explain my code" mode** — user pastes their code attempt + problem, Argmax analyzes code against the trace. [REQUIRES: core leetcode mode shipped + validated]
- [ ] **Company tags on problems** — tag LeetCode problems by company (Google, Meta, etc.). [REQUIRES: curated problem catalog]
- [ ] **Shareable trace links** — UUID trace snapshot in Supabase → shareable URL. [REQUIRES: lc_sessions table from progress tracking]
- [ ] **Curated problem catalog (Approach B)** — 100-problem DB with guaranteed viz. Replaces LLM extraction for known problems. [REQUIRES: extraction accuracy validated from production data]
- [ ] **Browser extension** — distribution funnel. Auto-detect LeetCode problem in active tab, offer Argmax solve. [REQUIRES: core leetcode mode validated with external users]
- [ ] **Mock interview mode** — timed practice sessions with problem sets. [REQUIRES: problem catalog]
- [ ] **Personalized study plan / spaced repetition** — based on lc_sessions history. [REQUIRES: progress tracking + 2+ weeks of user data]

## Algorithm Expansion — Deferred (from /plan-ceo-review 2026-04-27, eng review 2026-04-27)

- [ ] **interval_scheduling v2: multi-machine** — Sort by start time + min-heap of finish times (Meeting Rooms II exact algorithm). v1 (activity selection, single-machine) ships first. [REQUIRES: interval renderer validated from v1 production data]
- [ ] **Backtracking hierarchical layout** — Add `layout: 'tree'` mode to GraphRenderer so decision trees render in a clean top-down hierarchy instead of force-directed. [REQUIRES: backtracking registered + user feedback showing layout is confusing]
- [ ] **Backtracking permutations variant** — Different traversal than subsets (no start-index, full array pass each level). Route to text-only until this is implemented. [REQUIRES: backtracking subsets working]
- [ ] **Container With Most Water (11) / Trapping Rain Water (42)** — Two-pointer variants that need unsorted-array traversal logic. Different algorithm than two_pointers sorted-array. Route to text-only for now. [REQUIRES: two_pointers validated]
- [ ] **Sorting suite (bubble, insertion, quicksort, selection)** — Files exist in server/algorithms/sorting/, array renderer handles compare/swap steps generically. Low LeetCode value; deferred until class-mode is revived. [REQUIRES: none — standalone, low priority]
- [ ] **StackRenderer** — Dedicated renderer for stack-based algorithms. Vertical stack display + animated push/pop + input array cursor (shows what element is currently being processed) + result array panel. Would replace LinkedRenderer for `stack_operations` and `monotonic_stack`. ~200 lines: `client/src/components/renderers/StackRenderer.jsx` + `mapStackStep` in vizMapper + `case 'stack'` dispatch. [REQUIRES: monotonic_stack shipped + user feedback that stack visualization is confusing]
- [ ] **sliding_window vizMapper coverage** — Integer sliding_window is registered but has no vizMapper step handlers for `initial_window`, `slide`, `new_max`. Produces empty viz. BUNDLED INTO string-renderer PR (vizMapper fix while in vizMapper for StringRenderer work). [REQUIRES: none — in-flight]
- [ ] **union_find vizMapper coverage** — Registered but emits `find`, `already_connected`, `union`, `process_edge` with no handlers. All produce empty viz. [REQUIRES: none — standalone fix pass]

## String Renderer — Deferred (from /plan-ceo-review 2026-04-29, branch: leetcode-version)

- [ ] **rabin_karp** — Rolling hash pattern matching (LC28 alternative). Rabin-Karp concept is hash arithmetic, not string-semantic — less value in StringRenderer context. [REQUIRES: kmp_search shipped + user feedback asking for hashing explanation]
- [ ] **min_window_substring (LC76)** — Variable-size window with character requirement map. Different algorithm from sliding_window_string (LC3 pattern). [REQUIRES: sliding_window_string validated from production data]
- [ ] **Pseudocode panels for 5 string algorithms** — sliding_window_string, valid_palindrome, expand_palindrome, kmp_search, find_anagrams all lack pseudocode panels. Inconsistent with existing algorithms (dijkstra, kruskal, knapsack all have pseudocode). [REQUIRES: algorithm implementations complete — add in follow-up PR]

## Extraction Quality (from Outside Voice review)
- [x] **Few-shot examples in extraction prompt** — BUNDLED INTO THIS PR. Per-algorithm test_case schema examples (including graph adjacency list → {nodes, edges} format) included in parseLeetcodeProblem() extraction prompt. Resolved by /plan-eng-review 2026-04-24.
- [ ] **Extraction accuracy validation** — manually test 20 LeetCode medium problems against parseLeetcodeProblem() before launch. Target: 80% correct routing. Known misses from /qa 2026-04-30: LC53 (Maximum Subarray → should hit array_manipulation, hits dc_design fallback), LC70 (Climbing Stairs → should hit recursion_memoization, hits dp_design fallback). Add few-shot examples for these in parseLeetcodeProblem() extraction prompt.
- [ ] **ISSUE-002: LC53 routing** — Maximum Subarray does not match `array_manipulation` key. Add few-shot example to extraction prompt: `{"problem":"Maximum Subarray","algorithm_key":"array_manipulation","confidence":0.85}`. The Kadane's algorithm pattern (running max, reset on negative) is the Tier 2 trace to show.
- [ ] **ISSUE-003: LC70 routing** — Climbing Stairs does not match `recursion_memoization` key. Add few-shot example to extraction prompt. The fib-style DP memo table is the Tier 2 trace to show.

## Infrastructure
- [ ] **lc_sessions Supabase migration** — create table + RLS rules (user_id = auth.uid()) before deploy.
- [ ] **POST /api/lc-sessions/:id/master** — endpoint or WS message for marking a problem mastered. Accepted scope from CEO plan — implement in this PR alongside lc_sessions write.

## Renderer UX (from /plan-design-review 2026-04-30)

- [ ] **Empty states for all 7 non-String renderers** — Array, Graph, Tree, Linked, Interval, RecursionTree, Table each need ghost placeholder elements matching their renderer type (nodes/bars/intervals) + "Run an algorithm to see the visualization" instructional text. Approved direction: Variant A (ghost cells with dashed borders). Graph empty state shipped in quick-wins PR. [REQUIRES: none — standalone pass]

## DX Gaps (from /plan-devex-review 2026-04-24)
- [ ] **Auth wall — Google OAuth or skip email verification** — Email verification makes TTHW ~4-5min, putting Argmax in "Needs Work" tier vs VisuAlgo's 30s. Supabase supports Google OAuth in ~30min. Alternatively, disable email verification for beta (Supabase dashboard toggle). [REQUIRES: none — standalone change]
- [ ] **TTHW tracking** — Add `first_viz_shown` PostHog event when the first visualization frame renders in the client. This is the only metric that proves whether TTHW improved. Tie to `lc_session_started` event for funnel analysis.
- [ ] **"Try a sample problem" button** — A student who arrives without a LeetCode URL open can't experience the magic. Add a "Try: Number of Islands" or "Try: Course Schedule" button that pre-fills the textarea with a well-known medium problem. [REQUIRES: core LeetCode mode shipped]
- [ ] **Pre-auth product preview** — The auth modal shows no preview of what the product does. Add a screenshot or 1-sentence description to the AuthModal so students who arrive via a share link understand the value before signing up. Low-effort retention improvement.

# Companion consent-ladder: implementation plan

Branch: `pattern-recognition` · Teaching model: `claude-opus-4-8` (`server/models.js:14`)
Status: planned (not started) · Authored via `/investigate` + `/plan-eng-review`

## Goal

Stop the companion hint ladder from drifting upward on turns the student did not
license, without ever reducing the consent judgment to a server-side heuristic.
Keep one live agent / one thread. The consent call stays in the model; code only
does carry-forward arithmetic and caching; verification moves off the hot path to
an offline model-judge.

## Non-goals (explicit)

- No second live agent (router/judge per turn). Rejected: doubles time-to-first-token
  on a live sidebar that already warms the solver to dodge a 12s stall.
- No live server-side gate that reads the student's words to decide consent or hint
  quality. Rejected by founder: language/semantics must not be reduced to heuristics.
- No clamp/regenerate of a turn in flight. We detect and measure, we do not block live.

## Root cause (recap)

The consent contract lives entirely in the companion doctrine
(`server/guidedAgent.js:767-890`) as prose plus model self-report fields. The fields
`specificity_level` / `escalation_consented` are normalized (`server/agentLib.js:41-52`),
logged (`guidedAgent.js:1700`), and shipped to PostHog (`agentLib.js:69-104`) — and
then never read back to constrain anything. Two defects produced the observed
`1→2→3→3→3→4→4` drift:

- **A — advisory, not enforced.** Turn 2 shipped `specificity_level:2,
  escalation_consented:false` (a self-admitted uninvited rise) because nothing checks
  `level rose ⇒ consented`. Today there is also **no prompt caching** (`guidedAgent.js:1485`
  passes a plain `system:` string, no `cache_control`, no betas), so the full ~150-line
  doctrine is re-billed and re-reconciled every turn — an attention load that makes the
  model lose track of the rung it already committed to.
- **B — self-contradictory consent rule.** "not sure" / "I don't know" is defined as
  consent (`:782`) AND as engagement-not-consent when it answers your pending question
  (`:783`). The model resolved the ambiguity toward escalation (turn 6, `3→4`).

## Architecture decision

```
                    ONE live agent (Opus 4.8), ONE message thread
  ┌───────────────────────────────────────────────────────────────────────┐
  │ CACHED, STABLE                          PER-TURN, CHEAP                 │
  │ ┌─────────────────────────────┐         ┌──────────────────────────┐   │
  │ │ leveled ladder (L1..L5 table)│        │ {role:"system"} message  │   │
  │ │ + fixed consent rule         │ ◄──────┤ "struggle phase; last     │   │
  │ │ cache_control breakpoint     │  cache │  reported level = N; hold  │   │
  │ │ → ~0.1x reads after turn 1   │  intact│  ≤N unless asked/gave-up"  │   │
  │ └─────────────────────────────┘         └──────────────────────────┘   │
  │        the canonical reference                the model's OWN N,        │
  │        the model checks against              carried forward (no regex) │
  └───────────────────────────────────────────────────────────────────────┘
                                    │
                  offline (async, sampled) ▼
                  model-judge reads transcripts → flags level-rise-without-consent
                  & leaks → eval cases + prompt patches.  Never blocks a live turn.
```

Three principles this encodes: keep the semantic judgment in a model (never a
heuristic); make the gate a deterministic *invariant* only where it touches no
language (carry-forward arithmetic, caching, structural no-replay); make failure
*information* (offline measurement + evals), not live enforcement.

## Data flow — per companion turn

```
student msg ──► getClient(session).messages.create({
                  system: [ <cached leveled-ladder block, cache_control> ],   ← E2
                  messages: [ ...history,
                              {role:"user", ...student msg},
                              {role:"system", text: stateLine(session)} ],    ← E3
                  tools: computeActiveTools(...)  (sorted, stable)            ← E2 caveat
                })
                      │
        model replies w/ conversational_reply|emit_segment + self-report
                      │
   companionSelfReport(input) ─► session._prevSpecificity = report.level      ← E3 (carry-forward)
                      │
   emitCompanionTurn(...) ─► PostHog (unchanged)                              ← E4 reads these offline
```

`stateLine(session)` is pure: it reads `session._prevSpecificity` (the model's own
last number) and emits a fixed-format reminder. It never inspects the student's text.

## Workstreams

### E1 — Leveled ladder rewrite + consent-collision fix (prompt only)

`server/guidedAgent.js`, the `COMPANION_MODE_PROMPT` block (~`:767-890`).

Replace the two loose prose descriptions of the ladder (`:771-773`, `:877-880`) with
one checkable table:

```
L  VAGUENESS           MAY DO                                   MUST NOT
1  fully open          ask for their read / reframe smaller     point at any specific part of input
2  points at input     highlight the relevant sentence;         name the sub-question; hint the idea-kind
                       "which part matters?"
3  names question /     name the sub-question OR the KIND of     state/encode the key insight; show the op
   idea-kind           idea; mount zero-spoiler structure view
4  co-construction      build it WITH them (partial trace on     hand them the operation; full reveal
                       setup-only steps); "which pointer?"
5  full reveal          the operation; the solution trace        (terminal — only after derive OR give-up)
```

Fix the collision at `:781-784`. New rule:

> "I don't know" / "not sure" is **consent** ONLY when it answers an OFFER you made
> last turn (`offer_made` was true), or is a standalone bid for help ("just show me",
> "I give up", "hint please"). When it is the answer to a thinking-question you just
> asked, it is **engagement, not consent** — hold the level and ask the smaller
> question. Explicit give-up still outranks everything and goes to the terminal rungs.

Keep `reveals_key_insight`, the terminal viz ladder, and mid-struggle visuals as-is.
Non-companion output must stay byte-identical (regression-pinned in `guidedAgent.test.js`).

### E2 — Prompt caching for the guided teaching loop (system + rolling history)

`server/guidedAgent.js:1526` — the ONE `messages.create` in the multi-turn teaching loop
(the solver / author agents are single-shot, not worth caching). This call site is shared
by companion AND web-app guided sessions, so caching benefits both; you cannot scope it to
companion without branching, and shouldn't. `cache_control` is **GA, no beta header.**
Decided 2026-06-14 (eng review): **system + rolling-history, `ttl:"1h"`.**

```
PER-TURN REQUEST  (cache prefix order: tools → system → messages)
┌─ tools ──────────┐ computeActiveTools = allTools.filter(...) → preserves guidedTools
│                  │ order, gated on session flags fixed at start → byte-stable (NO sort).
├─ system ─────────┤ [{ text: doctrine (+ solver context once the solver runs), cache_control }]
│                  │   re-caches ONCE at the solver transition (:2185/2233/2257) — expected.
├─ messages ───────┤ grows every turn; rolling cache_control on the LAST block caches history.
└──────────────────┘ 2 of 4 breakpoints.
```

- **Implementation:** a request-only helper `withPromptCaching(systemText, messages)` →
  `{ system:[{type:"text",text,cache_control:CC}], messages: <copy with CC on the last
  block> }`, `CC = { type:"ephemeral", ttl:"1h" }`. **Never mutate the stored `messages`**
  (would leak stale breakpoints and blow the 4-breakpoint cap) — build a per-request copy.
  String content on the last message is converted to a `[{type:"text"}]` block to carry CC.
- **No tool sort (corrects the prior draft).** `computeActiveTools` already returns a
  deterministic, byte-stable list per session (filter preserves order; flags fixed at
  start). The only mid-session tool change is if `isOutOfScopeSession` flips when the
  solver reclassifies — one rebuild, self-correcting, not worth guarding.
- **The system prompt is NOT stable all session (corrects the prior draft).** It's
  reassigned `buildGuidedSystemPrompt + buildSolverContext` when the solver returns, so
  there are two stable phases and the transition re-caches the system block once. Wrapping
  the whole string in one CC handles this correctly; a two-block split to avoid the single
  rebuild isn't worth the construction complexity. (Volatility audit: no `Date.now`/random
  in the prompt or solver context — clean.)
- **TTL `1h`, not the 5-min default:** tutoring turns routinely exceed 5 minutes (student
  thinking), which would expire the default cache between turns → fresh writes. 1h write is
  2× (vs 1.25×) but breaks even at 3 turns; companion sessions run longer. Economics: read
  ≈0.1×, write ≈2× (1h).
- **Tests:** (1) **offline** unit test on `withPromptCaching` — CC on the system block + the
  last message's last block, `ttl:"1h"`, earlier blocks uncached, string→block conversion,
  input not mutated, empty-messages safe. (2) **live smoke** (one-time, needs a key):
  `usage.cache_creation_input_tokens > 0` on turn 1, `cache_read_input_tokens > 0` on turn 2.
  Min cacheable prefix on Opus 4.8 is **4096 tokens** — base+companion+tools clears it, but
  the smoke proves it (if zero, the prefix is under 4096 and silently isn't caching).

> **E2 ↔ E3 landmine:** E3 injects a per-turn `{role:"system"}` directive that changes every
> turn. It MUST land as the new last message so E2's rolling breakpoint rolls onto it (the
> stable history stays cached before it). If E3 instead inserts the volatile directive
> *before* the breakpoint, it churns the cache every turn. E3's implementation honors this.

This is the only change that reduces per-turn cost. The "slice/mutate the system prompt per
turn" idea is explicitly NOT done — it busts the system+messages cache every turn and costs
more, not less.

**Out of scope (conscious defer):** pre-warming turn 1 (a `max_tokens:0` warm-up so the
opener is fast too) — the opener already runs solver-warming and its latency is model-bound,
not prefill-bound; not worth the extra request.

### E3 — Per-turn carried-forward level injection (mid-conversation system message)

`server/guidedAgent.js` (assembly of `messages` before `.create`) + `server/agentLib.js`.

- Add `session._prevSpecificity` (init null). In `companionSelfReport` consumption
  (after each reply/segment), set `session._prevSpecificity = report.specificity_level`
  when present. Pure carry-forward of the model's OWN number — no language read.
- Before each companion `.create`, append one `{role:"system"}` message to `messages`:

  > `[LADDER STATE] Struggle phase. Your last reported specificity was N. Hold at ≤N
  > this turn UNLESS the student explicitly asked for more or gave up in their latest
  > message — you decide whether they did. On an explicit give-up, advance to the
  > terminal rungs. Do not rise on engagement (answering your question, "not sure" to
  > your question).`

  N = `session._prevSpecificity ?? 1`.
- Beta: `mid-conversation-system-2026-04-07` (supported on Opus 4.8). Message must
  follow a user message and cannot be `messages[0]`. **Fallback:** on a 400
  `role 'system' is not supported`, emit the same text as a `<system-reminder>` block
  in the user turn (same cache profile; just not the non-spoofable operator channel).
- **Honor E2's cache breakpoint (landmine):** this `{role:"system"}` directive changes
  every turn, so it must be the NEW last message — E2's rolling `cache_control` then sits
  on it and the stable history before it stays cached. Do NOT insert it before the
  breakpoint or earlier in `messages`, or it churns the cache every turn. (E2 attaches the
  breakpoint to whatever is the last block, so appending here is correct by construction.)
- **Give-up edge (resolved):** the hold rule carries its own exception, so a legitimate
  jump (give-up → L4/L5) is licensed by the rule itself; the model still classifies the
  give-up. After a consented rise the carry-forward N updates to the new level next turn.
  No heuristic decides the jump.

E3 carries no consent judgment — it reflects the model's own committed rung back so it
stops forgetting it. The consent decision stays entirely in Opus 4.8.

### E4 — Offline self-report honesty audit (verification, not enforcement)

Promotes TODOS.md §"Sampled self-report honesty audit" (`:80`) from deferred to built.

- Offline batch job (NOT runtime). Reuse the eval grader prompt. Reads ~20 sampled
  companion transcripts, flags any turn where (a) `reveals_key_insight` true while
  `escalation_consented` false and learner_state ≠ understands, or (b) the reply
  text states/encodes the reserved insight, or (c) `specificity_level` rose while
  `escalation_consented` false. Compares against the self-report; discrepancies become
  eval cases.
- Wire the pre-registered `violation_rate` readout (TODOS.md `:85`) to fire off the
  PostHog `companion_turn` rows that already exist (`agentLib.js:88-92`). This is the
  detector the gate was missing — measured, not blocking.

### E5 — Evals + regression tests

- `server/companionMode.eval.test.js`: extend the escalation-gradient case (`:158-177`).
  Add a transcript that feeds the exact `nums=[1,1,1,2,1]` "not sure" exchange and
  asserts the level HOLDS (does not go `3→4`) when "not sure" answers a thinking-question
  and `offer_made` was false the prior turn. Add a case asserting a real give-up still
  jumps to the terminal rungs.
- `server/guidedAgent.test.js`: pin the leveled-ladder table text; pin non-companion
  byte-identical output; pin tool-set stability across companion turns.
- New unit test for `stateLine(session)`: pure function over `_prevSpecificity`, asserts
  it never references student text and formats N correctly including the null/first-turn
  case.

### E6 — Docs

- PIPELINE.md §10 "Stuck Companion Mode" (`:1235-1356`): document the cached leveled
  ladder, the per-turn `{role:"system"}` injection + carry-forward, and that the consent
  decision is model-side with offline verification. CLAUDE.md requires PIPELINE.md updated
  in the same change as any pipeline edit.
- TODOS.md: mark the honesty-audit item built; note `violation_rate` now wired.

### E-UX — Companion hint affordances: message-anchored offer chips + "I'm stuck"

From `/plan-design-review` 2026-06-13. Surfaces the two highest-value, lowest-leak
tools (`highlight_problem_text`, the structure-view diagram) to the student through
the UI instead of leaving them invisible and purely agent-timed. Reference mockup
(approved): `~/.gstack/projects/johnz4021-ReLU/designs/companion-hint-chips-20260613/variant-D-refined.png`.

**Interaction model (decided):** the model still TIMES the visual (highlight at L2,
structure view at L3 / mid-struggle — never at L1), but the student PULLS the trigger.
Two controls:
1. **Offered-rung chip (push the offer, pull the delivery).** When a companion turn
   carries `offer_made: true`, render ONE gentle accent pill **anchored inline under
   the tutor message that made the offer** (not a global toolbar — the chip belongs to
   its message). Label names the modality: "✦ Show me which part →" (→ highlight) /
   "✦ Draw it for me →" (→ structure view). A tap = unambiguous consent for THAT rung.
2. **"I'm stuck" (always-present, low-emphasis ghost button, just above the input).**
   Does NOT deliver a hint — it asks the model to OFFER the next rung, which renders as
   a chip via #1. Routes through the same pacing; can never outrun the ladder.

**Consent stays in the model (architecture rule — do NOT violate).** A chip tap does
NOT set a server-side "this is consent" flag. It sends an explicit consent *sentence* as
a normal student turn ("Yes, show me which part please"); the model reads it as consent
via the E1 rules. This is as deterministic as the model ever gets (an explicit ask was
never the ambiguous case — "not sure" / "sure ig" was), and it keeps the no-server-consent
decision intact. No `from_chip`-means-consent path. No server consent logic.

**Integration (verified against the wiring, `/plan-eng-review` 2026-06-13):**

```
STUDENT taps offer-chip / "I'm stuck"
   │  handleGuidedMessage(canonicalText)        ← REUSE the freeform path, App.jsx:585
   ▼  send({type:'guided_message', text, source:'chip'|'stuck'})   ← source = TELEMETRY only
index.js case 'guided_message' (:216)           ← UNCHANGED (resolves resolver / queues)
   ▼  model reads the explicit ask as consent (E1) — model decides, no server gate
conversational_reply + companion{offer_made, offer_modality}
   ▼  sendJSON(..., companion)                  ← offer_modality rides the existing payload
App.jsx onMessage (:130) renders chip from companion.offer_modality
   client owns the label + the canonical send-text; chip anchored to this turn
```

**Build (small, additive — server diff is ONE enum field + optional telemetry tag):**
- **Client** (`client/src/App.jsx`): `offer_made` already arrives on every companion turn
  (`:130`, `:590`). Render a chip from `offer_made` + one new self-report field
  `offer_modality` (enum: `highlight` | `diagram`). **The client owns the chip label AND
  the canonical consent text it sends** — do NOT take UI copy from model output. On tap,
  call the existing `handleGuidedMessage(canonicalText)` (`:585`); add an optional
  `source:'chip'|'stuck'` to the `guided_message` payload. Reuse the opener's chip
  *rendering* (`:405-424`) but NOT its send-wiring (the opener sends `guided_response`
  /`optionId` at `:565`; chips send `guided_message`/`text`).
- **"I'm stuck"**: sends the literal text `"I'm stuck"` through `handleGuidedMessage` —
  already a standalone-bid consent in the E1 doctrine, so it triggers an offer with NO
  new code. No `nudge_request` message type, no new server case.
- **Server**: add `offer_modality` (enum) to the `conversational_reply` self-report
  (`server/tools.js`) and normalize it in `companionSelfReport` (`server/agentLib.js`) —
  it then forwards on the existing `companion` payload. `index.js` `guided_message`
  handler is UNCHANGED except for passing `source` through to the `companion_turn` emit.

**Hard UX rules (from the design review):**
- **Freeform input is ALWAYS present.** Naturally satisfied: chips reuse the same
  `guided_message` channel as the text box, so they coexist by construction. (This was
  the rejected behavior in mockup C.)
- **Chips are message-anchored**; the chip belongs to the latest offering turn (track by
  transcript turn id) and the next companion turn supersedes it. **Pure client state** —
  NOT the `highlight_result` id-correlation (`index.js:266`), which is a different
  mechanism (did the highlight paint).
- **Highlight-chip availability gate:** "Show me which part" maps to `highlight_problem_text`,
  which only paints in the extension overlay on leetcode. If it can't be honored (no
  extension, or `anchored:false` ack), degrade the chip to a plain "Show me" the model
  answers in prose — never a dead button. "Draw it for me" (in-rail canvas) works everywhere.
- **Double-send guard:** tapping a chip clears+disables it optimistically, and any
  outgoing message clears the current chip, so tap-then-type can't enqueue two consents.
- **Anti-vending-machine:** "I'm stuck" yields at most one OFFERED rung per tap; the
  reveal still requires reaching L5 legitimately or an explicit give-up. Keep "I'm stuck"
  (nudge, one rung) visually and semantically distinct from a give-up ("just show me").
- **Zero-spoiler canvas:** the structure view shows the input with NO pre-highlighted
  cell until the highlight rung actually fires (mockup B's pre-highlighted `2` is the
  anti-pattern).
- **Mobile / 520px rail:** chips wrap, 44px touch targets; "I'm stuck" stays low-emphasis
  next to the input (`App.jsx:806` stacks viz+chat below `md`).

**Why it compounds with E1–E4:** `App.jsx:587-590` RETIRED `companion_escalation_requested`
because freeform follow-ups are "indistinguishable" (answer vs decline vs acceptance). A
chip tap IS distinguishable, so the `source:'chip'` tag un-retires that precise funnel
event — giving E4's offer-acceptance-rate and the `violation_rate` readout a real
numerator instead of an inference. The consent itself still rides the model (E1), but the
highest-frequency escalation moment becomes an explicit ask rather than a fuzzy one.

## Test diagram

```
                       ┌─────────────────────────── unit ───────────────────────────┐
stateLine(prevN)  ─────┤ null→"level 1"; 3→"≤3 hold"; never contains student text     │
companion toolset ─────┤ sorted + stable across 3 simulated turns                     │
                       └──────────────────────────────────────────────────────────────┘
                       ┌─────────────────────────── eval (judge-graded) ─────────────┐
"[1,1,1,2,1] not sure" ┤ level HOLDS at 3 (was 3→4); no reveal                        │
explicit "just show me"┤ advances to terminal rungs (give-up exception fires)         │
opening turn           ┤ level 1, no spoiler                                          │
                       └──────────────────────────────────────────────────────────────┘
                       ┌─────────────────────────── live smoke ──────────────────────┐
2-turn companion run   ┤ turn1 cache_creation>0; turn2 cache_read>0 (caching verified) │
                       └──────────────────────────────────────────────────────────────┘
                       ┌─────────────────────────── offline batch ───────────────────┐
20 sampled transcripts ┤ violation_rate computed; discrepancies → new eval cases      │
                       └──────────────────────────────────────────────────────────────┘
```

## Risks / rollback

- **Caching false-negative (prefix < 4096 on Opus).** Caught by the E2 smoke assertion.
  If under 4096, caching is a no-op (not a regression) — E1/E3 still stand.
- **Beta unsupported / 400 on the system message.** E3 fallback to `<system-reminder>`
  in the user turn keeps the behavior; only the operator-authority property is lost.
- **Injection over-constrains the give-up jump.** Mitigated by the in-rule exception and
  the E5 give-up eval; if it still over-holds, the fix is prompt wording, not a code gate.
- **Each workstream is independently revertible.** E2 (caching) and E1 (prompt) ship
  alone safely; E3 depends on E1's leveled definitions; E4 is read-only.

## Sequencing & blast radius

1. E1 (prompt) — eval-gated, smallest diff, fixes the one unambiguous defect.
2. E2 (caching) — free win, independent.
3. E3 (injection) — depends on E1.
4. E4 (offline judge) — read-only, parallelizable.
5. E5/E6 alongside their workstreams.
6. E-UX (hint chips) — after E1 (needs the leveled rungs + offer semantics); independent
   of E2/E3. Mostly client; the server diff is ONE `offer_modality` enum field on the
   self-report. Consent stays in the model — chip taps send an explicit consent sentence
   through the existing `guided_message` channel, NOT a server-side consent flag.

Files touched: `server/guidedAgent.js`, `server/agentLib.js`,
`server/companionMode.eval.test.js`, `server/guidedAgent.test.js`, PIPELINE.md,
TODOS.md, plus one new offline-audit script (E1–E6). **E-UX additionally touches**
`client/src/App.jsx` (chip render + tap → existing `handleGuidedMessage`), adds one
`offer_modality` enum field to the `conversational_reply` self-report (`server/tools.js`,
normalized in `agentLib.js`), and an optional telemetry `source` on `guided_message`.
The `index.js` handler and the consent path are unchanged (the audit fields are unchanged).

## Out of scope (separate scope, not shortcuts)

- Web-app guided-mode ladder alignment (TODOS.md `:78`) — different consent context.
- Learner persistence / per-student pacing memory (TODOS.md `:79`).
- Live leak-proofing (would require a second live model judging a model — still not a
  guarantee; founder bar is catch-and-patch via E4, not live block).

## GSTACK REVIEW REPORT

| Run | Status | Findings |
|-----|--------|----------|
| /investigate (root cause) | done | Consent gate is advisory self-report; no server-side enforcement; "not sure" consent collision |
| /plan-eng-review (interactive) | done | Rejected 2-agent split and live heuristic gate; converged on cached leveled ladder + carry-forward injection + offline judge |
| E1 implemented + eval-verified | done | 15/15 live evals, 46/46 offline pins; eval loop caught + fixed 3 self-introduced regressions (consent/level coupling, give-up freeze, L2 tool-binding) |
| /plan-design-review (mockups) | done | Hint chips: offer-as-chip + "I'm stuck"; chips message-anchored; freeform input always present; approved mockup variant-D-refined |
| /plan-eng-review (E-UX integration) | done | Verified against the wiring; corrected the spec: killed the server-side `from_chip` consent path (architecture violation) + `nudge_request`; `offer_label` free-text → `offer_modality` enum (client owns copy); stale-clearing is client-only; chips reuse `guided_message`; server diff = 1 enum field + telemetry `source` |
| E-UX implemented + live-verified | done | Chip renders message-anchored, tap sends consent, chip clears, model draws on accept; "I'm stuck" + freeform coexist. Needed the offer-gated-canvas doctrine change (model offers instead of drawing direct) for the chip to fire. |
| /plan-eng-review (E2 caching) | done | Corrected the spec (no tool sort — already byte-stable; system prompt re-caches once at solver transition; scope is system + rolling history, not system-only; ttl 1h not 5min; shared call site). Flagged E2↔E3 breakpoint landmine. |
| E2 implemented + live-verified | done | `withPromptCaching` helper; 6 offline structural tests + live smoke: turn1 wrote 22,231 tokens to the 1h cache, turn2 read all 22,231 (~90% per-turn input cut after turn 1). |

Decisions resolved with the user:
- Single agent retained; no router/judge split (latency on a live sidebar).
- No live server-side semantic check (founder: don't reduce language to heuristics).
- Per-turn injection carries the model's OWN carried-forward level (arithmetic, not a
  consent heuristic); consent decision stays in Opus 4.8.
- Caching via stable cached system prompt + mid-conversation system message, NOT
  per-turn system mutation (which would bust cache).
- Verification is offline (sampled model-judge + `violation_rate`), not live enforcement.
- E1 consent floor: L1–L2 reachable on a genuine stall; L3+ consent-gated (Case 8 kept).
- E-UX hint delivery: model TIMES the visual, student PULLS via a message-anchored chip;
  "I'm stuck" offers (never delivers) one rung; freeform chat input is always present.
  Chip taps send an explicit consent sentence via the existing `guided_message` channel —
  consent stays in the MODEL (no server-side consent flag); server diff is one
  `offer_modality` enum + optional telemetry `source`. Approved mockup: variant-D-refined.

VERDICT: APPROVED to implement. E1 shipped + verified; remaining order E2→E3→E4, with
E-UX after E1 (independent of E2/E3). No codex / cross-model run requested.

NO UNRESOLVED DECISIONS

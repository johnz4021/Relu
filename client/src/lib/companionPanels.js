// Companion context-panel reveal-gate (design /plan-design-review 2026-06-15).
//
// In companion "nudge — no spoilers" mode the live context panels can give away the
// answer the hint ladder is carefully withholding: TRAVERSAL LOG prints the BFS
// answer order, QUEUE shows the mechanism, the pseudocode panel hints the approach.
// So in nudge mode ALL context panels stay hidden until the tutor reports it revealed
// the key insight (reveals_key_insight). Concept / "show me" / web-app modes are never
// gated — there the panels are the explanation the student asked for.
//
// Pure on purpose: the no-spoiler guarantee is the kind of thing that must stay under
// test (a regression here is a guarantee violation, not a cosmetic bug).
export function selectVisibleContextPanels(contextPanels, { companionNudge, keyInsightRevealed }) {
  if (companionNudge && !keyInsightRevealed) return [];
  return contextPanels || [];
}

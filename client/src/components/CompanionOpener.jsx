// Two-choice opener for the leetcode overlay (design Pass 1/2, eng D1).
//
// Renders INSTANTLY on overlay open — it must never wait on the WS or the solver.
// One tap routes intent:
//   "Nudge me — no spoilers" → the no-spoiler escalating-hint companion (companionMode)
//   "Show me how it works"    → the viz-first walkthrough (tpaul's path)
//
// The choice is remembered (App persists it) so a returning student is not
// re-gated every open. Anti-slop: no emoji, a single restrained indigo accent
// (no gradient). Full token set + focus-trap a11y land in Step 8.
export default function CompanionOpener({ onChoose, problemTitle }) {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-surface-0 px-6">
      <div className="w-full max-w-sm text-center">
        <h2 className="text-base font-display font-semibold text-text-primary">
          Stuck on this one?
        </h2>
        {problemTitle ? (
          <p className="mt-1 text-xs text-text-tertiary font-body truncate">{problemTitle}</p>
        ) : null}
        <p className="mt-2 text-sm text-text-secondary font-body">
          How do you want to work through it?
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- moves focus into the
            // panel on open (a11y); this opener is the overlay's first interactive view.
            autoFocus
            onClick={() => onChoose('nudge')}
            className="w-full rounded-lg border border-[#4f46e5] bg-[#4f46e5] px-4 py-3 text-left text-white transition-colors hover:bg-[#4338ca] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4f46e5] focus-visible:ring-offset-2"
          >
            <span className="block text-sm font-semibold font-display">Nudge me — no spoilers</span>
            <span className="mt-0.5 block text-xs font-body text-indigo-100">
              Hints that get you unstuck without giving away the answer
            </span>
          </button>

          <button
            type="button"
            onClick={() => onChoose('showme')}
            className="w-full rounded-lg border border-border-default bg-surface-1 px-4 py-3 text-left text-text-primary transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4f46e5] focus-visible:ring-offset-2"
          >
            <span className="block text-sm font-semibold font-display">Show me how it works</span>
            <span className="mt-0.5 block text-xs font-body text-text-tertiary">
              Walk through the solution with a visualization
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

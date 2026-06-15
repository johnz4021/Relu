// Two-choice opener for the leetcode overlay (design Pass 1/2, eng D1).
//
// Renders INSTANTLY on overlay open — it must never wait on the WS or the solver.
// One tap routes intent:
//   "Nudge me — no spoilers" → the no-spoiler escalating-hint companion (companionMode)
//   "Show me how it works"    → the viz-first walkthrough (tpaul's path)
//
// The choice is per-open, NOT persisted — re-asked on every overlay open so a
// remembered "Show me" never spoilers the next problem (/investigate 2026-06-15).
// Anti-slop: no emoji, the app's warm tan accent (--color-accent), no gradient.
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
            className="w-full rounded-lg border border-accent bg-accent px-4 py-3 text-left text-surface-0 transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
          >
            <span className="block text-sm font-semibold font-display">Nudge me — no spoilers</span>
            {/* The consent guarantee, surfaced (CEO review 2026-06-12): states the
                interaction RULE — escalation only happens when the student asks. */}
            <span className="mt-0.5 block text-xs font-body text-surface-0/70">
              Hints that get you unstuck — it won&apos;t get more specific unless you ask
            </span>
          </button>

          <button
            type="button"
            onClick={() => onChoose('showme')}
            className="w-full rounded-lg border border-border bg-surface-1 px-4 py-3 text-left text-text-primary transition-colors hover:bg-surface-2 hover:border-border-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
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

import { useEffect, useRef, useState } from 'react';

// One-shot toast that fires when an LC session is classified out-of-scope —
// no Tier 1 runner, no Tier 2 fallback. Lets the student request a viz; the
// demand signal feeds prioritization of which orphaned problems (Sudoku,
// House Robber, etc.) to add as dedicated registry entries first.
//
// Replaces the permanent VizRequestBanner. Two reasons: (1) a persistent
// banner above the transcript clutters the lesson view for the whole session;
// (2) the banner was layout-coupled (only mounted in transcriptOnly), so any
// stray context panel suppressed it. A toast at App level mounts regardless
// of layout.
export default function VizRequestToast({ lcParsed, userEmail }) {
  const [state, setState] = useState('hidden'); // hidden | shown | submitting | sent | error
  // Dedupe per problem submission — the same paste should fire the toast once,
  // not every time lcParsed re-renders.
  const seenForRef = useRef(null);

  useEffect(() => {
    if (lcParsed && lcParsed.has_viz === false && lcParsed.problemText) {
      if (seenForRef.current !== lcParsed.problemText) {
        seenForRef.current = lcParsed.problemText;
        setState('shown');
      }
    } else if (!lcParsed) {
      // Session ended / reset — allow the next out-of-scope paste to refire.
      seenForRef.current = null;
    }
  }, [lcParsed]);

  useEffect(() => {
    if (state === 'shown') {
      // Longer than the 8s used by other toasts: this one has a CTA the user
      // should have time to read and act on.
      const t = setTimeout(() => setState('hidden'), 15000);
      return () => clearTimeout(t);
    }
    if (state === 'sent' || state === 'error') {
      const t = setTimeout(() => setState('hidden'), 3000);
      return () => clearTimeout(t);
    }
  }, [state]);

  if (state === 'hidden') return null;

  const handleRequest = async () => {
    setState('submitting');
    try {
      const res = await fetch('/api/viz-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail || null,
          problem_text: lcParsed.problemText,
          classified_algo: lcParsed.algorithm_key || null,
          classification_confidence: lcParsed.confidence ?? null,
          reason: lcParsed.fallback_reason || (lcParsed.algorithm_key ? 'low_confidence' : 'no_match'),
        }),
      });
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg shadow-lg bg-surface-2 border border-border text-text-primary text-sm px-4 py-3 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex-1 min-w-0">
        <div className="font-medium">No visualization for this one</div>
        <div className="text-xs text-text-secondary mt-0.5">
          {state === 'shown' && (
            <>
              Tutor's still here, text-only.{' '}
              <button onClick={handleRequest} className="underline text-accent hover:text-accent-hover">
                Request a viz
              </button>
            </>
          )}
          {state === 'submitting' && <span className="text-text-tertiary">Sending…</span>}
          {state === 'sent' && <span className="text-green-400">Thanks — we'll prioritize this. ✓</span>}
          {state === 'error' && <span className="text-red-400">Couldn't send. Try again later.</span>}
        </div>
      </div>
      <button
        onClick={() => setState('hidden')}
        className="text-text-tertiary hover:text-text-primary text-lg leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

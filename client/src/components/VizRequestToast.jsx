import { useEffect, useRef, useState } from 'react';

// One-shot transparency toast for Tier 3 sessions: the problem has no curated
// (Tier 1) trace, so the tutor draws the visualization live — honest disclosure
// that it may be rougher than usual, plus a report CTA. Reports POST to
// /api/viz-request and are the demand signal for which patterns get promoted
// to dedicated Tier 1 registry entries next (see TODOS.md "Viz strategy").
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
          reason: 'tier3_fallback',
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
        <div className="font-medium">Live-drawn visualization</div>
        <div className="text-xs text-text-secondary mt-0.5">
          {state === 'shown' && (
            <>
              No curated visualization for this one yet — your tutor draws it live, so it may be rougher than usual.{' '}
              <button onClick={handleRequest} className="underline text-accent hover:text-accent-hover">
                Looks wrong? Report it
              </button>
            </>
          )}
          {state === 'submitting' && <span className="text-text-tertiary">Sending…</span>}
          {state === 'sent' && <span className="text-green-400">Thanks — this helps us prioritize a curated viz. ✓</span>}
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

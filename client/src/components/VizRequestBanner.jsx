import { useState } from 'react';

// Shows a "Request a visualization for this problem" CTA on the no-viz
// fallback path (LC classifier returned null OR a broken algo). Sends to
// /api/viz-request which logs to the `feedback` table with category='viz_request'.
//
// We're not visualizing every LC problem (yet). Capturing demand here
// tells us which deferred algos to fix next.
export default function VizRequestBanner({ problemText, classifiedAlgo, classificationConfidence, userEmail, fallbackReason }) {
  const [state, setState] = useState('idle'); // idle | submitting | sent | error

  if (!problemText) return null;

  const handleClick = async () => {
    setState('submitting');
    try {
      const res = await fetch('/api/viz-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail || null,
          problem_text: problemText,
          classified_algo: classifiedAlgo || null,
          classification_confidence: classificationConfidence ?? null,
          reason: fallbackReason || (classifiedAlgo ? 'low_confidence' : 'no_match'),
        }),
      });
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="mx-auto max-w-2xl mt-4 mb-2 px-4 py-3 rounded-lg bg-surface-1 border border-border text-sm">
      <p className="text-text-secondary mb-2">
        We don't have a visualization for this problem yet — your tutor is still here, just text-only.
      </p>
      {state === 'idle' && (
        <button
          onClick={handleClick}
          className="px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-surface-0 text-xs font-medium transition-colors"
        >
          Request a visualization
        </button>
      )}
      {state === 'submitting' && (
        <span className="text-xs text-text-tertiary">Sending...</span>
      )}
      {state === 'sent' && (
        <span className="text-xs text-text-tertiary">Thanks — we'll prioritize this. ✓</span>
      )}
      {state === 'error' && (
        <span className="text-xs text-red-400">Couldn't send. Try again later.</span>
      )}
    </div>
  );
}

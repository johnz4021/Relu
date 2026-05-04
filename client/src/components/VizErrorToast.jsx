import { useEffect, useState } from 'react';
import { onVizError } from '../lib/rendererRegistry';

// Surfaces renderer errors to the user as a non-blocking toast.
// Auto-dismisses after 8s. Deduped by `${kind}:${renderer}` so we don't
// spam if the same renderer throws repeatedly. Optional report callback
// posts to /api/viz-error so we can prioritize fixes from real signal.
export default function VizErrorToast({ algorithmKey }) {
  const [toast, setToast] = useState(null); // { kind, renderer, action, message }
  const [seen, setSeen] = useState(new Set()); // dedupe within session

  useEffect(() => {
    const off = onVizError((err) => {
      const key = `${err.kind}:${err.renderer}`;
      if (seen.has(key)) return;
      setSeen((prev) => new Set(prev).add(key));
      setToast(err);
    });
    return off;
  }, [seen]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  const handleReport = () => {
    fetch('/api/viz-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        algorithm: algorithmKey || null,
        renderer: toast.renderer,
        kind: toast.kind,
        action: toast.action || null,
        message: toast.message,
      }),
    }).catch(() => { /* fire-and-forget */ });
    setToast(null);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg shadow-lg bg-amber-900/95 border border-amber-700 text-amber-50 text-sm px-4 py-3 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <span className="text-base leading-none mt-0.5">⚠️</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium">Visualization issue</div>
        <div className="text-xs text-amber-200/90 mt-0.5">
          Tutor is still active.{' '}
          <button onClick={handleReport} className="underline hover:text-amber-100">
            Report
          </button>
        </div>
      </div>
      <button
        onClick={() => setToast(null)}
        className="text-amber-300/80 hover:text-amber-100 text-lg leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

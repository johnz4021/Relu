import { useEffect, useState, useRef } from 'react';

// One-shot toast that fires when the current session's viz is Tier 2
// (LLM-designed layout rather than a hand-written canonical visualization).
// Auto-dismisses after 8s. Resets when the algorithm changes so a new
// session can fire its own toast.
export default function VizTierToast({ vizTier, algorithmKey }) {
  const [show, setShow] = useState(false);
  const seenForAlgoRef = useRef(null);

  useEffect(() => {
    if (vizTier === 2 && seenForAlgoRef.current !== algorithmKey) {
      seenForAlgoRef.current = algorithmKey;
      setShow(true);
    }
    if (!vizTier) {
      seenForAlgoRef.current = null;
    }
  }, [vizTier, algorithmKey]);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => setShow(false), 8000);
    return () => clearTimeout(t);
  }, [show]);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg shadow-lg bg-amber-900/95 border border-amber-700 text-amber-50 text-sm px-4 py-3 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex-1 min-w-0">
        <div className="font-medium">On-the-fly visualization</div>
        <div className="text-xs text-amber-200/90 mt-0.5">
          No built-in viz for this problem — generated on the fly. Quality may vary.
        </div>
      </div>
      <button
        onClick={() => setShow(false)}
        className="text-amber-300/80 hover:text-amber-100 text-lg leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

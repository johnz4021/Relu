import { useState } from 'react';

// Lesson-page bug reporter. The viz error toast catches some failure modes
// automatically (renderer crash, never-mounted), but lots of "this looks
// wrong" issues only the user can identify. This is the always-available
// escape hatch — one click → small modal → POST → /api/bug-report logs to
// feedback table with category='bug_report' and structured meta so we can
// triage post-launch.
export default function ReportBugButton({ algorithmKey, problemText, userEmail }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('confusing'); // broken | confusing | suggestion
  const [state, setState] = useState('idle'); // idle | submitting | sent | error

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setState('submitting');
    try {
      const res = await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail || null,
          algorithm: algorithmKey || null,
          problem_text: problemText || null,
          severity,
          description: description.trim(),
          // Light browser context to help reproduce
          user_agent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          url_path: window.location.pathname,
        }),
      });
      if (res.ok) {
        setState('sent');
        setTimeout(() => {
          setOpen(false);
          setDescription('');
          setSeverity('confusing');
          setState('idle');
        }, 1500);
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Something off? Tell us — we triage every report."
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-surface-2 hover:bg-surface-3 border border-border rounded-lg transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        Report bug
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => state !== 'submitting' && setOpen(false)}
        >
          <div
            className="bg-surface-1 border border-border rounded-xl p-6 max-w-md w-full mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-text-primary">Report a bug</h3>
                <p className="text-xs text-text-tertiary mt-1">
                  Tell us what looked off. We read every report.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                disabled={state === 'submitting'}
                className="text-text-tertiary hover:text-text-secondary text-lg leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <p className="text-xs text-text-tertiary mb-2">What kind of issue?</p>
              <div className="flex gap-2 mb-4">
                {[
                  { id: 'broken', label: 'Broken' },
                  { id: 'confusing', label: 'Confusing' },
                  { id: 'suggestion', label: 'Suggestion' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSeverity(opt.id)}
                    className={`flex-1 px-3 py-1.5 text-xs rounded-md border transition-colors ${
                      severity === opt.id
                        ? 'bg-accent/20 border-accent text-accent'
                        : 'bg-surface-0 border-border text-text-secondary hover:border-text-tertiary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <p className="text-xs text-text-tertiary mb-2">What happened?</p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. The graph never appeared, or the tutor gave a wrong hint, or the animation looked weird at step 4..."
                rows={4}
                disabled={state === 'submitting'}
                className="w-full px-3 py-2 text-sm bg-surface-0 border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40 mb-3 resize-none"
              />

              {algorithmKey && (
                <p className="text-[11px] text-text-tertiary mb-3">
                  Auto-attached: algorithm = <code className="text-text-secondary">{algorithmKey}</code>
                  {problemText ? <>, problem text, browser info</> : <>, browser info</>}
                </p>
              )}

              <div className="flex items-center justify-end gap-2">
                {state === 'error' && (
                  <span className="text-xs text-red-400 mr-auto">Couldn't send. Try again.</span>
                )}
                {state === 'sent' && (
                  <span className="text-xs text-green-400 mr-auto">Thanks — we got it.</span>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={state === 'submitting'}
                  className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={state === 'submitting' || state === 'sent' || !description.trim()}
                  className="px-4 py-1.5 text-xs font-medium bg-accent hover:bg-accent-hover text-surface-0 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {state === 'submitting' ? 'Sending...' : state === 'sent' ? 'Sent!' : 'Send report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

import { useState, useEffect } from 'react';

export default function SettingsModal({ open, onClose, send, hasByok, deletionResult, onKeyDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);
  const [justDeleted, setJustDeleted] = useState(false);

  useEffect(() => {
    if (!deletionResult || !working) return;
    setWorking(false);
    if (deletionResult.success) {
      setConfirming(false);
      setJustDeleted(true);
      onKeyDeleted?.();
    } else {
      setError(deletionResult.error || 'Failed to remove API key');
    }
  }, [deletionResult, working, onKeyDeleted]);

  useEffect(() => {
    if (!open) {
      setConfirming(false);
      setError(null);
      setJustDeleted(false);
    }
  }, [open]);

  if (!open) return null;

  const handleRemove = () => {
    setError(null);
    setWorking(true);
    send({ type: 'delete_api_key' });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-surface-1 border border-border rounded-2xl p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-primary">Settings</h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="Close settings"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-1">Anthropic API key (BYOK)</h3>
          <p className="text-xs text-text-tertiary mb-3">
            {hasByok
              ? 'A key is on file, AES-256 encrypted at rest. Remove it any time.'
              : "No key on file. You're on the free-tier session allowance."}
          </p>

          {hasByok && !confirming && (
            <button
              onClick={() => setConfirming(true)}
              className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-surface-2 hover:bg-surface-3 border border-border rounded-lg transition-colors"
            >
              Remove key
            </button>
          )}

          {hasByok && confirming && (
            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <p className="text-xs text-text-secondary mb-3">
                Remove your API key? You'll go back to the free-tier allowance and hit the cap at 10 sessions.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleRemove}
                  disabled={working}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-red-500/80 hover:bg-red-500 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {working ? 'Removing...' : 'Yes, remove'}
                </button>
                <button
                  onClick={() => { setConfirming(false); setError(null); }}
                  disabled={working}
                  className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary bg-surface-3 hover:bg-surface-2 rounded-lg disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
              {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            </div>
          )}

          {justDeleted && !hasByok && (
            <p className="text-xs text-green-400">Key removed.</p>
          )}
        </div>
      </div>
    </div>
  );
}

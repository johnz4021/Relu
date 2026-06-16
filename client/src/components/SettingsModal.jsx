import { useState, useEffect } from 'react';
import { startCheckout, openBillingPortal } from '../lib/billing';

export default function SettingsModal({ open, onClose, send, hasByok, subscribed, billingEnabled, deletionResult, onKeyDeleted, saveResult, onKeySaved }) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);
  const [justDeleted, setJustDeleted] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [billingError, setBillingError] = useState(null);

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

  // React to api_key_result for saves. Keyed only on saveResult identity (not
  // on `saving`) so it fires once per genuine server response — never re-runs
  // for a stale result when the user clicks Save again after a failure.
  useEffect(() => {
    if (!saveResult) return;
    setSaving(false);
    if (saveResult.success) {
      setApiKey('');
      setJustSaved(true);
      onKeySaved?.();
    } else {
      setError(saveResult.error || 'Failed to save API key');
    }
  }, [saveResult, onKeySaved]);

  useEffect(() => {
    if (!open) {
      setConfirming(false);
      setError(null);
      setJustDeleted(false);
      setApiKey('');
      setSaving(false);
      setJustSaved(false);
    }
  }, [open]);

  if (!open) return null;

  const handleRemove = () => {
    setError(null);
    setWorking(true);
    send({ type: 'delete_api_key' });
  };

  const handleSaveKey = () => {
    if (!apiKey.trim()) return;
    setError(null);
    setSaving(true);
    send({ type: 'save_api_key', apiKey: apiKey.trim() });
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

        {(billingEnabled || subscribed) && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-1">Subscription</h3>
            {subscribed ? (
              <>
                <p className="text-xs text-text-tertiary mb-3">
                  ReLU Pro is active. Manage your plan, update your card, or cancel via Stripe.
                </p>
                <button
                  onClick={() => { setBillingError(null); openBillingPortal().catch((err) => setBillingError(err.message)); }}
                  className="px-3 py-1.5 text-xs font-medium text-text-primary bg-surface-2 hover:bg-surface-3 border border-border rounded-lg transition-colors"
                >
                  Manage subscription
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-text-tertiary mb-3">
                  Upgrade to ReLU Pro for 20 sessions per month on our API key — $15/month.
                </p>
                <button
                  onClick={() => { setBillingError(null); startCheckout().catch((err) => setBillingError(err.message)); }}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent/90 rounded-lg transition-colors"
                >
                  Upgrade — $15/month
                </button>
              </>
            )}
            {billingError && <p className="mt-2 text-xs text-red-400">{billingError}</p>}
            <div className="border-t border-border mt-5" />
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-1">Anthropic API key (BYOK)</h3>

          {hasByok ? (
            <>
              <p className="text-xs text-text-tertiary mb-3">
                A key is on file, AES-256 encrypted at rest. Remove it any time.
              </p>

              {!confirming && (
                <button
                  onClick={() => setConfirming(true)}
                  className="px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-surface-2 hover:bg-surface-3 border border-border rounded-lg transition-colors"
                >
                  Remove key
                </button>
              )}

              {confirming && (
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
            </>
          ) : (
            <>
              <p className="text-xs text-text-tertiary mb-3">
                No key on file — you're on the free-tier session allowance. Add your own
                key any time to skip the cap. It's AES-256 encrypted at rest and never
                logged. Get a key at{' '}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  console.anthropic.com
                </a>
                .
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="flex-1 px-3 py-2 text-sm bg-surface-0 border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40"
                  disabled={saving}
                />
                <button
                  onClick={handleSaveKey}
                  disabled={saving || !apiKey.trim()}
                  className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Validating...' : 'Save Key'}
                </button>
              </div>
              {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
              {justSaved && !error && (
                <p className="mt-2 text-xs text-green-400">API key saved. The cap no longer applies.</p>
              )}
              {justDeleted && !justSaved && !error && (
                <p className="mt-2 text-xs text-green-400">Key removed.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

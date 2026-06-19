import { useState, useEffect } from 'react';
import { track } from '../lib/posthog';
import { startCheckout } from '../lib/billing';

export default function SessionGate({ count, limit, send, onKeySuccess, apiKeyResult, billingEnabled, capReached = false, subscribed = false }) {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [keySuccess, setKeySuccess] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);
  const [checkoutOpened, setCheckoutOpened] = useState(false);

  const handleSubscribe = async () => {
    setCheckoutLoading(true);
    setCheckoutError(null);
    track('gate_subscribe_clicked', { count, limit });
    try {
      // In the web app this navigates away; in the extension it opens Stripe in
      // a new tab (returns true) and we stay mounted — so clear loading and let
      // the user reopen Stripe if they closed the tab without paying.
      const openedNewTab = await startCheckout();
      if (openedNewTab) {
        setCheckoutLoading(false);
        setCheckoutOpened(true);
      }
    } catch (err) {
      setCheckoutError(err.message);
      setCheckoutLoading(false);
    }
  };

  // React to api_key_result from server
  useEffect(() => {
    if (!apiKeyResult) return;
    setLoading(false);
    if (apiKeyResult.success) {
      setKeySuccess(true);
      onKeySuccess?.();
    } else {
      setError(apiKeyResult.error || 'Failed to save API key');
    }
  }, [apiKeyResult, onKeySuccess]);

  useEffect(() => {
    track('gate_viewed', { count, limit });
  }, [count, limit]);

  const handleSaveKey = () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    setError(null);
    send({ type: 'save_api_key', apiKey: apiKey.trim() });
  };

  return (
    <div className="absolute inset-0 overflow-y-auto p-6">
      <div className="w-full max-w-lg mx-auto bg-surface-1 border border-border rounded-2xl p-8 shadow-lg">
        <div className="text-center mb-6">
          <div className="text-2xl font-semibold text-text-primary mb-2">
            {capReached
              ? `You've used all ${limit} of this month's sessions`
              : `You've used all ${limit} free sessions`}
          </div>
          <p className="text-sm text-text-secondary">
            {capReached
              ? 'Your Pro plan resets at the start of next month. Bring your own API key below for unlimited sessions in the meantime.'
              : `You've completed ${count} sessions. To continue using ReLU, ${billingEnabled ? 'upgrade to Pro or bring your own API key.' : 'bring your own API key.'}`}
          </p>
        </div>

        {/* Section A: Subscribe via Stripe (only when billing is configured server-side) */}
        {billingEnabled && !subscribed && (
          <>
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Option 1: Upgrade to ReLU Pro</h3>
              <p className="text-xs text-text-tertiary mb-3">
                20 tutoring sessions per month on our API key. Cancel any time from Settings.
              </p>
              {/* Cross-problem roadmap line (plan-design-review 2026-06-18): part of the
                  PACKAGE pitch. "Coming" badge keeps it honest (not shipped); the concrete
                  example shows the value without a built surface. No date. This is the
                  convert-on-promise line the cohort-retention metric watches. */}
              <p className="text-xs text-text-tertiary mb-3 flex items-start gap-1.5">
                <span className="inline-flex items-center rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-secondary shrink-0">
                  Coming
                </span>
                <span>
                  A coach that spots the patterns you keep missing across problems — like reaching
                  for nested loops when two pointers was the tell.
                </span>
              </p>
              <button
                onClick={handleSubscribe}
                disabled={checkoutLoading}
                className="w-full px-4 py-2.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {checkoutLoading
                  ? 'Opening Stripe…'
                  : checkoutOpened
                    ? 'Reopen Stripe checkout'
                    : 'Subscribe — $15/month'}
              </button>
              {checkoutOpened && !checkoutError && (
                <p className="mt-2 text-xs text-text-tertiary">
                  Stripe opened in a new tab — finish there, then come back. This unlocks automatically once payment goes through.
                </p>
              )}
              {checkoutError && <p className="mt-2 text-xs text-red-400">{checkoutError}</p>}
            </div>
            <div className="border-t border-border my-6" />
          </>
        )}

        {/* Section B: BYOK */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-text-primary mb-3">{billingEnabled && !subscribed ? 'Option 2' : 'Option 1'}: Use your own API key</h3>
          <p className="text-xs text-text-tertiary mb-3">
            Your key is AES-256 encrypted and never logged.{' '}
            <a
              href="https://github.com/johnz4021/Relu/blob/main/server/index.js#L421"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              See exactly how it's stored →
            </a>
            {' '}Get a key at{' '}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              console.anthropic.com
            </a>
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="flex-1 px-3 py-2 text-sm bg-surface-0 border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40"
              disabled={loading || keySuccess}
            />
            <button
              onClick={handleSaveKey}
              disabled={loading || keySuccess || !apiKey.trim()}
              className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Validating...' : keySuccess ? 'Saved!' : 'Save Key'}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          {keySuccess && <p className="mt-2 text-xs text-green-400">API key saved successfully. You can now start sessions.</p>}
        </div>
      </div>
    </div>
  );
}

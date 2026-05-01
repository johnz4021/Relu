import { useState, useEffect } from 'react';
import { posthog, POSTHOG_KEY } from '../lib/posthog';

const track = (event, props) => POSTHOG_KEY && posthog.capture(event, props);

const AMOUNTS = ['$5/mo', '$10/mo', '$15/mo', '$20+/mo'];

export default function SessionGate({ count, limit, send, onKeySuccess, apiKeyResult }) {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [keySuccess, setKeySuccess] = useState(false);

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
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [otherClasses, setOtherClasses] = useState('');
  const [comments, setComments] = useState('');
  const [interestSent, setInterestSent] = useState(false);

  useEffect(() => {
    track('gate_viewed', { count, limit });
  }, [count, limit]);

  const handleSaveKey = () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    setError(null);
    send({ type: 'save_api_key', apiKey: apiKey.trim() });
  };

  const handleInterestSubmit = () => {
    if (!selectedAmount) return;
    send({ type: 'register_interest', amount: selectedAmount, otherClasses: otherClasses.trim(), comments: comments.trim() });
    track('would_pay_clicked', { amount: selectedAmount, other_classes: otherClasses.trim(), comments: comments.trim() });
    setInterestSent(true);
  };

  // Listen for api_key_result via parent — but we also expose handlers via props pattern
  // The parent (App.jsx) will call onKeySuccess when the WS response arrives

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-surface-1 border border-border rounded-2xl p-8 shadow-lg">
        <div className="text-center mb-6">
          <div className="text-2xl font-semibold text-text-primary mb-2">
            You've used all {limit} free sessions
          </div>
          <p className="text-sm text-text-secondary">
            You've completed {count} sessions. To continue using Argmax, bring your own API key or request more access.
          </p>
        </div>

        {/* Section A: BYOK */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Option 1: Use your own API key</h3>
          <p className="text-xs text-text-tertiary mb-3">
            Your key is encrypted and only used for your sessions.{' '}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              Get a key from Anthropic
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

        <div className="border-t border-border my-6" />

        {/* Section B: Interest Survey */}
        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-3">Option 2: Fill out the form to request credits</h3>

          {interestSent ? (
            <div className="text-center py-4">
              <p className="text-sm text-green-400">Thanks! We'll get back to you shortly.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-text-tertiary mb-3">How much would you pay monthly to use this across classes?</p>
              <div className="flex gap-2 mb-4">
                {AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setSelectedAmount(amount)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      selectedAmount === amount
                        ? 'bg-accent/20 border-accent text-accent'
                        : 'bg-surface-0 border-border text-text-secondary hover:border-text-tertiary'
                    }`}
                  >
                    {amount}
                  </button>
                ))}
              </div>

              <p className="text-xs text-text-tertiary mb-2">Any other classes/subjects you'd use a similar visualization tool for?</p>
              <input
                type="text"
                value={otherClasses}
                onChange={(e) => setOtherClasses(e.target.value)}
                placeholder="e.g. Data Structures, Operating Systems..."
                className="w-full px-3 py-2 text-sm bg-surface-0 border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40 mb-4"
              />

              <p className="text-xs text-text-tertiary mb-2">Any other comments or suggestions?</p>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="What would make this more useful for you?"
                rows={2}
                className="w-full px-3 py-2 text-sm bg-surface-0 border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40 mb-4 resize-none"
              />

              <button
                onClick={handleInterestSubmit}
                disabled={!selectedAmount}
                className="w-full px-4 py-2 text-sm font-medium bg-surface-2 text-text-primary border border-border rounded-lg hover:bg-surface-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Submit
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { track } from '../lib/posthog';


const AMOUNTS = ['$5/mo', '$10/mo', '$15/mo', '$20+/mo'];

// Wedge question: what would unlock paying. Structured > free-form so we can
// group/count and prioritize the roadmap from real signal instead of vibes.
const WEDGE_OPTIONS = [
  { id: 'more_sessions',     label: 'More sessions per month' },
  { id: 'better_explanations', label: 'Better / deeper explanations' },
  { id: 'more_algorithms',   label: 'More LeetCode problems supported' },
  { id: 'save_replay',       label: 'Save and replay past sessions' },
  { id: 'mobile',            label: 'Mobile / responsive' },
  { id: 'team_license',      label: 'Team or class license' },
];

export default function SessionGate({ count, limit, send, onKeySuccess, apiKeyResult, lastProblemText }) {
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
  // Auto-fill last problem text so we know which content was load-bearing
  // when the user hit the cap. Editable in case they want to clarify.
  const [problemContext, setProblemContext] = useState(lastProblemText || '');
  const [wedgeSelections, setWedgeSelections] = useState(new Set());
  const [wedgeOther, setWedgeOther] = useState('');
  const [npsScore, setNpsScore] = useState(null);
  const [interestSent, setInterestSent] = useState(false);

  useEffect(() => {
    track('gate_viewed', { count, limit });
  }, [count, limit]);

  const toggleWedge = (id) => {
    setWedgeSelections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSaveKey = () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    setError(null);
    send({ type: 'save_api_key', apiKey: apiKey.trim() });
  };

  const handleInterestSubmit = () => {
    if (!selectedAmount) return;
    const wedgeArr = Array.from(wedgeSelections);
    const payload = {
      type: 'register_interest',
      amount: selectedAmount,
      otherClasses: otherClasses.trim(),
      // Structured signal replacing the old "any other comments" textarea.
      problemContext: problemContext.trim(),
      wedgeSelections: wedgeArr,
      wedgeOther: wedgeOther.trim(),
      npsScore: npsScore,
    };
    send(payload);
    track('would_pay_clicked', {
      amount: selectedAmount,
      other_classes: otherClasses.trim(),
      wedge_selections: wedgeArr,
      wedge_other: wedgeOther.trim(),
      nps_score: npsScore,
      had_problem_context: !!problemContext.trim(),
    });
    setInterestSent(true);
  };

  // Listen for api_key_result via parent — but we also expose handlers via props pattern
  // The parent (App.jsx) will call onKeySuccess when the WS response arrives

  return (
    <div className="absolute inset-0 overflow-y-auto p-6">
      <div className="w-full max-w-lg mx-auto bg-surface-1 border border-border rounded-2xl p-8 shadow-lg">
        <div className="text-center mb-6">
          <div className="text-2xl font-semibold text-text-primary mb-2">
            You've used all {limit} free sessions
          </div>
          <p className="text-sm text-text-secondary">
            You've completed {count} sessions. To continue using ReLU, bring your own API key or request more access.
          </p>
        </div>

        {/* Section A: BYOK */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Option 1: Use your own API key</h3>
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

              {/* Wedge question — replaces the open "comments" textarea.
                  Structured selections give us countable prioritization signal. */}
              <p className="text-xs text-text-tertiary mb-2">What would unlock paying for this? (pick any)</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {WEDGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleWedge(opt.id)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      wedgeSelections.has(opt.id)
                        ? 'bg-accent/20 border-accent text-accent'
                        : 'bg-surface-0 border-border text-text-secondary hover:border-text-tertiary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={wedgeOther}
                onChange={(e) => setWedgeOther(e.target.value)}
                placeholder="Other (optional)"
                className="w-full px-3 py-2 text-sm bg-surface-0 border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40 mb-4"
              />

              {/* Auto-filled from the last LC problem the user pasted before
                  hitting the cap. Editable so they can clarify or replace it. */}
              {(problemContext || lastProblemText) && (
                <>
                  <p className="text-xs text-text-tertiary mb-2">Last problem you were working on (helps us prioritize what to support next):</p>
                  <textarea
                    value={problemContext}
                    onChange={(e) => setProblemContext(e.target.value)}
                    rows={2}
                    placeholder="Paste or describe the LeetCode problem..."
                    className="w-full px-3 py-2 text-sm bg-surface-0 border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/40 mb-4 resize-none"
                  />
                </>
              )}

              {/* NPS at the cap — peak engagement moment, single best signal. */}
              <p className="text-xs text-text-tertiary mb-2">How likely are you to recommend ReLU to a friend? (1 = not at all, 10 = definitely)</p>
              <div className="flex gap-1 mb-4">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNpsScore(n)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      npsScore === n
                        ? 'bg-accent/20 border-accent text-accent'
                        : 'bg-surface-0 border-border text-text-secondary hover:border-text-tertiary'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <button
                onClick={handleInterestSubmit}
                disabled={!selectedAmount}
                className="w-full px-4 py-2 text-sm font-medium bg-surface-2 text-text-primary border border-border rounded-lg hover:bg-surface-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Request {limit} more sessions
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

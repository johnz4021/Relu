import { useState } from 'react';
import { posthog, POSTHOG_KEY } from '../lib/posthog';

const track = (event, props) => POSTHOG_KEY && posthog.capture(event, props);

const DISPLAY_NAMES = {
  lcs: 'LCS',
  bfs: 'BFS',
  dfs: 'DFS',
  bst_insert: 'BST Insert',
  dag_shortest: 'DAG Shortest Path',
  bell_ford: 'Bellman-Ford',
  bellman_ford: 'Bellman-Ford',
};

export default function LeetCodeSolver({ onSelect, disabled, lcParsed }) {
  const [problemText, setProblemText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!problemText.trim() || disabled || lcParsed?.loading) return;
    track('leetcode_submitted', { text_length: problemText.length });
    onSelect('leetcode', { problemText: problemText.trim() });
  };

  const hasContent = problemText.trim().length > 0;
  const isLoading = !!lcParsed?.loading;

  return (
    <div className="flex flex-col items-center h-full overflow-auto px-4 pt-16">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-display font-semibold text-text-primary mb-2">
          Practice Interview Problems
        </h1>
        <p className="text-text-secondary font-body">
          Paste a LeetCode problem. Watch it think.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-2xl">
        <div className={`relative bg-surface-2 border rounded-2xl overflow-hidden focus-within:border-border-hover transition-colors ${isLoading ? 'opacity-70' : 'border-border'}`}>
          <textarea
            value={problemText}
            onChange={(e) => {
              setProblemText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 320) + 'px';
            }}
            placeholder="Paste a LeetCode problem statement here..."
            aria-label="LeetCode problem text"
            rows={5}
            disabled={isLoading}
            className="w-full bg-transparent px-4 pt-4 pb-2 text-sm text-text-primary font-body placeholder-text-tertiary focus:outline-none resize-none disabled:cursor-not-allowed"
          />

          <div className="flex items-center justify-between px-4 pb-3">
            <div aria-live="polite" className="text-xs text-text-tertiary font-body">
              {isLoading && !lcParsed?.algorithm_key && 'Analyzing problem...'}
              {lcParsed?.algorithm_key && `Detected: ${DISPLAY_NAMES[lcParsed.algorithm_key] ?? lcParsed.algorithm_key.replace(/_/g, ' ')} — loading session...`}
              {lcParsed && !lcParsed.algorithm_key && !lcParsed.loading && lcParsed.fallback_reason && 'No matching visualization — using text-only mode'}
            </div>
            <button
              type="submit"
              disabled={!hasContent || disabled || isLoading}
              className={`flex items-center gap-2 px-4 py-2 min-h-[44px] rounded-xl text-sm font-medium transition-colors ${
                hasContent && !disabled && !isLoading
                  ? 'bg-accent hover:bg-accent-hover text-surface-0'
                  : 'bg-surface-3 text-text-tertiary cursor-not-allowed'
              }`}
            >
              {isLoading ? 'Loading...' : 'Solve with Argmax'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

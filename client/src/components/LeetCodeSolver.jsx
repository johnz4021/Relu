import { useState } from 'react';
import { track } from '../lib/posthog';


const DISPLAY_NAMES = {
  lcs: 'LCS',
  bfs: 'BFS',
  dfs: 'DFS',
  bst_insert: 'BST Insert',
  dag_shortest: 'DAG Shortest Path',
  bellman_ford: 'Bellman-Ford',
};

const SAMPLE_PROBLEMS = [
  {
    label: 'Number of Islands',
    text: `Given an m x n 2D binary grid grid which represents a map of '1's (land) and '0's (water), return the number of islands.

An island is surrounded by water and is formed by connecting adjacent lands horizontally or vertically. You may assume all four edges of the grid are all surrounded by water.

Example 1:
Input: grid = [
  ["1","1","1","1","0"],
  ["1","1","0","1","0"],
  ["1","1","0","0","0"],
  ["0","0","0","0","0"]
]
Output: 1

Example 2:
Input: grid = [
  ["1","1","0","0","0"],
  ["1","1","0","0","0"],
  ["0","0","1","0","0"],
  ["0","0","0","1","1"]
]
Output: 3`,
  },
  {
    label: 'Course Schedule',
    text: `There are a total of numCourses courses you have to take, labeled from 0 to numCourses - 1. You are given an array prerequisites where prerequisites[i] = [ai, bi] indicates that you must take course bi first if you want to take course ai.

Return true if you can finish all courses. Otherwise, return false.

Example 1:
Input: numCourses = 2, prerequisites = [[1,0]]
Output: true
Explanation: There are a total of 2 courses to take. To take course 1 you should have finished course 0. So it is possible.

Example 2:
Input: numCourses = 2, prerequisites = [[1,0],[0,1]]
Output: false
Explanation: There are a total of 2 courses to take. To take course 1 you should have finished course 0, and to take course 0 you should have finished course 1. So it is impossible.`,
  },
];

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
          Paste a LeetCode problem. Build intuition.
        </p>
        <div className="flex items-center justify-center gap-2 mt-4">
          <span className="text-xs text-text-tertiary font-body">Try a sample:</span>
          {SAMPLE_PROBLEMS.map((p) => (
            <button
              key={p.label}
              onClick={() => setProblemText(p.text)}
              disabled={disabled || isLoading}
              className="text-xs px-3 py-1 rounded-lg bg-surface-2 border border-border text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-body"
            >
              {p.label}
            </button>
          ))}
        </div>
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
              {isLoading ? 'Loading...' : 'Solve with ReLU'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

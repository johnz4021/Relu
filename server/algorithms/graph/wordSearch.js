/**
 * Word Search (LC79) — DFS + backtracking on a 2D grid.
 * Converts the board to a graph (grid nodes + adjacency edges),
 * then DFS from every cell trying to match `word` character by character.
 */
export function wordSearch(input) {
  const { board, word } = input;
  const rows = board.length;
  const cols = board[0].length;
  const SPACING = 80;

  const nodes = [];
  const nodeMap = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = `${r}_${c}`;
      const node = { id, label: board[r][c], row: r, col: c, position: { x: c * SPACING, y: r * SPACING } };
      nodes.push(node);
      nodeMap[id] = node;
    }
  }

  const edges = [];
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          edges.push({ source: `${r}_${c}`, target: `${nr}_${nc}` });
        }
      }
    }
  }

  const graph = { nodes, edges, directed: false };
  const trace = [];
  trace.push({
    type: 'init',
    graph,
    word,
    board,
    description: `Word Search: find "${word}" in grid via DFS + backtracking.`,
  });

  let found = false;
  let foundPath = [];
  const visited = new Set();

  function dfs(r, c, index, path) {
    if (found) return;
    if (index === word.length) {
      found = true;
      foundPath = [...path];
      trace.push({ type: 'found_path', path: [...path], word });
      return;
    }
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    const id = `${r}_${c}`;
    if (visited.has(id) || board[r][c] !== word[index]) return;

    visited.add(id);
    const newPath = [...path, id];
    trace.push({ type: 'visit_node', node: id, char: board[r][c], word_index: index, path: newPath, word });

    for (const [dr, dc] of dirs) {
      dfs(r + dr, c + dc, index + 1, newPath);
      if (found) break;
    }

    if (!found) {
      visited.delete(id);
      trace.push({ type: 'backtrack', node: id, char: board[r][c], word_index: index });
    }
  }

  for (let r = 0; r < rows && !found; r++) {
    for (let c = 0; c < cols && !found; c++) {
      dfs(r, c, 0, []);
    }
  }

  trace.push({ type: 'result', found, path: foundPath, word });
  return trace;
}

export const DEFAULT_WORD_SEARCH_INPUT = {
  board: [['A', 'B', 'C', 'E'], ['S', 'F', 'C', 'S'], ['A', 'D', 'E', 'E']],
  word: 'ABCCED',
};

// Board-placement backtracking (Tier 1, parametric). Headline puzzle: N-Queens
// (LC51/52). The n×n table IS the chessboard — this entry exists because a
// graph circle layout failed for this problem class; the table renderer's grid
// is the natural board.
//
// Input contract: { puzzle: 'n_queens', n: 4 }. The `puzzle` field is the
// extension point for future board puzzles (sudoku_solver, knights_tour) —
// ONLY 'n_queens' is implemented today; unknown puzzles emit a single error
// step rather than faking support.
//
// Renderer: table. Step types map via mapTableStep:
//   init_table → init_grid (the empty board) + board_state seed
//   fill_cell  → place a queen '♛' (generic fill + algo-gated board_state)
//   conflict   → highlight the attacked square + its attackers in red
//   clear_cell → backtrack: erase the queen (new generic eraser case)
//   result     → mark the solution queens optimal; output = coordinate string
//
// Conflict/current highlights are transient by design: every step carries a
// `repaint` list (cells the PREVIOUS step colored, restored to 'filled' for
// queens / 'empty' otherwise) so stale highlights never linger on the board.

export const DEFAULT_BOARD_BACKTRACKING_INPUT = { puzzle: 'n_queens', n: 4 };

const QUEEN = '♛';
const MAX_N = 5; // keep traces short (< 80 steps for n=4) and boards readable

export function boardBacktracking(input) {
  const puzzle = input.puzzle || 'n_queens';
  if (puzzle !== 'n_queens') {
    return [{
      type: 'error',
      pseudocode_line: 0,
      description: `Unsupported puzzle "${puzzle}" — board_backtracking implements n_queens only.`,
    }];
  }
  const n = Math.min(Math.max(parseInt(input.n, 10) || DEFAULT_BOARD_BACKTRACKING_INPUT.n, 1), MAX_N);

  const trace = [];
  const queens = []; // queens[row] = col of the queen placed in that row
  let dirty = [];    // cells the previous step colored (need repaint next step)

  const snapshot = () => queens.map((col, row) => [row, col]);
  const boardEntries = (extra = []) => ([
    { key: 'Queens placed', value: `${queens.length} / ${n}` },
    ...extra,
  ]);

  // Restore every cell the previous step colored: queens back to 'filled',
  // empty squares back to 'empty'. Consumed (and reset) once per step.
  const takeRepaint = () => {
    const repaint = dirty.map(([r, c]) => ({
      row: r, col: c, className: queens[r] === c ? 'filled' : 'empty',
    }));
    dirty = [];
    return repaint;
  };

  trace.push({
    type: 'init_table',
    pseudocode_line: 0,
    rows: n,
    cols: n,
    rowLabels: Array.from({ length: n }, (_, i) => `r${i}`),
    colLabels: Array.from({ length: n }, (_, i) => `c${i}`),
    n,
    description: `N-Queens on a ${n}×${n} board: place one queen per row so no two share a column or diagonal. Start at row 0.`,
  });

  // All placed queens attacking square (row, col). Queens live in earlier
  // rows only (one per row), so row clashes are impossible by construction.
  const findAttackers = (row, col) => {
    const attackers = [];
    for (let r = 0; r < queens.length; r++) {
      const c = queens[r];
      if (c === col || Math.abs(c - col) === Math.abs(r - row)) attackers.push([r, c]);
    }
    return attackers;
  };

  function solve(row) {
    if (row === n) return true;
    for (let col = 0; col < n; col++) {
      const attackers = findAttackers(row, col);
      if (attackers.length > 0) {
        const [ar, ac] = attackers[0];
        const via = ac === col ? 'column' : 'diagonal';
        trace.push({
          type: 'conflict',
          pseudocode_line: 3,
          r: row,
          c: col,
          attackers,
          repaint: takeRepaint(),
          state_entries: boardEntries([
            { key: 'Current row', value: row },
            { key: 'Trying', value: `(${row},${col}) — attacked`, status: 'highlight' },
          ]),
          description: `(${row},${col}) is attacked: the queen at (${ar},${ac}) sees it along the ${via}${attackers.length > 1 ? ` (${attackers.length} attackers total)` : ''}. Skip this column.`,
        });
        dirty = [[row, col], ...attackers];
        continue;
      }

      queens.push(col);
      trace.push({
        type: 'fill_cell',
        pseudocode_line: 4,
        row,
        col,
        value: QUEEN,
        repaint: takeRepaint(),
        state_entries: boardEntries([
          { key: 'Current row', value: row },
          { key: 'Placed', value: `(${row},${col})`, status: 'updated' },
        ]),
        description: `(${row},${col}) is safe — place a queen there and move to row ${row + 1}.`,
      });
      dirty = [[row, col]];

      if (solve(row + 1)) return true;

      queens.pop();
      trace.push({
        type: 'clear_cell',
        pseudocode_line: 6,
        row,
        col,
        repaint: takeRepaint(),
        state_entries: boardEntries([
          { key: 'Current row', value: row },
          { key: 'Backtrack', value: `remove (${row},${col})`, status: 'highlight' },
        ]),
        description: `Every column in row ${row + 1} failed — backtrack: remove the queen from (${row},${col}) and try the next column.`,
      });
      dirty = [];
    }
    return false;
  }

  const solved = solve(0);
  const solution = snapshot();
  const output = solved ? solution.map(([r, c]) => `(${r},${c})`).join(', ') : 'no solution';

  trace.push({
    type: 'result',
    pseudocode_line: 1,
    solution,
    repaint: takeRepaint(),
    output,
    description: solved
      ? `All ${n} queens placed: ${output}. No two share a row, column, or diagonal.`
      : `No valid placement exists for n = ${n}.`,
  });

  return trace;
}

// Tier 1 implementation for Valid Sudoku (LC 36).
//
// Single-pass scan with three sets per constraint type: 9 row sets,
// 9 column sets, 9 box sets. For each non-empty cell, check whether
// its value already lives in the row / column / box set; if so, the
// board is invalid. Stops at the first conflict so the trace stays
// readable — the lesson is about *finding* the conflict, not exhausting
// the board.

const VALUE_PATTERN = /^[1-9]$/;

function isFilled(cell) {
  return cell !== '.' && cell != null && cell !== '';
}

function setToStr(set) {
  if (set.size === 0) return '{ }';
  return '{ ' + Array.from(set).sort().join(', ') + ' }';
}

// Box index 0..8: top-left to bottom-right reading order, 3 across.
function boxIndex(r, c) {
  return Math.floor(r / 3) * 3 + Math.floor(c / 3);
}

// All 9 cells in box b, in row-major order.
function cellsInBox(b) {
  const startR = Math.floor(b / 3) * 3;
  const startC = (b % 3) * 3;
  const cells = [];
  for (let r = startR; r < startR + 3; r++) {
    for (let c = startC; c < startC + 3; c++) {
      cells.push({ row: r, col: c });
    }
  }
  return cells;
}

export function validSudoku(input) {
  const board = input?.board || DEFAULT_VALID_SUDOKU_INPUT.board;
  const trace = [];

  // 9 sets per constraint type, indexed 0..8.
  const rowSets = Array.from({ length: 9 }, () => new Set());
  const colSets = Array.from({ length: 9 }, () => new Set());
  const boxSets = Array.from({ length: 9 }, () => new Set());

  // The constraint-state panel shows the three currently-active sets for the
  // cell being scanned. Returns the three entries verbatim.
  const buildSetState = (r, c) => ([
    { key: `Row ${r}`, value: setToStr(rowSets[r]) },
    { key: `Col ${c}`, value: setToStr(colSets[c]) },
    { key: `Box (${Math.floor(r / 3)},${Math.floor(c / 3)})`, value: setToStr(boxSets[boxIndex(r, c)]) },
  ]);

  trace.push({
    type: 'init_table',
    description: 'Valid Sudoku: scan the 9×9 grid and verify each row, column, and 3×3 sub-box has no duplicate digits 1-9.',
    board,
    rows: 9,
    cols: 9,
    pseudocode_line: 0,
  });

  let foundConflict = false;
  let conflictDetails = null;

  outer:
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const value = board[r]?.[c];
      if (!isFilled(value)) continue;
      // Defensive: skip non-digit input rather than corrupting the trace.
      if (!VALUE_PATTERN.test(String(value))) continue;

      trace.push({
        type: 'scan_cell',
        description: `Cell (${r}, ${c}) has value '${value}'. Check three constraints in turn.`,
        r, c, value,
        pseudocode_line: 1,
      });

      // ── 1. Row constraint ────────────────────────────────────────────
      {
        const conflict = rowSets[r].has(value);
        trace.push({
          type: 'check_constraint',
          description: conflict
            ? `Row ${r} already contains '${value}' — conflict.`
            : `Row ${r} does not yet contain '${value}'.`,
          r, c, value,
          constraint: 'row',
          constraint_index: r,
          cells_in_group: Array.from({ length: 9 }, (_, ci) => ({ row: r, col: ci })),
          set_state: buildSetState(r, c),
          has_conflict: conflict,
          pseudocode_line: 2,
        });
        if (conflict) {
          trace.push({
            type: 'conflict',
            description: `Duplicate '${value}' in row ${r}. Board is invalid.`,
            r, c, value,
            constraint: 'row',
            constraint_index: r,
            pseudocode_line: 5,
          });
          foundConflict = true;
          conflictDetails = { r, c, value, constraint: 'row', constraint_index: r };
          break outer;
        }
        rowSets[r].add(value);
      }

      // ── 2. Column constraint ─────────────────────────────────────────
      {
        const conflict = colSets[c].has(value);
        trace.push({
          type: 'check_constraint',
          description: conflict
            ? `Column ${c} already contains '${value}' — conflict.`
            : `Column ${c} does not yet contain '${value}'.`,
          r, c, value,
          constraint: 'col',
          constraint_index: c,
          cells_in_group: Array.from({ length: 9 }, (_, ri) => ({ row: ri, col: c })),
          set_state: buildSetState(r, c),
          has_conflict: conflict,
          pseudocode_line: 3,
        });
        if (conflict) {
          trace.push({
            type: 'conflict',
            description: `Duplicate '${value}' in column ${c}. Board is invalid.`,
            r, c, value,
            constraint: 'col',
            constraint_index: c,
            pseudocode_line: 5,
          });
          foundConflict = true;
          conflictDetails = { r, c, value, constraint: 'col', constraint_index: c };
          break outer;
        }
        colSets[c].add(value);
      }

      // ── 3. Box constraint ────────────────────────────────────────────
      {
        const b = boxIndex(r, c);
        const conflict = boxSets[b].has(value);
        trace.push({
          type: 'check_constraint',
          description: conflict
            ? `3×3 box ${b} already contains '${value}' — conflict.`
            : `3×3 box ${b} does not yet contain '${value}'.`,
          r, c, value,
          constraint: 'box',
          constraint_index: b,
          cells_in_group: cellsInBox(b),
          set_state: buildSetState(r, c),
          has_conflict: conflict,
          pseudocode_line: 4,
        });
        if (conflict) {
          trace.push({
            type: 'conflict',
            description: `Duplicate '${value}' in 3×3 box ${b}. Board is invalid.`,
            r, c, value,
            constraint: 'box',
            constraint_index: b,
            pseudocode_line: 5,
          });
          foundConflict = true;
          conflictDetails = { r, c, value, constraint: 'box', constraint_index: b };
          break outer;
        }
        boxSets[b].add(value);
      }

      trace.push({
        type: 'cell_done',
        description: `(${r}, ${c}) passes all three checks.`,
        r, c,
        accepted: true,
        pseudocode_line: 6,
      });
    }
  }

  trace.push({
    type: 'result',
    description: foundConflict
      ? `Board is INVALID — duplicate '${conflictDetails.value}' found in ${conflictDetails.constraint} at (${conflictDetails.r}, ${conflictDetails.c}).`
      : 'Board is VALID — every row, column, and 3×3 box has no duplicates.',
    output: foundConflict ? 'false' : 'true',
    valid: !foundConflict,
    conflict: conflictDetails,
    pseudocode_line: 7,
  });

  return trace;
}

// The canonical LC 36 example board (valid).
export const DEFAULT_VALID_SUDOKU_INPUT = {
  board: [
    ['5','3','.','.','7','.','.','.','.'],
    ['6','.','.','1','9','5','.','.','.'],
    ['.','9','8','.','.','.','.','6','.'],
    ['8','.','.','.','6','.','.','.','3'],
    ['4','.','.','8','.','3','.','.','1'],
    ['7','.','.','.','2','.','.','.','6'],
    ['.','6','.','.','.','.','2','8','.'],
    ['.','.','.','4','1','9','.','.','5'],
    ['.','.','.','.','8','.','.','7','9'],
  ],
};

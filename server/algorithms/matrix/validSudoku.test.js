import { describe, it, expect } from 'vitest';
import { validSudoku, DEFAULT_VALID_SUDOKU_INPUT } from './validSudoku.js';

// Helper: walk a trace, return the first step matching a predicate (or null).
const findStep = (trace, pred) => trace.find(pred) || null;

// The default board is LC 36 Ex2 (invalid). Restoring '5' at (0,0) gives the
// LC 36 Ex1 board, which is valid.
const VALID_BOARD = DEFAULT_VALID_SUDOKU_INPUT.board.map((row) => [...row]);
VALID_BOARD[0][0] = '5';

describe('validSudoku — trace shape', () => {
  it('init_table is the first step and carries the 9×9 board', () => {
    const trace = validSudoku(DEFAULT_VALID_SUDOKU_INPUT);
    const init = trace[0];
    expect(init.type).toBe('init_table');
    expect(init.rows).toBe(9);
    expect(init.cols).toBe(9);
    expect(init.board.length).toBe(9);
    expect(init.board[0].length).toBe(9);
  });

  it('emits exactly one result step, last, with output "true" for valid boards', () => {
    const trace = validSudoku({ board: VALID_BOARD });
    const results = trace.filter((s) => s.type === 'result');
    expect(results.length).toBe(1);
    expect(trace[trace.length - 1].type).toBe('result');
    expect(results[0].output).toBe('true');
    expect(results[0].valid).toBe(true);
  });

  it('default board (LC Ex2) → conflict found, result "false"', () => {
    const trace = validSudoku(DEFAULT_VALID_SUDOKU_INPUT);
    expect(findStep(trace, (s) => s.type === 'conflict')).not.toBeNull();
    const result = trace[trace.length - 1];
    expect(result.type).toBe('result');
    expect(result.output).toBe('false');
  });

  it('emits no scan_cell for "." cells (defensive scan)', () => {
    const board = Array.from({ length: 9 }, () => new Array(9).fill('.'));
    board[0][0] = '5';
    board[4][4] = '7';
    const trace = validSudoku({ board });
    const scans = trace.filter((s) => s.type === 'scan_cell');
    expect(scans.length).toBe(2);
    expect(scans[0]).toMatchObject({ r: 0, c: 0, value: '5' });
    expect(scans[1]).toMatchObject({ r: 4, c: 4, value: '7' });
  });
});

describe('validSudoku — conflict detection', () => {
  it('detects a row duplicate and stops at first conflict', () => {
    const board = Array.from({ length: 9 }, () => new Array(9).fill('.'));
    board[0][0] = '5';
    board[0][8] = '5'; // same row, end of row
    board[3][0] = '9'; // would be processed if we didn't stop
    const trace = validSudoku({ board });
    const conflict = findStep(trace, (s) => s.type === 'conflict');
    expect(conflict).not.toBeNull();
    expect(conflict).toMatchObject({ r: 0, c: 8, value: '5', constraint: 'row' });
    // Should not have scanned beyond the conflict
    const lastScan = [...trace].reverse().find((s) => s.type === 'scan_cell');
    expect(lastScan).toMatchObject({ r: 0, c: 8 });
    const result = trace[trace.length - 1];
    expect(result.type).toBe('result');
    expect(result.valid).toBe(false);
    expect(result.output).toBe('false');
  });

  it('detects a column duplicate', () => {
    const board = Array.from({ length: 9 }, () => new Array(9).fill('.'));
    board[0][3] = '7';
    board[5][3] = '7';
    const trace = validSudoku({ board });
    const conflict = findStep(trace, (s) => s.type === 'conflict');
    expect(conflict).toMatchObject({ r: 5, c: 3, value: '7', constraint: 'col' });
  });

  it('detects a 3×3 box duplicate', () => {
    const board = Array.from({ length: 9 }, () => new Array(9).fill('.'));
    // Both inside box 0 (rows 0-2, cols 0-2)
    board[0][0] = '3';
    board[2][2] = '3';
    const trace = validSudoku({ board });
    const conflict = findStep(trace, (s) => s.type === 'conflict');
    expect(conflict).toMatchObject({ r: 2, c: 2, value: '3', constraint: 'box', constraint_index: 0 });
  });
});

describe('validSudoku — set_state contents', () => {
  it('check_constraint set_state surfaces the active row/col/box snapshots', () => {
    const trace = validSudoku(DEFAULT_VALID_SUDOKU_INPUT);
    // First check_constraint is the row check for cell (0,0) = '8'.
    // At this moment row 0 / col 0 / box 0 are all still empty.
    const firstCheck = findStep(trace, (s) => s.type === 'check_constraint');
    expect(firstCheck.set_state.length).toBe(3);
    expect(firstCheck.set_state[0].key).toBe('Row 0');
    expect(firstCheck.set_state[1].key).toBe('Col 0');
    expect(firstCheck.set_state[2].key).toBe('Box (0,0)');
    // No values seen yet → all three are empty sets
    expect(firstCheck.set_state[0].value).toBe('{ }');
  });

  it('cells_in_group has the expected shape per constraint type', () => {
    const trace = validSudoku(DEFAULT_VALID_SUDOKU_INPUT);
    const checks = trace.filter((s) => s.type === 'check_constraint');
    // First three checks are row, col, box for cell (0,0)
    expect(checks[0].constraint).toBe('row');
    expect(checks[0].cells_in_group.length).toBe(9);
    expect(checks[0].cells_in_group.every((c) => c.row === 0)).toBe(true);

    expect(checks[1].constraint).toBe('col');
    expect(checks[1].cells_in_group.length).toBe(9);
    expect(checks[1].cells_in_group.every((c) => c.col === 0)).toBe(true);

    expect(checks[2].constraint).toBe('box');
    expect(checks[2].cells_in_group.length).toBe(9);
    // Box 0 = rows 0-2, cols 0-2
    expect(checks[2].cells_in_group.every((c) => c.row <= 2 && c.col <= 2)).toBe(true);
  });
});

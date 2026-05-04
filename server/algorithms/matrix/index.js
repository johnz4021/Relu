// Tier 1 implementations for matrix / 2D grid patterns.

// ── number_of_islands — Number of Islands (grid BFS flood-fill) ───────────────
export function numberOfIslands(input) {
  const grid = input.grid || [
    [1,1,1,1,0],
    [1,1,0,1,0],
    [1,1,0,0,0],
    [0,0,0,0,0],
  ];
  const rows = grid.length, cols = grid[0].length;
  const trace = [];

  // Build graph nodes for renderer
  const nodes = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      nodes.push({ id: `${r},${c}` });

  const edges = [];
  const dirs = [[0,1],[0,-1],[1,0],[-1,0]];

  trace.push({
    type: 'init',
    description: `Number of Islands: BFS flood-fill on ${rows}×${cols} grid. 1=land, 0=water.`,
    nodes, edges,
    source: '',
    distances: Object.fromEntries(nodes.map(n => {
      const [r, c] = n.id.split(',').map(Number);
      return [n.id, grid[r][c] === 1 ? 'land' : 'water'];
    })),
    island_count: 0,
    pseudocode_line: 0,
  });

  const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));
  let count = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] === 1 && !visited[r][c]) {
        count++;
        // BFS flood fill
        const queue = [[r, c]];
        visited[r][c] = true;
        let front = 0;

        trace.push({
          type: 'visit_node',
          description: `Found island #${count} starting at (${r},${c})`,
          node: `${r},${c}`,
          from: '',
          distances: Object.fromEntries(nodes.map(n => {
            const [nr, nc] = n.id.split(',').map(Number);
            if (visited[nr][nc]) return [n.id, `island-${count}`];
            return [n.id, grid[nr][nc] === 1 ? 'land' : 'water'];
          })),
          island_count: count,
          pseudocode_line: 3,
        });

        while (front < queue.length) {
          const [cr, cc] = queue[front++];
          for (const [dr, dc] of dirs) {
            const nr = cr + dr, nc = cc + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (grid[nr][nc] !== 1 || visited[nr][nc]) continue;
            visited[nr][nc] = true;
            queue.push([nr, nc]);
            edges.push({ source: `${cr},${cc}`, target: `${nr},${nc}`, weight: count });
            trace.push({
              type: 'visit_node',
              description: `BFS: mark (${nr},${nc}) as part of island #${count}`,
              node: `${nr},${nc}`,
              from: `${cr},${cc}`,
              distances: Object.fromEntries(nodes.map(n => {
                const [r2, c2] = n.id.split(',').map(Number);
                if (visited[r2][c2]) return [n.id, `island-${count}`];
                return [n.id, grid[r2][c2] === 1 ? 'land' : 'water'];
              })),
              island_count: count,
              pseudocode_line: 13,
            });
          }
        }
      }
    }
  }

  trace.push({
    type: 'result',
    description: `Found ${count} island(s) in ${rows}×${cols} grid`,
    nodes, edges,
    output: String(count),
    pseudocode_line: 1,
  });

  return trace;
}

export const DEFAULT_NUMBER_OF_ISLANDS_INPUT = {
  grid: [
    [1,1,1,1,0],
    [1,1,0,1,0],
    [1,1,0,0,0],
    [0,0,0,0,0],
  ],
};

// ── spiral_matrix — Spiral Matrix Traversal ───────────────────────────────────
export function spiralMatrix(input) {
  const matrix = input.matrix || [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ];
  const rows = matrix.length, cols = matrix[0].length;
  const trace = [];
  const result = [];

  trace.push({
    type: 'init',
    description: `Spiral traversal of ${rows}×${cols} matrix — peel layer by layer (top→right→bottom→left)`,
    array: [],
    indices: [],
  });

  let top = 0, bottom = rows - 1, left = 0, right = cols - 1;

  while (top <= bottom && left <= right) {
    // Traverse right along top row
    for (let c = left; c <= right; c++) {
      result.push(matrix[top][c]);
      trace.push({
        type: 'traverse',
        description: `Top row [${top}][${c}] = ${matrix[top][c]}`,
        array: [...result],
        indices: [result.length - 1],
      });
    }
    top++;

    // Traverse down along right column
    for (let r = top; r <= bottom; r++) {
      result.push(matrix[r][right]);
      trace.push({
        type: 'traverse',
        description: `Right col [${r}][${right}] = ${matrix[r][right]}`,
        array: [...result],
        indices: [result.length - 1],
      });
    }
    right--;

    // Traverse left along bottom row
    if (top <= bottom) {
      for (let c = right; c >= left; c--) {
        result.push(matrix[bottom][c]);
        trace.push({
          type: 'traverse',
          description: `Bottom row [${bottom}][${c}] = ${matrix[bottom][c]}`,
          array: [...result],
          indices: [result.length - 1],
        });
      }
      bottom--;
    }

    // Traverse up along left column
    if (left <= right) {
      for (let r = bottom; r >= top; r--) {
        result.push(matrix[r][left]);
        trace.push({
          type: 'traverse',
          description: `Left col [${r}][${left}] = ${matrix[r][left]}`,
          array: [...result],
          indices: [result.length - 1],
        });
      }
      left++;
    }
  }

  trace.push({
    type: 'result',
    description: `Spiral order: [${result.join(', ')}]`,
    array: [...result],
    indices: result.map((_, i) => i),
    output: JSON.stringify(result),
  });

  return trace;
}

export const DEFAULT_SPIRAL_MATRIX_INPUT = {
  matrix: [[1,2,3],[4,5,6],[7,8,9]],
};

// ── rotate_matrix — Rotate Matrix 90° In-Place (transpose + reverse rows) ────
export function rotateMatrix(input) {
  const matrix = input.matrix || [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ];
  const n = matrix.length;
  const trace = [];

  // Deep copy to avoid mutating input
  const mat = matrix.map(r => [...r]);

  const flatten = m => m.flatMap(r => r);

  trace.push({
    type: 'init',
    description: `Rotate ${n}×${n} matrix 90° clockwise in-place: step 1 = transpose, step 2 = reverse each row`,
    array: flatten(mat),
    indices: [],
  });

  // Step 1: Transpose
  for (let r = 0; r < n; r++) {
    for (let c = r + 1; c < n; c++) {
      [mat[r][c], mat[c][r]] = [mat[c][r], mat[r][c]];
      trace.push({
        type: 'swap',
        description: `Transpose: swap [${r}][${c}]↔[${c}][${r}] → [${mat[r].join(',')}] / [${mat[c].join(',')}]`,
        array: flatten(mat),
        indices: [r * n + c, c * n + r],
      });
    }
  }

  trace.push({
    type: 'phase',
    description: `Transpose complete. Now reverse each row.`,
    array: flatten(mat),
    indices: [],
  });

  // Step 2: Reverse each row
  for (let r = 0; r < n; r++) {
    mat[r].reverse();
    trace.push({
      type: 'reverse',
      description: `Reverse row ${r}: [${mat[r].join(', ')}]`,
      array: flatten(mat),
      indices: mat[r].map((_, c) => r * n + c),
    });
  }

  trace.push({
    type: 'result',
    description: `Rotation complete. Result: ${JSON.stringify(mat)}`,
    array: flatten(mat),
    indices: [],
    output: JSON.stringify(mat),
  });

  return trace;
}

export const DEFAULT_ROTATE_MATRIX_INPUT = {
  matrix: [[1,2,3],[4,5,6],[7,8,9]],
};

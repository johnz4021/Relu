export function knapsack(items, capacity) {
  const trace = [];
  const n = items.length;

  // dp[i][w] = max value using items 0..i-1 with capacity w
  const dp = Array.from({ length: n + 1 }, () => Array(capacity + 1).fill(0));

  trace.push({
    type: 'init_table',
    pseudocode_line: 0,
    rows: n + 1,
    cols: capacity + 1,
    rowLabels: ['0 (no items)', ...items.map((item, i) => `${i + 1} (+${item.name})`)],
    colLabels: Array.from({ length: capacity + 1 }, (_, w) => `w=${w}`),
    table: dp.map(row => [...row]),
    items: items.map((item, i) => ({ ...item, index: i })),
    description: `Initialize a ${n + 1} x ${capacity + 1} DP table with zeros. Rows represent items (0 = no items, then each item). Columns represent capacities 0 to ${capacity}.`,
  });

  for (let i = 1; i <= n; i++) {
    const item = items[i - 1];

    trace.push({
      type: 'consider_item',
      pseudocode_line: 1,
      row: i,
      item: { ...item },
      description: `Consider item ${i}: "${item.name}" (weight=${item.weight}, value=${item.value}).`,
    });

    for (let w = 0; w <= capacity; w++) {
      if (item.weight > w) {
        // Item doesn't fit — carry forward the value without this item
        dp[i][w] = dp[i - 1][w];

        trace.push({
          type: 'skip_cell',
          pseudocode_line: 4,
          row: i,
          col: w,
          value: dp[i][w],
          from: [{ row: i - 1, col: w, role: 'skip' }],
          description: `Capacity ${w} < weight ${item.weight} of "${item.name}". Cannot include it. dp[${i}][${w}] = dp[${i - 1}][${w}] = ${dp[i][w]}.`,
          conceptual_state: {
            remaining_capacity: w,
            item_fits: false,
          },
        });
      } else {
        const withoutItem = dp[i - 1][w];
        const withItem = dp[i - 1][w - item.weight] + item.value;

        if (withItem > withoutItem) {
          dp[i][w] = withItem;

          trace.push({
            type: 'fill_cell',
            pseudocode_line: 8,
            row: i,
            col: w,
            value: dp[i][w],
            from: [
              { row: i - 1, col: w, role: 'skip' },
              { row: i - 1, col: w - item.weight, role: 'take' },
            ],
            choice: 'take',
            withItem,
            withoutItem,
            description: `dp[${i}][${w}]: Include "${item.name}"? Without = ${withoutItem}, With = dp[${i - 1}][${w - item.weight}] + ${item.value} = ${withItem}. Take it! dp[${i}][${w}] = ${dp[i][w]}.`,
            conceptual_state: {
              remaining_capacity: w,
              item_fits: true,
            },
          });
        } else {
          dp[i][w] = withoutItem;

          trace.push({
            type: 'fill_cell',
            pseudocode_line: 8,
            row: i,
            col: w,
            value: dp[i][w],
            from: [
              { row: i - 1, col: w, role: 'skip' },
              { row: i - 1, col: w - item.weight, role: 'take' },
            ],
            choice: 'skip',
            withItem,
            withoutItem,
            description: `dp[${i}][${w}]: Include "${item.name}"? Without = ${withoutItem}, With = dp[${i - 1}][${w - item.weight}] + ${item.value} = ${withItem}. Skip it. dp[${i}][${w}] = ${dp[i][w]}.`,
            conceptual_state: {
              remaining_capacity: w,
              item_fits: true,
            },
          });
        }
      }
    }
  }

  // Traceback to find which items were selected
  const selectedItems = [];
  let remainingCapacity = capacity;
  for (let i = n; i >= 1; i--) {
    if (dp[i][remainingCapacity] !== dp[i - 1][remainingCapacity]) {
      const item = items[i - 1];
      selectedItems.push({ ...item, index: i - 1 });

      trace.push({
        type: 'traceback',
        pseudocode_line: 9,
        row: i,
        col: remainingCapacity,
        item: { ...item },
        included: true,
        description: `Traceback: dp[${i}][${remainingCapacity}] (${dp[i][remainingCapacity]}) != dp[${i - 1}][${remainingCapacity}] (${dp[i - 1][remainingCapacity]}), so "${item.name}" was included. Move to dp[${i - 1}][${remainingCapacity - item.weight}].`,
      });

      remainingCapacity -= item.weight;
    } else {
      trace.push({
        type: 'traceback',
        pseudocode_line: 9,
        row: i,
        col: remainingCapacity,
        item: { ...items[i - 1] },
        included: false,
        description: `Traceback: dp[${i}][${remainingCapacity}] (${dp[i][remainingCapacity]}) == dp[${i - 1}][${remainingCapacity}] (${dp[i - 1][remainingCapacity]}), so "${items[i - 1].name}" was NOT included. Move to dp[${i - 1}][${remainingCapacity}].`,
      });
    }
  }

  selectedItems.reverse();

  trace.push({
    type: 'result',
    pseudocode_line: 9,
    maxValue: dp[n][capacity],
    selectedItems,
    table: dp.map(row => [...row]),
    description: `Knapsack complete! Maximum value = ${dp[n][capacity]}. Selected items: ${selectedItems.map(it => it.name).join(', ') || 'none'}.`,
  });

  return trace;
}

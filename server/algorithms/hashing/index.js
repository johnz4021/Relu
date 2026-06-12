// Tier 1 implementations for hash map, set, bit, greedy, and math patterns.
// All context-renderer: every step must have viz_actions targeting algorithm_state.

function ctxUpdate(entries) {
  return [{ renderer: 'context', action: 'update', params: { panel_id: 'algorithm_state', entries } }];
}

function entry(key, value, updated = false) {
  return { key: String(key), value: String(value), status: updated ? 'updated' : 'default' };
}

// ── hash_map_grouping — Group Anagrams ────────────────────────────────────────
export function hashMapGrouping(input) {
  const words = input.words || [];
  const trace = [];
  const groups = {};

  trace.push({
    type: 'init',
    description: `Group ${words.length} words by sorted-character key`,
    viz_actions: ctxUpdate([]),
  });

  for (const word of words) {
    const key = word.split('').sort().join('');
    if (!groups[key]) groups[key] = [];
    groups[key].push(word);

    const entries = Object.entries(groups).map(([k, v]) =>
      entry(k, v.join(', '), k === key)
    );
    trace.push({
      type: 'hash_insert',
      description: `"${word}" → sorted key "${key}" → group now [${groups[key].join(', ')}]`,
      word, key,
      viz_actions: ctxUpdate(entries),
    });
  }

  const result = Object.values(groups);
  const finalEntries = Object.entries(groups).map(([k, v]) => entry(k, v.join(', ')));
  trace.push({
    type: 'result',
    description: `${result.length} anagram groups found`,
    output: JSON.stringify(result),
    viz_actions: ctxUpdate(finalEntries),
  });

  return trace;
}

export const DEFAULT_HASH_MAP_GROUPING_INPUT = {
  words: ['eat', 'tea', 'tan', 'ate', 'nat', 'bat'],
};

// ── frequency_count — Top K Frequent Elements ────────────────────────────────
export function frequencyCount(input) {
  const nums = input.nums || [];
  const k = input.k ?? nums.length;
  const trace = [];
  const freq = {};

  trace.push({
    type: 'init',
    description: `Count frequencies of ${nums.length} elements, then find top ${k}`,
    viz_actions: ctxUpdate([]),
  });

  for (const num of nums) {
    freq[num] = (freq[num] || 0) + 1;
    const entries = Object.entries(freq).map(([n, c]) =>
      entry(n, `count: ${c}`, String(n) === String(num))
    );
    trace.push({
      type: 'count',
      description: `nums[_]=${num} → freq[${num}] = ${freq[num]}`,
      num, count: freq[num],
      viz_actions: ctxUpdate(entries),
    });
  }

  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  const topK = sorted.slice(0, k).map(([n]) => Number(n));
  const finalEntries = sorted.map(([n, c]) =>
    entry(n, `${c}x${topK.includes(Number(n)) ? ' ★' : ''}`, topK.includes(Number(n)))
  );
  trace.push({
    type: 'result',
    description: `Top ${k} frequent: [${topK.join(', ')}]`,
    output: `[${topK.join(',')}]`,
    viz_actions: ctxUpdate(finalEntries),
  });

  return trace;
}

export const DEFAULT_FREQUENCY_COUNT_INPUT = { nums: [1, 1, 1, 2, 2, 3], k: 2 };

// ── two_sum_hash — Two Sum ────────────────────────────────────────────────────
// Trace shape is mapper-driven (no embedded viz_actions). The algorithm
// renderer is 'array', the canonical Two Sum visualization is bars across
// the top with the current scan index highlighted, plus a hash-map context
// panel ('algorithm_state') ticking as values are seen. mapArrayStep handles
// init / store / found / result — see vizMapper.js.
export function twoSumHash(input) {
  const nums = input.nums || [];
  const target = input.target ?? 0;
  const trace = [];
  const seen = {};

  trace.push({
    type: 'init',
    description: `Find two indices in [${nums.join(', ')}] that sum to ${target}`,
    array: [...nums],
    target,
  });

  for (let i = 0; i < nums.length; i++) {
    const num = nums[i];
    const complement = target - num;

    if (seen[complement] !== undefined) {
      trace.push({
        type: 'found',
        description: `nums[${i}]=${num}, complement ${complement} is at index ${seen[complement]} → answer [${seen[complement]}, ${i}]`,
        i, num, complement, foundAt: seen[complement],
        seen: { ...seen },
      });
      trace.push({
        type: 'result',
        description: `Pair found at indices [${seen[complement]}, ${i}]`,
        output: `[${seen[complement]},${i}]`,
        i, foundAt: seen[complement],
        seen: { ...seen },
      });
      return trace;
    }

    seen[num] = i;
    trace.push({
      type: 'store',
      description: `nums[${i}]=${num}, complement ${complement} not seen — store {${num}: ${i}}`,
      i, num, complement,
      seen: { ...seen },
    });
  }

  trace.push({
    type: 'result',
    description: 'No solution found',
    output: '[-1,-1]',
    seen: { ...seen },
  });
  return trace;
}

// Five misses/stores before the complement hit — [2,7,11,15]/9 (LC Ex1) found
// the pair on the second element and never showed the hash map earning its keep.
export const DEFAULT_TWO_SUM_HASH_INPUT = { nums: [3, 8, 11, 2, 15, 7], target: 9 };

// ── string_hash — Isomorphic Strings ─────────────────────────────────────────
export function stringHash(input) {
  const s = input.s || '';
  const t = input.t || '';
  const trace = [];
  const sToT = {};
  const tToS = {};

  trace.push({
    type: 'init',
    description: `Check if "${s}" and "${t}" are isomorphic (same structure)`,
    viz_actions: ctxUpdate([]),
  });

  for (let i = 0; i < s.length; i++) {
    const sc = s[i], tc = t[i];
    const currentEntries = Object.entries(sToT).map(([k, v]) => entry(`${k}→${v}`, 'mapped'));

    if ((sToT[sc] && sToT[sc] !== tc) || (tToS[tc] && tToS[tc] !== sc)) {
      const entries = [...currentEntries, entry(`${sc}→${tc}`, 'CONFLICT', true)];
      trace.push({
        type: 'conflict',
        description: `Position ${i}: '${sc}'→'${tc}' conflicts with existing mapping — NOT isomorphic`,
        sc, tc, i,
        viz_actions: ctxUpdate(entries),
      });
      trace.push({
        type: 'result',
        description: `"${s}" and "${t}" are NOT isomorphic`,
        output: 'false',
        viz_actions: ctxUpdate(entries),
      });
      return trace;
    }

    sToT[sc] = tc;
    tToS[tc] = sc;
    const entries = Object.entries(sToT).map(([k, v]) =>
      entry(`${k}→${v}`, 'mapped', k === sc)
    );
    trace.push({
      type: 'map',
      description: `Position ${i}: map '${sc}'→'${tc}'`,
      sc, tc, i,
      viz_actions: ctxUpdate(entries),
    });
  }

  const finalEntries = Object.entries(sToT).map(([k, v]) => entry(`${k}→${v}`, 'mapped'));
  trace.push({
    type: 'result',
    description: `"${s}" and "${t}" ARE isomorphic`,
    output: 'true',
    viz_actions: ctxUpdate(finalEntries),
  });
  return trace;
}

// "foo"/"bar" hits the conflict step (o already mapped to a, then needs r) —
// "egg"/"add" (LC Ex1) mapped three chars and never tested a mapping.
export const DEFAULT_STRING_HASH_INPUT = { s: 'foo', t: 'bar' };

// ── set_operations — Contains Duplicate ──────────────────────────────────────
export function setOperations(input) {
  const nums = input.nums || [];
  const trace = [];
  const seen = new Set();

  trace.push({
    type: 'init',
    description: `Check for duplicates in [${nums.join(', ')}] using a hash set`,
    viz_actions: ctxUpdate([]),
  });

  for (let i = 0; i < nums.length; i++) {
    const num = nums[i];
    const baseEntries = [...seen].map(n => entry(n, 'in set'));

    if (seen.has(num)) {
      const entries = [...baseEntries, entry(num, 'DUPLICATE!', true)];
      trace.push({
        type: 'duplicate_found',
        description: `nums[${i}]=${num} already in set — duplicate!`,
        num, i,
        viz_actions: ctxUpdate(entries),
      });
      trace.push({
        type: 'result',
        description: `Contains duplicate: true (${num} seen twice)`,
        output: 'true',
        viz_actions: ctxUpdate(entries),
      });
      return trace;
    }

    seen.add(num);
    const entries = [...seen].map(n => entry(n, 'in set', n === num));
    trace.push({
      type: 'add',
      description: `nums[${i}]=${num} not in set — add it (set size: ${seen.size})`,
      num, i,
      viz_actions: ctxUpdate(entries),
    });
  }

  const finalEntries = [...seen].map(n => entry(n, 'unique'));
  trace.push({
    type: 'result',
    description: 'No duplicates — all elements unique',
    output: 'false',
    viz_actions: ctxUpdate(finalEntries),
  });
  return trace;
}

export const DEFAULT_SET_OPERATIONS_INPUT = { nums: [1, 2, 3, 1] };

// ── bit_ops — Single Number (XOR trick) ──────────────────────────────────────
export function bitOps(input) {
  const nums = input.nums || [];
  const trace = [];
  let acc = 0;

  trace.push({
    type: 'init',
    description: `XOR all ${nums.length} numbers — pairs cancel (a⊕a=0), single survives`,
    viz_actions: ctxUpdate([entry('accumulator', `0 (${(0).toString(2)})`)]),
  });

  for (let i = 0; i < nums.length; i++) {
    const num = nums[i];
    const prev = acc;
    acc ^= num;
    trace.push({
      type: 'xor',
      description: `${prev} ⊕ ${num} = ${acc}  (${prev.toString(2).padStart(4,'0')} ⊕ ${num.toString(2).padStart(4,'0')} = ${acc.toString(2).padStart(4,'0')})`,
      num, prev, result: acc, i,
      viz_actions: ctxUpdate([
        entry('accumulator', `${acc} (${acc.toString(2)})`, true),
        entry(`step ${i + 1}`, `${prev} ⊕ ${num} = ${acc}`),
      ]),
    });
  }

  trace.push({
    type: 'result',
    description: `Single number is ${acc} — all paired elements cancelled via XOR`,
    output: String(acc),
    viz_actions: ctxUpdate([
      entry('accumulator', `${acc} (${acc.toString(2)})`),
      entry('answer', String(acc), true),
    ]),
  });

  return trace;
}

export const DEFAULT_BIT_OPS_INPUT = { nums: [4, 1, 2, 1, 2] };

// ── math_simulation — Happy Number ───────────────────────────────────────────
export function mathSimulation(input) {
  const n = input.n ?? 19;
  const trace = [];
  const visited = new Set();
  let cur = n;

  trace.push({
    type: 'init',
    description: `Is ${n} happy? Replace repeatedly with sum of squared digits until 1 or cycle`,
    viz_actions: ctxUpdate([entry('current', n), entry('visited', '(none)'), entry('happy?', '...')]),
  });

  while (cur !== 1 && !visited.has(cur)) {
    visited.add(cur);
    const digits = String(cur).split('').map(Number);
    const next = digits.reduce((s, d) => s + d * d, 0);
    const expr = digits.map(d => `${d}²`).join('+') + `=${next}`;
    trace.push({
      type: 'compute',
      description: `${cur} → ${expr}`,
      current: cur, next, expression: expr,
      viz_actions: ctxUpdate([
        entry('current', cur),
        entry('next', `${next} (${expr})`, true),
        entry('visited', [...visited].join(', ')),
      ]),
    });
    cur = next;
  }

  const happy = cur === 1;
  trace.push({
    type: 'result',
    description: happy
      ? `${n} IS a happy number — reached 1`
      : `${n} is NOT happy — cycle detected at ${cur}`,
    output: String(happy),
    viz_actions: ctxUpdate([
      entry('current', cur),
      entry('visited', [...visited].join(', ')),
      entry('result', happy ? `${n} is HAPPY ✓` : `NOT happy (cycle at ${cur})`, true),
    ]),
  });

  return trace;
}

export const DEFAULT_MATH_SIMULATION_INPUT = { n: 19 };

// ── greedy_choice — Jump Game I (can you reach the end?) ─────────────────────
export function greedyChoice(input) {
  const nums = input.nums || [];
  const trace = [];
  let maxReach = 0;
  const goal = nums.length - 1;

  trace.push({
    type: 'init',
    description: `Jump Game: can index ${goal} be reached from nums=[${nums.join(', ')}]?`,
    viz_actions: ctxUpdate([
      entry('maxReach', 0),
      entry('goal', goal),
    ]),
  });

  for (let i = 0; i < nums.length; i++) {
    if (i > maxReach) {
      trace.push({
        type: 'stuck',
        description: `Index ${i} is unreachable (maxReach=${maxReach}) — stuck`,
        i, maxReach,
        viz_actions: ctxUpdate([
          entry('maxReach', maxReach),
          entry('stuck at', i, true),
          entry('goal', goal),
        ]),
      });
      trace.push({
        type: 'result',
        description: 'Cannot reach the last index',
        output: 'false',
        viz_actions: ctxUpdate([entry('maxReach', maxReach), entry('result', 'false', true)]),
      });
      return trace;
    }

    const newReach = Math.max(maxReach, i + nums[i]);
    const changed = newReach > maxReach;
    maxReach = newReach;

    trace.push({
      type: 'jump',
      description: `Index ${i}: jump up to ${nums[i]} → maxReach = ${maxReach}`,
      i, jump: nums[i], maxReach,
      viz_actions: ctxUpdate([
        entry('index', i),
        entry('jump', nums[i]),
        entry('maxReach', maxReach, changed),
        entry('goal', goal),
      ]),
    });

    if (maxReach >= goal) break;
  }

  trace.push({
    type: 'result',
    description: `Can reach index ${goal} (maxReach=${maxReach} ≥ ${goal})`,
    output: 'true',
    viz_actions: ctxUpdate([
      entry('maxReach', maxReach),
      entry('goal', goal),
      entry('result', 'true', true),
    ]),
  });
  return trace;
}

// Mixes improving and non-improving indices before reaching the goal —
// [2,3,1,1,4] (LC Ex1) hit maxReach=goal in two straight updates with no
// tension. Also differentiates this entry from jump_game's stuck/false default.
export const DEFAULT_GREEDY_CHOICE_INPUT = { nums: [2, 1, 1, 1, 4] };

// ── jump_game_ii — Jump Game II (minimum jumps) ───────────────────────────────
export function jumpGameII(input) {
  const nums = input.nums || [];
  const trace = [];
  let jumps = 0, curEnd = 0, farthest = 0;
  const goal = nums.length - 1;

  trace.push({
    type: 'init',
    description: `Jump Game II: minimum jumps to reach index ${goal} from [${nums.join(', ')}]`,
    viz_actions: ctxUpdate([entry('jumps', 0), entry('window end', 0), entry('farthest', 0)]),
  });

  for (let i = 0; i < goal; i++) {
    farthest = Math.max(farthest, i + nums[i]);
    trace.push({
      type: 'scan',
      description: `i=${i}: from here can reach up to ${i + nums[i]}, farthest=${farthest}`,
      i, farthest, curEnd,
      viz_actions: ctxUpdate([
        entry('index', i),
        entry('can reach', i + nums[i]),
        entry('farthest', farthest, farthest === i + nums[i]),
        entry('jumps', jumps),
      ]),
    });

    if (i === curEnd) {
      jumps++;
      curEnd = farthest;
      trace.push({
        type: 'jump',
        description: `Reached window end ${i} — must jump. Jump #${jumps}, new window [${i+1}..${curEnd}]`,
        jumps, curEnd,
        viz_actions: ctxUpdate([
          entry('jumps', jumps, true),
          entry('new window end', curEnd, true),
          entry('farthest', farthest),
        ]),
      });
    }
  }

  trace.push({
    type: 'result',
    description: `Minimum jumps to reach index ${goal}: ${jumps}`,
    output: String(jumps),
    viz_actions: ctxUpdate([entry('jumps', jumps, true), entry('goal', goal)]),
  });
  return trace;
}

export const DEFAULT_JUMP_GAME_II_INPUT = { nums: [2, 3, 1, 1, 4] };

// ── valid_parentheses — Balanced bracket matching ─────────────────────────────
export function validParentheses(input) {
  const s = input.s || '';
  const trace = [];
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };

  trace.push({
    type: 'init',
    description: `Check if "${s}" has valid parentheses using a stack`,
    viz_actions: ctxUpdate([entry('stack', '(empty)'), entry('position', 0)]),
  });

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if ('([{'.includes(ch)) {
      stack.push(ch);
      trace.push({
        type: 'push',
        description: `'${ch}' is opening bracket — push to stack`,
        ch, i,
        viz_actions: ctxUpdate([
          entry('stack', stack.join(' ') || '(empty)', true),
          entry('position', i),
          entry('char', ch),
        ]),
      });
    } else {
      const expected = pairs[ch];
      const top = stack[stack.length - 1];
      if (top !== expected) {
        const entries = [
          entry('stack', stack.join(' ') || '(empty)'),
          entry('char', ch),
          entry('expected top', expected),
          entry('actual top', top || 'none', true),
          entry('mismatch!', `'${ch}' needs '${expected}' but got '${top || 'empty'}'`, true),
        ];
        trace.push({
          type: 'mismatch',
          description: `'${ch}' needs '${expected}' but stack top is '${top || 'empty'}' — INVALID`,
          ch, expected, top, i,
          viz_actions: ctxUpdate(entries),
        });
        trace.push({ type: 'result', description: 'Invalid parentheses', output: 'false', viz_actions: ctxUpdate(entries) });
        return trace;
      }
      stack.pop();
      trace.push({
        type: 'pop',
        description: `'${ch}' matches top '${top}' — pop. Stack: [${stack.join(', ') || 'empty'}]`,
        ch, top, i,
        viz_actions: ctxUpdate([
          entry('stack', stack.join(' ') || '(empty)', true),
          entry('position', i),
          entry('matched', `${ch}↔${top}`),
        ]),
      });
    }
  }

  const valid = stack.length === 0;
  trace.push({
    type: 'result',
    description: valid ? 'Valid parentheses — stack empty' : `Invalid — ${stack.length} unmatched bracket(s): ${stack.join('')}`,
    output: String(valid),
    viz_actions: ctxUpdate([
      entry('stack', stack.join(' ') || '(empty)'),
      entry('result', valid ? 'VALID ✓' : 'INVALID ✗', true),
    ]),
  });
  return trace;
}

export const DEFAULT_VALID_PARENTHESES_INPUT = { s: '([{}])' };

// ── task_scheduler — Task Scheduler (greedy with frequency counting) ──────────
export function taskScheduler(input) {
  const tasks = input.tasks || ['A', 'A', 'A', 'B', 'B', 'B'];
  const n = input.n ?? 2;
  const trace = [];
  const freq = {};

  for (const t of tasks) freq[t] = (freq[t] || 0) + 1;

  trace.push({
    type: 'init',
    description: `Schedule ${tasks.length} tasks with cooldown n=${n}`,
    viz_actions: ctxUpdate(Object.entries(freq).map(([k, v]) => entry(k, `×${v}`))),
  });

  const maxFreq = Math.max(...Object.values(freq));
  const maxCount = Object.values(freq).filter(f => f === maxFreq).length;

  trace.push({
    type: 'analyze',
    description: `Most frequent task appears ${maxFreq} times, ${maxCount} task(s) tied for max`,
    maxFreq, maxCount,
    viz_actions: ctxUpdate([
      ...Object.entries(freq).map(([k, v]) => entry(k, `×${v}`, v === maxFreq)),
      entry('max frequency', maxFreq, true),
      entry('count at max', maxCount),
    ]),
  });

  const result = Math.max(tasks.length, (maxFreq - 1) * (n + 1) + maxCount);

  trace.push({
    type: 'compute',
    description: `Formula: max(tasks=${tasks.length}, (${maxFreq}-1)×(${n}+1)+${maxCount}) = ${result}`,
    result,
    viz_actions: ctxUpdate([
      entry('tasks.length', tasks.length),
      entry('formula', `(${maxFreq}-1)×(${n+1})+${maxCount}`),
      entry('formula value', (maxFreq-1)*(n+1)+maxCount),
      entry('result', result, true),
    ]),
  });

  trace.push({
    type: 'result',
    description: `Minimum intervals needed: ${result}`,
    output: String(result),
    viz_actions: ctxUpdate([entry('minimum intervals', result, true)]),
  });
  return trace;
}

export const DEFAULT_TASK_SCHEDULER_INPUT = { tasks: ['A', 'A', 'A', 'B', 'B', 'B'], n: 2 };

// ── lru_cache — LRU Cache (hash map + doubly linked list) ─────────────────────
export function lruCache(input) {
  const capacity = input.capacity ?? 2;
  const operations = input.operations || [
    { type: 'put', key: 1, value: 1 },
    { type: 'put', key: 2, value: 2 },
    { type: 'get', key: 1 },
    { type: 'put', key: 3, value: 3 },
    { type: 'get', key: 2 },
  ];
  const trace = [];

  // Simple ordered map implementation (insertion-order for LRU)
  const cache = new Map();
  const outputs = [];

  trace.push({
    type: 'init',
    description: `LRU Cache with capacity ${capacity}`,
    viz_actions: ctxUpdate([entry('capacity', capacity), entry('size', 0), entry('cache', '(empty)')]),
  });

  for (const op of operations) {
    if (op.type === 'get') {
      if (cache.has(op.key)) {
        const val = cache.get(op.key);
        cache.delete(op.key);
        cache.set(op.key, val);
        outputs.push(val);
        const entries = [...cache.entries()].map(([k, v], i) =>
          entry(`[${i}] key=${k}`, `val=${v}`, k === op.key)
        );
        trace.push({
          type: 'get_hit',
          description: `GET ${op.key} → ${val} (cache hit, moved to MRU)`,
          key: op.key, value: val,
          viz_actions: ctxUpdate([...entries, entry('last output', val, true)]),
        });
      } else {
        outputs.push(-1);
        const entries = [...cache.entries()].map(([k, v]) => entry(`key=${k}`, `val=${v}`));
        trace.push({
          type: 'get_miss',
          description: `GET ${op.key} → -1 (cache miss)`,
          key: op.key,
          viz_actions: ctxUpdate([...entries, entry('last output', -1, true)]),
        });
      }
    } else {
      if (cache.size >= capacity && !cache.has(op.key)) {
        const evicted = cache.keys().next().value;
        cache.delete(evicted);
        const entries = [...cache.entries()].map(([k, v]) => entry(`key=${k}`, `val=${v}`));
        trace.push({
          type: 'evict',
          description: `Cache full — evict LRU key=${evicted}`,
          evicted,
          viz_actions: ctxUpdate([...entries, entry(`evicted key=${evicted}`, '✗', true)]),
        });
      }
      cache.delete(op.key);
      cache.set(op.key, op.value);
      const entries = [...cache.entries()].map(([k, v], i) =>
        entry(`[${i}] key=${k}`, `val=${v}`, k === op.key)
      );
      trace.push({
        type: 'put',
        description: `PUT key=${op.key} val=${op.value} (MRU position)`,
        key: op.key, value: op.value,
        viz_actions: ctxUpdate(entries),
      });
    }
  }

  trace.push({
    type: 'result',
    description: `Operations complete. GET outputs: [${outputs.join(', ')}]`,
    output: `[${outputs.join(',')}]`,
    viz_actions: ctxUpdate([
      ...([...cache.entries()].map(([k, v]) => entry(`key=${k}`, `val=${v}`))),
      entry('GET outputs', outputs.join(', '), true),
    ]),
  });
  return trace;
}

// ── longest_consecutive — Longest Consecutive Sequence (LC128) ───────────────
// Build a hash set, then walk streaks only from streak starts (numbers whose
// num-1 is NOT in the set). Each streak is summarized in ONE trace step (not
// one per increment) so the trace stays short. Context-renderer: every step
// embeds viz_actions targeting the 'algorithm_state' panel and re-emits the
// full current state (Set / Current streak / Best streak) each step.
export function longestConsecutive(input) {
  const nums = input.nums || [];
  const trace = [];
  const set = new Set();

  trace.push({
    type: 'init',
    pseudocode_line: 0,
    description: `Find the longest run of consecutive integers in [${nums.join(', ')}] using a hash set — O(n), no sorting`,
    viz_actions: ctxUpdate([]),
  });

  for (const num of nums) {
    const dup = set.has(num);
    set.add(num);
    trace.push({
      type: 'add',
      pseudocode_line: 0,
      description: dup
        ? `${num} is already in the set — duplicates don't change streak lengths`
        : `Insert ${num} into the set (size ${set.size})`,
      num,
      viz_actions: ctxUpdate([
        entry('Set', `{${[...set].join(', ')}}`, true),
        entry('Current streak', '—'),
        entry('Best streak', 0),
      ]),
    });
  }

  let best = 0;
  let bestStart = null;
  const setStr = `{${[...set].join(', ')}}`;

  for (const num of set) {
    if (set.has(num - 1)) {
      trace.push({
        type: 'scan',
        pseudocode_line: 2,
        description: `${num}: ${num - 1} is in the set, so ${num} sits inside some streak — skip (it gets counted from that streak's start)`,
        num, streak_start: false,
        viz_actions: ctxUpdate([
          entry('Set', setStr),
          entry('Current streak', `skip ${num} (${num - 1} in set)`, true),
          entry('Best streak', best),
        ]),
      });
      continue;
    }

    let length = 1;
    while (set.has(num + length)) length++;
    const improved = length > best;
    if (improved) {
      best = length;
      bestStart = num;
    }
    trace.push({
      type: 'scan',
      pseudocode_line: improved ? 4 : 3,
      description: `${num - 1} not in set → ${num} starts a streak. Walk ${num}..${num + length - 1}: length ${length}${improved ? ' — new best!' : ` (best stays ${best})`}`,
      num, streak_start: true, length, best,
      viz_actions: ctxUpdate([
        entry('Set', setStr),
        entry('Current streak', `${num} → ${num + length - 1} (length ${length})`, true),
        entry('Best streak', best, improved),
      ]),
    });
  }

  trace.push({
    type: 'result',
    pseudocode_line: 5,
    description: best > 0
      ? `Longest consecutive sequence: ${bestStart} → ${bestStart + best - 1}, length ${best}`
      : 'Empty input — longest consecutive sequence has length 0',
    output: String(best),
    viz_actions: ctxUpdate([
      entry('Set', setStr),
      entry('Current streak', '—'),
      entry('Best streak', `${best}${bestStart !== null ? ` (${bestStart} → ${bestStart + best - 1})` : ''}`, true),
    ]),
  });

  return trace;
}

export const DEFAULT_LONGEST_CONSECUTIVE_INPUT = { nums: [100, 4, 200, 1, 3, 2] };

export const DEFAULT_LRU_CACHE_INPUT = {
  capacity: 2,
  operations: [
    { type: 'put', key: 1, value: 1 },
    { type: 'put', key: 2, value: 2 },
    { type: 'get', key: 1 },
    { type: 'put', key: 3, value: 3 },
    { type: 'get', key: 2 },
    { type: 'get', key: 3 },
  ],
};

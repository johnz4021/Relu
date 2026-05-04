// Tier 1 implementations for math and number theory patterns.
// All context-renderer.

function ctxUpdate(entries) {
  return [{ renderer: 'context', action: 'update', params: { panel_id: 'algorithm_state', entries } }];
}
function entry(key, value, updated = false) {
  return { key: String(key), value: String(value), status: updated ? 'updated' : 'default' };
}

// ── sieve_primes — Sieve of Eratosthenes (Count Primes) ───────────────────────
export function sievePrimes(input) {
  const n = input.n ?? 30;
  const trace = [];
  const sieve = new Array(n + 1).fill(true);
  sieve[0] = sieve[1] = false;

  trace.push({
    type: 'init',
    description: `Sieve of Eratosthenes up to n=${n}: mark all true, then strike composites`,
    array: sieve.map(v => v ? 1 : 0),
    indices: [],
  });

  for (let p = 2; p * p <= n; p++) {
    if (!sieve[p]) continue;
    const toMark = [];
    for (let j = p * p; j <= n; j += p) {
      sieve[j] = false;
      toMark.push(j);
    }
    trace.push({
      type: 'mark',
      description: `Prime ${p}: mark multiples [${toMark.join(', ')}] as composite`,
      array: sieve.map(v => v ? 1 : 0),
      indices: toMark,
      prime: p,
    });
  }

  const primes = sieve.reduce((acc, v, i) => v ? [...acc, i] : acc, []);
  trace.push({
    type: 'result',
    description: `Found ${primes.length} prime(s) ≤ ${n}: [${primes.join(', ')}]`,
    array: sieve.map(v => v ? 1 : 0),
    indices: primes,
    output: String(primes.length),
  });

  return trace;
}

export const DEFAULT_SIEVE_PRIMES_INPUT = { n: 30 };

// ── fast_power — Fast Exponentiation (Pow(x, n)) ─────────────────────────────
export function fastPower(input) {
  const x = input.x ?? 2;
  let n = input.n ?? 10;
  const trace = [];

  trace.push({
    type: 'init',
    description: `Compute ${x}^${n} via fast exponentiation (repeated squaring)`,
    viz_actions: ctxUpdate([entry('x', x), entry('n', n), entry('result', 1)]),
  });

  let base = x;
  let exp = n < 0 ? -n : n;
  let result = 1;

  while (exp > 0) {
    if (exp % 2 === 1) {
      result *= base;
      trace.push({
        type: 'multiply',
        description: `exp=${exp} is odd — result *= base (${result / base} × ${base} = ${result})`,
        viz_actions: ctxUpdate([
          entry('base', base),
          entry('exp', exp),
          entry('result', result, true),
        ]),
      });
    }
    base *= base;
    exp = Math.floor(exp / 2);
    if (exp > 0) {
      trace.push({
        type: 'square',
        description: `Square base: ${Math.sqrt(base)} → ${base}, exp → ${exp}`,
        viz_actions: ctxUpdate([
          entry('base', base, true),
          entry('exp', exp, true),
          entry('result', result),
        ]),
      });
    }
  }

  const answer = n < 0 ? 1 / result : result;
  trace.push({
    type: 'result',
    description: `${x}^${n} = ${answer}`,
    output: String(answer),
    viz_actions: ctxUpdate([entry('answer', answer, true)]),
  });

  return trace;
}

export const DEFAULT_FAST_POWER_INPUT = { x: 2, n: 10 };

// ── gcd_algorithm — GCD / Euclidean Algorithm ─────────────────────────────────
export function gcdAlgorithm(input) {
  let a = input.a ?? 48;
  let b = input.b ?? 18;
  const trace = [];

  trace.push({
    type: 'init',
    description: `GCD(${a}, ${b}) via Euclidean algorithm: gcd(a,b) = gcd(b, a mod b)`,
    viz_actions: ctxUpdate([entry('a', a), entry('b', b)]),
  });

  while (b !== 0) {
    const remainder = a % b;
    trace.push({
      type: 'divide',
      description: `GCD(${a}, ${b}): ${a} = ${Math.floor(a/b)}×${b} + ${remainder} → GCD(${b}, ${remainder})`,
      viz_actions: ctxUpdate([
        entry('a', a),
        entry('b', b),
        entry('a mod b', remainder, true),
        entry('next: a', b),
        entry('next: b', remainder),
      ]),
    });
    a = b;
    b = remainder;
  }

  trace.push({
    type: 'result',
    description: `GCD = ${a} (b reached 0)`,
    output: String(a),
    viz_actions: ctxUpdate([entry('GCD', a, true)]),
  });

  return trace;
}

export const DEFAULT_GCD_ALGORITHM_INPUT = { a: 48, b: 18 };

// ── majority_vote — Boyer-Moore Majority Vote ─────────────────────────────────
export function majorityVote(input) {
  const nums = input.nums || [2, 2, 1, 1, 1, 2, 2];
  const trace = [];
  let candidate = null;
  let count = 0;

  trace.push({
    type: 'init',
    description: `Boyer-Moore majority vote in [${nums.join(', ')}]`,
    viz_actions: ctxUpdate([entry('candidate', 'none'), entry('count', 0)]),
  });

  for (let i = 0; i < nums.length; i++) {
    const num = nums[i];
    if (count === 0) {
      candidate = num;
      count = 1;
      trace.push({
        type: 'new_candidate',
        description: `count=0: new candidate = ${num}`,
        viz_actions: ctxUpdate([
          entry('candidate', candidate, true),
          entry('count', count, true),
          entry('index', i),
        ]),
      });
    } else if (num === candidate) {
      count++;
      trace.push({
        type: 'reinforce',
        description: `nums[${i}]=${num} matches candidate ${candidate} → count=${count}`,
        viz_actions: ctxUpdate([
          entry('candidate', candidate),
          entry('count', count, true),
          entry('index', i),
        ]),
      });
    } else {
      count--;
      trace.push({
        type: 'cancel',
        description: `nums[${i}]=${num} cancels candidate ${candidate} → count=${count}`,
        viz_actions: ctxUpdate([
          entry('candidate', candidate),
          entry('count', count, true),
          entry('index', i),
        ]),
      });
    }
  }

  trace.push({
    type: 'result',
    description: `Majority candidate: ${candidate} (verify in second pass if needed)`,
    output: String(candidate),
    viz_actions: ctxUpdate([entry('majority', candidate, true), entry('count', count)]),
  });

  return trace;
}

export const DEFAULT_MAJORITY_VOTE_INPUT = { nums: [2, 2, 1, 1, 1, 2, 2] };

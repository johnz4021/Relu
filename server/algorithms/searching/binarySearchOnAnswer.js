// Binary Search on the ANSWER (Koko Eating Bananas, LC875).
//
// Distinct from `binary_search` (find a target in a sorted ARRAY). Here the
// search space is the set of candidate ANSWERS (eating speeds 1..max(pile));
// each probe runs a feasibility check (can Koko finish at speed k within h
// hours?) instead of an array compare. Feasible → the answer might be smaller,
// shrink the high bound; infeasible → must go faster, raise the low bound.
//
// The piles array renders on the array renderer; the shrinking [lo, hi] range,
// the per-pile feasibility math, and the iteration log render on context panels.
//
// Koko's feasibility predicate is sum(ceil(pile / k)) <= h. Other "binary
// search on answer" problems (LC410 Split Array, LC1011 Ship Capacity) use
// DIFFERENT predicates — this runner is Koko-shaped only. A general predicate-
// parameterized entry is a separate future registry capability.

const ceilDiv = (a, b) => Math.ceil(a / b);

function hoursAtSpeed(piles, k) {
  // per-pile hours + total, for the feasibility panel
  const perPile = piles.map((p) => ({ pile: p, hours: ceilDiv(p, k) }));
  const total = perPile.reduce((sum, e) => sum + e.hours, 0);
  return { perPile, total };
}

export function binarySearchOnAnswer(input) {
  const piles = input.piles || [3, 6, 7, 11];
  const h = input.h ?? 8;
  const trace = [];

  let lo = 1;
  let hi = Math.max(...piles);

  trace.push({
    type: 'init',
    description: `Koko eats ${piles.length} piles within ${h} hours. Search the ANSWER space: slowest speed = 1, fastest needed = ${hi} (biggest pile). Find the minimum feasible speed.`,
    array: [...piles],
    indices: piles.map((_, i) => i),
    lo, hi, h,
  });

  let answer = hi;
  let guard = 0;
  while (lo < hi && guard++ < 64) {
    const mid = Math.floor((lo + hi) / 2);
    const { perPile, total } = hoursAtSpeed(piles, mid);
    const feasible = total <= h;

    trace.push({
      type: 'probe',
      description: `Range [${lo}, ${hi}] — try mid speed k = ${mid}.`,
      array: [...piles],
      lo, hi, mid, h,
    });

    trace.push({
      type: 'feasibility',
      description: `At k = ${mid}: total hours = ${total} ${feasible ? '≤' : '>'} ${h} → ${feasible ? 'CAN finish' : 'too slow'}.`,
      mid, perPile, total, h, feasible,
    });

    if (feasible) {
      answer = mid;
      hi = mid;            // answer might be even smaller
      trace.push({
        type: 'narrow_slower',
        description: `k = ${mid} works — could go slower. Shrink high to ${hi}. New range [${lo}, ${hi}].`,
        lo, hi, mid,
      });
    } else {
      lo = mid + 1;        // must go faster
      trace.push({
        type: 'narrow_faster',
        description: `k = ${mid} too slow — must go faster. Raise low to ${lo}. New range [${lo}, ${hi}].`,
        lo, hi, mid,
      });
    }
  }

  trace.push({
    type: 'found',
    description: `Range collapsed: minimum feasible speed is k = ${lo}.`,
    answer: lo,
    lo, hi,
  });

  trace.push({
    type: 'result',
    description: `Minimum eating speed: ${lo} bananas/hour.`,
    output: String(lo),
    answer: lo,
  });

  return trace;
}

export const DEFAULT_BINARY_SEARCH_ON_ANSWER_INPUT = { piles: [3, 6, 7, 11], h: 8 };

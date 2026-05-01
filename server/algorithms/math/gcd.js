/**
 * Euclid's GCD algorithm with trace output.
 * Trace format matches the array renderer expectations.
 */

export function gcd(a, b) {
  const trace = [];

  // Initial state
  trace.push({
    type: 'init',
    array: [a, b],
    description: `Finding GCD(${a}, ${b})`,
    conceptual_state: {
      a, b,
      step: 'Initialize with the two numbers',
    },
  });

  let stepCount = 0;
  while (b !== 0) {
    const remainder = a % b;

    trace.push({
      type: 'compute_remainder',
      array: [a, b],
      highlight: [0, 1],
      description: `${a} mod ${b} = ${remainder}`,
      conceptual_state: {
        a,
        b,
        remainder,
        step: `Compute ${a} mod ${b} = ${remainder}`,
      },
    });

    trace.push({
      type: 'shift_values',
      array: [b, remainder],
      highlight: [0, 1],
      description: `Replace: a = ${b}, b = ${remainder}`,
      conceptual_state: {
        a: b,
        b: remainder,
        step: `Shift: a becomes ${b}, b becomes ${remainder}`,
      },
    });

    a = b;
    b = remainder;
    stepCount++;
  }

  trace.push({
    type: 'result',
    array: [a],
    highlight: [0],
    description: `GCD = ${a}`,
    conceptual_state: {
      gcd: a,
      steps_taken: stepCount,
      step: `b is 0, so GCD = ${a}`,
    },
  });

  return trace;
}

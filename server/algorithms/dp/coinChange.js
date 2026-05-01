export function coinChange(coins, amount) {
  const trace = [];

  // dp[i] = minimum number of coins to make amount i
  // Initialize with Infinity (unreachable), except dp[0] = 0
  const dp = Array(amount + 1).fill(Infinity);
  dp[0] = 0;

  // Track which coin was used at each amount (for traceback)
  const usedCoin = Array(amount + 1).fill(-1);

  trace.push({
    type: 'init_table',
    size: amount + 1,
    coins: [...coins],
    table: dp.map(v => v === Infinity ? '\u221E' : v),
    description: `Initialize 1D DP table of size ${amount + 1}. dp[0] = 0 (zero coins for amount 0). All other values = \u221E (unreachable). Coins: [${coins.join(', ')}].`,
  });

  for (const coin of coins) {
    trace.push({
      type: 'consider_coin',
      coin,
      description: `Now considering coin with value ${coin}. For each amount >= ${coin}, check if using this coin yields fewer coins.`,
    });

    for (let i = coin; i <= amount; i++) {
      const withoutCoin = dp[i];
      const withCoin = dp[i - coin] === Infinity ? Infinity : dp[i - coin] + 1;

      if (withCoin < withoutCoin) {
        dp[i] = withCoin;
        usedCoin[i] = coin;

        trace.push({
          type: 'fill_cell',
          index: i,
          value: dp[i],
          coin,
          fromIndex: i - coin,
          previousValue: withoutCoin === Infinity ? '\u221E' : withoutCoin,
          description: `dp[${i}]: Using coin ${coin}, dp[${i - coin}] + 1 = ${dp[i - coin] === Infinity ? '\u221E' : dp[i]}. Better than current ${withoutCoin === Infinity ? '\u221E' : withoutCoin}. Update dp[${i}] = ${dp[i]}.`,
        });
      } else {
        trace.push({
          type: 'fill_cell',
          index: i,
          value: dp[i] === Infinity ? '\u221E' : dp[i],
          coin,
          fromIndex: i - coin,
          kept: true,
          description: `dp[${i}]: Using coin ${coin}, dp[${i - coin}] + 1 = ${withCoin === Infinity ? '\u221E' : withCoin}. Not better than current ${withoutCoin === Infinity ? '\u221E' : withoutCoin}. No change.`,
        });
      }
    }
  }

  // Traceback to find which coins were used
  const coinsUsed = [];
  if (dp[amount] !== Infinity) {
    let remaining = amount;
    while (remaining > 0) {
      const coin = usedCoin[remaining];
      coinsUsed.push(coin);

      trace.push({
        type: 'traceback',
        amount: remaining,
        coin,
        description: `Traceback: At amount ${remaining}, used coin ${coin}. Remaining = ${remaining - coin}.`,
      });

      remaining -= coin;
    }
  }

  const reachable = dp[amount] !== Infinity;

  trace.push({
    type: 'result',
    minCoins: reachable ? dp[amount] : -1,
    coinsUsed: reachable ? coinsUsed : [],
    table: dp.map(v => v === Infinity ? '\u221E' : v),
    description: reachable
      ? `Coin change complete! Minimum coins for amount ${amount} = ${dp[amount]}. Coins used: [${coinsUsed.join(', ')}].`
      : `Coin change complete! Amount ${amount} is not reachable with coins [${coins.join(', ')}].`,
  });

  return trace;
}

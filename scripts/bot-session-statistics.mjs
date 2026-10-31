export function scoreInterval(successes, total, z = 1.959963984540054) {
  if (
    !Number.isInteger(total) ||
    total < 1 ||
    !Number.isInteger(successes) ||
    successes < 0 ||
    successes > total
  )
    throw Error('Score interval needs valid binary counts');
  const p = successes / total,
    square = z * z,
    scale = 1 + square / total;
  const center = (p + square / (2 * total)) / scale;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + square / (4 * total * total))) / scale;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

// The product has two terminal payoffs: collect the table, or exhaust every
// permitted hero buy-in. A hand cap is neither outcome. Bound those missing
// outcomes both ways instead of treating the current bankroll as final profit.
export function finiteSessionSummary(results, { winningProfitBB, losingProfitBB }) {
  if (!results.length || !(winningProfitBB > 0) || !(losingProfitBB < 0))
    throw Error('Invalid session summary');
  const wins = results.filter((r) => r.champion).length;
  const censored = results.filter((r) => r.censored).length;
  for (const r of results) {
    if (r.censored) {
      if (r.ended || r.champion) throw Error('A censored session cannot be a terminal win');
    } else if (!r.ended || r.profitBB !== (r.champion ? winningProfitBB : losingProfitBB))
      throw Error('The terminal payoff does not match the actual buy-in ledger');
  }
  const payoff = (p) => losingProfitBB + p * (winningProfitBB - losingProfitBB);
  const probability = [
    scoreInterval(wins, results.length)[0],
    scoreInterval(wins + censored, results.length)[1],
  ];
  const total = (key) => results.reduce((sum, r) => sum + r[key], 0);
  return {
    sessions: results.length,
    champions: wins,
    censored,
    ended: results.length - censored,
    hands: total('hands'),
    actualBuyinBB: total('buyinBB'),
    currentFinalBB: total('finalBB'),
    currentProfitBB: total('profitBB'),
    currentReturnOnBuyin: total('profitBB') / total('buyinBB'),
    championRateBounds: [wins / results.length, (wins + censored) / results.length],
    championScoreInterval95: probability,
    terminalProfitPerSessionBoundsBB: [
      payoff(wins / results.length),
      payoff((wins + censored) / results.length),
    ],
    terminalMeanProfitScoreInterval95BB: probability.map(payoff),
    breakEvenChampionRate: -losingProfitBB / (winningProfitBB - losingProfitBB),
    exploratory: results.length < 30,
    interpretation:
      'Approximate pointwise binary score interval with a conservative envelope for capped sessions; independent seeds, rotating lineups, no global exploitability guarantee.',
  };
}

// Independent 100BB samples must not inherit elimination/rebuy/game-over
// state from a previous sample. Product sessions still retain those rules.
export function freshSimulationGame(engine, count, handIndex, difficulty) {
  const game = engine.newGame(count);
  game.dealer = (handIndex + count - 1) % count;
  game.hand = handIndex;
  game.difficulty = difficulty;
  game.emotionMode = 'off';
  return game;
}

// Fixed-depth cash samples retain only the memory a continuing opponent would
// have. Elimination, cards, payouts, stacks and pending actions never carry.
export function carrySimulationMemory(previous, next) {
  if (!previous) return;
  for (const p of next.players) {
    const old = previous.players[p.id];
    for (const key of ['publicReads', 'botMood'])
      if (old[key]) p[key] = JSON.parse(JSON.stringify(old[key]));
  }
}

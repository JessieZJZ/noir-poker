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

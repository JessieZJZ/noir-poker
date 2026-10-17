import { newGame, startHand, act, advanceStreet } from '../../src/engine/poker.js';

export function checkedSeatGame(count = 9, street = 2) {
  const game = newGame(count);
  game.dealer = 1; // Mia is CO, Leo is BTN after startHand rotates the button.
  startHand(game);
  while (game.street < street) {
    while (game.phase === 'playing') act(game, game.actor, 'call');
    advanceStreet(game);
  }
  while (game.actor !== 1) act(game, game.actor, 'check');
  act(game, 1, 'check');
  return game;
}

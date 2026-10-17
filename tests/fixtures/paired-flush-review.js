import { newGame, startHand, act, advanceStreet, deckOfCards } from '../../src/engine/poker.js';
import { cards } from './deceptive-decisions.js';

// Legal synthetic line with the reported cards, positions, pot and call price.
// Opponent cards are test data, never evidence for the review examples.
export function pairedFlushReviewGame(opponent = '8h 8d') {
  const game = newGame(9);
  game.dealer = 7;
  startHand(game);
  const hero = cards('4c Ac'),
    rival = cards(opponent),
    board = cards('7s Jd As Tc Js'),
    known = new Set([...hero, ...rival, ...board].map((card) => card.key)),
    pool = deckOfCards().filter((card) => !known.has(card.key));
  for (const player of game.players)
    player.hole = player.id === 0 ? hero : player.id === 6 ? rival : [pool.pop(), pool.pop()];
  const burn = pool.splice(-3);
  game.deck = [
    ...pool,
    ...[burn[0], ...board.slice(0, 3), burn[1], board[3], burn[2], board[4]].reverse(),
  ];
  while (game.actor !== 6) act(game, game.actor, 'fold');
  act(game, 6, 'raise', 1000);
  while (game.actor !== 0) act(game, game.actor, 'fold');
  act(game, 0, 'call');
  while (game.phase === 'playing') act(game, game.actor, 'fold');
  for (const street of [1, 2]) {
    advanceStreet(game);
    act(game, 0, 'raise', 1000);
    act(game, 6, 'call');
  }
  advanceStreet(game);
  act(game, 0, 'raise', 3400);
  act(game, 6, 'raise', 17000);
  act(game, 0, 'call');
  advanceStreet(game);
  return game;
}

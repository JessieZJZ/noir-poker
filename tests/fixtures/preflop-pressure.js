import { newGame, startHand, act, deckOfCards } from '../../src/engine/poker.js';
import { cards } from './deceptive-decisions.js';

// Reconstructed public lines, not recovered screenshot hand histories.
// Clockwise IDs: UTG=0, UTG+1=1, ..., CO=5, BTN=6, SB=7, BB=8.
export function pressureTable(hole, actor, { smallBlind = 100, shoverBB = 100 } = {}) {
  const game = newGame(9, {
    smallBlind,
    bigBlind: smallBlind * 2,
    startingStack: smallBlind * 200,
    chipUnit: smallBlind,
  });
  game.dealer = 5;
  game.difficulty = 'hard';
  game.emotionMode = 'lively';
  game.players[0].stack = shoverBB * game.bigBlind;
  startHand(game);
  const own = cards(hole),
    remaining = deckOfCards().filter((c) => !own.some((o) => o.key === c.key));
  game.players.forEach((p) => {
    p.hole = p.id === actor ? own : remaining.splice(0, 2);
  });
  game.deck = remaining;
  return game;
}

export function lateColdShove(hole = 'As Kd', actor = 5, options = {}) {
  const game = pressureTable(hole, actor, { shoverBB: 46, ...options });
  act(game, 0, 'raise', game.players[0].stack);
  while (game.actor !== actor) act(game, game.actor, 'fold');
  return game;
}

export function buttonIsolation(hole = 'As Qd', sizeBB = 3, limpers = 3, options = {}) {
  const game = pressureTable(hole, 1, options);
  act(game, 0, 'fold');
  for (let id = 1; id <= 5; id++) act(game, id, id <= limpers ? 'call' : 'fold');
  act(game, 6, 'raise', sizeBB * game.bigBlind);
  act(game, 7, 'fold');
  act(game, 8, 'fold');
  return game;
}

export function cutoffOvercall(hole = '7s 6s', options = {}) {
  const game = pressureTable(hole, 5, options);
  act(game, 0, 'raise', game.bigBlind * 3);
  for (const id of [1, 2, 3]) act(game, id, 'call');
  act(game, 4, 'fold');
  return game;
}

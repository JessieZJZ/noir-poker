import { newGame, startHand, act, advanceStreet, deckOfCards } from '../../src/engine/poker.js';
import { cards } from './deceptive-decisions.js';

// Real legal action sequences, with a complete unique deck. Only the engine's
// before-action public snapshots leave this fixture.
function preparedGame(hole, flop, openerStack) {
  const g = newGame(5, {
    smallBlind: 100,
    bigBlind: 200,
    startingStack: 20000,
    chipUnit: 100,
  });
  g.dealer = -1;
  g.players[3].stack = openerStack;
  startHand(g);
  const own = cards(hole),
    board = cards(flop),
    known = new Set([...own, ...board].map((card) => card.key)),
    rest = deckOfCards().filter((card) => !known.has(card.key));
  g.players[0].hole = own;
  g.players.slice(1).forEach((p) => (p.hole = rest.splice(0, 2)));
  g.deck = board.length ? [...rest.slice(0, -1), ...board.slice().reverse(), rest.at(-1)] : rest;
  if (new Set([...g.deck, ...g.players.flatMap((p) => p.hole)].map((c) => c.key)).size !== 52)
    throw Error('Fixture must preserve all 52 unique cards');
  return g;
}

export function allInPressureSnapshot({ preflop = false, sidePot = false, allIn = true } = {}) {
  const g = preparedGame('7c 8c', 'Qc 9c 2d', allIn ? 500 : 20000);
  act(g, 3, 'raise', 500);
  act(g, 4, 'call');
  if (preflop) {
    act(g, 0, 'raise', 2000);
  } else {
    act(g, 0, 'call');
    act(g, 1, 'fold');
    act(g, 2, 'fold');
    advanceStreet(g);
    if (sidePot) {
      act(g, 4, 'raise', 1000);
      act(g, 0, 'call');
      advanceStreet(g);
    }
    while (g.actor !== 0) act(g, g.actor, 'check');
    act(g, 0, 'raise', 1000);
  }
  const total = g.players.reduce((sum, p) => sum + p.stack + p.total, 0);
  if (total !== (allIn ? 80500 : 100000)) throw Error('Fixture must conserve chips');
  return g.decisions.at(-1);
}

export function cheapMiddlePairRaise() {
  const g = preparedGame('Kc Tc', 'Qh Td 4s', 20000);
  act(g, 3, 'fold');
  act(g, 4, 'raise', 500);
  act(g, 0, 'call');
  act(g, 1, 'fold');
  act(g, 2, 'fold');
  advanceStreet(g);
  act(g, 4, 'raise', 200);
  act(g, 0, 'raise', 400);
  return g.decisions.at(-1);
}

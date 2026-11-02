import { newGame, startHand, act, deckOfCards } from '../../src/engine/poker.js';
import { cards } from './deceptive-decisions.js';

// Constructed legal squeeze response, reproducing a developer-corpus pattern.
// Hole cards are arranged for the test; all wagers use the production rules.
export function observedSqueeze({
  count = 5,
  hands = 32,
  hole = 'As Jc',
  smallBlind = 100,
  difficulty = 'hard',
} = {}) {
  const game = newGame(count, {
    smallBlind,
    bigBlind: 2 * smallBlind,
    chipUnit: smallBlind,
    startingStack: 200 * smallBlind,
  });
  game.dealer = count - 3;
  game.hand = hands;
  game.difficulty = difficulty;
  game.emotionMode = 'off';
  startHand(game);
  const target = count - 1,
    opener = count - 2;
  game.players[target].botProfile = 'owen';
  game.players[target].hole = cards(hole);
  game.players[0].hole = cards('9d 8c');
  const known = [...game.players[target].hole, ...game.players[0].hole];
  const rest = deckOfCards().filter((c) => !known.some((k) => k.key === c.key));
  for (const p of game.players.slice(1, target)) p.hole = rest.splice(0, 2);
  game.deck = rest;
  game.players[0].publicReads = Array.from({ length: hands }, () => ({
    hands: 1,
    voluntaryHands: 1,
    raisingHands: 1,
    largeRaiseHands: 1,
  }));
  const bb = game.bigBlind;
  for (let id = 1; id < opener; id++) act(game, id, id === 2 ? 'call' : 'fold');
  act(game, opener, 'raise', 7 * bb);
  act(game, target, 'call');
  act(game, 0, 'raise', 18 * bb);
  act(game, 2, 'fold');
  act(game, opener, 'fold');
  return game;
}

import assert from 'node:assert/strict';
import * as engine from '../../src/engine/poker.js';

const deck = engine.deckOfCards();
const card = (key) =>
  deck.find(
    (c) => c.rank === '23456789TJQKA'.indexOf(key[0]) + 2 && c.suit === 'shcd'.indexOf(key[1]),
  );

// The reported 5-seat hand at 100/200: UTG opens 500, CO and BTN call, the
// SB (宽松取值) 3-bets to 3K, UTG calls. On 3♦ 7♠ 4♦ the SB checks and UTG
// bets the 7.2K pot. The SB holds 9♣ 9♦, an overpair, and must call 7.2K.
export function facingPotBet(difficulty, sbHole = '9c 9d', { heroRead = null } = {}) {
  const g = engine.newGame(5, {
    smallBlind: 100,
    bigBlind: 200,
    startingStack: 20000,
    chipUnit: 100,
  });
  g.difficulty = difficulty;
  const profiles = [null, 'iris', 'vale', 'jett', 'rook'];
  [20100, 19300, 19700, 24100, 16800].forEach((stack, id) => {
    g.players[id].stack = stack;
    if (id) g.players[id].botProfile = profiles[id];
  });
  if (heroRead) g.players[0].publicReads = [heroRead];
  g.dealer = 1;
  engine.startHand(g);
  const holes = { 0: 'Qc 8h', 1: '5s 5h', 2: 'Js Th', 3: sbHole, 4: '2h 6c' };
  const used = new Set();
  for (const [id, text] of Object.entries(holes)) {
    g.players[id].hole = text.split(' ').map(card);
    g.players[id].hole.forEach((c) => used.add(c.key));
  }
  const flop = ['3d', '7s', '4d'].map(card);
  flop.forEach((c) => used.add(c.key));
  const rest = engine.deckOfCards().filter((c) => !used.has(c.key));
  // dealCommunityCards pops a burn card, then the three flop cards.
  g.deck = [...rest.slice(0, -1), ...flop.reverse(), rest.at(-1)];
  const step = (id, action, amount) => {
    assert.equal(g.actor, id);
    engine.act(g, id, action, amount);
  };
  step(0, 'raise', 500);
  step(1, 'call');
  step(2, 'call');
  step(3, 'raise', 3000);
  step(4, 'fold');
  step(0, 'call');
  step(1, 'fold');
  step(2, 'fold');
  engine.advanceStreet(g);
  assert.deepEqual(
    g.board.map((c) => c.key),
    flop.reverse().map((c) => c.key),
  );
  step(3, 'check');
  step(0, 'raise', 7200);
  assert.equal(engine.seatPosition(g, 3), 'SB');
  return g;
}

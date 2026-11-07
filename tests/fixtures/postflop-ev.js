import * as engine from '../../src/engine/poker.js';

// ♠0 ♥1 ♣2 ♦3
export const card = (rank, suit) => ({ rank, suit, symbol: '♠♥♣♦'[suit], key: `${suit}-${rank}` });
export const seeded = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// The reported hand: nine seats, UTG (seat 4) opens, seat 8, seat 0 and the
// button (seat 1) call. The flop is K♦ 5♦ 9♣ and the first seats check.
// `holes` replaces hole cards by seat; `flop` scripts the flop actions before
// the decision under test as [seat, action, amount?] in table order.
export function postflopSpot({
  difficulty = 'normal',
  holes = { 1: [card(13, 0), card(7, 1)] },
  flop = [
    [4, 'check'],
    [8, 'check'],
    [0, 'check'],
  ],
} = {}) {
  const g = engine.newGame(9);
  g.difficulty = difficulty;
  g.emotionMode = 'off';
  for (const p of g.players) p.botProfile = 'balanced';
  g.dealer = 0;
  engine.startHand(g);
  const board = [card(13, 3), card(5, 3), card(9, 2), card(6, 2), card(14, 2)];
  const used = new Set([...Object.values(holes).flat(), ...board].map((c) => c.key));
  const rest = engine.deckOfCards().filter((c) => !used.has(c.key));
  for (const p of g.players) p.hole = holes[p.id] || [rest.pop(), rest.pop()];
  // Cards are dealt from the end: burn, flop, burn, turn, burn, river.
  g.deck = [
    ...rest.slice(0, 10),
    board[4],
    rest[10],
    board[3],
    rest[11],
    ...board.slice(0, 3).reverse(),
    rest[12],
  ];
  const preflop = { 4: ['raise', 1000], 8: ['call'], 0: ['call'], 1: ['call'] };
  while (g.street === 0 && g.phase === 'playing') {
    const [action, amount] = preflop[g.actor] || ['fold'];
    engine.act(g, g.actor, action, amount);
  }
  if (g.phase === 'between') engine.advanceStreet(g);
  for (const [seat, action, amount] of flop) {
    if (g.actor !== seat) throw Error(`Seat ${seat} is not next to act (${g.actor})`);
    engine.act(g, seat, action, amount);
  }
  return g;
}

export function decisions(make, count = 60, seed = 1) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(engine.botDecision(make(), seeded((seed + i) * 7919)));
  return out;
}

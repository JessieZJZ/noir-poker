import { newGame, startHand, act, advanceStreet } from '../../src/engine/poker.js';
import { stakesFromSmallBlind } from '../../src/engine/stakes.js';
import { clarityRandom, giveClarityHole } from './review-clarity-followup.js';
import { cards } from './deceptive-decisions.js';

// Legal reconstructions of the screenshots, not recovered saved games.
function arrange({ dealer, holes, board, stacks, difficulty = 'hard', smallBlind = 10000 }) {
  const g = newGame(5, stakesFromSmallBlind(smallBlind));
  g.dealer = dealer;
  g.difficulty = difficulty;
  g.emotionMode = 'off';
  const saved = Math.random;
  Math.random = clarityRandom(2026102543);
  try {
    startHand(g);
  } finally {
    Math.random = saved;
  }
  for (const [id, text] of Object.entries(holes)) giveClarityHole(g, Number(id), text);
  if (stacks)
    for (const [id, bb] of Object.entries(stacks)) {
      const p = g.players[id];
      p.stack = bb * g.bigBlind - p.total;
    }
  const target = cards(board),
    reserved = new Set(target.map((c) => c.key));
  for (const card of target) {
    let found;
    for (const group of [...g.players.filter((p) => !(p.id in holes)).map((p) => p.hole), g.deck])
      for (let i = 0; i < group.length; i++) if (group[i].key === card.key) found = [group, i];
    if (!found) throw Error('Board conflicts with assigned cards');
    const spare = g.deck.findIndex((c) => !reserved.has(c.key));
    [found[0][found[1]], g.deck[spare]] = [g.deck[spare], found[0][found[1]]];
  }
  const rest = g.deck.filter((c) => !reserved.has(c.key)),
    burns = [rest.pop(), rest.pop(), rest.pop()];
  g.deck = [
    ...rest,
    ...[burns[0], ...target.slice(0, 3), burns[1], target[3], burns[2], target[4]].reverse(),
  ];
  return g;
}

export function pairedTurn({
  beforeBet = false,
  flop = false,
  defender = 'Ac 9h',
  hero = 'Kh 5c',
  betBB = 4,
  ...options
} = {}) {
  const g = arrange({
    dealer: 3,
    holes: { 0: hero, 1: defender, 2: 'Th Jc' },
    board: 'Tc 7s 7c Ah 4d',
    stacks: { 0: 216.5, 1: 462.5, 2: 56, 3: 112.5, 4: 255.5 },
    ...options,
  });
  g.players[1].botProfile = g.players[2].botProfile = 'vale';
  act(g, 2, 'call');
  act(g, 3, 'fold');
  act(g, 4, 'call');
  act(g, 0, 'call');
  act(g, 1, 'check');
  advanceStreet(g);
  for (const id of [0, 1]) act(g, id, 'check');
  if (flop) return g;
  for (const id of [2, 4]) act(g, id, 'check');
  advanceStreet(g);
  if (!beforeBet) act(g, 0, 'raise', betBB * g.bigBlind);
  return g;
}

export function checkedRiver({
  beforeBet = false,
  defender = 'Kd Td',
  betBB = 2,
  ...options
} = {}) {
  const g = arrange({
    dealer: 4,
    holes: { 0: '8d 5c', 1: defender, 2: '3d 6h', 4: '5s 6s' },
    board: '9d 2h 2c Ac Ts',
    stacks: { 0: 222.5, 1: 457.5, 2: 58, 3: 116.5, 4: 254.5 },
    ...options,
  });
  g.players[1].botProfile = 'vale';
  act(g, 3, 'fold');
  act(g, 4, 'call');
  act(g, 0, 'call');
  act(g, 1, 'call');
  act(g, 2, 'check');
  for (let street = 1; street <= 2; street++) {
    advanceStreet(g);
    for (const id of [1, 2, 4, 0]) act(g, id, 'check');
  }
  advanceStreet(g);
  if (!beforeBet) {
    for (const id of [1, 2, 4]) act(g, id, 'check');
    act(g, 0, 'raise', betBB * g.bigBlind);
  }
  return g;
}

export function deepFourBet({ hero = 'Ad 4c', ...options } = {}) {
  const g = arrange({
    dealer: 0,
    holes: { 0: hero, 1: 'Ah Kc', 3: 'As 8s', 4: 'Jd Jc' },
    board: '2h 6c Qd 9s 3c',
    stacks: { 0: 222.5, 1: 456.5, 2: 57, 3: 111.5, 4: 252.5 },
    ...options,
  });
  g.players[1].botProfile = 'vale';
  g.players[3].botProfile = 'owen';
  g.players[4].botProfile = 'mira';
  act(g, 4, 'call');
  act(g, 0, 'call');
  act(g, 1, 'raise', 9 * g.bigBlind);
  act(g, 2, 'fold');
  act(g, 3, 'call');
  act(g, 4, 'raise', 49.5 * g.bigBlind);
  act(g, 0, 'raise', g.players[0].stack + g.players[0].bet);
  return g;
}

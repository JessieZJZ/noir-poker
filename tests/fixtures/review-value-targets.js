import { newGame, startHand, act, advanceStreet, legalActions } from '../../src/engine/poker.js';
import { stakesFromSmallBlind } from '../../src/engine/stakes.js';
import { cards } from './deceptive-decisions.js';
import { clarityRandom, giveClarityHole } from './review-clarity-followup.js';

// Legal reconstructions of the supplied public cards/prices. Unknown actions
// are scripted test assumptions, not recovered original hand records.
function arranged({ hole, rival, board, smallBlind = 10000, sb = false, depthBB }) {
  const g = newGame(5, stakesFromSmallBlind(smallBlind));
  g.dealer = sb ? 3 : 1;
  const saved = Math.random;
  Math.random = clarityRandom(2026102531);
  try {
    startHand(g);
  } finally {
    Math.random = saved;
  }
  ['你', 'Mia', 'Alex', 'Theo', 'Jade'].forEach((name, id) => (g.players[id].name = name));
  for (const id of [0, sb ? 2 : 1]) g.players[id].stack += (depthBB - 100) * g.bigBlind;
  giveClarityHole(g, 0, hole);
  giveClarityHole(g, sb ? 2 : 1, rival);
  const target = cards(board),
    keys = new Set(target.map((c) => c.key));
  for (const card of target) {
    let found;
    for (const group of [
      ...g.players.filter((p) => ![0, sb ? 2 : 1].includes(p.id)).map((p) => p.hole),
      g.deck,
    ])
      for (let i = 0; i < group.length; i++) if (group[i].key === card.key) found = [group, i];
    if (!found) throw Error('Board conflicts with active hole cards');
    const spare = g.deck.findIndex((c) => !keys.has(c.key));
    [found[0][found[1]], g.deck[spare]] = [g.deck[spare], found[0][found[1]]];
  }
  const rest = g.deck.filter((c) => !keys.has(c.key)),
    burns = [rest.pop(), rest.pop(), rest.pop()];
  g.deck = [
    ...rest,
    ...[burns[0], ...target.slice(0, 3), burns[1], target[3], burns[2], target[4]].reverse(),
  ];
  return g;
}
export function topPairFlushTurn({
  smallBlind = 10000,
  reraise = false,
  hole = 'Ks Tc',
  turnCard = '2d',
  depthBB = 114,
} = {}) {
  const g = arranged({
    hole,
    rival: '9d 8d',
    board: `5d Th 6d ${turnCard} 7s`,
    smallBlind,
    depthBB,
  });
  const bb = (n) => n * g.bigBlind;
  act(g, 0, 'raise', bb(6));
  act(g, 1, 'call');
  act(g, 2, 'raise', bb(13));
  act(g, 3, 'fold');
  act(g, 4, 'fold');
  act(g, 0, 'call');
  act(g, 1, 'call');
  advanceStreet(g);
  act(g, 0, 'raise', bb(40.5));
  act(g, 1, 'call');
  act(g, 2, 'fold');
  advanceStreet(g);
  if (reraise) {
    act(g, 0, 'raise', bb(10));
    act(g, 1, 'raise', bb(30));
  }
  act(g, 0, 'raise', g.players[0].bet + g.players[0].stack);
  return { game: g, flop: g.decisions.at(-2), turn: g.decisions.at(-1) };
}
export function limpedSmallFlush({
  smallBlind = 10000,
  riverAction = 'check',
  rival = 'Qs 4d',
  raised = false,
  depthBB = 138,
} = {}) {
  const g = arranged({
    hole: '2c 5c',
    rival,
    board: '8c Td Qc 4c 4h',
    smallBlind,
    sb: true,
    depthBB,
  });
  const bb = (n) => n * g.bigBlind;
  act(g, 2, raised ? 'raise' : 'call', raised ? bb(3) : undefined);
  act(g, 3, 'fold');
  act(g, 4, 'call');
  act(g, 0, 'call');
  act(g, 1, raised ? 'fold' : 'check');
  advanceStreet(g);
  act(g, 0, 'raise', bb(2));
  if (!raised) act(g, 1, 'fold');
  act(g, 2, 'call');
  act(g, 4, 'call');
  advanceStreet(g);
  act(g, 0, 'raise', bb(4));
  act(g, 2, 'call');
  act(g, 4, 'fold');
  advanceStreet(g);
  act(g, 0, riverAction, riverAction === 'raise' ? bb(9) : undefined);
  return { game: g, river: g.decisions.at(-1) };
}
export function shortFlushShove({ smallBlind = 10000 } = {}) {
  const g = arranged({
    hole: '8d Td',
    rival: 'Qh Jh',
    board: '3d 9d Qs 7c 5d',
    smallBlind,
    depthBB: 106,
  });
  const bb = (n) => n * g.bigBlind;
  act(g, 0, 'raise', bb(6));
  act(g, 1, 'call');
  for (const id of [2, 3, 4]) act(g, id, 'fold');
  advanceStreet(g);
  act(g, 0, 'raise', bb(15));
  act(g, 1, 'call');
  advanceStreet(g);
  act(g, 0, 'raise', bb(75));
  act(g, 1, 'call');
  advanceStreet(g);
  act(g, 0, 'raise', g.players[0].stack);
  return { game: g, river: g.decisions.at(-1) };
}
export function finishValueGame(g) {
  while (g.phase !== 'done') {
    if (g.phase === 'between') advanceStreet(g);
    else act(g, g.actor, legalActions(g).canCheck ? 'check' : 'call');
  }
  return g;
}

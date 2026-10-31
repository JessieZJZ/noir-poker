import { cards } from './deceptive-decisions.js';
import {
  legalActions,
  newGame,
  startHand,
  deckOfCards,
  act,
  advanceStreet,
} from '../../src/engine/poker.js';
import { stakesFromSmallBlind } from '../../src/engine/stakes.js';

// Invented before-action ledgers; these are not saved user or agent sessions.
export function strategyRiver({ hole = '2c 3d', board = 'As Ks Qs Js Ts', action = 'call' } = {}) {
  const players = [
    {
      id: 0,
      name: '你',
      position: 'BTN',
      stack: 18200,
      total: 1800,
      bet: 0,
      actedTo: 0,
      checked: false,
    },
    {
      id: 1,
      name: 'Mia',
      position: 'CO',
      botProfile: 'balanced',
      stack: 17000,
      total: 3000,
      bet: 1200,
      actedTo: 1200,
    },
    {
      id: 2,
      name: 'Alex',
      position: 'SB',
      stack: 19900,
      total: 100,
      bet: 0,
      folded: true,
      actedTo: 0,
    },
    {
      id: 3,
      name: 'Kai',
      position: 'BB',
      stack: 19800,
      total: 200,
      bet: 0,
      folded: true,
      actedTo: 0,
    },
    {
      id: 4,
      name: 'River',
      position: 'UTG',
      stack: 20000,
      total: 0,
      bet: 0,
      folded: true,
      actedTo: 0,
    },
  ];
  const s = {
    index: 0,
    hand: 1,
    street: 3,
    position: 'BTN',
    hole: cards(hole),
    board: cards(board),
    smallBlind: 100,
    bigBlind: 200,
    chipUnit: 100,
    stack: 18200,
    total: 1800,
    bet: 0,
    pot: 5100,
    currentBet: 1200,
    minRaise: 1200,
    pending: [0],
    dealer: 0,
    difficulty: 'hard',
    emotionMode: 'off',
    players,
    action,
    amount: action === 'call' ? 1200 : 0,
    history: [
      { id: 1, street: 0, action: 'raise', amount: 600 },
      { id: 0, street: 0, action: 'call', amount: 600 },
      { id: 1, street: 1, action: 'raise', amount: 400 },
      { id: 0, street: 1, action: 'call', amount: 400 },
      { id: 1, street: 2, action: 'raise', amount: 800 },
      { id: 0, street: 2, action: 'call', amount: 800 },
      { id: 1, street: 3, action: 'raise', amount: 1200 },
    ],
  };
  s.legal = legalActions({ ...s, actor: 0, phase: 'playing' });
  return s;
}

// Entirely legal 5-seat reconstruction for browser/native/WeChat QA.
export function strategyRiverGame({
  smallBlind = 100,
  hole = '2c 3d',
  board = 'As Ks Qs Js Ts',
  action = 'call',
} = {}) {
  const g = newGame(5, stakesFromSmallBlind(smallBlind));
  g.dealer = 4;
  startHand(g);
  const own = cards(hole),
    community = cards(board);
  const keys = new Set([...own, ...community].map((c) => c.key));
  const rest = deckOfCards().filter((c) => !keys.has(c.key));
  for (const p of g.players) p.hole = p.id === 0 ? own : [rest.pop(), rest.pop()];
  const burns = [rest.pop(), rest.pop(), rest.pop()];
  g.deck = [
    ...rest,
    ...[
      burns[0],
      ...community.slice(0, 3),
      burns[1],
      community[3],
      burns[2],
      community[4],
    ].reverse(),
  ];
  const scale = smallBlind / 100;
  act(g, 3, 'fold');
  act(g, 4, 'raise', 600 * scale);
  act(g, 0, 'call');
  act(g, 1, 'fold');
  act(g, 2, 'fold');
  advanceStreet(g);
  act(g, 4, 'raise', 400 * scale);
  act(g, 0, 'call');
  advanceStreet(g);
  act(g, 4, 'raise', 800 * scale);
  act(g, 0, 'call');
  advanceStreet(g);
  act(g, 4, 'raise', 1200 * scale);
  if (action === null) return { game: g, snapshot: null };
  act(g, 0, action, action === 'raise' ? 3700 * scale : undefined);
  const snapshot = g.decisions.at(-1);
  if (g.phase === 'between') advanceStreet(g);
  return { game: g, snapshot };
}

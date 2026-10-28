import * as defaultEngine from '../../src/engine/poker.js';
import { stakesFromSmallBlind } from '../../src/engine/stakes.js';

export const CHECKED_POSTFLOP_CASES = Object.freeze({
  'top-pair-wet': { hole: 'As Qd', board: 'Ah 8h 3c', street: 1 },
  'overpair-wet': { hole: 'Ks Kd', board: 'Jh 8h 3c', street: 1 },
  'nut-draw-checked': { hole: 'As Js', board: 'Ts 7s 2d', street: 1 },
  'combo-draw-checked': { hole: 'Js Ts', board: 'Qs 9s 2d', street: 1 },
  'turn-value-improved': { hole: 'As Js', board: 'Ts 7s 2d 9s', street: 2 },
  'turn-flush-completed': { hole: 'As Qd', board: 'Ah 8h 3c 2h', street: 2 },
  'strong-turn-response': {
    hole: 'As Qd',
    board: 'Ah 8h 3c Kd',
    street: 2,
    facingTurnBet: true,
  },
  'middle-pair-danger': { hole: '8s 7c', board: 'Ah 8h 3c 2h', street: 2 },
  'prior-checkthrough-draw-lead': {
    hole: 'As Js',
    board: 'Qs 7s Jd 4c',
    street: 2,
    checkThroughFlop: true,
  },
  'prior-checkthrough-paired-turn': {
    hole: 'As Js',
    board: 'Ts 7s 2d 2c',
    street: 2,
    checkThroughFlop: true,
  },
  'prior-checkthrough-flush-turn': {
    hole: 'As Js',
    board: 'Th 7h Qs 9h',
    street: 2,
    checkThroughFlop: true,
  },
  'prior-checkthrough-four-connected': {
    hole: 'As Ks',
    board: 'Ts 9s 8d 7c',
    street: 2,
    checkThroughFlop: true,
  },
  'prior-checkthrough-strong-response': {
    hole: 'As Js',
    board: 'Qs 7s Jd 4c',
    street: 2,
    checkThroughFlop: true,
    facingTurnBet: true,
  },
});

// Scripted legal public lines, not samples from a natural or human session.
// All setup actions use the supplied engine so frozen old/new producers can
// be compared on identical before-action information and independent rolls.
export function checkedPostflopGame({
  scenario = 'top-pair-wet',
  count = 5,
  opponents = 3,
  profile = 'balanced',
  difficulty = 'normal',
  smallBlind = 100,
  seed = 76291,
  engine = defaultEngine,
} = {}) {
  const config = CHECKED_POSTFLOP_CASES[scenario];
  if (!config || ![5, 6, 7, 8, 9].includes(count) || opponents < 1 || opponents > 3)
    throw Error('Invalid checked-postflop fixture');
  const g = engine.newGame(count, stakesFromSmallBlind(smallBlind));
  // Ordinary cases evaluate button seat 1; check-through leads evaluate
  // small blind seat 1 before the other live opponents act on the turn.
  g.dealer = config.checkThroughFlop ? count - 1 : 0;
  g.difficulty = difficulty;
  g.emotionMode = 'off';
  const previous = Math.random;
  let n = seed >>> 0;
  Math.random = () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
  try {
    engine.startHand(g);
  } finally {
    Math.random = previous;
  }
  g.players[1].botProfile = profile;
  const catalogue = engine.deckOfCards();
  const parse = (text) =>
    text
      .split(' ')
      .map((key) =>
        catalogue.find(
          (c) =>
            c.rank === '23456789TJQKA'.indexOf(key[0]) + 2 && c.suit === 'shcd'.indexOf(key[1]),
        ),
      );
  const own = parse(config.hole),
    board = parse(config.board),
    known = new Set([...own, ...board].map((c) => c.key)),
    rest = catalogue.filter((c) => !known.has(c.key));
  for (const p of g.players) p.hole = p.id === 1 ? own : [rest.pop(), rest.pop()];
  const sequence = [rest.pop(), ...board.slice(0, 3)];
  if (board.length > 3) sequence.push(rest.pop(), board[3]);
  g.deck = [...rest, ...sequence.reverse()];
  const ids = [0, count - 1, count - 2].slice(0, opponents);
  const active = new Set([1, ...ids]);
  while (g.phase === 'playing') {
    const legal = engine.legalActions(g);
    engine.act(g, g.actor, active.has(g.actor) ? (legal.canCheck ? 'check' : 'call') : 'fold');
  }
  engine.advanceStreet(g);
  const checkToActor = () => {
    while (g.phase === 'playing' && g.actor !== 1) engine.act(g, g.actor, 'check');
    if (g.phase !== 'playing' || g.actor !== 1) throw Error('Fixture did not reach its actor');
  };
  checkToActor();
  if (config.street === 1) return g;
  if (config.checkThroughFlop) {
    while (g.phase === 'playing') engine.act(g, g.actor, 'check');
  } else {
    const pot = g.players.reduce((sum, p) => sum + p.total, 0);
    const amount = Math.max(g.bigBlind, Math.round(pot / 2 / g.chipUnit) * g.chipUnit);
    engine.act(g, 1, 'raise', amount);
    while (g.phase === 'playing') engine.act(g, g.actor, 'call');
  }
  engine.advanceStreet(g);
  if (config.facingTurnBet) {
    if (config.checkThroughFlop) engine.act(g, 1, 'check');
    const turnPot = g.players.reduce((sum, p) => sum + p.total, 0);
    engine.act(g, g.actor, 'raise', Math.round((turnPot * 0.75) / g.chipUnit) * g.chipUnit);
    while (g.phase === 'playing' && g.actor !== 1) engine.act(g, g.actor, 'call');
  } else checkToActor();
  return g;
}

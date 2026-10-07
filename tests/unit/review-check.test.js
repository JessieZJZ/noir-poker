import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deckOfCards,
  newGame,
  startHand,
  act,
  advanceStreet,
  settle,
} from '../../src/engine/poker.js';
import {
  createReviewInput,
  analyzeDecision,
  analyzeReview,
  callPrice,
  startingTier,
  actionLabel,
} from '../../src/review/analysis.js';
let passed = 0;
const started = performance.now();
const check = (name, fn) => test(name, fn);
const cards = (s) =>
  s
    .split(' ')
    .map((v) =>
      deckOfCards().find(
        (c) => c.rank === '23456789TJQKA'.indexOf(v[0]) + 2 && c.suit === 'shcd'.indexOf(v[1]),
      ),
    );
const options = { trials: 100 };
function snapshot({
  hole = '7s 2h',
  board = '2s 6h 9c Jd Qs',
  street = 3,
  action = 'call',
  amount = 100,
  position = 'BTN',
  totals = [100, 200, 0, 0, 0, 0],
  stacks = [1000, 1000, 0, 0, 0, 0],
  allins = [],
  pending = [0],
  currentBet = 200,
  canCheck = false,
  canRaise = true,
} = {}) {
  const players = totals.map((total, id) => ({
    id,
    name: ['你', 'Mia', 'Alex', 'River', 'Kai', 'Luna'][id],
    position,
    stack: stacks[id],
    total,
    bet: total,
    folded: id > 1 && total === 0,
    allin: allins.includes(id),
    action: id === 1 ? '下注 ' + currentBet : '',
  }));
  return {
    index: 0,
    hand: 1,
    street,
    position,
    hole: cards(hole),
    board: board ? cards(board) : [],
    stack: stacks[0],
    bet: totals[0],
    total: totals[0],
    pot: totals.reduce((a, b) => a + b, 0),
    currentBet,
    minRaise: 50,
    legal: {
      enabled: true,
      canCheck,
      canRaise,
      raiseReopened: canRaise,
      toCall: canCheck ? 0 : amount,
      callAmount: canCheck ? 0 : amount,
      minRaiseTo: currentBet + 50,
      maxRaiseTo: totals[0] + stacks[0],
    },
    pending,
    action,
    amount,
    players,
    history: [{ id: 1, street, action: 'raise', amount: currentBet }],
  };
}
check('every valid hero action records a before-action snapshot without hidden data', () => {
  const g = newGame();
  g.dealer = 2;
  startHand(g);
  assert.equal(g.actor, 0);
  const beforeStack = g.players[0].stack,
    beforePot = g.players.reduce((n, p) => n + p.total, 0);
  act(g, 0, 'call');
  const s = g.decisions[0];
  assert.equal(s.stack, beforeStack);
  assert.equal(s.pot, beforePot);
  assert.equal(s.action, 'call');
  assert.equal(s.amount, 50);
  assert.equal(s.board.length, 0);
  assert.ok(s.players.every((p) => !('hole' in p) && !('cards' in p)));
  assert.ok(!('deck' in s));
  assert.ok(!('result' in s));
  assert.equal(s.history.length, 0);
  const saved = JSON.stringify(s);
  g.players[0].hole[0].rank = 2;
  g.players[1].stack = 1;
  g.board.push(...cards('As Kh Qc'));
  g.history[0].amount = 999;
  assert.equal(JSON.stringify(s), saved);
});
check('illegal and out-of-turn actions do not create history entries', () => {
  const g = newGame();
  startHand(g);
  assert.throws(() => act(g, 0, 'call'));
  assert.equal(g.decisions.length, 0);
  assert.equal(g.history.length, 0);
  g.dealer = 2;
  g.phase = 'done';
  startHand(g);
  assert.throws(() => act(g, 0, 'check'));
  assert.equal(g.decisions.length, 0);
});
check('all four streets are recorded and an empty call normalizes to check', () => {
  const g = newGame();
  g.dealer = 2;
  startHand(g);
  while (g.phase !== 'done') {
    if (g.phase === 'between') advanceStreet(g);
    else act(g, g.actor, 'call');
  }
  assert.deepEqual(
    g.decisions.map((s) => s.street),
    [0, 1, 2, 3],
  );
  assert.deepEqual(
    g.decisions.map((s) => s.board.length),
    [0, 3, 4, 5],
  );
  assert.deepEqual(
    g.decisions.map((s) => s.action),
    ['call', 'check', 'check', 'check'],
  );
  const input = createReviewInput(g);
  startHand(g);
  assert.equal(g.decisions.length, 0);
  assert.equal(input.decisions.length, 4);
  assert.equal(input.outcome.board.length, 5);
});
check('review cannot start before settlement', () => {
  const g = newGame();
  startHand(g);
  assert.throws(() => createReviewInput(g));
});
check('folding when a free check exists recommends the legal free check', () => {
  const s = snapshot({
    action: 'fold',
    canCheck: true,
    amount: 0,
    currentBet: 0,
    totals: [50, 50, 0, 0, 0, 0],
  });
  const r = analyzeDecision(s, options);
  assert.equal(r.status, 'attention');
  assert.equal(r.alternative.action, 'check');
});
check('weak early-position preflop entry recommends folding', () => {
  const s = snapshot({
    street: 0,
    board: '',
    position: 'UTG',
    totals: [0, 50, 25, 0, 0, 0],
    stacks: [1000, 1000, 1000, 1000, 1000, 1000],
    currentBet: 50,
    amount: 50,
  });
  assert.equal(analyzeDecision(s, options).alternative.action, 'fold');
});
check('strong all-in losing to a later runout is not automatically a mistake', () => {
  const s = snapshot({
    hole: 'As Ah',
    street: 0,
    board: '',
    action: 'raise',
    amount: 1000,
    totals: [0, 50, 25, 0, 0, 0],
    stacks: [1000, 1000, 1000, 0, 0, 0],
    currentBet: 50,
  });
  const input = {
    hand: 1,
    decisions: [s],
    outcome: { profit: -1000, folded: false, board: cards('Ks Kh Kc Qd 2s') },
  };
  const r = analyzeReview(input, options);
  assert.equal(r.attention, 0);
  assert.equal(r.title, '未发现明显决策失误');
});
check('decision verdicts do not change with showdown winner or future board', () => {
  const s = snapshot({ street: 1, board: '2s 6h 9c' });
  const a = {
    hand: 1,
    decisions: [s],
    outcome: { profit: -200, folded: false, board: cards('2s 6h 9c As Ah'), result: 'Mia won' },
  };
  const b = {
    ...a,
    outcome: { ...a.outcome, profit: 500, board: cards('2s 6h 9c 7h 7c'), result: 'hero won' },
  };
  assert.deepEqual(analyzeReview(a, options).steps, analyzeReview(b, options).steps);
});
check('recommendations never reopen a legally closed raise', () => {
  const s = snapshot({ hole: 'As Ah', street: 0, board: '', canRaise: false });
  assert.notEqual(analyzeDecision(s, options).alternative.action, 'raise');
});
check('a recommended raise respects minimum, maximum and integer totals', () => {
  const s = snapshot({
    hole: 'As Ah',
    street: 0,
    board: '',
    currentBet: 50,
    totals: [0, 50, 25, 0, 0, 0],
    amount: 50,
  });
  const r = analyzeDecision(s, options);
  assert.equal(r.alternative.action, 'raise');
  assert.ok(
    r.alternative.amount >= s.legal.minRaiseTo && r.alternative.amount <= s.legal.maxRaiseTo,
  );
  assert.ok(Number.isInteger(r.alternative.amount));
});
check('short-stack call price excludes unreachable side pots', () => {
  const s = snapshot({
    totals: [50, 300, 300, 0, 0, 0],
    stacks: [50, 1000, 1000, 0, 0, 0],
    amount: 50,
    currentBet: 300,
    pending: [0],
  });
  s.players[2].folded = false;
  const p = callPrice(s);
  assert.equal(p.contestable, 300);
  assert.equal(p.cost, 50);
  assert.equal(p.required, 1 / 6);
  assert.equal(p.pots.length, 1);
  assert.deepEqual(p.pots[0].eligible, [0, 1, 2]);
});
check('main and side pots have distinct eligible opponents in call analysis', () => {
  const s = snapshot({
    totals: [100, 100, 300, 300, 0, 0],
    stacks: [200, 0, 1000, 1000, 0, 0],
    amount: 200,
    currentBet: 300,
    allins: [1],
  });
  s.players[2].folded = false;
  s.players[3].folded = false;
  const p = callPrice(s);
  assert.deepEqual(
    p.pots.map((p) => p.amount),
    [400, 600],
  );
  assert.deepEqual(
    p.pots.map((p) => p.eligible),
    [
      [0, 1, 2, 3],
      [0, 2, 3],
    ],
  );
  assert.equal(p.contestable, 1000);
  assert.equal(p.required, 0.2);
});
check('uncalled refunds are not confused with risk or pot winnings', () => {
  const s = snapshot({
    totals: [25, 20, 0, 0, 0, 0],
    stacks: [1000, 0, 0, 0, 0, 0],
    allins: [1],
    amount: 25,
    currentBet: 50,
    canRaise: false,
  });
  const p = callPrice(s);
  assert.equal(p.refundBefore, 5);
  assert.equal(p.refundAfter, 30);
  assert.equal(p.cost, 0);
  assert.equal(p.contestable, 40);
});
check('folded contributions remain in the call price but folded players cannot win', () => {
  const s = snapshot({
    totals: [100, 200, 200, 0, 0, 0],
    stacks: [1000, 1000, 0, 0, 0, 0],
    amount: 100,
  });
  s.players[2].folded = true;
  const p = callPrice(s);
  assert.equal(p.contestable, 600);
  assert.deepEqual(p.pots[0].eligible, [0, 1]);
});
check('royal flush on the board yields a tie rather than a false advantage', () => {
  const s = snapshot({
    hole: '2h 3h',
    board: 'As Ks Qs Js Ts',
    totals: [100, 200, 0, 0, 0, 0],
    amount: 100,
  });
  const r = analyzeDecision(s, options);
  assert.equal(r.metrics.equityLow, 0.5);
  assert.equal(r.metrics.equityHigh, 0.5);
  assert.equal(r.status, 'sound');
});
check('deterministic ranges stay stable when a review is reopened', () => {
  const s = snapshot();
  assert.deepEqual(analyzeDecision(s, options), analyzeDecision(s, options));
});
check('blind-only loss has no fabricated decision mistakes', () => {
  const input = { hand: 1, decisions: [], outcome: { profit: -25, folded: false } };
  const r = analyzeReview(input, options);
  assert.deepEqual(r.steps, []);
  assert.equal(r.attention, 0);
});
check('short all-in raise and all-in call labels use street total versus added amount', () => {
  const s = snapshot({
    action: 'raise',
    amount: 125,
    totals: [100, 100, 0, 0, 0, 0],
    stacks: [25, 1000, 0, 0, 0, 0],
    currentBet: 100,
  });
  assert.equal(actionLabel(s), '全下至 125');
  s.action = 'call';
  s.legal.callAmount = 25;
  assert.equal(actionLabel(s), '全下跟注 25');
});
check('starting-hand tiers distinguish premium and weak unsuited hands', () => {
  assert.equal(startingTier(cards('As Ah')), 3);
  assert.equal(startingTier(cards('7s 2h')), 0);
});

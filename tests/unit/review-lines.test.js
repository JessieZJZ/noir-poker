import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  startHand,
  act,
  advanceStreet,
  playBotTurn,
  botDecision,
  restartHand,
  deckOfCards,
  legalActions,
  potSize,
} from '../../src/engine/poker.js';
import {
  analyzeDecision,
  analyzeReview,
  createReviewInput,
  callPrice,
} from '../../src/review/analysis.js';
import { decisionContext } from '../../src/review/context.js';
import { chooseBotAction, BOT_PROFILES, freshBotMood } from '../../src/engine/bot-profiles.js';
import { explainOpponent } from '../../src/review/opponents.js';
const cards = (s) =>
  s
    .split(' ')
    .map((v) =>
      deckOfCards().find(
        (c) => c.rank === '23456789TJQKA'.indexOf(v[0]) + 2 && c.suit === 'shcd'.indexOf(v[1]),
      ),
    );
const options = { trials: 120 };
const copy = (v) => JSON.parse(JSON.stringify(v));
function btn(hole = 'Ac 7h', limp = false) {
  const g = newGame();
  g.dealer = 5;
  startHand(g);
  g.players[0].hole = cards(hole);
  while (g.actor !== 0) act(g, g.actor, limp && g.actor === 5 ? 'call' : 'fold');
  return g;
}
function seeded(seed) {
  let n = seed;
  return () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
}
test('A7 offsuit BTN opening has position/blocker rationale and distinct conditional sizing', () => {
  const g = btn();
  act(g, 0, 'raise', 150);
  const r = analyzeDecision(g.decisions[0], options);
  assert.equal(r.code, 'late-open');
  assert.equal(r.status, 'sound');
  assert.match(r.reason, /阻断|后位/);
  assert.match(r.reason, /开池／偷盲/);
  assert.doesNotMatch(r.reason, /没有.*听牌/);
  assert.notEqual(r.recommendation, '2-bet 开池至 150');
  assert.equal(r.routes.secondary.action, 'raise');
  assert.notEqual(r.routes.primary.amount, r.routes.secondary.amount);
  assert.ok(r.routes.secondary.amount >= g.decisions[0].legal.minRaiseTo);
  assert.match(r.routes.secondary.tradeoff, /范围|成本/);
});
test('BTN isolation of limper is distinct from unopened steal and true squeeze', () => {
  const g = btn('Ac 7h', true);
  act(g, 0, 'raise', 200);
  const r = analyzeDecision(g.decisions[0], options);
  assert.equal(r.code, 'late-isolation');
  assert.match(r.reason, /跛入者|隔离/);
  assert.match(r.plan, /多人|较多/);
});
test('A7 opening and calls to 3bet/4bet produce distinct recommendations from actual legal line', () => {
  const g = btn();
  act(g, 0, 'raise', 150);
  act(g, 1, 'call');
  act(g, 2, 'raise', 650);
  act(g, 0, 'call');
  act(g, 1, 'raise', 1800);
  act(g, 2, 'call');
  act(g, 0, 'call');
  const a = g.decisions.map((s) => analyzeDecision(s, options));
  assert.deepEqual(
    a.map((r) => r.code),
    ['late-open', 'weak-threebet-defense', 'weak-fourbet-defense'],
  );
  assert.equal(a[1].alternative.action, 'fold');
  assert.equal(a[2].status, 'attention');
  assert.match(a[1].reason, /开池有合理依据/);
  assert.match(a[2].lesson, /4-bet/);
  assert.notEqual(a[1].plan, a[2].plan);
});
test('suited weak ace defense discusses realization potential rather than only changing rank label', () => {
  const steps = ['Ac 7h', 'Ac 7c'].map((h) => {
    const g = btn(h);
    act(g, 0, 'raise', 150);
    act(g, 1, 'raise', 350);
    act(g, 2, 'fold');
    act(g, 0, 'call');
    return analyzeDecision(g.decisions[1], options);
  });
  assert.match(steps[0].plan, /不同花/);
  assert.match(steps[1].plan, /同花潜力/);
  assert.equal(steps[0].status, 'consider');
});
test('same street repeated calls do not count as multiple earlier streets', () => {
  const g = btn();
  act(g, 0, 'raise', 150);
  act(g, 1, 'call');
  act(g, 2, 'raise', 650);
  act(g, 0, 'call');
  act(g, 1, 'raise', 1800);
  act(g, 2, 'call');
  act(g, 0, 'call');
  advanceStreet(g);
  while (g.actor !== 0) act(g, g.actor, 'check');
  act(g, 0, 'check');
  const c = decisionContext(g.decisions.at(-1));
  assert.equal(c.pastCalls, 1);
  assert.equal(c.pastCallActions, 2);
});
test('calling a sole all-in opponent closes future betting even with hero chips remaining', () => {
  const g = btn();
  act(g, 0, 'raise', 150);
  g.players[1].stack = 850;
  act(g, 1, 'raise', 875);
  act(g, 2, 'fold');
  act(g, 0, 'call');
  const p = callPrice(g.decisions.at(-1));
  assert.equal(p.closing, true);
  assert.equal(g.players[0].allin, false);
});
test('opponent all-in does not close betting when another live opponent can still act', () => {
  const g = btn();
  act(g, 0, 'raise', 150);
  g.players[1].stack = 850;
  act(g, 1, 'raise', 875);
  act(g, 2, 'call');
  act(g, 0, 'call');
  assert.equal(callPrice(g.decisions.at(-1)).closing, false);
});
test('policy queries never record actions; execution records exactly once and preserves private snapshots', () => {
  const g = newGame();
  startHand(g);
  const id = g.actor;
  botDecision(g, seeded(4));
  assert.equal(g.botDecisions.length, 0);
  playBotTurn(g, seeded(4));
  assert.equal(g.botDecisions.length, 1);
  const r = g.botDecisions[0];
  assert.equal(r.id, id);
  assert.equal(r.sequence, 1);
  assert.equal(r.action, g.history[0].action);
  assert.equal(r.trace.view.history.length, 0);
  const saved = JSON.stringify(r);
  g.players[id].hole[0].rank = 2;
  g.players[id].botMood.kind = 'frustrated';
  assert.equal(JSON.stringify(r), saved);
  assert.throws(() => createReviewInput(g));
});
test('actual weak all-in call identifies randomized exceptions rather than rationalizing as good odds', () => {
  const v = {
    id: 1,
    hole: cards('7s 2h'),
    board: [],
    street: 0,
    position: 'UTG',
    count: 6,
    stack: 5000,
    bet: 0,
    pot: 5000,
    currentBet: 5000,
    difficulty: 'normal',
    rivals: 1,
    equity: 0.07,
    contestable: 10000,
    history: [{ id: 0, street: 0, action: 'raise', amount: 5000 }],
    features: { draw: false, wet: false },
    playsBoard: false,
    legal: {
      enabled: true,
      canCheck: false,
      canRaise: false,
      toCall: 5000,
      callAmount: 5000,
      minRaiseTo: 10000,
      maxRaiseTo: 5000,
    },
  };
  const d = chooseBotAction(v, BOT_PROFILES[0], freshBotMood(), 'off', () => 0);
  assert.equal(d.action, 'call');
  assert.equal(d.trace.reason, 'loose-exception');
  assert.ok(d.trace.exceptions.includes('insufficient-equity'));
  const e = explainOpponent({ id: 1, name: 'Mia', ...d, trace: { ...d.trace, view: v } });
  assert.match(e.detail, /失误/);
  assert.match(e.warning, /随机范围/);
  assert.ok(d.trace.checks.every((c) => c.selected));
});
test('settled bot traces are separate from hero grading, retry clears and regenerates one attempt', () => {
  const g = newGame();
  g.dealer = 2;
  startHand(g);
  const rng = seeded(91),
    wealth = g.players.reduce((n, p) => n + p.stack, 0) + potSize(g);
  while (g.phase !== 'done') {
    if (g.phase === 'between') advanceStreet(g);
    else if (g.actor === 0) act(g, 0, legalActions(g).canCheck ? 'check' : 'call');
    else playBotTurn(g, rng);
  }
  assert.equal(
    g.players.reduce((n, p) => n + p.stack, 0),
    wealth,
  );
  const input = createReviewInput(g);
  assert.ok(input.opponents.length > 0);
  const a = analyzeReview(input, options).steps;
  const altered = copy(input);
  altered.opponents = [{ trace: { view: { hole: cards('As Ah') }, reason: 'fake' } }];
  altered.outcome.profit = -9999;
  altered.outcome.board = cards('2s 3h 4c 5d 6s');
  assert.deepEqual(a, analyzeReview(altered, options).steps);
  assert.ok(
    input.decisions.every((s) => !('trace' in s) && s.players.every((p) => !('hole' in p))),
  );
  restartHand(g);
  assert.equal(g.botDecisions.length, 0);
  assert.equal(g.decisions.length, 0);
  assert.ok(input.opponents.length > 0);
});

test('Q7 suited UTG acknowledges its suit and treats the open as a range-sensitive discussion', () => {
  const g = newGame();
  g.dealer = 2;
  startHand(g);
  g.players[0].hole = cards('Qs 7s');
  act(g, 0, 'raise', 150);
  const r = analyzeDecision(g.decisions[0], options);
  assert.equal(r.code, 'early-suited-entry');
  assert.equal(r.status, 'consider');
  assert.match(r.reason, /确实是同花/);
  assert.doesNotMatch(r.reason, /不同花弱牌更难|低点数不同花牌/);
  assert.equal(r.routes.secondary.action, 'raise');
  assert.ok(r.simulation);
  assert.equal(r.simulation.rows.length >= 4, true);
});
test('foreign styles are accepted independently and retain distinct control vectors', () => {
  for (const id of ['viktor', 'jungleman', 'dwan']) {
    const g = newGame();
    const profile = BOT_PROFILES.find((p) => p.id === id);
    assert.ok(profile && profile.sources.length);
    assert.equal(profile.axes.length, 5);
  }
  const vectors = BOT_PROFILES.filter((p) => ['viktor', 'jungleman', 'dwan'].includes(p.id)).map(
    (p) => p.axes.join(','),
  );
  assert.equal(new Set(vectors).size, 3);
});
test('cheap unraised suited broadway is not discarded by multiway random equity; large raises retain checks', () => {
  const v = {
    id: 1,
    hole: cards('Qs Js'),
    board: [],
    street: 0,
    position: 'UTG',
    count: 6,
    stack: 5000,
    bet: 0,
    pot: 75,
    currentBet: 50,
    difficulty: 'normal',
    rivals: 5,
    equity: 0.05,
    contestable: 125,
    history: [],
    features: { draw: false, wet: false },
    playsBoard: false,
    legal: {
      enabled: true,
      canCheck: false,
      canRaise: true,
      toCall: 50,
      callAmount: 50,
      minRaiseTo: 100,
      maxRaiseTo: 5000,
    },
  };
  for (let seed = 0; seed < 100; seed++) {
    const d = chooseBotAction(v, BOT_PROFILES[0], freshBotMood(), 'off', seeded(seed + 7));
    assert.notEqual(d.action, 'fold');
    assert.equal(d.trace.cheapRangePassed, true);
    assert.ok(!d.trace.checks.some((c) => c.code === 'insufficient-equity'));
  }
  const large = {
    ...v,
    currentBet: 5000,
    pot: 5000,
    contestable: 10000,
    history: [{ id: 0, street: 0, action: 'raise', amount: 5000 }],
    legal: { ...v.legal, canRaise: false, toCall: 5000, callAmount: 5000 },
  };
  const d = chooseBotAction(large, BOT_PROFILES[0], freshBotMood(), 'off', () => 0.9);
  assert.equal(d.action, 'fold');
  assert.equal(d.trace.cheapRangePassed, false);
});

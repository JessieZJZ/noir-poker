import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botThinkingTime, BOT_THINK_LIMITS } from '../../src/engine/bot-timing.js';
import {
  newGame,
  startHand,
  botDecision,
  planBotTurn,
  executeBotTurn,
  isBotTurnCurrent,
  act,
  restartHand,
  playBotTurn,
} from '../../src/engine/poker.js';
import { riverShoveResponse } from '../fixtures/all-in-decisions.js';
const copy = (v) => structuredClone(v);
function seeded(seed) {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function sample() {
  return {
    bigBlind: 50,
    chipUnit: 25,
    action: 'call',
    trace: {
      equity: 0.6,
      odds: 0.1,
      callTolerance: 0,
      percentile: 0.05,
      range: 0.45,
      axes: [50, 50, 40, 50, 20],
      mode: 'off',
      mood: { kind: 'steady' },
      reason: 'price-continue',
      cheapEntry: false,
      admitted: true,
      view: {
        id: 1,
        street: 0,
        position: 'BTN',
        rivals: 1,
        stack: 5000,
        bet: 0,
        pot: 100,
        currentBet: 50,
        contestable: 150,
        board: [],
        history: [],
        features: { wet: false, draw: false, overpair: false },
        opponents: [{ id: 2, stack: 5000, bet: 50, allin: false }],
        legal: { toCall: 50, callAmount: 50 },
      },
    },
  };
}
test('timing responds to decision closeness, own draws, board texture, action line, position and commitment', () => {
  const base = sample(),
    estimate = (d) => botThinkingTime(d, () => 0.5);
  const boundary = copy(base);
  boundary.trace.equity = 0.12;
  assert.ok(estimate(boundary).durationMs > estimate(base).durationMs);
  const draw = copy(base);
  draw.trace.view.features = { wet: true, draw: true, overpair: true };
  draw.trace.view.board = [
    { rank: 8, suit: 0 },
    { rank: 9, suit: 0 },
    { rank: 10, suit: 1 },
  ];
  assert.ok(estimate(draw).durationMs > estimate(base).durationMs);
  const line = copy(base);
  line.trace.view.history = [
    { id: 2, street: 0, action: 'raise' },
    { id: 2, street: 1, action: 'check' },
    { id: 2, street: 1, action: 'raise' },
  ];
  line.trace.view.street = 1;
  assert.ok(estimate(line).factors.route > 0.6);
  const position = copy(base);
  position.trace.view.position = 'SB';
  position.trace.view.rivals = 5;
  assert.ok(estimate(position).durationMs > estimate(base).durationMs);
  const pressure = copy(base);
  pressure.trace.view.legal = { toCall: 4000, callAmount: 4000 };
  assert.ok(estimate(pressure).factors.commitment > estimate(base).factors.commitment);
});
test('a re-raise after the actors own raise adds route complexity and relative position follows surviving action order', () => {
  const d = sample();
  d.trace.view.street = 1;
  d.trace.view.history = [{ id: 2, street: 1, action: 'raise' }];
  const withoutOwnRaise = botThinkingTime(d, () => 0.5);
  d.trace.view.history.unshift({ id: 1, street: 1, action: 'raise' });
  assert.ok(botThinkingTime(d, () => 0.5).factors.route > withoutOwnRaise.factors.route);
  d.trace.view.inPosition = true;
  const inPosition = botThinkingTime(d, () => 0.5);
  d.trace.view.inPosition = false;
  assert.ok(botThinkingTime(d, () => 0.5).durationMs > inPosition.durationMs);
});

test('a short all-in does not collapse the remaining deep opponents effective stack', () => {
  const d = sample();
  d.trace.view.history = [{ id: 2, street: 0, action: 'raise' }];
  d.trace.view.opponents = [
    { id: 2, stack: 0, bet: 50, allin: true },
    { id: 3, stack: 3000, bet: 50, allin: false },
  ];
  assert.equal(botThinkingTime(d, () => 0.5).factors.effectiveStack, 3000);
});
test('all-in timing follows the actual price boundary and pending risk instead of the old opening range', () => {
  const far = sample();
  far.trace.percentile = far.trace.range;
  far.trace.view.allIn = { odds: 0.1, pendingBuffer: 0.04 };
  far.trace.allIn = far.trace.view.allIn;
  assert.equal(botThinkingTime(far, () => 0.5).factors.closeness, 0);
  const shifted = copy(far);
  shifted.trace.percentile = 0.99;
  assert.deepEqual(
    botThinkingTime(shifted, () => 0.5),
    botThinkingTime(far, () => 0.5),
  );
  const close = copy(far);
  close.trace.equity = 0.16;
  assert.equal(botThinkingTime(close, () => 0.5).factors.closeness, 1);
  const noPending = copy(close);
  noPending.trace.view.allIn.pendingBuffer = 0;
  assert.ok(
    botThinkingTime(close, () => 0.5).factors.closeness >
      botThinkingTime(noPending, () => 0.5).factors.closeness,
  );
  assert.ok(
    botThinkingTime(close, () => 0.5).durationMs > botThinkingTime(noPending, () => 0.5).durationMs,
  );
});
test('guaranteed shared-royal defense is not a price guessing problem', () => {
  const decision = botDecision(riverShoveResponse(), seeded(1), { trials: 120 });
  assert.equal(decision.trace.allIn.unbeatableRiver, true);
  assert.ok(decision.trace.allIn.guaranteedReturn >= decision.trace.allIn.cost);
  assert.equal(botThinkingTime(decision, () => 0.5).factors.closeness, 0);
});
test('public-range entry timing follows the executed price gate and response risk', () => {
  const d = sample();
  d.trace.affordableRangePassed = true;
  d.trace.assumedOpponents = 1;
  d.trace.requiredEquity = 0.165;
  d.trace.responseRisk = 0.045;
  d.trace.equity = 0.165;
  d.trace.view.publicEquity = { model: 'public-action-ranges', assumedOpponentIds: [2] };
  d.trace.view.actionContext = { pendingResponseCount: 5, priorActedResponseCount: 1 };
  const close = botThinkingTime(d, () => 0.5);
  assert.equal(close.factors.priceCloseness, 1);
  assert.equal(close.factors.requiredEquity, 0.165);
  assert.equal(close.factors.multiway, 0, 'Five waiting seats are not five confirmed opponents');
  const far = copy(d);
  far.trace.equity = 0.55;
  far.trace.view.actionContext = { pendingResponseCount: 0, priorActedResponseCount: 0 };
  const easy = botThinkingTime(far, () => 0.5);
  assert.equal(easy.factors.priceCloseness, 0);
  assert.equal(easy.factors.routine, true);
  assert.ok(close.durationMs > easy.durationMs + 1000);
  assert.ok(close.factors.responses > easy.factors.responses);
});
test('priced draws use the actual outs gate and clear range folds ignore unrelated equity', () => {
  const d = sample();
  Object.assign(d.trace, { drawContinue: true, drawChance: 0.105, equity: 0.7 });
  d.trace.view.street = 1;
  d.trace.view.features = { draw: true, wet: true };
  const close = botThinkingTime(d, () => 0.5);
  assert.ok(close.factors.drawCloseness > 0.95);
  assert.equal(close.factors.priceCloseness, 0);
  d.trace.drawChance = 0.3;
  assert.ok(botThinkingTime(d, () => 0.5).durationMs < close.durationMs);
  const fold = sample();
  fold.action = 'fold';
  Object.assign(fold.trace, { reason: 'outside-range', percentile: 0.99, equity: 0.12 });
  assert.equal(botThinkingTime(fold, () => 0.5).factors.closeness, 0);
  assert.equal(botThinkingTime(fold, () => 0.5).factors.routine, true);
});
test('current bot decisions supply the same required equity and remain scale invariant', () => {
  const game = newGame(9);
  startHand(game);
  const decision = botDecision(game, seeded(178));
  const pacing = botThinkingTime(decision, seeded(44));
  assert.equal(pacing.model, 'policy-pacing-v2');
  assert.equal(pacing.factors.requiredEquity, decision.trace.requiredEquity);
  const scaled = copy(decision),
    v = scaled.trace.view;
  for (const key of [
    'stack',
    'bet',
    'total',
    'pot',
    'currentBet',
    'contestable',
    'bigBlind',
    'chipUnit',
  ])
    if (Number.isFinite(v[key])) v[key] *= 10;
  for (const key of ['toCall', 'callAmount', 'minRaiseTo', 'maxRaiseTo', 'chipUnit'])
    if (Number.isFinite(v.legal[key])) v.legal[key] *= 10;
  for (const p of v.opponents) for (const key of ['stack', 'bet', 'total']) p[key] *= 10;
  for (const p of v.callPots) p.amount *= 10;
  for (const key of ['cost', 'contestable', 'refundDelta']) v.callPrice[key] *= 10;
  if (Number.isFinite(scaled.amount)) scaled.amount *= 10;
  const other = botThinkingTime(scaled, seeded(44));
  assert.equal(other.durationMs, pacing.durationMs);
  assert.equal(other.factors.spr, pacing.factors.spr);
});
test('all-in pacing uses effective risk while remaining-stack planning still accounts for the gross call', () => {
  const risk = sample();
  risk.trace.view.legal = { toCall: 500, callAmount: 500 };
  risk.trace.view.allIn = { cost: 500, odds: 0.1, pendingBuffer: 0 };
  risk.trace.allIn = risk.trace.view.allIn;
  const refunded = copy(risk);
  refunded.trace.view.allIn.cost = 0;
  const fullRisk = botThinkingTime(risk, () => 0.5),
    noRisk = botThinkingTime(refunded, () => 0.5);
  assert.ok(noRisk.factors.commitment < fullRisk.factors.commitment);
  assert.equal(fullRisk.factors.effectiveStack, 4500);
  assert.equal(noRisk.factors.effectiveStack, 4500);
});
test('pacing is bounded and varied, with overlapping value, bluff, trap and fold pauses', () => {
  const estimates = [];
  for (const reason of ['value-raise', 'pure-bluff', 'trap', 'outside-range']) {
    const times = [],
      acting = new Set();
    for (let seed = 1; seed <= 150; seed++) {
      const d = sample();
      d.trace.reason = reason;
      d.action = reason === 'trap' ? 'check' : reason === 'outside-range' ? 'fold' : 'raise';
      d.amount = 150;
      const result = botThinkingTime(d, seeded(seed * 2341));
      assert.ok(
        result.durationMs >= BOT_THINK_LIMITS.minimum &&
          result.durationMs <= BOT_THINK_LIMITS.maximum,
      );
      times.push(result.durationMs);
      acting.add(result.acting);
    }
    assert.ok(new Set(times).size > 100);
    assert.ok(acting.has('quick') && acting.has('deliberate') && acting.has('neutral'));
    estimates.push({ min: Math.min(...times), max: Math.max(...times) });
  }
  assert.ok(Math.max(...estimates.map((s) => s.min)) < Math.min(...estimates.map((s) => s.max)));
  const d = sample();
  d.trace.mode = 'lively';
  d.trace.mood.kind = 'cautious';
  assert.ok(
    botThinkingTime(d, () => 0.5).durationMs > botThinkingTime(sample(), () => 0.5).durationMs,
  );
  d.trace.mode = 'off';
  assert.deepEqual(
    botThinkingTime(d, () => 0.5),
    botThinkingTime(sample(), () => 0.5),
  );
});
test('planning does not mutate the game and execution reuses its selected action without sampling again', () => {
  const g = newGame(undefined, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  startHand(g);
  const before = copy(g),
    expected = botDecision(g, seeded(42));
  const plan = planBotTurn(g, seeded(42), { timingRandom: seeded(55) });
  assert.deepEqual(g, before);
  assert.deepEqual(Object.keys(plan), ['delayMs']);
  const result = executeBotTurn(g, plan, { waitedMs: plan.delayMs });
  assert.equal(result.action, expected.action);
  assert.equal(result.amount, expected.amount);
  assert.equal(g.botDecisions.length, 1);
  assert.equal(g.history.length, before.history.length + 1);
  assert.equal(g.botDecisions[0].trace.thinking.durationMs, plan.delayMs);
  assert.equal(g.botDecisions[0].trace.thinking.waitedMs, plan.delayMs);
  assert.equal(g.botDecisions[0].trace.thinking.expedited, false);
  assert.throws(() => executeBotTurn(g, plan), /过期/);
});
test('different time randomness leaves the strategy action unchanged and live plans expose no private factors', () => {
  const first = newGame(undefined, {
    smallBlind: 25,
    bigBlind: 50,
    startingStack: 5000,
    chipUnit: 25,
  });
  startHand(first);
  const second = copy(first);
  const p1 = planBotTurn(first, seeded(44), { timingRandom: () => 0.1 });
  const p2 = planBotTurn(second, seeded(44), { timingRandom: () => 0.8 });
  assert.notEqual(p1.delayMs, p2.delayMs);
  const a = executeBotTurn(first, p1),
    b = executeBotTurn(second, p2);
  assert.deepEqual(a, b);
});
test('planning cannot read rival holes, the future deck or final winners', () => {
  const g = newGame(9, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  startHand(g);
  const expected = planBotTurn(g, seeded(76), { timingRandom: seeded(77) });
  for (const p of g.players)
    if (p.id !== g.actor)
      Object.defineProperty(p, 'hole', {
        get: () => {
          throw Error('hidden hole read');
        },
      });
  for (const key of ['deck', 'winners', 'result'])
    Object.defineProperty(g, key, {
      get: () => {
        throw Error(`${key} read`);
      },
    });
  const actual = planBotTurn(g, seeded(76), { timingRandom: seeded(77) });
  assert.equal(actual.delayMs, expected.delayMs);
});
test('plans are rejected after another action, different game, difficulty change or same-hand retry', () => {
  const g = newGame(undefined, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  startHand(g);
  const plan = planBotTurn(g, seeded(90));
  assert.equal(isBotTurnCurrent(copy(g), plan), false);
  g.difficulty = 'hard';
  assert.equal(isBotTurnCurrent(g, plan), false);
  g.difficulty = 'normal';
  act(g, g.actor, 'call');
  assert.equal(isBotTurnCurrent(g, plan), false);
  while (g.phase === 'playing') act(g, g.actor, 'fold');
  restartHand(g);
  assert.equal(isBotTurnCurrent(g, plan), false);
  assert.throws(() => executeBotTurn(g, plan), /过期/);
  assert.equal(g.botDecisions.length, 0);
});
test('instant bot execution records expedited thinking without a timer or duplicated action', () => {
  const g = newGame(undefined, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  startHand(g);
  playBotTurn(g, seeded(88));
  assert.equal(g.botDecisions.length, 1);
  assert.equal(g.botDecisions[0].trace.thinking.expedited, true);
  assert.equal(g.botDecisions[0].trace.thinking.waitedMs, 0);
});

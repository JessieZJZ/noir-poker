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
const copy = (v) => structuredClone(v);
function seeded(seed) {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function sample() {
  return {
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
  const g = newGame();
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
  const first = newGame();
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
  const g = newGame(9);
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
  const g = newGame();
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
  const g = newGame();
  startHand(g);
  playBotTurn(g, seeded(88));
  assert.equal(g.botDecisions.length, 1);
  assert.equal(g.botDecisions[0].trace.thinking.expedited, true);
  assert.equal(g.botDecisions[0].trace.thinking.waitedMs, 0);
});

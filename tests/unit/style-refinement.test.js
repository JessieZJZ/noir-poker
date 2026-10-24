import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseBotAction, getBotProfile, freshBotMood } from '../../src/engine/bot-profiles.js';
import { checkedToPositionProbe, expensiveWeakPair } from '../../src/engine/bot-style.js';
import { deceptiveView } from '../fixtures/deceptive-decisions.js';
const decide = (id, view) =>
  chooseBotAction(view, getBotProfile(id), freshBotMood(), 'off', () => 0.4);

test('balanced and positional first-in ranges raise selected hands rather than widening into automatic limps', () => {
  const late = deceptiveView('Kh Th', '', { equity: 0.4, difficulty: 'normal' });
  for (const id of ['balanced', 'iris']) {
    const decision = decide(id, late);
    assert.equal(decision.action, 'raise');
    assert.equal(decision.amount, 125);
    assert.equal(
      decision.trace.range,
      decision.trace.openingRange * decision.trace.style.controls.unopenedRange,
    );
  }
  const weak = deceptiveView('Jh 4c', '', { equity: 0.15, difficulty: 'normal', position: 'UTG' });
  assert.equal(decide('balanced', weak).action, 'fold');
  const cold = {
    ...late,
    currentBet: 150,
    history: [{ id: 0, street: 0, action: 'raise', amount: 150 }],
    legal: { ...late.legal, toCall: 150, callAmount: 150, minRaiseTo: 250 },
  };
  assert.equal(
    decide('iris', cold).trace.checks.some((r) => r.code === 'first-in'),
    false,
  );
});

test('late isolation needs a playable admitted hand, affordable depth and genuine limpers', () => {
  const view = deceptiveView('Qh Jh', '', {
    equity: 0.4,
    position: 'BTN',
    difficulty: 'normal',
    pot: 125,
    opponents: [{ id: 0, stack: 5000, allin: false }],
    history: [{ id: 0, street: 0, action: 'call', amount: 50 }],
  });
  const d = decide('iris', view);
  assert.equal(d.action, 'raise');
  assert.equal(d.amount, 225);
  assert.ok(d.trace.checks.some((r) => r.code === 'position-isolation'));
  for (const change of [
    { ...view, position: 'UTG' },
    { ...view, stack: 500 },
    { ...view, hole: deceptiveView('Jh 2c').hole },
    { ...view, opponents: [{ id: 0, stack: 0, allin: true }] },
    {
      ...view,
      history: [0, 2, 3].map((id) => ({ id, street: 0, action: 'call', amount: 50 })),
      opponents: [0, 2, 3].map((id) => ({ id, stack: 5000, allin: false })),
    },
  ])
    assert.equal(
      decide('iris', change).trace.checks.some((r) => r.code === 'position-isolation'),
      false,
    );
});

test('a positional probe requires actual checks and cannot turn a showdown pair, draw or threatened board into an air stab', () => {
  const v = deceptiveView('Ks Jh', 'Ac 7d 2h', {
    equity: 0.25,
    difficulty: 'normal',
    history: [{ id: 0, street: 1, action: 'check', amount: 0 }],
  });
  assert.equal(checkedToPositionProbe(v), true);
  const d = decide('iris', v);
  assert.equal(d.action, 'raise');
  assert.equal(d.trace.style.positionProbe, true);
  assert.equal(d.trace.value, false);
  assert.ok(d.trace.sizing.fraction <= 0.5);
  for (const change of [
    { ...v, history: [] },
    { ...v, inPosition: false },
    { ...v, rivals: 3 },
    { ...v, opponents: [{ id: 0, stack: 0, allin: true }] },
    { ...v, features: { ...v.features, ownMade: true } },
    { ...v, features: { ...v.features, draw: true } },
    { ...v, features: { ...v.features, wet: true } },
    { ...v, legal: { ...v.legal, canCheck: false } },
    { ...v, history: [{ id: 0, street: 1, action: 'raise', amount: 100 }] },
  ])
    assert.equal(checkedToPositionProbe(change), false);
});

test('a pocket underpair plus a public pair remains a weak made hand under repeated expensive aggression', () => {
  const v = deceptiveView('8s 8h', 'Qc Td 4h Ts', {
    equity: 0.5,
    stack: 16000,
    total: 4000,
    currentBet: 5000,
    history: [
      { id: 0, street: 1, action: 'raise', amount: 2000 },
      { id: 0, street: 2, action: 'raise', amount: 5000 },
    ],
    legal: {
      enabled: true,
      canCheck: false,
      canRaise: true,
      toCall: 5000,
      callAmount: 5000,
      minRaiseTo: 10000,
      maxRaiseTo: 16000,
    },
  });
  assert.equal(v.features.ownPair, false);
  assert.equal(v.features.strongMade, false);
  assert.equal(expensiveWeakPair(v, 0.5), true);
  assert.equal(decide('balanced', v).action, 'fold');
  assert.equal(expensiveWeakPair({ ...v, legal: { ...v.legal, callAmount: 4000 } }, 0.5), false);
  assert.equal(expensiveWeakPair({ ...v, allIn: { odds: 0.2 } }, 0.5), false);
  assert.equal(expensiveWeakPair({ ...v, features: { ...v.features, draw: true } }, 0.5), false);
  assert.equal(
    expensiveWeakPair({ ...v, features: { ...v.features, strongMade: true } }, 0.5),
    false,
  );
});

test('a checked-to dry-board high card can contest a wide public range without requiring a low equity estimate', () => {
  const v = deceptiveView('Kc Qc', 'Ac 8d 3h', {
    equity: 0.56,
    difficulty: 'hard',
    history: [{ id: 0, street: 1, action: 'check', amount: 0 }],
  });
  assert.equal(v.features.ownMade, false);
  assert.equal(v.features.draw, false);
  assert.equal(checkedToPositionProbe(v), true);
  const d = decide('iris', v);
  assert.equal(d.action, 'raise');
  assert.equal(d.trace.style.positionProbe, true);
  assert.ok(d.trace.sizing.fraction <= 0.5);
  assert.equal(checkedToPositionProbe({ ...v, equity: 0.65 }), false);
  assert.equal(checkedToPositionProbe({ ...v, equity: 0.149 }), false);
  assert.equal(checkedToPositionProbe({ ...v, features: { ...v.features, wet: true } }), false);
});

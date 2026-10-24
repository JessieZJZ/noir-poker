import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseBotAction, getBotProfile, freshBotMood } from '../../src/engine/bot-profiles.js';
import { postflopStyleLine, balancedPriceDefense } from '../../src/engine/bot-style-lines.js';
import { resolveBotStyle } from '../../src/engine/bot-style.js';
import { deceptiveView } from '../fixtures/deceptive-decisions.js';
const decide = (v, id = 'iris', n = 0.4) =>
  chooseBotAction(v, getBotProfile(id), freshBotMood(), 'off', () => n);
const probe = () =>
  deceptiveView('Kc Qc', 'Ac 8d 3h', {
    equity: 0.56,
    history: [{ id: 0, street: 1, action: 'check', amount: 0 }],
  });
const barrel = () =>
  deceptiveView('Qh Jh', 'Kd 7h 2c Th', {
    equity: 0.38,
    history: [
      { id: 1, street: 0, action: 'raise', amount: 125 },
      { id: 0, street: 0, action: 'call', amount: 125 },
      { id: 0, street: 1, action: 'check', amount: 0 },
      { id: 1, street: 1, action: 'raise', amount: 300 },
      { id: 0, street: 1, action: 'call', amount: 300 },
      { id: 0, street: 2, action: 'check', amount: 0 },
    ],
  });

test('selected positional lines are not cancelled by pot-control or a second attack lottery', () => {
  const v = probe();
  for (const n of [0.05, 0.15, 0.4, 0.79]) {
    const d = decide(v, 'iris', n);
    assert.equal(d.action, 'raise');
    assert.equal(d.trace.style.linePlan.kind, 'position-probe');
    assert.equal(d.trace.style.linePlan.selected, true);
    assert.equal(d.trace.style.linePlan.executed, true);
    assert.equal(d.trace.checks.filter((c) => c.code === 'style-line').length, 1);
    assert.equal(
      d.trace.checks.some((c) => ['attack', 'pot-control'].includes(c.code)),
      false,
    );
  }
  const d = decide(v, 'iris', 0.9);
  assert.equal(d.action, 'check');
  assert.equal(d.trace.style.linePlan.selected, false);
});

test('a new turn draw after our actual flop bet can barrel, while unrelated history cannot claim that line', () => {
  const v = barrel(),
    s = resolveBotStyle(getBotProfile('iris'));
  assert.equal(postflopStyleLine(v, s, 0.38).kind, 'position-draw-barrel');
  const d = decide(v);
  assert.equal(d.action, 'raise');
  assert.equal(d.trace.basis.motive, 'semi-bluff');
  for (const change of [
    { ...v, inPosition: false },
    { ...v, history: v.history.filter((a) => a.id !== 1 || a.street !== 1) },
    { ...v, opponents: [{ id: 0, allin: true, stack: 0 }] },
    { ...v, legal: { ...v.legal, canCheck: false } },
    { ...v, rivals: 3 },
  ])
    assert.notEqual(postflopStyleLine(change, s, 0.38)?.kind, 'position-draw-barrel');
  const blank = deceptiveView('Qh Jh', 'Kd 7h 2c 4s', { equity: 0.2, history: v.history });
  assert.notEqual(postflopStyleLine(blank, s, 0.2)?.kind, 'position-draw-barrel');
  assert.equal(postflopStyleLine(blank, s, 0.2)?.kind, 'position-reassess');
  assert.equal(decide(blank).action, 'check');
});

test('selected lines retain real chip budgets, legal raise rights, and cannot force a discretionary shove', () => {
  for (const v of [
    { ...probe(), stack: 100, legal: { ...probe().legal, maxRaiseTo: 100 } },
    { ...probe(), stack: 1000, total: 49000 },
    { ...probe(), legal: { ...probe().legal, canRaise: false } },
  ]) {
    const d = decide(v);
    assert.notEqual(d.action, 'raise');
    if (d.trace.style.linePlan?.selected)
      assert.match(d.trace.style.linePlan.veto, /commitment-limit|risk-budget/);
  }
  for (const unit of [25, 100, 500, 50000]) {
    const v = probe();
    Object.assign(v, { chipUnit: unit, bigBlind: unit * 2, pot: unit * 40, stack: unit * 400 });
    v.legal = { ...v.legal, chipUnit: unit, minRaiseTo: unit * 2, maxRaiseTo: unit * 400 };
    const d = decide(v);
    assert.equal(d.action, 'raise');
    assert.equal(d.amount % unit, 0);
    assert(d.amount >= v.legal.minRaiseTo && d.amount < v.legal.maxRaiseTo);
  }
});

test('balanced lines distinguish routine value, medium protection, showdown control and a priced defense', () => {
  const hist = [
    { id: 1, street: 0, action: 'raise', amount: 125 },
    { id: 0, street: 0, action: 'call', amount: 125 },
    { id: 0, street: 1, action: 'check', amount: 0 },
  ];
  const value = deceptiveView('As Qd', 'Ac 8d 3h', { equity: 0.76, history: hist });
  assert.equal(decide(value, 'balanced').trace.style.linePlan.kind, 'balanced-value');
  assert.equal(decide(value, 'balanced').action, 'raise');
  const oop = { ...value, inPosition: false, history: hist.slice(0, 2) };
  assert.equal(decide(oop, 'balanced').action, 'raise');
  const callerOop = { ...oop, history: [{ id: 0, street: 0, action: 'raise', amount: 125 }] };
  assert.equal(
    postflopStyleLine(callerOop, resolveBotStyle(getBotProfile('balanced')), 0.76),
    null,
  );
  const medium = deceptiveView('Ts Td', 'Ac 8d 3h', { equity: 0.5, history: hist });
  // As the preflop raiser a medium hand takes a small flop protection bet;
  // without the initiative it keeps the hand for showdown.
  assert.equal(decide(medium, 'balanced').trace.style.linePlan.kind, 'balanced-protect');
  assert.equal(decide(medium, 'balanced').action, 'raise');
  const caller = deceptiveView('Ts Td', 'Ac 8d 3h', {
    equity: 0.5,
    history: [
      { id: 0, street: 0, action: 'raise', amount: 125 },
      { id: 1, street: 0, action: 'call', amount: 125 },
      { id: 0, street: 1, action: 'check', amount: 0 },
    ],
  });
  assert.equal(decide(caller, 'balanced').trace.style.linePlan.kind, 'balanced-showdown');
  assert.equal(decide(caller, 'balanced').action, 'check');
  const defend = {
    ...medium,
    currentBet: 100,
    history: [...hist.slice(0, 2), { id: 0, street: 1, action: 'raise', amount: 100 }],
    legal: { ...medium.legal, canCheck: false, toCall: 100, callAmount: 100, minRaiseTo: 200 },
  };
  assert.equal(decide(defend, 'balanced').action, 'call');
  assert.equal(decide(defend, 'balanced').trace.style.linePlan.kind, 'balanced-defense');
  assert.equal(
    balancedPriceDefense(defend, resolveBotStyle(getBotProfile('balanced')), 0.15, 0.2),
    false,
  );
});

test('line helpers never read opposing private cards, future cards, or outcomes', () => {
  const v = probe();
  for (const k of ['deck', 'winner', 'result', 'players'])
    Object.defineProperty(v, k, {
      get() {
        throw Error('hidden ' + k);
      },
    });
  Object.defineProperty(v.opponents[0], 'hole', {
    get() {
      throw Error('opposing private hole');
    },
  });
  assert.equal(decide(v).action, 'raise');
  const hard = resolveBotStyle(getBotProfile('iris'));
  for (const change of [
    { ...probe(), difficulty: 'easy' },
    { ...probe(), history: [] },
    { ...probe(), allIn: { odds: 0.2 } },
    { ...probe(), playsBoard: true },
  ])
    assert.equal(postflopStyleLine(change, hard, 0.56), null);
});

test('a strong short-SPR value hand retains the original commitment option instead of a forced check', () => {
  const v = deceptiveView('As Ah', 'Ac 8d 3h', {
    equity: 0.95,
    stack: 100,
    history: [
      { id: 1, street: 0, action: 'raise', amount: 125 },
      { id: 0, street: 0, action: 'call', amount: 125 },
      { id: 0, street: 1, action: 'check', amount: 0 },
    ],
  });
  v.legal = { ...v.legal, maxRaiseTo: 100 };
  const d = decide(v, 'balanced');
  assert.equal(d.action, 'raise');
  assert.equal(d.amount, 100);
  assert.equal(d.trace.style.linePlan.veto, 'commitment-limit');
  assert.equal(d.trace.basis.motive, 'value');
});

test('position draws and existing supported value seek one coherent response to actual checks', () => {
  const hist = [{ id: 0, street: 1, action: 'check', amount: 0 }];
  const draw = deceptiveView('Qh Jh', 'Kd 7h 2h', { equity: 0.35, history: hist });
  const d = decide(draw);
  assert.equal(d.action, 'raise');
  assert.equal(d.trace.style.linePlan.kind, 'position-draw-pressure');
  assert.equal(d.trace.basis.motive, 'semi-bluff');
  const value = deceptiveView('As Qd', 'Ac 8d 3h', { equity: 0.75, history: hist });
  assert.equal(decide(value).trace.style.linePlan.kind, 'position-value');
  const blocked = { ...draw, opponents: [{ id: 0, stack: 5000, allin: false }], history: [] };
  assert.equal(postflopStyleLine(blocked, resolveBotStyle(getBotProfile('iris')), 0.35), null);
});

test('a small backdoor contest needs a real private improvement path, and never substitutes for an expensive call', () => {
  const v = deceptiveView('Qs Jh', 'Kd 7h 2h', {
    equity: 0.32,
    history: [{ id: 0, street: 1, action: 'check', amount: 0 }],
  });
  assert.equal(decide(v).trace.style.linePlan.kind, 'position-backdoor');
  const empty = deceptiveView('Qs Jc', 'Kd 7h 2h', { equity: 0.32, history: v.history });
  assert.notEqual(
    postflopStyleLine(empty, resolveBotStyle(getBotProfile('iris')), 0.32)?.kind,
    'position-backdoor',
  );
  const facing = {
    ...v,
    legal: { ...v.legal, canCheck: false, toCall: 2500, callAmount: 2500 },
    currentBet: 2500,
  };
  assert.equal(postflopStyleLine(facing, resolveBotStyle(getBotProfile('iris')), 0.32), null);
});

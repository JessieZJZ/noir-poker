import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presetRaiseTo } from '../../src/ui/bet-sizing.js';
import { isChipAmount, legalRaiseTo, roundChips } from '../../src/engine/bet-sizing.js';
import {
  newGame,
  startHand,
  act,
  advanceStreet,
  legalActions,
  potSize,
} from '../../src/engine/poker.js';

const view = (overrides = {}, legalOverrides = {}) => ({
  currentBet: 800,
  pot: 3075,
  ...overrides,
  legal: {
    enabled: true,
    canRaise: true,
    callAmount: 800,
    minRaiseTo: 1600,
    maxRaiseTo: 10000,
    ...legalOverrides,
  },
});

test('pot and half-pot raises include the hypothetical call in the pot fraction', () => {
  assert.equal(presetRaiseTo(view(), 'pot'), 4675);
  assert.equal(presetRaiseTo(view(), 'half'), 2750);
  assert.equal(
    presetRaiseTo(view({ currentBet: 0, pot: 1000 }, { callAmount: 0, minRaiseTo: 50 }), 'pot'),
    1000,
  );
  assert.equal(
    presetRaiseTo(view({ currentBet: 0, pot: 1000 }, { callAmount: 0, minRaiseTo: 50 }), 'half'),
    500,
  );
});

test('existing street contributions are counted once, using the remaining call amount', () => {
  // Hero already has 300 in this street: owes 500 of the current 800.
  assert.equal(presetRaiseTo(view({}, { callAmount: 500 }), 'pot'), 4375);
  assert.equal(presetRaiseTo(view({}, { callAmount: 500 }), 'half'), 2600);
});

test('fraction shortcuts round to whole 25 chips, with half chips rounded up', () => {
  const odd = view({ pot: 400, currentBet: 225 }, { callAmount: 225, minRaiseTo: 450 });
  assert.equal(presetRaiseTo(odd, 'pot'), 850);
  assert.equal(presetRaiseTo(odd, 'half'), 550);
  assert.equal(
    presetRaiseTo(view({ pot: 400, currentBet: 0 }, { callAmount: 0, minRaiseTo: 50 }), 'half'),
    200,
  );
});

test('chip quantization uses nearest denominations without escaping legal bounds', () => {
  assert.equal(roundChips(656), 650);
  assert.equal(roundChips(312.5), 325);
  const legal = { minRaiseTo: 651, maxRaiseTo: 999 };
  assert.equal(legalRaiseTo(656, legal), 675);
  assert.equal(legalRaiseTo(1000, legal), 975);
  assert.throws(() => legalRaiseTo(656, { minRaiseTo: 651, maxRaiseTo: 674 }));
  for (const amount of [-25, 1, 24, 26, 656, 312.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])
    assert.equal(isChipAmount(amount), false);
});

test('off-grid raises and invalid starting balances are rejected before state writes', () => {
  const g = newGame(6);
  startHand(g);
  for (const amount of [101, 656, 312.5, NaN, Infinity]) {
    const before = JSON.stringify(g);
    assert.throws(() => act(g, g.actor, 'raise', amount), /25/);
    assert.equal(JSON.stringify(g), before);
  }
  act(g, g.actor, 'raise', 650);
  assert.equal(legalActions(g).callAmount, 650);
  act(g, g.actor, 'call');
  assert.equal(g.players[4].total, 650);
  const idle = newGame(6);
  idle.players[3].stack = 3894;
  const before = JSON.stringify(idle);
  assert.throws(() => startHand(idle), /25/);
  assert.equal(JSON.stringify(idle), before);
});

test('ordinary re-raises use the last full increment, and shortcuts obey that minimum', () => {
  const g = newGame(6);
  startHand(g, () => 0.5);
  act(g, g.actor, 'raise', 150); // BB 50 -> 150: a full increment of 100.
  assert.equal(legalActions(g).fullRaiseTo, 250);
  act(g, g.actor, 'raise', 350); // 150 -> 350: a full increment of 200.
  const legal = legalActions(g);
  assert.equal(legal.fullRaiseTo, 550); // Not double the total 350.
  assert.equal(presetRaiseTo({ currentBet: 350, pot: potSize(g), legal }, 'min'), 550);
  const before = g.players.reduce((sum, p) => sum + p.stack, 0) + potSize(g);
  assert.throws(() => act(g, g.actor, 'raise', 549), /合法/);
  act(g, g.actor, 'raise', 550);
  assert.equal(g.players.reduce((sum, p) => sum + p.stack, 0) + potSize(g), before);
});

test('presets retain exact engine limits for minimum raises, stack caps and short all-ins', () => {
  assert.equal(presetRaiseTo(view({ pot: 100 }, { minRaiseTo: 1600 }), 'half'), 1600);
  assert.equal(presetRaiseTo(view({}, { maxRaiseTo: 2325 }), 'pot'), 2325);
  for (const preset of ['min', 'half', 'pot', 'all'])
    assert.equal(presetRaiseTo(view({}, { minRaiseTo: 1100, maxRaiseTo: 1100 }), preset), 1100);
  assert.equal(presetRaiseTo(view(), 'min'), 1600);
  assert.equal(presetRaiseTo(view(), 'all'), 10000);
  for (const preset of ['min', 'half', 'pot', 'all']) {
    assert.equal(presetRaiseTo(view({}, { canRaise: false }), preset), null);
    assert.equal(presetRaiseTo(view({}, { enabled: false }), preset), null);
  }
  assert.equal(presetRaiseTo(view(), 'unknown'), null);
});

test('a real turn pot of 3075 facing 800 produces legal targets and conserves every chip', () => {
  for (const preset of ['half', 'pot']) {
    const g = newGame(6);
    g.dealer = 5;
    g.players[0].stack = 5025;
    const wealth = g.players.reduce((n, p) => n + p.stack, 0);
    startHand(g, () => 0.5);
    act(g, 3, 'raise', 350);
    for (const id of [4, 5, 0]) act(g, id, 'call');
    for (const id of [1, 2]) act(g, id, 'fold');
    advanceStreet(g);
    while (g.phase === 'playing') act(g, g.actor, 'check');
    advanceStreet(g);
    act(g, 3, 'raise', 800);
    act(g, 4, 'call');
    act(g, 5, 'fold');
    assert.equal(potSize(g), 3075);
    const legal = legalActions(g, 0),
      amount = presetRaiseTo({ currentBet: g.currentBet, pot: potSize(g), legal }, preset);
    assert.equal(legal.callAmount, 800);
    assert.equal(amount, preset === 'pot' ? 4675 : 2750);
    act(g, 0, 'raise', amount);
    assert.equal(g.players[0].bet, amount);
    assert.equal(g.players.reduce((n, p) => n + p.stack, 0) + potSize(g), wealth);
    while (g.phase !== 'done') {
      if (g.phase === 'between') advanceStreet(g);
      else act(g, g.actor, legalActions(g).canCheck ? 'check' : 'call');
    }
    assert.equal(
      g.players.reduce((n, p) => n + p.stack, 0),
      wealth,
    );
  }
});

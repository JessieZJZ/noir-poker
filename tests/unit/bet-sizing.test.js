import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presetRaiseTo } from '../../src/ui/bet-sizing.js';
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

test('presets retain exact engine limits for minimum raises, stack caps and short all-ins', () => {
  assert.equal(presetRaiseTo(view({ pot: 100 }, { minRaiseTo: 1600 }), 'half'), 1600);
  assert.equal(presetRaiseTo(view({}, { maxRaiseTo: 2321 }), 'pot'), 2321);
  for (const preset of ['min', 'half', 'pot', 'all'])
    assert.equal(presetRaiseTo(view({}, { minRaiseTo: 1107, maxRaiseTo: 1107 }), preset), 1107);
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

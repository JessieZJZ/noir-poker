import test from 'node:test';
import assert from 'node:assert/strict';
import { botDecision } from '../../src/engine/poker.js';
import { publicComboWeight } from '../../src/engine/public-ranges.js';
import { BOT_PROFILES } from '../../src/engine/bot-profiles.js';
import { cards } from '../fixtures/deceptive-decisions.js';
import { buttonIsolation, cutoffOvercall, lateColdShove } from '../fixtures/preflop-pressure.js';
import {
  allInRandom,
  finishAfterResponse,
  riverShoveResponse,
} from '../fixtures/all-in-decisions.js';

test('real nine-seat AQ defends a small isolation across styles and lively moods', () => {
  for (const profile of BOT_PROFILES)
    for (const kind of ['steady', 'frustrated', 'cautious', 'confident', 'reactive']) {
      const game = buttonIsolation();
      game.players[1].botProfile = profile.id;
      game.players[1].botMood.kind = kind;
      const d = botDecision(game, allInRandom(17));
      assert.notEqual(d.action, 'fold', `${profile.id}/${kind}`);
      assert.equal(d.trace.affordableRangePassed, true);
      assert.equal(d.trace.assumedOpponents, 3);
    }
});

test('a priced late overcall uses a bounded entry range instead of requiring all callers to reach showdown', () => {
  for (let seed = 1; seed <= 24; seed++) {
    const game = cutoffOvercall();
    const d = botDecision(game, allInRandom(seed));
    assert.notEqual(d.action, 'fold');
    assert.equal(d.trace.affordableOpen, true);
    assert.equal(d.trace.entryContext.openCallers, 3);
    assert.equal(d.trace.view.publicEquity.assumedOpponentIds.length, 4);
  }
  const garbage = botDecision(cutoffOvercall('7s 2h'), allInRandom(17));
  assert.equal(garbage.action, 'fold');
});

test('large single opens and all-ins do not inherit the cheap entry exemption', () => {
  for (const size of [6, 16.5, 40]) {
    const d = botDecision(buttonIsolation('As Qc', size), allInRandom(17));
    assert.equal(d.trace.affordableOpen, false);
    assert.equal(d.trace.affordableRangePassed, false);
  }
  const jam = botDecision(lateColdShove('8s 8c', 7), allInRandom(17));
  assert.equal(jam.trace.affordableRangePassed, false);
  assert.equal(jam.trace.requiredEquity, jam.trace.odds + jam.trace.allIn.pendingBuffer);
});

test('the current preflop call prices only paid layers while retaining the full-field estimate', () => {
  const d = botDecision(buttonIsolation('As Qc', 16.5), allInRandom(17));
  const view = d.trace.view;
  assert.ok(view.publicEquity.priceEquity > view.publicEquity.equity);
  assert.equal(view.equity, view.publicEquity.priceEquity);
  const upper = view.callPots.at(-1);
  assert.deepEqual(upper.eligible, [1, 6]);
  assert.ok(view.equityPots.at(-1).eligible.includes(2));
  const matched = botDecision(cutoffOvercall('As Qc'), allInRandom(17)).trace.view;
  assert.equal(matched.publicEquity.priceEquity, matched.publicEquity.equity);
});

test('AQ can defend an oversized button isolation without requiring the other limpers to call', () => {
  let continues = 0;
  for (let seed = 1; seed <= 32; seed++) {
    const d = botDecision(buttonIsolation('As Qc', 16.5), allInRandom(seed));
    if (d.action !== 'fold') continues++;
    assert.equal(d.trace.affordableOpen, false);
  }
  assert.ok(continues >= 28, `AQ continued ${continues}/32`);
});

test('medium-depth open-shove prior contains more medium hands than deep multiple-raise commitment', () => {
  const base = {
    allIn: true,
    street: 0,
    role: 'shover',
    position: 'UTG',
    line: 'cold-shove',
    depthBB: 46,
  };
  for (const hand of ['8s 8c', 'As Jh', 'Ks Qs']) {
    const mid = publicComboWeight(cards(hand), base);
    const deep = publicComboWeight(cards(hand), { ...base, depthBB: 100 });
    const reraised = publicComboWeight(cards(hand), { ...base, line: 'multi-raise-shove' });
    assert.ok(mid > deep && mid > reraised, hand);
  }
  assert.ok(publicComboWeight(cards('As Ah'), base) > publicComboWeight(cards('7s 2h'), base));
});

test('AK usually defends the reconstructed 46 BB open shove without making 88 a mandatory stack-off', () => {
  let akCalls = 0,
    pairFolds = 0;
  for (let seed = 1; seed <= 32; seed++) {
    const ak = botDecision(lateColdShove(), allInRandom(seed));
    const pair = botDecision(lateColdShove('8s 8c', 7), allInRandom(seed));
    if (ak.action === 'call') akCalls++;
    if (pair.action === 'fold') pairFolds++;
    assert.equal(ak.trace.trials, 512);
  }
  assert.ok(akCalls > 16, `AK continued ${akCalls}/32`);
  assert.ok(pairFolds > 0, '88 still has a price-sensitive fold branch');
});

test('A6 full house on AA246 defends a real river shove rather than folding a starting-hand label', () => {
  const game = riverShoveResponse('Ac 6s', '2c As 4c Ah 6c');
  const d = botDecision(game, allInRandom(17));
  assert.equal(d.action, 'call');
  assert.equal(d.trace.view.features.strongMade, true);
  finishAfterResponse(game, d);
  assert.equal(game.phase, 'done');
});

test('new real policy paths ignore hidden opponent holes and conserve variable-stakes chips', () => {
  for (const smallBlind of [25, 100, 300, 50000]) {
    const game = cutoffOvercall('7s 6s', { smallBlind });
    const wealth = game.players.reduce((sum, p) => sum + p.stack + p.total, 0);
    const d = botDecision(game, allInRandom(17));
    const hidden = structuredClone(game);
    for (const p of hidden.players.filter((p) => p.id !== hidden.actor))
      Object.defineProperty(p, 'hole', {
        get() {
          throw Error('Hidden opponent cards read');
        },
      });
    Object.defineProperty(hidden, 'deck', {
      get() {
        throw Error('Future deck read');
      },
    });
    assert.deepEqual(botDecision(hidden, allInRandom(17)), d);
    finishAfterResponse(game, d);
    assert.equal(
      game.players.reduce((sum, p) => sum + p.stack, 0),
      wealth,
    );
    assert.ok(game.players.every((p) => p.stack % smallBlind === 0));
  }
});

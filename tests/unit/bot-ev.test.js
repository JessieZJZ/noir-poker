import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../../src/engine/poker.js';
import { PROBE_FRACTION, ONE_PAIR_FRACTION } from '../../src/engine/bot-ev.js';
import { stakesFromSmallBlind } from '../../src/engine/stakes.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { postflopSpot, card, decisions, seeded } from '../fixtures/postflop-ev.js';

const count = (list, predicate) => list.filter(predicate).length;
const explain = (g, d) =>
  explainOpponent({
    id: g.actor,
    name: g.players[g.actor].name,
    action: d.action,
    amount: d.amount,
    trace: d.trace,
  });
const topPair = [card(13, 0), card(7, 1)];
const twoPair = [card(13, 0), card(9, 1)];

test('a checked-to top pair bets on the button and from the first seat', () => {
  for (const difficulty of ['normal', 'hard']) {
    // The reported hand: K7 on the button, checked to four ways on K♦ 5♦ 9♣.
    const button = decisions(() => postflopSpot({ difficulty }));
    const first = decisions(() => postflopSpot({ difficulty, holes: { 4: topPair }, flop: [] }));
    for (const list of [button, first]) {
      assert.ok(count(list, (d) => d.action === 'raise') >= 45, difficulty);
      for (const d of list.filter((d) => d.action === 'raise')) {
        assert.equal(d.trace.reason, 'value-raise');
        assert.equal(d.trace.style.linePlan.kind, 'ev-choice');
        // Four players: one pair stays at a quarter of the pot.
        assert.ok(d.trace.sizing.fraction <= ONE_PAIR_FRACTION.many);
      }
    }
  }
});

test('a middle pair first to act sometimes probes small and the review explains why', () => {
  const make = () => postflopSpot({ holes: { 4: [card(9, 0), card(8, 0)] }, flop: [] });
  const list = decisions(make);
  const probes = list.filter((d) => d.trace.reason === 'probe-bet');
  assert.ok(probes.length >= 3 && probes.length <= 30, `${probes.length}`);
  for (const d of probes) assert.ok(d.trace.sizing.fraction <= PROBE_FRACTION);
  assert.ok(count(list, (d) => d.action === 'check') >= 30);
  const review = explain(make(), probes[0]);
  assert.equal(review.title, '先行动小注试探');
  assert.match(review.detail, /这是试探注：.*先行动.*后位若加注/);
  assert.doesNotMatch(review.detail, /；/);
});

test('two pair raises a heads-up bet and check-raises, and the review names the check-raise', () => {
  const facing = decisions(() =>
    postflopSpot({
      holes: { 1: twoPair },
      flop: [
        [4, 'raise', 1200],
        [8, 'fold'],
        [0, 'fold'],
      ],
    }),
  );
  assert.ok(count(facing, (d) => d.action === 'raise') >= 40);
  const make = () =>
    postflopSpot({
      holes: { 4: twoPair },
      flop: [
        [4, 'check'],
        [8, 'fold'],
        [0, 'fold'],
        [1, 'raise', 1200],
      ],
    });
  const raised = decisions(make).filter((d) => d.trace.reason === 'check-raise');
  assert.ok(raised.length >= 40);
  assert.equal(raised[0].trace.style.linePlan.kind, 'check-raise-value');
  const review = explain(make(), raised[0]);
  assert.equal(review.title, '过牌后再加注');
  assert.match(review.detail, /这是过牌加注：.*先过牌，等对手下注后/);
  assert.doesNotMatch(review.detail, /；/);
});

test('safety limits: air never raises a bet, one pair never raises a multiway bet, no EV all-in', () => {
  const air = decisions(() =>
    postflopSpot({
      holes: { 1: [card(3, 0), card(2, 1)] },
      flop: [
        [4, 'raise', 1200],
        [8, 'fold'],
        [0, 'fold'],
      ],
    }),
  );
  assert.equal(
    count(air, (d) => d.action === 'raise'),
    0,
  );
  const multiway = decisions(() =>
    postflopSpot({
      holes: { 1: topPair },
      flop: [
        [4, 'raise', 1200],
        [8, 'call'],
        [0, 'fold'],
      ],
    }),
  );
  assert.equal(
    count(multiway, (d) => d.action === 'raise'),
    0,
  );
  for (const d of [...air, ...multiway]) {
    const plan = d.trace.style.linePlan;
    if (plan?.kind === 'ev-choice')
      for (const o of plan.options) assert.ok(o.amount < d.trace.view.legal.maxRaiseTo);
  }
});

test('estimated-value bets keep whole chips and conserve the table at both stake boundaries', () => {
  for (const smallBlind of [25, 50000]) {
    const random = seeded(smallBlind + 3);
    const g = engine.newGame(6, stakesFromSmallBlind(smallBlind));
    g.difficulty = 'normal';
    g.emotionMode = 'off';
    g.risingBlinds = false;
    const total = g.players.reduce((sum, p) => sum + p.stack, 0);
    let evRaises = 0;
    for (let hand = 0; hand < 25 && !g.over && !engine.needsHeroRebuy(g); hand++) {
      engine.startHand(g);
      while (g.phase !== 'done') {
        if (g.phase === 'between') engine.advanceStreet(g);
        else {
          const d = engine.botDecision(g, random, { trials: 8 });
          if (d.action === 'raise') {
            assert.equal(d.amount % g.chipUnit, 0);
            if (d.trace.style.linePlan?.source === undefined && d.trace.style.linePlan?.options)
              evRaises++;
          }
          engine.act(g, g.actor, d.action, d.amount);
        }
      }
      assert.equal(
        g.players.reduce((sum, p) => sum + p.stack, 0),
        total,
      );
      for (const p of g.players) assert.equal(p.stack % g.chipUnit, 0);
    }
    assert.ok(evRaises > 0, 'the estimated-value step chose some bets');
  }
});

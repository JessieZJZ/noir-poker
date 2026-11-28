import test from 'node:test';
import assert from 'node:assert/strict';
import { act, botDecision, deckOfCards, newGame, startHand } from '../../src/engine/poker.js';
import { BOT_PROFILES } from '../../src/engine/bot-profiles.js';
import { explainOpponent } from '../../src/review/opponents.js';

// Facing a 3-bet, stacks decide what is small, chips behind pay for hands
// that hit big, an opener without room to play moves in or folds, and deep
// openers sometimes 4-bet suited wheel aces. Hands are played on the engine.

const card = (key) =>
  deckOfCards().find(
    (c) => c.rank === '23456789TJQKA'.indexOf(key[0]) + 2 && c.suit === 'shcd'.indexOf(key[1]),
  );
const seeded = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function play({ count, dealer, stacks, holes, script, difficulty = 'normal' }) {
  const g = newGame(count, { smallBlind: 100, bigBlind: 200, startingStack: 20000, chipUnit: 100 });
  Object.assign(g, { risingBlinds: false, difficulty, emotionMode: 'off', dealer });
  if (stacks) g.players.forEach((p, i) => (p.stack = stacks[i] ?? p.stack));
  startHand(g);
  const given = new Map(Object.entries(holes).map(([id, text]) => [Number(id), text]));
  const used = new Set([...given.values()].flatMap((text) => text.split(' ')));
  const spare = deckOfCards().filter(
    (c) => !used.has('23456789TJQKA'[c.rank - 2] + 'shcd'[c.suit]),
  );
  g.players.forEach((p) => {
    p.hole = given.has(p.id) ? given.get(p.id).split(' ').map(card) : spare.splice(0, 2);
  });
  for (const [id, action, amount] of script) {
    assert.equal(g.actor, id, `seat ${id} acts`);
    act(g, id, action, amount);
  }
  return g;
}
const decide = (g, seed = 1) =>
  botDecision(structuredClone(g), seeded(seed * 7919 + 13), { trials: 40 });
const outcomes = (g, seeds = 60) => {
  const counts = {};
  for (let seed = 1; seed <= seeds; seed++) {
    const d = decide(g, seed);
    const key =
      d.action === 'raise' && d.amount >= d.trace.view.legal.maxRaiseTo ? 'all-in' : d.action;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
};

// The reported hand: nine seats, Alex on the button. Luna folds, Theo and
// Jade limp, Leo (about 20BB) opens to 900 and the hero 3-bets to 1.6K.
// Seats: 0 hero (HJ), 1 Mia, 2 Alex (BTN), 3 River, 4 Kai, 5 Luna, 6 Theo,
// 7 Jade, 8 Leo (LJ).
const reported = (upTo) =>
  play({
    count: 9,
    dealer: 1,
    stacks: [38400, 19900, 18800, 20000, 20000, 20000, 18800, 20000, 4100],
    holes: {
      0: 'Qh 2h',
      1: '2s 4h',
      2: '6h 6s',
      3: '2d 3s',
      4: '5s 6d',
      5: '3d 8h',
      6: 'Qd 8d',
      7: '4c Ac',
      8: 'Qs As',
    },
    script: [
      [5, 'fold'],
      [6, 'call'],
      [7, 'call'],
      [8, 'raise', 900],
      [0, 'raise', 1600],
      [1, 'fold'],
      [2, 'fold'],
      [3, 'fold'],
      [4, 'fold'],
      [6, 'fold'],
      [7, 'fold'],
    ].slice(0, upTo),
  });

test('a minimum 3-bet over limpers is cheap for deep stacks: 66 calls, A4s often, Q8s folds', () => {
  // Alex: 1.6K is 8BB but under a tenth of his 18.8K, at a third of the pot.
  const alex = reported(6);
  assert.equal(alex.actor, 2);
  const first = decide(alex);
  assert.equal(first.trace.affordableThreeBet, true);
  assert.deepEqual(outcomes(alex), { call: 60 });
  assert.equal(first.trace.reason, 'small-reraise-continue');
  const review = explainOpponent({ action: 'call', trace: first.trace, name: 'Alex' });
  assert.match(review.detail, /小尺度 3-bet 防守/);
  assert.match(review.detail, /暗三条/);
  // Theo limped Q8s: dominated and out of position, it still folds.
  const theo = reported(9);
  assert.equal(theo.actor, 6);
  assert.deepEqual(outcomes(theo, 30), { fold: 30 });
  // Jade limped A4s with 18.4K behind a 1.4K call (13 calls): a suited ace
  // calls at 0.75 x 0.85 out of position.
  const jade = reported(10);
  assert.equal(jade.actor, 7);
  const trace = decide(jade).trace;
  assert.equal(trace.impliedThreeBet.class, 'suited-ace');
  assert.equal(trace.impliedThreeBet.depthWeight, 1);
  assert.ok(Math.abs(trace.impliedThreeBet.rate - 0.6375) < 1e-9);
  const jadeCalls = outcomes(jade, 120).call;
  assert.ok(jadeCalls >= 55 && jadeCalls <= 100, String(jadeCalls));
});

test('an opener 3-bet at about 20BB moves AQs all-in instead of flat-calling', () => {
  const leo = reported(11);
  assert.equal(leo.actor, 8);
  const d = decide(leo);
  assert.equal(d.action, 'raise');
  assert.equal(d.amount, d.trace.view.legal.maxRaiseTo);
  assert.equal(d.trace.reason, 'short-reshove');
  assert.equal(d.trace.pushFold.reopened, true);
  assert.equal(Math.round(d.trace.pushFold.depthBB), 21);
  assert.deepEqual(outcomes(leo, 30), { 'all-in': 30 });
  const review = explainOpponent({
    action: 'raise',
    amount: d.amount,
    trace: d.trace,
    name: 'Leo',
  });
  assert.match(review.detail, /有效筹码只剩约 21 个大盲/);
  assert.match(review.detail, /直接全下/);
});

// Six seats: seat 0 BTN, 1 SB, 2 BB, 3 UTG, 4 HJ, 5 CO.
const openerSpot = ({ bb = 100, hole, threeBet = 1300, difficulty = 'normal' }) =>
  play({
    count: 6,
    dealer: 5,
    difficulty,
    stacks: Array(6).fill(bb * 200),
    holes: { 5: hole },
    script: [
      [3, 'fold'],
      [4, 'fold'],
      [5, 'raise', 500],
      [0, 'raise', threeBet],
      [1, 'fold'],
      [2, 'fold'],
    ],
  });

test('the committed opener jams a range that narrows from 20BB to 40BB; other hands decide on price', () => {
  // 20BB: a flat call keeps no fold equity, so the range moves all-in.
  for (const hole of ['Jd Ah', '9c 9d', 'Kh Qh', 'Qs Qd'])
    assert.deepEqual(outcomes(openerSpot({ bb: 20, hole }), 20), { 'all-in': 20 }, hole);
  // Hands outside it are not forced out: they take the normal decision.
  for (const hole of ['7s 6s', 'Jh Kh']) {
    const d = decide(openerSpot({ bb: 20, hole }));
    assert.equal(d.trace.pushFold, null, hole);
    assert.notEqual(d.trace.reason, 'short-reshove', hole);
  }
  // 30BB: the hands between the two ranges move in half the time and
  // otherwise call, since the call still leaves room (SPR 1.6).
  const mixed = outcomes(openerSpot({ bb: 30, hole: 'Jd Ah' }), 120);
  assert.ok(mixed['all-in'] >= 40 && mixed['all-in'] <= 80, JSON.stringify(mixed));
  assert.equal(mixed['all-in'] + mixed.call, 120);
  // 40BB: TT+ and AQ+ move in; 99, KQs and AJo call the small 3-bet as before.
  assert.deepEqual(outcomes(openerSpot({ bb: 40, hole: 'Qs Qd' }), 20), { 'all-in': 20 });
  for (const hole of ['Jd Ah', '9c 9d', 'Kh Qh']) {
    const d = decide(openerSpot({ bb: 40, hole }));
    assert.deepEqual([d.action, d.trace.reason], ['call', 'small-reraise-continue'], hole);
  }
  // Deeper, a large 3-bet that leaves less than 1.5 pots behind a call.
  const big = (hole) => openerSpot({ bb: 60, hole, threeBet: 3600 });
  const queens = decide(big('Qs Qd'));
  assert.deepEqual([queens.action, queens.trace.reason], ['raise', 'value-raise']);
  assert.equal(queens.amount, queens.trace.view.legal.maxRaiseTo);
  const ajo = decide(big('Jd Ah'));
  assert.equal(ajo.trace.committedOpen, null);
  assert.ok(!(ajo.action === 'raise' && ajo.amount === ajo.trace.view.legal.maxRaiseTo));
  // Easy opponents keep their plain decisions.
  assert.equal(
    decide(openerSpot({ bb: 20, hole: 'Jd Ah', difficulty: 'easy' })).trace.pushFold,
    null,
  );
});

// UTG limps, the HJ opens to 900, the CO 3-bets to 1.6K: the button cold.
const coldSpot = ({ stack = 20000, hole, seat = 0 }) =>
  play({
    count: 6,
    dealer: 5,
    stacks: Array(6).fill(stack),
    holes: { [seat]: hole },
    script: [
      [3, 'call'],
      [4, 'raise', 900],
      [5, 'raise', 1600],
      ...(seat === 2
        ? [
            [0, 'fold'],
            [1, 'fold'],
          ]
        : []),
    ],
  });

test('implied-odds calls start at eight calls behind and are full from twelve', () => {
  const implied = (stack, hole = '3c 3d', seat = 0) =>
    decide(coldSpot({ stack, hole, seat })).trace.impliedThreeBet;
  // Behind/call = 10 (17.6K): half the widening; 12 (20.8K): all of it.
  assert.equal(implied(17600).depthWeight, 0.5);
  assert.equal(implied(20800).depthWeight, 1);
  // 8 (14.4K): the call is over a tenth of the stack, so the gate is closed.
  assert.equal(implied(14400).class, null);
  // In position a set-mining pair calls at 0.9; the big blind is 15% lower.
  assert.ok(Math.abs(implied(20800).rate - 0.9) < 1e-9);
  assert.ok(Math.abs(implied(20800, '3c 3d', 2).rate - 0.765) < 1e-9);
  // Suited connectors call only in position.
  assert.equal(implied(20800, '7d 8d').class, 'suited-connector');
  assert.equal(implied(20800, '7d 8d', 2).class, null);
  // 30BB with 5 calls behind: no implied-odds calls.
  assert.equal(decide(coldSpot({ stack: 6000, hole: '3c 3d' })).action, 'fold');
});

test('light 4-bets are a hard-only bluff with A5s–A2s, deep and heads up, at 10–25% by style', () => {
  const rateOf = (d) => d.trace.checks.find((c) => c.code === 'light-four-bet')?.threshold;
  const bluffs = (spot, seeds = 200) => {
    let raised = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const d = decide(spot, seed);
      if (d.action === 'raise' && d.trace.reason === 'pure-bluff') {
        assert.ok(d.amount < d.trace.view.legal.maxRaiseTo);
        raised++;
      }
    }
    return raised;
  };
  const hard = bluffs(openerSpot({ hole: '5h Ah', threeBet: 1600, difficulty: 'hard' }));
  assert.ok(hard >= 16 && hard <= 50, String(hard));
  assert.equal(bluffs(openerSpot({ hole: '5h Ah', threeBet: 1600 })), 0);
  assert.equal(bluffs(openerSpot({ hole: 'Kd Qs', threeBet: 1600, difficulty: 'hard' })), 0);
  assert.equal(
    bluffs(openerSpot({ bb: 50, hole: '5h Ah', threeBet: 1600, difficulty: 'hard' })),
    0,
  );
  // Every style stays between 10% and 25%.
  const spot = openerSpot({ hole: '5h Ah', threeBet: 1600, difficulty: 'hard' });
  for (const profile of BOT_PROFILES) {
    const g = structuredClone(spot);
    g.players[5].botProfile = profile.id;
    const rate = rateOf(decide(g));
    assert.ok(rate >= 0.1 && rate <= 0.25, `${profile.id}: ${rate}`);
  }
});

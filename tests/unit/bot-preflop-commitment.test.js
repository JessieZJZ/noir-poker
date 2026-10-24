import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../../src/engine/poker.js';
import { BOT_PROFILES, chooseBotAction, freshBotMood } from '../../src/engine/bot-profiles.js';
import { preflopJamPlan } from '../../src/engine/bot-preflop-commitment.js';
import { preparePublicRanges } from '../../src/engine/public-ranges.js';
import {
  allInRandom,
  multiRaiseShoveResponse,
  reviewedAllInGame,
} from '../fixtures/all-in-decisions.js';
import { explainOpponent } from '../../src/review/opponents.js';
import {
  preflopPressureCase,
  finishPressureCase,
  PRESSURE_LINES,
} from '../../scripts/preflop-pressure-cases.mjs';

const game = (kind, hand = 'AA', seats = 2, difficulty = 'hard', smallBlind = 100) =>
  preflopPressureCase(engine, { seats, kind, hand, difficulty, smallBlind });
const decision = (g, seed = 1, options) => engine.botDecision(g, allInRandom(seed), options);

test('pressure fixtures use actual 2/3-seat residual rings and every supported 5–9-seat table', () => {
  for (const seats of [2, 3, 5, 6, 7, 8, 9])
    for (const kind of PRESSURE_LINES) {
      const g = game(kind, 'AKo', seats);
      if (!g) {
        assert.equal(seats, 2);
        assert.equal(kind, 'multi-caller-jam-100');
        continue;
      }
      assert.equal(engine.seatedRing(g).length, seats);
      assert.equal(g.players.filter((p) => !p.out && p.hole.length === 2).length, seats);
      assert(engine.legalActions(g).enabled);
      const used = [...g.deck, ...g.players.flatMap((p) => p.hole)];
      assert.equal(used.length, 52);
      assert.equal(new Set(used.map((c) => c.key)).size, 52);
    }
});

test('review snapshots retain folded seated players and exclude eliminated seats from the same public range count', () => {
  for (const seats of [2, 3, 5, 6, 7, 8, 9]) {
    const g = game('early-jam-20', 'AKo', seats);
    const v = decision(g, 1, { trials: 17 }).trace.view;
    const players = g.players.map(({ id, stack, bet, total, folded, allin, out }) => ({
      id,
      position: engine.seatPosition(g, id),
      stack,
      bet,
      total,
      folded,
      allin,
      out,
    }));
    const review = { ...v, count: undefined, players };
    const botRanges = preparePublicRanges(v);
    const reviewRanges = preparePublicRanges(review);
    assert.equal(reviewRanges[0].seatedCount, seats);
    assert.deepEqual(reviewRanges, botRanges);
  }
});

test('short-handed 20BB first-in shoves are distinct from deep 5-bet commitments', () => {
  for (const difficulty of ['normal', 'hard'])
    for (const hand of ['66', 'KQs', 'TT', 'AKo', 'QQ']) {
      const d = decision(game('early-jam-20', hand, 2, difficulty), 3);
      assert.equal(d.action, 'call', `${difficulty}/${hand}`);
      assert.equal(d.trace.trials, 512);
      assert.equal(d.trace.noise, 0);
      assert.equal(d.trace.allIn.committedIds.length, 1);
      assert.equal(d.trace.view.count, 2);
      finishPressureCase(engine, game('early-jam-20', hand, 2, difficulty), d);
    }
  for (const hand of ['66', 'KQs', 'KQo', '72o']) {
    const g = game('5bet-jam-100', hand);
    assert.equal(decision(g, 3).action, 'fold', hand);
  }
});

test('QQ and AK defend a closed heads-up 4-bet on every table size without opening the multi-caller safety gate', () => {
  for (const seats of [2, 3, 5, 6, 7, 8, 9])
    for (const hand of ['QQ', 'AKs', 'AKo'])
      for (const difficulty of ['normal', 'hard']) {
        const g = game('4bet-jam-100', hand, seats, difficulty);
        let calls = 0;
        for (const seed of [1, 2, 3, 4]) {
          const d = decision(g, seed);
          const priced = d.trace.equity + d.trace.callTolerance >= d.trace.requiredEquity;
          // Borderline AKo can still fall below the price. A starting-hand
          // name must neither force a call nor override a supported one.
          assert.equal(d.action, priced ? 'call' : 'fold');
          assert.equal(d.trace.view.opponents.length, 1);
          assert.equal(d.trace.allIn.line, 'multi-raise-shove');
          assert.equal(d.trace.view.history.filter((a) => a.action === 'raise').length, 3);
          calls += Number(d.action === 'call');
          if (seed === 1) finishPressureCase(engine, g, d);
        }
        assert.ok(calls > 0, `${seats}/${difficulty}/${hand} must not systematically fold`);
        if (hand === 'QQ') assert.ok(calls >= 3, 'QQ normally supports the closed-heads-up price');
      }
  const multi = decision(multiRaiseShoveResponse(), 1, { trials: 120 });
  assert.equal(multi.action, 'fold');
  assert.equal(multi.trace.allIn.committedIds.length, 2);
});

test('AA values a legal shove over a non-all-in 5-bet at every table size and chip scale', () => {
  for (const seats of [2, 3, 5, 6, 7, 8, 9])
    for (const smallBlind of [25, 100, 50000]) {
      const g = game('reraise-5bet-50', 'AA', seats, 'hard', smallBlind);
      const v = decision(g, 1, { trials: 128 }).trace.view;
      assert.equal(v.allIn.isAllIn, false);
      for (const p of BOT_PROFILES) {
        const d = chooseBotAction(v, p, freshBotMood(), 'off', () => 0.4);
        assert.equal(d.action, 'raise', `${seats}/${smallBlind}/${p.id}`);
        assert.equal(d.amount, v.legal.maxRaiseTo);
        assert.equal(d.trace.basis.shove, true);
        assert.equal(d.trace.reason, 'value-raise');
        finishPressureCase(engine, g, d);
      }
    }
});

test('deep stacks never open-shove AA, while a short-stack opening can commit directly', () => {
  for (const seats of [2, 3, 5, 9]) {
    const short = decision(game('unopened-20', 'QQ', seats)).trace.view;
    const deep = decision(game('unopened-100', 'AA', seats)).trace.view;
    const p = BOT_PROFILES[0];
    const shove = chooseBotAction(short, p, freshBotMood(), 'off', () => 0.4);
    assert.equal(shove.amount, short.legal.maxRaiseTo);
    assert.equal(preflopJamPlan(deep, p), null);
    // Only AA/KK would open-shove deep, which would mark the hand.
    for (const draw of [0.01, 0.5, 0.999]) {
      const open = chooseBotAction(deep, p, freshBotMood(), 'off', () => draw);
      assert.notEqual(open.amount, deep.legal.maxRaiseTo, `draw ${draw}`);
    }
  }
});

test('commitment cannot reopen a short all-in, create an artificial side pot or ignore a bad call price', () => {
  const g = game('reraise-5bet-50');
  const v = decision(g, 1, { trials: 128 }).trace.view;
  const p = BOT_PROFILES[0];
  for (const changed of [
    { ...v, street: 1 },
    { ...v, legal: { ...v.legal, canRaise: false } },
    { ...v, opponents: v.opponents.map((p) => ({ ...p, allin: true, stack: 0 })) },
  ])
    assert.equal(preflopJamPlan(changed, p), null);
  const underpriced = { ...v, equity: 0.05 };
  const d = chooseBotAction(underpriced, p, freshBotMood(), 'off', () => 0.4);
  assert.equal(d.action, 'fold');
  const actual = game('4bet-jam-100');
  const a = decision(actual);
  assert.equal(a.action, 'call');
  assert.equal(a.trace.view.allIn.isAllIn, true);
});

test('huge single opens use the commitment price but ordinary opens retain their low-cost path', () => {
  const large = decision(game('open-75', 'KK'));
  assert.equal(large.trace.allIn.highCommitment, true);
  assert.equal(large.trace.allIn.isAllIn, false);
  assert.equal(large.trace.view.callPrice.odds, large.trace.odds);
  const small = decision(game('open-10', 'KK'));
  assert.equal(small.trace.allIn, null);
  assert.equal(small.trace.affordableRangePassed, false);
  const explicit = decision(game('early-jam-20', 'QQ'), 4, { trials: 17 });
  assert.equal(explicit.trace.trials, 17);
});

test('new preflop choices ignore opponent hole cards, future deck and final results', () => {
  for (const kind of ['4bet-jam-100', 'reraise-5bet-50', 'unopened-20']) {
    const g = game(kind, 'AKs');
    const before = decision(g, 7);
    for (const p of g.players) if (p.id !== g.actor) p.hole = engine.deckOfCards().slice(0, 2);
    g.deck.reverse();
    g.winners = [g.actor];
    g.payouts.fill(999999);
    assert.deepEqual(decision(g, 7), before);
  }
});

test('executed AA value shoves keep the actual amount and motive in opponent review', () => {
  const g = reviewedAllInGame('deep-value-jam');
  const r = g.botDecisions[0];
  assert.equal(r.action, 'raise');
  assert.equal(r.amount, 5000);
  assert.equal(r.trace.basis.shove, true);
  assert.equal(r.trace.basis.motive, 'value');
  const text = explainOpponent(r, g.players).detail;
  assert.match(text, /4\.85K/);
  assert.doesNotMatch(text, /全下者已不能|跟完就已全下|抽样|模拟器|模型|EV/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateAllInEquity } from '../../src/engine/bot-allin.js';
import { botDecision, deckOfCards, evaluate, compare } from '../../src/engine/poker.js';
import { allInCacheCases } from '../fixtures/all-in-cache-cases.js';
import { allInRandom, flopShoveResponse } from '../fixtures/all-in-decisions.js';

// Captured before memoization with seed 7919 and exactly 32 trials. These
// values guard the weighting, range order, random stream and side-pot result.
const baseline = {
  preflop: [0.13203125, false, 0, 288],
  flop: [0.240625, false, 0, 192],
  'turn-locked-preflop': [0.278125, false, 0, 160],
  'river-shared-royal': [0.24666666666666667, true, 1200, 128],
  'river-private-nuts': [1, true, 1200, 128],
  'river-beatable': [0.1265625, false, 0, 128],
};

function measuredEstimate(view, context, cache) {
  let seed = 7919;
  let randomCalls = 0;
  let evaluateCalls = 0;
  const assessment = estimateAllInEquity(view, context, {
    deck: deckOfCards(),
    compare,
    trials: 32,
    cache,
    random: () => {
      randomCalls++;
      return (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    },
    evaluate: (cards) => {
      evaluateCalls++;
      return evaluate(cards);
    },
  });
  return { assessment, randomCalls, evaluateCalls };
}

for (const { name, view, context } of allInCacheCases()) {
  test(`all-in memoization preserves the pre-change ${name} result and samples while bounding evaluations`, () => {
    const measured = measuredEstimate(view, context);
    const [equity, unbeatableRiver, guaranteedReturn, randomCalls] = baseline[name];
    assert.deepEqual(
      {
        equity: measured.assessment.equity,
        unbeatableRiver: measured.assessment.unbeatableRiver,
        guaranteedReturn: measured.assessment.guaranteedReturn,
      },
      { equity, unbeatableRiver, guaranteedReturn },
    );
    assert.equal(
      measured.assessment.winProbability +
        measured.assessment.tieProbability +
        measured.assessment.lossProbability,
      1,
    );
    assert.equal(measured.randomCalls, randomCalls);
    const unseen = 52 - view.hole.length - view.board.length;
    const pairs = (unseen * (unseen - 1)) / 2;
    const rangeBoards = new Set(
      context.ranges
        .filter((range) => view.street > 0 && range.street > 0)
        .map((range) => Math.min(range.street, view.street)),
    );
    if (view.street === 3) rangeBoards.add(3);
    // Each public range board evaluates an unknown pair at most once. A river
    // reuses those exhaustive scores in every trial; earlier streets still
    // price every sampled full runout at the unchanged trial count.
    const maximum =
      pairs * rangeBoards.size + (view.street === 3 ? 2 : 32 * (context.ranges.length + 1));
    assert.ok(
      measured.evaluateCalls <= maximum,
      `${measured.evaluateCalls} evaluations exceed the public-board bound ${maximum}`,
    );
  });
}

test('locked preflop river ranges still exhaustively establish guarantees for every unknown pair', () => {
  for (const name of ['river-shared-royal', 'river-beatable']) {
    const fixture = allInCacheCases().find((fixture) => fixture.name === name);
    const context = {
      ...fixture.context,
      ranges: fixture.context.ranges.map((range) => ({ ...range, street: 0 })),
    };
    const measured = measuredEstimate(fixture.view, context);
    const unseen = 52 - fixture.view.hole.length - fixture.view.board.length;
    assert.equal(measured.evaluateCalls, (unseen * (unseen - 1)) / 2 + 2);
    assert.equal(measured.assessment.unbeatableRiver, name === 'river-shared-royal');
    assert.equal(measured.assessment.guaranteedReturn, name === 'river-shared-royal' ? 1200 : 0);
    assert.equal(measured.randomCalls, 128);
  }
});

test('a sampled-deal cache shares only pure evaluations across distinct ranges, prices, boards and chip scales', () => {
  const fixtures = allInCacheCases();
  const flop = fixtures.find(({ name }) => name === 'flop');
  const royal = fixtures.find(({ name }) => name === 'river-shared-royal');
  const tight = {
    view: {
      ...flop.view,
      currentBet: 3000,
      pot: 3600,
      opponents: flop.view.opponents.map((player) =>
        player.id === 0 ? { ...player, bet: 3000 } : player,
      ),
    },
    context: {
      ...flop.context,
      ranges: flop.context.ranges.map((range) => ({ ...range, role: 'caller' })),
    },
  };
  const scaledRoyal = {
    view: {
      ...royal.view,
      smallBlind: 100,
      bigBlind: 200,
      chipUnit: 100,
      pot: 2000,
      currentBet: 400,
      contestable: 2000,
      opponents: royal.view.opponents.map((player) => ({ ...player, bet: player.bet / 3 })),
      callPots: royal.view.callPots.map((pot) => ({ ...pot, amount: pot.amount / 3 })),
    },
    context: royal.context,
  };
  const snapshots = [flop, tight, flop, ...fixtures.slice(2), scaledRoyal];
  const before = JSON.stringify(snapshots);
  const cache = new Map();
  let independentCalls = 0;
  let sharedCalls = 0;
  const results = [];
  for (const [index, { view, context }] of snapshots.entries()) {
    const independent = measuredEstimate(view, context);
    const shared = measuredEstimate(view, context, cache);
    assert.deepEqual(shared.assessment, independent.assessment);
    assert.equal(shared.randomCalls, independent.randomCalls);
    independentCalls += independent.evaluateCalls;
    sharedCalls += shared.evaluateCalls;
    results.push(shared.assessment);
    if (index === 2) {
      assert.equal(shared.evaluateCalls, 0, 'Returning to a public view must reuse every score');
    }
  }
  assert.notEqual(
    results[0].equity,
    results[1].equity,
    'Changed range/pressure must recompute weights',
  );
  assert.deepEqual(results[2], results[0], 'Changed pressure must not contaminate earlier results');
  assert.equal(results.at(-1).guaranteedReturn, 400, 'Chip floors belong to each new view');
  assert.ok(sharedCalls < independentCalls / 2, 'Candidate reuse must avoid repeated evaluations');
  assert.equal(JSON.stringify(snapshots), before, 'No public input may be mutated');
});

test('botDecision forwards an optional sampled-deal cache without changing decisions or public traces', () => {
  const game = flopShoveResponse();
  const before = JSON.stringify(game);
  const cache = new Map();
  const independent = botDecision(game, allInRandom(19), { trials: 8 });
  const shared = botDecision(game, allInRandom(19), { trials: 8, allInCache: cache });
  assert.ok(cache.size > 0, 'The optional cache must receive pure evaluation entries');
  const entries = cache.size;
  const replay = botDecision(game, allInRandom(19), { trials: 8, allInCache: cache });
  assert.deepEqual(shared, independent);
  assert.deepEqual(replay, independent);
  assert.equal(cache.size, entries);
  assert.equal(JSON.stringify(game), before);
  assert.ok(!('allInCache' in shared.trace.view) && !('cache' in shared.trace.view));
});

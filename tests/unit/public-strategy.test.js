import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPublicStrategy } from '../../src/engine/public-strategy.js';
import { evaluate, compare, deckOfCards } from '../../src/engine/poker.js';
import { cards, deceptiveView } from '../fixtures/deceptive-decisions.js';

const assess = (view, extra = {}) =>
  assessPublicStrategy(view, {
    deck: deckOfCards(),
    evaluate,
    compare,
    samples: 64,
    ...extra,
  });
const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-10, `${message || ''}: ${actual} != ${expected}`);
const facingDraw = (overrides = {}) =>
  deceptiveView('Kh Qh', 'Ah Jh 2s', {
    currentBet: 200,
    pot: 1000,
    opponents: [{ id: 0, position: 'BB', stack: 4000, bet: 200, total: 400, allin: false }],
    history: [{ id: 0, street: 1, action: 'raise', amount: 200 }],
    legal: {
      canRaise: true,
      canCheck: false,
      callAmount: 200,
      minRaiseTo: 400,
      maxRaiseTo: 5000,
      chipUnit: 25,
    },
    ...overrides,
  });

test('strategy ignores hidden cards, actual future deck, future actions, outcomes and supplied equity', () => {
  const view = facingDraw();
  const before = structuredClone(view);
  const original = assess(view);
  const contaminated = structuredClone(view);
  contaminated.opponents[0].hole = cards('As Ac');
  contaminated.deck = cards('Th 9h 8h');
  contaminated.runout = cards('Th 9h');
  contaminated.winners = [0];
  contaminated.result = { winner: 0, equity: 1 };
  contaminated.equity = 1;
  contaminated.publicEquity = { equity: 1, priceEquity: 1 };
  contaminated.history.push({ id: 0, street: 3, action: 'raise', amount: 5000 });
  assert.deepEqual(assess(contaminated), original);
  assert.deepEqual(view, before, 'the assessment never mutates the decision snapshot');
});

test('the full catalogue is order independent and the strategy consumes no global random stream', () => {
  const view = facingDraw();
  const original = assess(view);
  const globalRandom = Math.random;
  try {
    Math.random = () => {
      throw Error('Global random must not be used');
    };
    assert.deepEqual(assess(view, { deck: deckOfCards().reverse() }), original);
  } finally {
    Math.random = globalRandom;
  }
  assert.throws(() => assess(view, { deck: deckOfCards().slice(2) }), /完整的52张牌目录/);
  assert.throws(
    () => assess(view, { deck: [...deckOfCards().slice(1), deckOfCards()[1]] }),
    /完整的52张牌目录/,
  );
});

test('every sampled hand and independent runout contains only distinct legal cards', () => {
  let evaluated = 0;
  assess(facingDraw(), {
    samples: 24,
    evaluate: (input) => {
      evaluated++;
      assert.equal(new Set(input.map((c) => c.key)).size, input.length);
      return evaluate(input);
    },
  });
  assert.ok(evaluated > 50);
});

test('public range advantage depends on the actor public line, never its actual hand', () => {
  const view = deceptiveView('5s 4s', 'As Kd 2h 7c 9d', {
    id: 0,
    position: 'UTG',
    opponents: [{ id: 1, position: 'BTN', stack: 5000, bet: 0, allin: false }],
    history: [
      { id: 0, street: 0, action: 'raise', amount: 150 },
      { id: 1, street: 0, action: 'call', amount: 150 },
    ],
  });
  const baseline = assess(view);
  assert.deepEqual(assess({ ...view, hole: cards('Ah Ac') }).range, baseline.range);
  const strongPublicLine = assess({
    ...view,
    history: [
      ...view.history,
      { id: 0, street: 1, action: 'raise', amount: 400 },
      { id: 1, street: 1, action: 'call', amount: 400 },
      { id: 0, street: 2, action: 'raise', amount: 800 },
      { id: 1, street: 2, action: 'call', amount: 800 },
    ],
  });
  assert.notEqual(strongPublicLine.range.actorTopMass, baseline.range.actorTopMass);
  assert.notEqual(strongPublicLine.range.actorEquity, baseline.range.actorEquity);
  assert.equal(baseline.range.topThresholdQuantile, 0.85);
  assert.ok(Array.isArray(baseline.range.topThresholdScore));
  assert.equal(baseline.range.method, 'sampled-public-ranges');
  assert.equal(baseline.range.comparisons, 64);
  assert.ok(baseline.range.uncertainty > 0);
  assert.ok(baseline.limitations.includes('sampling-uncertainty-excludes-prior-error'));
});

test('both public range descriptors retain visible style axes while private mood and axes are ignored', () => {
  const view = deceptiveView('5s 4s', 'As Kd 2h 7c 9d', {
    id: 0,
    position: 'UTG',
    botProfile: 'balanced',
    publicAxes: [10, 50, 40, 50, 20],
    opponents: [
      {
        id: 1,
        position: 'BTN',
        botProfile: 'balanced',
        publicAxes: [50, 50, 40, 50, 20],
        stack: 5000,
        bet: 0,
        allin: false,
      },
    ],
    history: [
      { id: 0, street: 0, action: 'raise', amount: 150 },
      { id: 1, street: 0, action: 'call', amount: 150 },
    ],
  });
  const cache = new Map();
  const tight = assess(view, { cache });
  const wide = assess({ ...view, publicAxes: [90, 50, 40, 50, 20] }, { cache });
  assert.notEqual(
    tight.range.actorTopMass,
    wide.range.actorTopMass,
    'the self descriptor must not silently use the fallback width of 50',
  );
  assert.notEqual(tight.range.actorEquity, wide.range.actorEquity);
  const differentOpponent = assess(
    { ...view, opponents: [{ ...view.opponents[0], publicAxes: [90, 50, 40, 50, 20] }] },
    { cache },
  );
  assert.notEqual(tight.range.opponentTopMass, differentOpponent.range.opponentTopMass);
  const privateState = structuredClone(view);
  privateState.axes = [99, 99, 99, 99, 99];
  privateState.botMood = { aggression: 99, confidence: 0 };
  privateState.opponents[0].axes = [1, 1, 1, 1, 1];
  privateState.opponents[0].botMood = { aggression: 99, confidence: 0 };
  assert.deepEqual(assess(privateState, { cache }), tight);
});

test('five legal size estimates have monotonic folds and retain a selective paying range', () => {
  const result = assess(deceptiveView('As Kh', 'Ah Jd 7s 3c 2d'));
  assert.deepEqual(
    result.options.map((o) => o.fraction),
    [0.25, 0.5, 0.75, 1, 1.5],
  );
  for (const [index, option] of result.options.entries()) {
    assert.equal(option.amount % 25, 0);
    assert.ok(option.amount >= 50 && option.amount <= 5000);
    close(option.foldProbability + option.callProbability + option.raiseProbability, 1);
    assert.ok(option.worseMadeCallMass > 0);
    assert.ok(option.worseMadeCallMass <= option.opponents[0].callProbability);
    assert.ok(option.opponents[0].callProbability < 1);
    if (index) assert.ok(option.foldProbability >= result.options[index - 1].foldProbability);
  }
  assert.ok(result.options[0].worseMadeCallMass > result.options.at(-1).worseMadeCallMass);
  assert.ok(
    result.options[0].calledEquity > result.options.at(-1).calledEquity,
    'larger sizing cannot assume the same weak paying range',
  );
  assert.ok(result.limitations.includes('estimated-values-not-proven-ev'));
});

test('observed callers and folders alter paying estimates without erasing size selectivity or poisoning the cache', () => {
  const view = deceptiveView('As Kh', 'Ah Jd 7s 3c 2d');
  const cache = new Map();
  const base = assess(view, { cache });
  const read = { hands: 32, postActions: 128, facedPostBet: 64 };
  const changed = (foldedPostBet) =>
    assess(
      {
        ...view,
        opponents: view.opponents.map((p) => ({
          ...p,
          publicRead: { ...read, foldedPostBet },
        })),
      },
      { cache },
    );
  const caller = changed(0),
    folder = changed(64);
  assert.ok(caller.options[0].foldProbability < base.options[0].foldProbability);
  assert.ok(folder.options[0].foldProbability > base.options[0].foldProbability);
  assert.ok(caller.options[0].worseMadeCallMass > folder.options[0].worseMadeCallMass);
  for (const result of [caller, folder])
    for (const [index, option] of result.options.entries()) {
      close(option.foldProbability + option.callProbability + option.raiseProbability, 1);
      if (index) assert.ok(option.foldProbability >= result.options[index - 1].foldProbability);
    }
  assert.deepEqual(assess(view, { cache }), base);
});

test('legal short all-in caps come only from the legal action view', () => {
  const view = facingDraw({
    legal: {
      canRaise: true,
      canCheck: false,
      callAmount: 200,
      minRaiseTo: 325,
      maxRaiseTo: 325,
      chipUnit: 25,
    },
  });
  for (const option of assess(view).options) assert.equal(option.amount, 325);
  assert.deepEqual(assess({ ...view, legal: { ...view.legal, canRaise: false } }).options, []);
});

test('called equity integrates fold/call subsets instead of counting every waiting seat as a caller', () => {
  const view = deceptiveView('As Kh', 'Ah Jd 7s 3c 2d', {
    opponents: [
      { id: 0, position: 'BB', stack: 5000, bet: 0, allin: false },
      { id: 2, position: 'CO', stack: 5000, bet: 0, allin: false },
    ],
  });
  const result = assess(view);
  for (const option of result.options) {
    const [a, b] = option.opponents;
    const weightedEquity =
      a.callProbability * b.foldProbability * a.calledEquity +
      a.foldProbability * b.callProbability * b.calledEquity +
      a.callProbability * b.callProbability * a.calledEquity * b.calledEquity;
    close(option.calledEquity, weightedEquity / option.callProbability);
    assert.ok(option.calledEquity >= a.calledEquity * b.calledEquity);
  }
  assert.ok(result.limitations.includes('multiway-joint-fold-and-equity-approximation'));
});

test('nut flush facts respect board ace blockers, combo draws and paired-board limitations', () => {
  const nut = assess(deceptiveView('Kh Qh', 'Ah Jh 2s'));
  assert.equal(
    nut.draw.nutFlushDraw,
    true,
    'the ace on board makes the held king the highest available flush card',
  );
  assert.equal(nut.draw.comboDraw, true);
  assert.equal(nut.draw.nutOuts, 9);
  assert.equal(nut.draw.nutOutsMeaning, 'highest-flush-completions');
  assert.equal(assess(deceptiveView('Qh 9h', 'Ah Jh 2s')).draw.nutFlushDraw, false);
  assert.equal(assess(deceptiveView('Kh Qh', '9h Jh 2s')).draw.nutFlushDraw, false);
  assert.equal(assess(deceptiveView('Kh Qd', 'Ah Jh 2h')).draw.nutFlushDraw, true);
  assert.equal(assess(deceptiveView('Kd Qs', 'Ah Jh 2h')).draw.flushDraw, false);
  const paired = assess(deceptiveView('Kh Qh', 'Ah Jh 2s 2d'));
  assert.equal(paired.draw.pairedBoard, true);
  assert.ok(paired.limitations.includes('paired-board-full-house-risk'));
  assert.ok(paired.limitations.includes('nut-flush-rank-is-not-guaranteed-overall-nuts'));
});

test('implied calls price only the next card and use sampled future paying hands', () => {
  const result = assess(facingDraw());
  close(result.call.improvementProbability, result.draw.improvementOuts / 47);
  assert.equal(result.call.forecast, 'next-card-improvement');
  assert.equal(result.call.eligible, true);
  assert.ok(result.call.futurePaySamples > 0);
  assert.ok(result.call.futurePayFrequency > 0 && result.call.futurePayFrequency < 0.58);
  assert.notEqual(result.call.futurePayFrequency, 0.3);
  assert.ok(result.call.futurePayBound <= 4000);
  assert.ok(
    result.call.impliedValue <= result.call.futurePayBound * result.call.improvementProbability,
  );
  close(result.call.estimatedValue, result.call.directCallValue + result.call.impliedValue);
  const differentRange = assess(
    facingDraw({
      history: [
        { id: 0, street: 0, action: 'raise', amount: 150 },
        { id: 0, street: 1, action: 'raise', amount: 800 },
      ],
    }),
  );
  assert.notEqual(differentRange.call.futurePayFrequency, result.call.futurePayFrequency);
});

test('all-in calls and ineligible side-pot stacks cannot supply implied future money or all-fold wins', () => {
  const actorAllIn = assess(facingDraw({ stack: 200 }));
  assert.equal(actorAllIn.call.reason, 'actor-all-in');
  assert.equal(actorAllIn.call.futurePayBound, 0);
  assert.equal(actorAllIn.call.impliedValue, 0);
  const locked = facingDraw({
    opponents: [
      { id: 0, position: 'BB', stack: 0, bet: 200, total: 400, allin: true },
      { id: 2, position: 'CO', stack: 20000, bet: 200, total: 400, allin: false },
    ],
    callPots: [
      { amount: 1200, eligible: [0, 1] },
      { amount: 10000, eligible: [0, 2] },
    ],
    callPrice: { cost: 200, contestable: 1200 },
  });
  const result = assess(locked);
  assert.equal(result.call.futurePayBound, 0);
  assert.equal(result.call.impliedValue, 0);
  assert.equal(result.call.reason, 'no-eligible-future-stack');
  for (const option of result.options) {
    assert.equal(option.foldProbability, 0);
    const allIn = option.opponents.find((o) => o.id === 0);
    assert.equal(allIn.callProbability, 1);
    assert.equal(allIn.raiseProbability, 0);
    assert.equal(allIn.expectedCallContribution, 0);
  }
  const otherPotOnly = assess({ ...locked, callPots: [{ amount: 1200, eligible: [1, 2] }] });
  assert.ok(otherPotOnly.options.every((option) => option.opponents.every((o) => o.id !== 0)));
});

test('preflop pair mining is a bounded set-by-flop forecast, with no preflop size fiction', () => {
  const view = deceptiveView('5s 5h', '');
  const result = assess(view);
  close(result.call.improvementProbability, 1 - (48 * 47 * 46) / (50 * 49 * 48));
  assert.equal(result.call.pairMining, true);
  assert.equal(result.call.forecast, 'set-by-flop');
  assert.deepEqual(result.options, []);
  assert.ok(result.limitations.includes('preflop-size-response-omitted'));
  const allIn = assess({ ...view, stack: view.legal.callAmount });
  assert.equal(allIn.call.impliedValue, 0);
});

test('an all-in hand only reduces called equity in pots where it is eligible', () => {
  const view = facingDraw({
    opponents: [
      { id: 0, position: 'BB', stack: 0, bet: 200, total: 400, allin: true },
      { id: 2, position: 'CO', stack: 125, bet: 200, total: 400, allin: false },
    ],
    callPots: [
      { amount: 1000, eligible: [0, 1] },
      { amount: 4000, eligible: [1, 2] },
    ],
    callPrice: { cost: 200, contestable: 5000 },
  });
  const result = assess(view);
  assert.ok(result.call.futurePayBound <= 125);
  for (const option of result.options) {
    const allIn = option.opponents.find((o) => o.id === 0);
    const live = option.opponents.find((o) => o.id === 2);
    const noRaise = live.foldProbability + live.callProbability;
    const expectedEquity =
      (1000 * allIn.calledEquity +
        (4000 * (live.foldProbability + live.callProbability * live.calledEquity)) / noRaise) /
      5000;
    close(option.calledEquity, expectedEquity);
    assert.equal(option.foldProbability, 0);
  }
});

test('stake scaling preserves range/response probabilities and scales all money estimates', () => {
  const view = facingDraw();
  const factor = 17;
  const scaled = structuredClone(view);
  for (const key of ['stack', 'bet', 'total', 'pot', 'currentBet', 'bigBlind', 'chipUnit'])
    if (scaled[key] !== undefined) scaled[key] *= factor;
  for (const opponent of scaled.opponents)
    for (const key of ['stack', 'bet', 'total'])
      if (opponent[key] !== undefined) opponent[key] *= factor;
  for (const key of ['chipUnit', 'callAmount', 'minRaiseTo', 'maxRaiseTo'])
    scaled.legal[key] *= factor;
  scaled.history.forEach((action) => (action.amount *= factor));
  const base = assess(view),
    result = assess(scaled);
  assert.deepEqual(result.range, base.range);
  assert.deepEqual(result.draw, base.draw);
  for (let i = 0; i < result.options.length; i++) {
    const a = base.options[i],
      b = result.options[i];
    for (const key of [
      'foldProbability',
      'raiseProbability',
      'calledEquity',
      'worseMadeCallMass',
      'drawCallMass',
    ])
      close(b[key], a[key], key);
    for (const key of ['amount', 'extra', 'estimatedValue']) close(b[key], a[key] * factor, key);
  }
  for (const key of ['futurePayBound', 'impliedValue', 'directCallValue', 'estimatedValue'])
    close(result.call[key], base.call[key] * factor, key);
  close(result.call.futurePayFrequency, base.call.futurePayFrequency);
});

test('sampling and shared assessment caches are bounded and cached results cannot be poisoned', () => {
  const cache = new Map(),
    view = facingDraw();
  const original = assess(view, { cache, samples: 1 });
  assert.equal(original.range.samples, 8);
  original.options[0].foldProbability = 999;
  assert.notEqual(assess(view, { cache, samples: 1 }).options[0].foldProbability, 999);
  assert.equal(assess(view, { cache, samples: 1000 }).range.samples, 96);
  assert.ok(cache.size <= 65);
  assert.throws(() => assess(view, { samples: 0 }), /正整数/);
  assert.throws(() => assess(view, { samples: 2.5 }), /正整数/);
  assert.ok(JSON.stringify(assess(view, { samples: 8 })).length < 20000);
});

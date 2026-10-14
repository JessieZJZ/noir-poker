import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  newGame,
  startHand,
  act,
  legalActions,
  botDecision,
  deckOfCards,
  evaluate,
  compare,
} from '../../src/engine/poker.js';
import { publicActionContext, publicResponseRisk } from '../../src/engine/public-action-context.js';
import { preparePublicRanges, publicComboWeight } from '../../src/engine/public-ranges.js';
import {
  createPublicPairSampler,
  samplePublicPair,
  estimatePublicEquity,
} from '../../src/engine/public-equity.js';
import {
  botBoardFeatures,
  chooseBotAction,
  getBotProfile,
  freshBotMood,
} from '../../src/engine/bot-profiles.js';
import { cards, deceptiveView } from '../fixtures/deceptive-decisions.js';
import {
  allInRandom,
  coldShoveResponse,
  flopShoveResponse,
  finishAfterResponse,
  oldShortAllInSideBet,
} from '../fixtures/all-in-decisions.js';

const estimate = (view, seed = 71, extra = {}) =>
  estimatePublicEquity(view, preparePublicRanges(view), {
    deck: deckOfCards(),
    evaluate,
    compare,
    features: botBoardFeatures,
    trials: 52,
    random: allInRandom(seed),
    ...extra,
  });
function decision(view) {
  const assessment = estimate(view);
  return chooseBotAction(
    { ...view, equity: assessment.equity, publicEquity: assessment },
    getBotProfile('balanced'),
    freshBotMood(),
    'off',
    () => 0.5,
  );
}
function facing(
  hole,
  board,
  { pot = 10000, callAmount = 3000, opponents = 1, action = 'raise' } = {},
) {
  return deceptiveView(hole, board, {
    id: 0,
    bigBlind: 200,
    chipUnit: 100,
    position: 'BB',
    inPosition: false,
    stack: 20000,
    pot,
    currentBet: callAmount,
    contestable: pot + callAmount,
    rivals: opponents,
    opponents: Array.from({ length: opponents }, (_, index) => ({
      id: index + 1,
      position: index ? 'CO' : 'BTN',
      stack: 20000,
      total: callAmount,
      bet: callAmount,
      allin: false,
    })),
    history: Array.from({ length: opponents }, (_, index) => ({
      id: index + 1,
      street: board.split(' ').length - 2,
      action: index ? 'call' : action,
      amount: callAmount,
    })),
    legal: {
      enabled: true,
      chipUnit: 100,
      canRaise: false,
      canCheck: false,
      toCall: callAmount,
      callAmount,
      minRaiseTo: callAmount * 2,
      maxRaiseTo: 20000,
    },
  });
}

test('BB has no first actions behind it while prior opener and caller still owe a real response', () => {
  const game = newGame(6);
  startHand(game);
  act(game, 3, 'raise', 600);
  act(game, 4, 'call');
  act(game, 5, 'fold');
  act(game, 0, 'fold');
  act(game, 1, 'raise', 2000);
  assert.equal(game.actor, 2);
  const context = publicActionContext(game);
  assert.equal(context.unactedBehindCount, 0);
  assert.deepEqual(context.pendingResponseIds, [3, 4]);
  assert.deepEqual(context.priorActedResponseIds, [3, 4]);
  assert.equal(
    publicResponseRisk({ street: 0, history: game.history, actionContext: context }),
    0.024,
  );
  const legacy = structuredClone(game);
  delete legacy.players[3].actedTo;
  delete legacy.players[4].actedTo;
  assert.deepEqual(
    publicActionContext(legacy),
    context,
    'Missing old actedTo metadata uses current-street public actions',
  );
  const view = botDecision(game, allInRandom(71), { trials: 52 }).trace.view;
  assert.ok(view.callPots.some((pot) => !pot.eligible.includes(4)));
  assert.ok(
    view.equityPots.every((pot) => pot.eligible.includes(4)),
    'The earlier caller can cover the current upper layer',
  );
  assert.equal(
    view.equityPots.reduce((sum, pot) => sum + pot.amount, 0),
    view.callPrice.contestable,
  );
});

test('an unentered future caller competes for exposed money without creating future chips or a free pot', () => {
  const game = newGame(6);
  startHand(game);
  const before = JSON.stringify(game),
    view = botDecision(game, allInRandom(71), { trials: 52 }).trace.view,
    assessment = view.publicEquity,
    futureCaller = assessment.assumedOpponentIds[0];
  assert.equal(game.players[futureCaller].total, 0);
  assert.ok(view.callPots.every((pot) => !pot.eligible.includes(futureCaller)));
  assert.ok(view.equityPots.every((pot) => pot.eligible.includes(futureCaller)));
  assert.ok(assessment.equity > 0 && assessment.equity < 1);
  assert.ok(
    Math.abs(assessment.equity - assessment.winProbability - assessment.tieProbability / 2) < 1e-12,
  );
  assert.equal(
    view.equityPots.reduce((sum, pot) => sum + pot.amount, 0),
    view.callPrice.contestable,
  );
  assert.equal(JSON.stringify(game), before);
});

test('a future caller who cannot cover any current layer is replaced by an eligible live seat', () => {
  const game = newGame(6);
  game.players[0].stack = 100;
  startHand(game);
  const view = botDecision(game, allInRandom(71), { trials: 52 }).trace.view;
  assert.ok(view.equityPots.every((pot) => !pot.eligible.includes(0)));
  assert.ok(!view.publicEquity.assumedOpponentIds.includes(0));
  assert.equal(view.publicEquity.assumedOpponentIds.length, 1);
  assert.ok(
    view.equityPots.some((pot) => pot.eligible.includes(view.publicEquity.assumedOpponentIds[0])),
  );
  assert.ok(view.publicEquity.equity < 1);
});

test('a forced blind all-in stays in its paid main cap without acquiring a voluntary shove range', () => {
  const game = newGame(6);
  game.players[1].stack = 100;
  startHand(game);
  const view = botDecision(game, allInRandom(71), { trials: 52 }).trace.view,
    blind = preparePublicRanges(view).find((range) => range.id === 1);
  assert.equal(blind.actualAllIn, true);
  assert.equal(blind.allIn, false);
  assert.equal(blind.preflop.action, null);
  assert.ok(view.publicEquity.assumedOpponentIds.includes(1));
  assert.ok(view.publicEquity.assumedOpponentIds.some((id) => id !== 1));
  const future = view.publicEquity.assumedOpponentIds.find((id) => id !== 1);
  assert.ok(view.equityPots[0].eligible.includes(1));
  assert.ok(view.equityPots.slice(1).every((pot) => !pot.eligible.includes(1)));
  assert.ok(
    view.equityPots.slice(1).every((pot) => pot.eligible.includes(future)),
    'The assumed live caller also contests the upper layer',
  );
  assert.equal(
    view.equityPots.reduce((sum, pot) => sum + pot.amount, 0),
    view.callPrice.contestable,
  );
  assert.ok(view.publicEquity.equity < 1);
});

test('an earlier short all-in only contests its paid main-pot cap in ordinary equity', () => {
  const game = oldShortAllInSideBet(),
    wealth = game.players.reduce((sum, p) => sum + p.stack + p.total, 0),
    view = botDecision(game, allInRandom(71), { trials: 52 }).trace.view;
  assert.equal(view.allIn, undefined);
  assert.ok(view.equityPots[0].eligible.includes(1));
  assert.ok(view.equityPots.slice(1).every((pot) => !pot.eligible.includes(1)));
  assert.ok(
    view.equityPots.slice(1).every((pot) => pot.eligible.includes(0) && pot.eligible.includes(4)),
    'Live unmatched seats can cover an upper layer',
  );
  assert.equal(
    view.equityPots.reduce((sum, pot) => sum + pot.amount, 0),
    view.callPrice.contestable,
  );
  const chosen = botDecision(game, allInRandom(71), { trials: 52 });
  finishAfterResponse(game, chosen);
  assert.equal(
    game.players.reduce((sum, p) => sum + p.stack, 0),
    wealth,
  );
});

test('short all-in response metadata does not reopen a previously completed full raise', () => {
  const game = newGame(6);
  game.players[5].stack = 800;
  startHand(game);
  act(game, 3, 'raise', 600);
  act(game, 4, 'call');
  act(game, 5, 'raise', 800);
  for (const id of [0, 1, 2]) act(game, id, 'fold');
  assert.equal(game.actor, 3);
  assert.equal(legalActions(game).canRaise, false);
  const context = publicActionContext(game);
  assert.equal(context.unactedBehindCount, 0);
  assert.deepEqual(context.priorActedResponseIds, [4]);
  assert.ok(!context.pendingResponseIds.includes(5));
  assert.ok(context.liveShowdownIds.includes(5));
});

test('real unacted-behind count changes opening range at identical position and live table count', () => {
  const base = deceptiveView('9s 8s', '', { equity: 0.5, position: 'CO', history: [] });
  const decide = (behind) =>
    chooseBotAction(
      {
        ...base,
        actionContext: {
          unactedBehindCount: behind,
          pendingResponseIds: Array.from({ length: behind }, (_, i) => i + 2),
        },
      },
      getBotProfile('balanced'),
      freshBotMood(),
      'off',
      () => 0.5,
    );
  const few = decide(1),
    many = decide(4);
  assert.ok(few.trace.openingRange > many.trace.openingRange);
  assert.equal(few.trace.view, undefined);
  assert.equal(few.trace.actionContext.unactedBehindCount, 1);
  assert.equal(many.trace.actionContext.unactedBehindCount, 4);
});

test('public prior actions and raiser position narrow or widen the same candidate range', () => {
  const base = facing('Ah Qd', 'Js 8c 2h'),
    view = {
      ...base,
      street: 0,
      board: [],
      history: [{ id: 1, street: 0, action: 'raise', amount: 600 }],
    },
    open = preparePublicRanges(view)[0],
    threeBet = preparePublicRanges({
      ...view,
      history: [
        { id: 2, street: 0, action: 'raise', amount: 600 },
        { id: 1, street: 0, action: 'raise', amount: 1800 },
      ],
    })[0],
    early = preparePublicRanges({
      ...view,
      opponents: [{ ...view.opponents[0], position: 'UTG' }],
    })[0];
  assert.ok(publicComboWeight(cards('9s 8s'), open) > publicComboWeight(cards('9s 8s'), threeBet));
  assert.ok(publicComboWeight(cards('9s 8s'), open) > publicComboWeight(cards('9s 8s'), early));
  const shove = coldShoveResponse();
  const botView = botDecision(shove, allInRandom(7), { trials: 8 }).trace.view;
  const withoutTrace = { ...botView };
  delete withoutTrace.allIn;
  assert.deepEqual(
    preparePublicRanges(withoutTrace),
    preparePublicRanges(botView),
    'Public ledger and history reconstruct the shove range without recorded traces',
  );
});

test('board-weighted equity supports a priced structured HU call but rejects an expensive call and stronger multiway ranges', () => {
  const priced = facing('Qs Qd', 'Js 7h 2c', { callAmount: 2500, pot: 10000 });
  const expensive = facing('Jh Td', 'Js 7h 2c', { callAmount: 18000, pot: 20000 });
  expensive.history.unshift(
    { id: 0, street: 0, action: 'raise', amount: 600 },
    { id: 1, street: 0, action: 'raise', amount: 2000 },
    { id: 0, street: 0, action: 'raise', amount: 6000 },
    { id: 1, street: 0, action: 'call', amount: 6000 },
  );
  expensive.opponents[0].position = 'UTG';
  assert.equal(decision(priced).action, 'call');
  assert.equal(decision(expensive).action, 'fold');
  const broad = estimate(
    facing('As Jh', 'Jd 7c 2h', { callAmount: 3000, opponents: 1, action: 'check' }),
  );
  const strongMultiway = estimate(
    facing('As Jh', 'Jd 7c 2h', { callAmount: 18000, pot: 20000, opponents: 3 }),
  );
  assert.ok(broad.equity > strongMultiway.equity);
  assert.equal(
    decision(facing('As Jh', 'Jd 7c 2h', { callAmount: 18000, pot: 20000, opponents: 3 })).action,
    'fold',
  );
});

test('changing the public board and prior betting changes equity while hidden state cannot', () => {
  const dry = facing('Ah Th', 'Jh 7h 3h 2s 4c', { callAmount: 2000 }),
    paired = { ...dry, board: cards('Jh 7h 3h 2s 7c') };
  const before = estimate(dry),
    after = estimate(paired);
  assert.ok(before.equity > after.equity);
  const checked = {
    ...paired,
    history: paired.history.map((action) => ({ ...action, action: 'check', amount: 0 })),
  };
  assert.notEqual(after.equity, estimate(checked).equity);
  const hidden = structuredClone(paired);
  hidden.opponents[0].hole = cards('Kh Qh');
  hidden.futureDeck = cards('As Ad');
  hidden.winners = [{ id: 1 }];
  hidden.result = 'opponent won';
  assert.deepEqual(preparePublicRanges(hidden), preparePublicRanges(paired));
  assert.deepEqual(estimate(hidden), after);
});

test('ordinary public equity avoids whole-combination enumeration and preserves the requested trial budget', () => {
  const view = facing('As Ah', 'Ks 8h 3c 2d', { opponents: 3 });
  view.history = [];
  let calls = 0;
  const result = estimate(view, 71, {
    evaluate: (cards) => {
      calls++;
      return evaluate(cards);
    },
  });
  assert.equal(result.samples, 52);
  assert.equal(result.cdfFallbacks, 0);
  assert.equal(result.proposals, 52 * 3);
  assert.ok(calls < 500, `Normal estimation made ${calls} evaluations`);
  assert.equal(result.winProbability + result.tieProbability + result.lossProbability, 1);
});

test('a narrow preflop prior is sampled before postflop conditioning within the ordinary evaluation budget', () => {
  const view = facing('Qs Qd', 'Js 7h 2c', { callAmount: 18000, pot: 20000 });
  view.history.unshift(
    { id: 0, street: 0, action: 'raise', amount: 600 },
    { id: 1, street: 0, action: 'raise', amount: 2000 },
    { id: 0, street: 0, action: 'raise', amount: 6000 },
    { id: 1, street: 0, action: 'call', amount: 6000 },
  );
  let calls = 0;
  const result = estimate(view, 71, {
    evaluate: (cards) => {
      calls++;
      return evaluate(cards);
    },
  });
  assert.equal(result.samples, 52);
  assert.equal(result.cdfFallbacks, 0);
  assert.ok(result.proposals < 52 * 6);
  assert.ok(calls < 400, `Narrow public range made ${calls} evaluations`);
});

test('rank-class sampling agrees with exact available-pair mass for blocked narrow and suited ranges', () => {
  const pool = cards('As Ah Kd Kh Qs Jd 9s 8h'),
    descriptors = [
      { board: [], preflop: { action: 'raise', raises: 3, amountBB: 15 }, position: 'UTG' },
      {
        board: [],
        allIn: true,
        street: 0,
        role: 'shover',
        line: 'cold-shove',
        depthBB: 100,
        position: 'BTN',
      },
    ];
  for (const descriptor of descriptors) {
    let weightTotal = 0,
      expectedPairs = 0,
      expectedSuited = 0;
    for (let a = 0; a < pool.length; a++)
      for (let b = a + 1; b < pool.length; b++) {
        const weight = publicComboWeight([pool[a], pool[b]], descriptor, { board: [] });
        weightTotal += weight;
        if (pool[a].rank === pool[b].rank) expectedPairs += weight;
        if (pool[a].suit === pool[b].suit) expectedSuited += weight;
      }
    const random = allInRandom(97),
      stats = {};
    let pairs = 0,
      suited = 0;
    for (let trial = 0; trial < 5000; trial++) {
      const sampled = samplePublicPair(pool, descriptor, { random, evaluate, compare, stats });
      assert.ok(sampled[0] !== sampled[1] && sampled.every((card) => pool.includes(card)));
      if (sampled[0].rank === sampled[1].rank) pairs++;
      if (sampled[0].suit === sampled[1].suit) suited++;
    }
    assert.ok(Math.abs(pairs / 5000 - expectedPairs / weightTotal) < 0.025);
    assert.ok(Math.abs(suited / 5000 - expectedSuited / weightTotal) < 0.025);
    assert.equal(stats.cdfFallbacks || 0, 0);
  }
});

test('postflop conditional and all-in uniform proposals agree with the same exact CDF target', () => {
  const pool = cards('As Ah Kd Kh 7s 2h'),
    board = cards('Qs Jh 9h');
  const descriptors = [
    {
      board,
      street: 1,
      preflop: { action: 'raise', raises: 3, amountBB: 15 },
      postflop: { action: 'raise', ratio: 3 },
      position: 'UTG',
    },
    { board, street: 1, allIn: true, role: 'caller', aggressionRatio: 3 },
  ];
  for (const descriptor of descriptors) {
    let total = 0,
      overpairMass = 0;
    for (let a = 0; a < pool.length; a++)
      for (let b = a + 1; b < pool.length; b++) {
        const pair = [pool[a], pool[b]],
          score = evaluate([...pair, ...board]).score,
          features = botBoardFeatures(pair, board, score),
          weight = publicComboWeight(pair, descriptor, { board, score, features, compare });
        total += weight;
        if (features.overpair) overpairMass += weight;
      }
    const random = allInRandom(193),
      cache = new Map();
    let overpairs = 0;
    for (let trial = 0; trial < 4000; trial++) {
      const pair = samplePublicPair(pool, descriptor, {
        random,
        evaluate,
        features: botBoardFeatures,
        compare,
        cache,
      });
      const score = evaluate([...pair, ...board]).score;
      if (botBoardFeatures(pair, board, score).overpair) overpairs++;
    }
    assert.ok(Math.abs(overpairs / 4000 - overpairMass / total) < 0.025);
  }
});

test('narrow postflop rejection has a bounded exact CDF fallback rather than uniform cards', () => {
  const pool = cards('As Ah 2d'),
    descriptor = {
      board: cards('Ac Kc Qh'),
      street: 1,
      allIn: true,
      role: 'caller',
      aggressionRatio: 9,
    },
    stats = {};
  let randomCalls = 0;
  const pair = samplePublicPair(pool, descriptor, {
    random: () => (++randomCalls <= 72 ? 0.9999 : 0),
    evaluate,
    compare,
    stats,
  });
  assert.deepEqual(pair, cards('As Ah'));
  assert.equal(stats.proposals, 24);
  assert.equal(stats.cdfFallbacks, 1);
  assert.equal(randomCalls, 73);
  assert.deepEqual(pool, cards('As Ah 2d'));
});

// Captured from the full pre-factory implementation on source 6933bd9d, with
// seed 197 and 64 draws. These independent oracles guard the refactor itself,
// not only two entry points that now share the same implementation.
const samplerGoldens = [
  [
    'unentered-preflop',
    { board: [], preflop: { action: null, raises: 0, amountBB: 1 } },
    'a73e8b28cee7c0e37b5969995a955c6713c92111893cca57862e417c0ff6f56d',
    181,
    64,
    0,
  ],
  [
    'narrow-preflop',
    { board: [], position: 'UTG', preflop: { action: 'raise', raises: 3, amountBB: 15 } },
    'fcaef21a1b1136f7073abdfb7d75593b688e6e2a90b0eb7a0b35d8554ca300a3',
    177,
    64,
    0,
  ],
  [
    'allin-preflop',
    {
      board: [],
      street: 0,
      allIn: true,
      position: 'BTN',
      role: 'shover',
      line: 'cold-shove',
      depthBB: 100,
    },
    'a5adc97027698b16df52a1b000123c8032892c31255f7ab1e7cab0e3eea3003d',
    173,
    64,
    0,
  ],
  [
    'normal-flop',
    {
      board: cards('Qc Jh 9h'),
      street: 1,
      position: 'UTG',
      preflop: { action: 'raise', raises: 3, amountBB: 15 },
      postflop: { action: 'raise', ratio: 3 },
    },
    'b46b068c1a2e4df53246c5ac78dce39ca4d3bf7a13eeb1e7eaaf46816b111675',
    469,
    126,
    0,
  ],
  [
    'allin-flop',
    { board: cards('Qc Jh 9h'), street: 1, allIn: true, role: 'caller', aggressionRatio: 3 },
    'ef3421884426f6f09f4f4662c50071b74a3b7e291bdcd14802664e62a4a35416',
    1116,
    378,
    1,
  ],
  [
    'normal-river',
    {
      board: cards('Qc Jh 9h 3s 2d'),
      street: 3,
      position: 'UTG',
      preflop: { action: 'call', raises: 2, amountBB: 10 },
      postflop: { action: 'raise', ratio: 3 },
    },
    'b8a629971d48b53ef5a173d6374503d87f1b93b7c4d35c32eff7f374b00df61b',
    851,
    230,
    0,
  ],
];

for (const [name, descriptor, digest, calls, proposals, fallbacks] of samplerGoldens) {
  test(`fixed-pool ${name} preserves every pre-factory pair, random call and rejection statistic`, () => {
    const pool = cards('As Ah Kd Kh Qs Jd 9s 8h 7c 6c 5s 2h'),
      before = JSON.stringify({ pool, descriptor });
    const sequences = [];
    for (const reuse of [false, true]) {
      const cache = new Map(),
        stats = {},
        seeded = allInRandom(197);
      let randomCalls = 0;
      const random = () => {
          randomCalls++;
          return seeded();
        },
        options = { evaluate, features: botBoardFeatures, compare, cache },
        draw = reuse ? createPublicPairSampler(pool, descriptor, options) : null;
      assert.equal(randomCalls, 0, 'Preparing a factory must never consume random state');
      const sequence = [];
      for (let trial = 0; trial < 64; trial++) {
        const pair = reuse
          ? draw({ random, stats })
          : samplePublicPair(pool, descriptor, { ...options, random, stats });
        assert.ok(pair[0] !== pair[1] && pair.every((card) => pool.includes(card)));
        sequence.push(pair.map((card) => card.key));
      }
      assert.equal(createHash('sha256').update(JSON.stringify(sequence)).digest('hex'), digest);
      assert.equal(randomCalls, calls);
      assert.equal(stats.proposals, proposals);
      assert.equal(stats.cdfFallbacks || 0, fallbacks);
      sequences.push(sequence);
    }
    assert.deepEqual(sequences[0], sequences[1]);
    assert.equal(JSON.stringify({ pool, descriptor }), before);
  });
}

test('a fixed-pool factory captures its own current public range and copied pool', () => {
  const pool = cards('As Ah Kd Kh Qs Jd 9s 8h 7c 6c 5s 2h'),
    descriptor = structuredClone(samplerGoldens[3][1]),
    options = { evaluate, features: botBoardFeatures, compare },
    captured = createPublicPairSampler(pool, descriptor, options),
    reference = createPublicPairSampler([...pool], structuredClone(descriptor), options);
  pool.reverse();
  pool.pop();
  descriptor.position = 'BTN';
  descriptor.preflop.action = null;
  descriptor.postflop.ratio = 0;
  const left = allInRandom(197),
    right = allInRandom(197);
  for (let trial = 0; trial < 64; trial++)
    assert.deepEqual(captured({ random: left }), reference({ random: right }));
});

test('win probability is independent of shared-board ties and side-pot share', () => {
  const view = facing('2c 3d', 'As Ks Qs Js Ts', { opponents: 3 });
  const result = estimate(view);
  assert.equal(result.winProbability, 0);
  assert.equal(result.tieProbability, 1);
  assert.equal(result.lossProbability, 0);
  assert.equal(result.equity, 0.25);
});

for (const smallBlind of [25, 100, 300, 50000]) {
  test(`ordinary future-caller exposure uses only current money and settles whole ${smallBlind} chips`, () => {
    const stakes = {
        smallBlind,
        bigBlind: smallBlind * 2,
        chipUnit: smallBlind,
        startingStack: smallBlind * 200,
      },
      game = newGame(6, stakes);
    startHand(game);
    const wealth = game.players.reduce((sum, player) => sum + player.stack + player.total, 0),
      chosen = botDecision(game, allInRandom(71), { trials: 52 }),
      view = chosen.trace.view;
    assert.equal(
      view.equityPots.reduce((sum, pot) => sum + pot.amount, 0),
      view.callPrice.contestable,
    );
    assert.ok(view.publicEquity.equity < 1);
    finishAfterResponse(game, chosen);
    assert.equal(
      game.players.reduce((sum, player) => sum + player.stack, 0),
      wealth,
    );
    for (const amount of [...game.payouts, ...game.refunds.map((refund) => refund.amount)])
      assert.equal(amount % smallBlind, 0);
  });
  test(`new public policy settles real decisions with dynamic ${smallBlind}/${smallBlind * 2} chips conserved`, () => {
    const stakes = {
      smallBlind,
      bigBlind: smallBlind * 2,
      chipUnit: smallBlind,
      startingStack: smallBlind * 200,
    };
    const game = flopShoveResponse('Qs Qd', 5000, 5000, stakes),
      before = game.players.reduce((sum, p) => sum + p.stack + p.total, 0),
      chosen = botDecision(game, allInRandom(19), { trials: 52 });
    assert.equal(chosen.trace.view.actionContext.unactedBehindCount, 3);
    assert.ok(chosen.trace.view.opponents.every((p) => p.position && !('hole' in p)));
    const hidden = structuredClone(game);
    hidden.players[0].hole = cards('As Ah');
    hidden.deck.reverse();
    hidden.winners = [{ id: 0 }];
    assert.deepEqual(botDecision(hidden, allInRandom(19), { trials: 52 }), chosen);
    finishAfterResponse(game, chosen);
    assert.equal(
      game.players.reduce((sum, p) => sum + p.stack, 0),
      before,
    );
    for (const amount of [
      ...game.payouts,
      ...game.refunds.map((r) => r.amount),
      ...game.pots.flatMap((pot) => pot.awards.map((award) => award.amount)),
    ])
      assert.equal(amount % smallBlind, 0);
  });
}

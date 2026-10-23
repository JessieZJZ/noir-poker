import test from 'node:test';
import assert from 'node:assert/strict';
import {
  botDecision,
  legalActions,
  partitionPots,
  potSize,
  deckOfCards,
  evaluate,
  compare,
} from '../../src/engine/poker.js';
import { allInContext, estimateAllInEquity } from '../../src/engine/bot-allin.js';
import { cards } from '../fixtures/deceptive-decisions.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';
import {
  allInRandom,
  coldShoveResponse,
  openerShoveResponse,
  flopShoveResponse,
  multiRaiseShoveResponse,
  largeFourBetResponse,
  oldShortAllInSideBet,
  earlierShortAndFlopShoveResponse,
  riverShoveResponse,
  finishAfterResponse,
  reviewedAllInGame,
} from '../fixtures/all-in-decisions.js';

const decide = (game) => botDecision(game, allInRandom(1), { trials: 120 });
const bank = (game) => game.players.reduce((sum, p) => sum + p.stack + p.total, 0);
function assertSettlesLegally(game, decision) {
  const wealth = bank(game),
    legal = legalActions(game);
  assert.ok(['fold', 'call', 'raise', 'check'].includes(decision.action));
  if (decision.action === 'call') assert.ok(legal.callAmount > 0);
  if (decision.action === 'raise') {
    assert.equal(legal.canRaise, true);
    assert.ok(decision.amount <= legal.maxRaiseTo);
    assert.ok(decision.amount >= legal.minRaiseTo || decision.amount === legal.maxRaiseTo);
  }
  finishAfterResponse(game, decision);
  assert.equal(game.phase, 'done');
  assert.equal(
    game.players.reduce((sum, p) => sum + p.stack, 0),
    wealth,
  );
  for (const amount of [
    ...game.players.flatMap((p) => [p.stack, p.total, p.bet]),
    ...game.payouts,
    ...game.refunds.map((r) => r.amount),
    ...game.pots.flatMap((p) => [p.amount, ...p.awards.map((a) => a.amount)]),
  ]) {
    assert.ok(Number.isInteger(amount) && amount >= 0);
    assert.equal(amount % game.chipUnit, 0);
  }
  for (const pot of game.pots) {
    assert.equal(
      pot.awards.reduce((sum, award) => sum + award.amount, 0),
      pot.amount,
    );
    assert.ok(pot.awards.every((award) => pot.eligible.includes(award.id)));
  }
}

test('real shove contexts separate confirmed commitments from seats still deciding', () => {
  for (const [fixture, line, committed, waiting, cost, contestable] of [
    [coldShoveResponse, 'cold-shove', [0], [2, 3, 4, 5], 5000, 10075],
    [openerShoveResponse, 'reraise-shove', [0], [], 4850, 10075],
    [flopShoveResponse, 'postflop-shove', [0], [2, 3, 4], 4950, 10150],
    [multiRaiseShoveResponse, 'multi-raise-shove', [0, 1], [4, 5], 4850, 16050],
  ]) {
    const game = fixture(),
      decision = decide(game),
      view = decision.trace.view,
      context = view.allIn;
    assert.equal(context.line, line);
    assert.deepEqual(context.committedIds, committed);
    assert.deepEqual(context.waitingIds, waiting);
    assert.equal(context.ranges.length, committed.length);
    assert.ok(context.ranges.every((range) => !waiting.includes(range.id)));
    assert.equal(context.cost, cost);
    assert.equal(context.contestable, contestable);
    assert.equal(context.odds, cost / contestable);
    assert.equal(context.depthBB, 100);
    assert.equal(decision.trace.equityModel, 'public-all-in-ranges');
    assert.equal(
      view.callPots.reduce((sum, pot) => sum + pot.amount, 0),
      contestable,
    );
    assert.ok(view.callPots.every((pot) => pot.eligible.includes(view.id)));
    assert.equal(view.rivals, committed.length + waiting.length);
  }
});

test('flop overpair can defend a shove while three pending seats are not imaginary showdown hands', () => {
  const game = flopShoveResponse(),
    decision = decide(game);
  assert.equal(decision.action, 'call');
  assert.equal(decision.trace.reason, 'price-continue');
  assert.equal(decision.trace.view.features.overpair, true);
  assert.deepEqual(decision.trace.allIn.committedIds, [0]);
  assert.deepEqual(decision.trace.allIn.waitingIds, [2, 3, 4]);
  assert.ok(decision.trace.allIn.equity > decision.trace.allIn.odds);
  assertSettlesLegally(game, decision);
});

test('cold and re-raise shoves allow strong defense without making every premium tier a mandatory call', () => {
  for (const fixture of [coldShoveResponse, openerShoveResponse])
    for (const hole of ['As Ah', 'Ks Kd']) {
      const game = fixture(hole),
        decision = decide(game);
      assert.equal(decision.action, 'call', `${fixture.name}: ${hole}`);
      assert.equal(decision.trace.reason, 'price-continue');
      assertSettlesLegally(game, decision);
    }
  for (const hole of ['As Qh', '7s 7h', '7s 2h']) {
    const game = coldShoveResponse(hole),
      decision = decide(game);
    assert.equal(decision.action, 'fold', hole);
    assert.equal(decision.trace.reason, 'insufficient-equity');
    assertSettlesLegally(game, decision);
  }
});

test('actual 4-bet plus a full caller narrows defense rather than treating QQ like AA', () => {
  for (const [hole, action] of [
    ['Qs Qd', 'fold'],
    ['As Ah', 'call'],
    ['7s 2h', 'fold'],
  ]) {
    const game = multiRaiseShoveResponse(hole),
      decision = decide(game);
    assert.equal(decision.action, action, hole);
    assert.deepEqual(
      decision.trace.allIn.ranges.map((r) => [r.id, r.role]),
      [
        [0, 'shover'],
        [1, 'caller'],
      ],
    );
    assert.equal(decision.trace.allIn.odds, 4850 / 16050);
    assertSettlesLegally(game, decision);
  }
});

test('a near-all-in 4-bet prices the real risk without restoring automatic 77 premium defense', () => {
  for (const amount of [4000, 5000])
    for (const [hole, action] of [
      ['7s 7h', 'fold'],
      ['As Ah', 'call'],
    ]) {
      const game = largeFourBetResponse(hole, amount),
        decision = decide(game),
        pressure = decision.trace.allIn;
      assert.equal(decision.action, action, `${hole}/${amount}`);
      assert.equal(pressure.line, 'multi-raise-shove');
      assert.equal(pressure.cost, amount - 150);
      assert.equal(pressure.aggressorAllIn, amount === 5000);
      assert.equal(pressure.callerAllIn, amount === 5000);
      assert.equal(pressure.highCommitment, true);
      assert.deepEqual(pressure.waitingIds, [4]);
      assertSettlesLegally(game, decision);
    }
});

test('20 BB shove depth and capped caller eligibility change actual price and continuation', () => {
  const shortShove = openerShoveResponse('Qs Qd', 1000),
    shortDecision = decide(shortShove);
  assert.equal(shortDecision.trace.allIn.depthBB, 20);
  assert.equal(shortDecision.trace.allIn.cost, 850);
  assert.equal(shortDecision.trace.allIn.contestable, 2075);
  assert.equal(shortDecision.action, 'call');
  assertSettlesLegally(shortShove, shortDecision);
  const capped = flopShoveResponse('Qs Qd', 5000, 1000),
    decision = decide(capped);
  assert.equal(potSize(capped), 5200);
  assert.equal(decision.trace.allIn.cost, 950);
  assert.equal(decision.trace.allIn.contestable, 2150);
  assert.equal(decision.trace.allIn.odds, 950 / 2150);
  assert.equal(decision.action, 'call');
  assertSettlesLegally(capped, decision);
  assert.deepEqual(capped.refunds, [{ id: 0, amount: 4000 }]);
  assert.equal(
    capped.pots.reduce((sum, pot) => sum + pot.amount, 0),
    2150,
  );
});

test('earlier short all-in keeps its original public range and only competes for the main pot', () => {
  const game = earlierShortAndFlopShoveResponse(),
    decision = decide(game),
    view = decision.trace.view;
  assert.deepEqual(
    view.allIn.ranges.map((r) => [r.id, r.role, r.street, r.depthBB]),
    [
      [0, 'shover', 1, 100],
      [1, 'shover', 0, 2],
    ],
  );
  assert.deepEqual(view.callPots, [
    { amount: 500, eligible: [0, 1, 2, 3, 4] },
    { amount: 9800, eligible: [0, 2] },
  ]);
  assert.equal(view.allIn.contestable, 10300);
  assertSettlesLegally(game, decision);
  assert.ok(game.pots.filter((pot) => pot.amount > 500).every((pot) => !pot.eligible.includes(1)));
  const normalSideBet = decide(oldShortAllInSideBet());
  assert.equal(allInContext(normalSideBet.trace.view), null);
  assert.equal(normalSideBet.trace.allIn, null);
  assert.equal(normalSideBet.trace.equityModel, 'public-action-ranges');
});

test('shared royal and private river nuts defend guaranteed nonlosing calls and settle in whole chips', () => {
  const shared = riverShoveResponse(),
    sharedDecision = decide(shared);
  assert.equal(sharedDecision.trace.view.board.length, 5);
  assert.equal(sharedDecision.trace.allIn.equity, 0.5);
  assert.equal(sharedDecision.trace.allIn.unbeatableRiver, true);
  assert.equal(sharedDecision.trace.allIn.guaranteedReturn, 5000);
  assert.ok(sharedDecision.trace.allIn.guaranteedReturn >= sharedDecision.trace.allIn.cost);
  assert.ok(
    sharedDecision.trace.allIn.odds + sharedDecision.trace.allIn.pendingBuffer + 0.02 > 0.5,
  );
  assert.equal(
    sharedDecision.action,
    'call',
    'A shared royal cannot lose to any legal unknown cards',
  );
  assertSettlesLegally(shared, sharedDecision);
  assert.deepEqual(shared.payouts, [5075, 5075, 0, 0, 0]);
  assert.deepEqual(partitionPots(shared).pots[0].eligible, [0, 1]);
  const nuts = riverShoveResponse('Ah Kh', 'Qh Jh Th 2c 3d'),
    nutsDecision = decide(nuts);
  assert.equal(nutsDecision.trace.allIn.equity, 1);
  assert.equal(nutsDecision.trace.allIn.unbeatableRiver, true);
  assert.equal(nutsDecision.action, 'call');
  assertSettlesLegally(nuts, nutsDecision);
  assert.equal(nuts.payouts[1], 10150);
});

test('guaranteed river return floors each tied pot to whole 25 chips before summing', () => {
  // A public pot-share arithmetic boundary, not a complete wager ledger or
  // a claim that an arbitrary call cost would be legal in this fixture.
  const view = {
    bigBlind: 50,
    chipUnit: 25,
    id: 1,
    hole: cards('2c 3d'),
    board: cards('As Ks Qs Js Ts'),
    street: 3,
    pot: 200,
    currentBet: 100,
    opponents: [
      { id: 0, bet: 100, allin: true },
      { id: 2, bet: 25, allin: true },
    ],
    allIn: { aggressorId: 0 },
    callPots: [
      { amount: 125, eligible: [0, 1, 2] },
      { amount: 75, eligible: [0, 1] },
    ],
  };
  const context = {
    committedIds: [0, 2],
    ranges: [
      { id: 0, role: 'shover', street: 3, line: 'postflop-shove', depthBB: 2 },
      { id: 2, role: 'caller', street: 3, line: 'postflop-shove', depthBB: 1 },
    ],
  };
  const assessment = estimateAllInEquity(view, context, {
    deck: deckOfCards(),
    evaluate,
    compare,
    trials: 4,
    random: allInRandom(1),
  });
  assert.equal(assessment.unbeatableRiver, true);
  assert.equal(assessment.guaranteedReturn, 50);
  assert.equal(assessment.guaranteedReturn % 25, 0);
  assert.ok(assessment.guaranteedReturn < 125 / 3 + 75 / 2);
});

test('all-in decisions ignore actual opponent holes, future deck, reviews and winners', () => {
  for (const fixture of [flopShoveResponse, multiRaiseShoveResponse, riverShoveResponse]) {
    const original = fixture(),
      altered = structuredClone(original),
      other = altered.players.filter((p) => p.id !== altered.actor),
      hands = other.map((p) => p.hole);
    other.forEach((p, index) => (p.hole = hands[(index + 1) % hands.length]));
    altered.deck.reverse();
    altered.winners = [{ id: altered.actor, amount: 999999 }];
    altered.decisions = [{ action: 'fold', grade: 'keep' }];
    altered.botDecisions = [{ trace: { reason: 'premium-continue' } }];
    const actual = decide(original),
      changed = decide(altered);
    assert.deepEqual(changed, actual);
    assert.equal(Object.hasOwn(actual.trace.view, 'deck'), false);
    assert.equal(Object.hasOwn(actual.trace.view, 'winners'), false);
    assert.ok(actual.trace.view.opponents.every((p) => !Object.hasOwn(p, 'hole')));
  }
});

test('real executed bot plans replay their own call or fold motive without raw simulations', () => {
  for (const [kind, action, cost] of [
    ['flop-qq', 'call', '4.95K'],
    ['multi-qq', 'fold', '4.85K'],
    ['shared-royal', 'call', '4.95K'],
  ]) {
    const game = reviewedAllInGame(kind),
      record = game.botDecisions[0],
      review = explainOpponent(record, game.players);
    assert.equal(record.action, action);
    assert.equal(record.sequence, record.trace.view.history.length + 1);
    assert.match(review.detail, new RegExp(cost));
    assert.ok(review.detail.includes(record.name));
    assert.match(review.detail, /全下/);
    assert.deepEqual(review.metrics, []);
    assert.doesNotMatch(review.detail, /随机范围|抽样|EV|它|模拟器|模型/);
    if (kind === 'flop-qq') {
      assert.match(review.detail, /超对 Q/);
      assert.match(review.detail, /10.15K/);
      assert.match(review.detail, /之后不再参与下注决策/);
      assert.doesNotMatch(review.detail, /9♦ 8♣/);
    } else if (kind === 'shared-royal') assert.match(review.detail, /平分底池/);
  }
});

test('a large non-all-in continuation does not claim the aggressor cannot bet again', () => {
  const game = reviewedAllInGame('deep-nonallin'),
    record = game.botDecisions[0],
    review = explainOpponent(record, game.players);
  assert.equal(record.action, 'call');
  assert.equal(record.trace.allIn.highCommitment, true);
  assert.equal(record.trace.allIn.aggressorAllIn, false);
  assert.equal(record.trace.allIn.callerAllIn, false);
  assert.match(review.detail, /4K/);
  assert.match(review.detail, /3\.85K/);
  assert.doesNotMatch(review.detail, /全下者已|跟完就已全下|之后只能等|只能等发牌/);
});

test('actual all-in motives localize across all supported locales without losing names or call amounts', async () => {
  const cases = ['flop-qq', 'multi-qq', 'shared-royal'].map((kind) => {
    const game = reviewedAllInGame(kind),
      record = game.botDecisions[0],
      review = explainOpponent(record, game.players);
    return { record, texts: [review.title, ...review.paragraphParts.flat(), ...review.reasons] };
  });
  for (const locale of SUPPORTED_LOCALES) {
    await loadLocale(locale);
    for (const { record, texts } of cases)
      for (const text of texts) {
        const translated = localizeText(text);
        assert.doesNotMatch(translated, /\{\d+\}/, `${locale}: unresolved placeholder`);
        if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
          assert.doesNotMatch(translated, /\p{Script=Han}/u, `${locale}: ${translated}`);
        for (const value of [record.name, '4.95K', '4.85K', '10.15K'])
          if (text.includes(value))
            assert.ok(translated.includes(localizeText(value)), `${locale}: ${value}`);
      }
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stakesFromSmallBlind } from '../../src/engine/stakes.js';
import { botDecision, deckOfCards, evaluate, compare } from '../../src/engine/poker.js';
import { allInContext, estimateAllInEquity } from '../../src/engine/bot-allin.js';
import { chooseBotAction, getBotProfile, freshBotMood } from '../../src/engine/bot-profiles.js';
import { botThinkingTime } from '../../src/engine/bot-timing.js';
import { cards, deceptionCases } from '../fixtures/deceptive-decisions.js';
import {
  allInRandom,
  coldShoveResponse,
  openerShoveResponse,
  flopShoveResponse,
  multiRaiseShoveResponse,
  largeFourBetResponse,
  nearAllInDrawResponse,
  riverShoveResponse,
  finishAfterResponse,
} from '../fixtures/all-in-decisions.js';

const configurations = [100, 300, 50000].map(stakesFromSmallBlind);
const scaleView = (view, stakes) => {
  const ratio = stakes.bigBlind / view.bigBlind;
  const amounts = (object, fields) =>
    Object.fromEntries(
      fields.filter((key) => object[key] !== undefined).map((key) => [key, object[key] * ratio]),
    );
  return {
    ...view,
    ...stakes,
    ...amounts(view, ['stack', 'bet', 'total', 'pot', 'currentBet', 'contestable']),
    history: view.history.map((action) => ({ ...action, amount: action.amount * ratio })),
    opponents: view.opponents.map((player) => ({
      ...player,
      ...amounts(player, ['stack', 'bet', 'total']),
    })),
    legal: {
      ...view.legal,
      ...amounts(view.legal, ['toCall', 'callAmount', 'minRaiseTo', 'maxRaiseTo']),
      chipUnit: stakes.chipUnit,
    },
  };
};

for (const stakes of configurations) {
  test(`merged shove defense keeps BB depth, price, outcomes and chip conservation at ${stakes.smallBlind}/${stakes.bigBlind}`, () => {
    for (const [fixture, action] of [
      [() => coldShoveResponse('As Ah', stakes), 'call'],
      [() => openerShoveResponse('Ks Kd', 5000, 5000, stakes), 'call'],
      [() => flopShoveResponse('Qs Qd', 5000, 5000, stakes), 'call'],
      [() => flopShoveResponse('Qs Qd', 5000, 1000, stakes), 'call'],
      [() => multiRaiseShoveResponse('Qs Qd', stakes), 'fold'],
      [() => largeFourBetResponse('7s 7h', 4000, stakes), 'fold'],
      [() => riverShoveResponse('2c 3d', 'As Ks Qs Js Ts', stakes), 'call'],
    ]) {
      const game = fixture();
      const budget = game.players.reduce((sum, player) => sum + player.stack + player.total, 0);
      const decision = botDecision(game, allInRandom(1), { trials: 120 });
      assert.equal(decision.action, action);
      assert.deepEqual(game.stakes, stakes);
      assert.ok([20, 80, 100].includes(decision.trace.allIn.depthBB));
      assert.ok(
        decision.trace.allIn.ranges.every(
          (range) => range.depthBB === decision.trace.allIn.depthBB,
        ),
      );
      assert.equal(decision.trace.allIn.cost % stakes.chipUnit, 0);
      assert.equal(decision.trace.allIn.contestable % stakes.chipUnit, 0);
      if (decision.trace.allIn.unbeatableRiver)
        assert.equal(decision.trace.allIn.guaranteedReturn, stakes.startingStack);
      finishAfterResponse(game, decision);
      assert.equal(game.phase, 'done');
      assert.equal(
        game.players.reduce((sum, player) => sum + player.stack, 0),
        budget,
      );
      for (const amount of [
        ...game.players.flatMap((player) => [player.stack, player.bet, player.total]),
        ...game.payouts,
        ...game.refunds.map((refund) => refund.amount),
        ...game.pots.flatMap((pot) => [pot.amount, ...pot.awards.map((award) => award.amount)]),
      ])
        assert.equal(amount % stakes.chipUnit, 0);
      for (const pot of game.pots)
        assert.equal(
          pot.awards.reduce((sum, award) => sum + award.amount, 0),
          pot.amount,
        );
      if (decision.trace.allIn.depthBB === 20)
        assert.deepEqual(game.refunds, [{ id: 0, amount: 80 * stakes.bigBlind }]);
    }
  });

  test(`high commitment threshold and guaranteed tie floors follow live BB/SB at ${stakes.smallBlind}/${stakes.bigBlind}`, () => {
    const publicView = (matched) => ({
      ...stakes,
      id: 1,
      street: 0,
      stack: 40 * stakes.bigBlind,
      bet: 0,
      currentBet: matched,
      history: [
        { id: 2, street: 0, action: 'raise', amount: 3 * stakes.bigBlind },
        { id: 0, street: 0, action: 'raise', amount: matched },
      ],
      opponents: [{ id: 0, stack: stakes.startingStack, bet: matched, allin: false }],
      legal: { callAmount: matched, canCheck: false },
    });
    assert.equal(allInContext(publicView(20 * stakes.bigBlind - stakes.chipUnit)), null);
    assert.equal(allInContext(publicView(20 * stakes.bigBlind)).highCommitment, true);
    const view = {
      ...stakes,
      id: 1,
      hole: cards('2c 3d'),
      board: cards('As Ks Qs Js Ts'),
      street: 3,
      pot: 8 * stakes.chipUnit,
      currentBet: 4 * stakes.chipUnit,
      opponents: [
        { id: 0, bet: 4 * stakes.chipUnit, allin: true },
        { id: 2, bet: stakes.chipUnit, allin: true },
      ],
      allIn: { aggressorId: 0 },
      callPots: [
        { amount: 5 * stakes.chipUnit, eligible: [0, 1, 2] },
        { amount: 3 * stakes.chipUnit, eligible: [0, 1] },
      ],
    };
    const assessment = estimateAllInEquity(
      view,
      {
        committedIds: [0, 2],
        ranges: [0, 2].map((id) => ({
          id,
          role: 'shover',
          street: 3,
          line: 'postflop-shove',
          depthBB: 2,
        })),
      },
      { deck: deckOfCards(), evaluate, compare, trials: 2, random: allInRandom(1) },
    );
    assert.equal(assessment.unbeatableRiver, true);
    assert.equal(assessment.guaranteedReturn, 2 * stakes.chipUnit);
  });

  test(`deceptive sizing, near-all-in draw defense and real pacing scale at ${stakes.smallBlind}/${stakes.bigBlind}`, () => {
    const profile = getBotProfile('balanced');
    for (const view of Object.values(deceptionCases())) {
      const baseline = chooseBotAction(view, profile, freshBotMood(), 'off', () => 0);
      const scaled = scaleView(view, stakes);
      const decision = chooseBotAction(scaled, profile, freshBotMood(), 'off', () => 0);
      assert.equal(decision.action, baseline.action);
      assert.equal(decision.trace.reason, baseline.trace.reason);
      if (decision.action === 'raise') {
        assert.equal(decision.amount, (baseline.amount * stakes.bigBlind) / view.bigBlind);
        assert.equal(decision.amount % stakes.chipUnit, 0);
        assert.equal(
          decision.trace.sizing.desired,
          (baseline.trace.sizing.desired * stakes.bigBlind) / view.bigBlind,
        );
      }
      const originalTiming = botThinkingTime(
        { ...baseline, trace: { ...baseline.trace, view } },
        () => 0.5,
      );
      const scaledTiming = botThinkingTime(
        { ...decision, trace: { ...decision.trace, view: scaled } },
        () => 0.5,
      );
      assert.equal(scaledTiming.durationMs, originalTiming.durationMs);
    }
    const game = nearAllInDrawResponse(stakes);
    const decision = botDecision(game, allInRandom(1), { trials: 120 });
    assert.equal(decision.action, 'call');
    assert.equal(decision.trace.nearAllInDraw, true);
    assert.equal(decision.trace.drawContinue, true);
    assert.equal(
      game.players[game.actor].stack - decision.trace.view.legal.callAmount,
      stakes.chipUnit,
    );
    const budget = game.players.reduce((sum, player) => sum + player.stack + player.total, 0);
    finishAfterResponse(game, decision);
    assert.equal(
      game.players.reduce((sum, player) => sum + player.stack, 0),
      budget,
    );
  });
}

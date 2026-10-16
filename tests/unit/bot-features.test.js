import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, deckOfCards, botDecision } from '../../src/engine/poker.js';
import {
  botBoardFeatures,
  chooseBotAction,
  getBotProfile,
  freshBotMood,
} from '../../src/engine/bot-profiles.js';
import { cards, deceptiveView } from '../fixtures/deceptive-decisions.js';
import {
  allInRandom,
  topPairDonkResponse,
  nearAllInDrawResponse,
  finishAfterResponse,
} from '../fixtures/all-in-decisions.js';
import { explainOpponent } from '../../src/review/opponents.js';

function features(hole, board) {
  const own = cards(hole),
    community = cards(board);
  return botBoardFeatures(own, community, evaluate([...own, ...community]).score);
}

test('strong made hands distinguish private two-pair or sets from low pairs under a paired board', () => {
  assert.equal(evaluate(cards('4s 4h Qs Qd Ac 7h 2c')).score[0], 2);
  assert.equal(features('4s 4h', 'Qs Qd Ac 7h 2c').strongMade, false);
  for (const [hole, board] of [
    ['Ks 7d', 'Kh 7c 3h'],
    ['5s 5d', '5h Ks 9c'],
    ['As Kh', '3s 3h 3c 3d Tc'],
  ]) {
    const f = features(hole, board);
    assert.equal(f.strongMade, true, `${hole}/${board}`);
    assert.equal(f.ownMade, true, `${hole}/${board}`);
  }
  for (const [hole, board] of [
    ['As Kh', '9d 9c 9h'],
    ['4s 3d', 'Ks Kd Kh 2s 2d'],
    ['2c 3d', 'As Ks Qs Js Ts'],
    ['2s 2h', 'Js Jd 9c 9h Kc'],
  ])
    assert.equal(features(hole, board).strongMade, false, `${hole}/${board}`);
});

test('combined straight and flush draws count distinct unseen completion cards without double counting', () => {
  const hole = cards('Qs Js'),
    board = cards('Ts 9d 2s'),
    known = new Set([...hole, ...board].map((c) => c.key)),
    f = features('Qs Js', 'Ts 9d 2s');
  const flush = deckOfCards().filter((c) => !known.has(c.key) && c.suit === hole[0].suit);
  const straight = deckOfCards().filter((c) => !known.has(c.key) && [8, 13].includes(c.rank));
  assert.equal(flush.length, 9);
  assert.equal(straight.length, 8);
  assert.equal(new Set([...flush, ...straight].map((c) => c.key)).size, 15);
  for (const card of [...flush, ...straight])
    assert.ok(evaluate([...hole, ...board, card]).score[0] >= 4);
  assert.equal(f.flushDraw, true);
  assert.equal(f.straightOuts, 8);
  assert.equal(f.drawOuts, 15);
  assert.equal(f.draw, true);
  const boardOnly = features('7s 2d', '9h Tc Jd Qc');
  assert.equal(boardOnly.straightOuts, 0);
  assert.equal(boardOnly.drawOuts, 0);
  assert.equal(boardOnly.draw, false);
  const noPrivateFlush = features('7d 2c', 'As Ks Qs Js');
  assert.equal(noPrivateFlush.flushDraw, false);
  assert.equal(noPrivateFlush.draw, false);
});

test('draw continuation uses the distinct completion cards rather than the larger single draw', () => {
  const v = deceptiveView('Qs Js', 'Ts 9d 2s', {
    pot: 600,
    currentBet: 200,
    contestable: 800,
    equity: 0.05,
    history: [{ id: 0, street: 1, action: 'raise', amount: 200 }],
    legal: {
      enabled: true,
      canCheck: false,
      canRaise: true,
      toCall: 200,
      callAmount: 200,
      minRaiseTo: 400,
      maxRaiseTo: 5000,
    },
  });
  // The deliberately low estimate isolates the draw-price branch; it is not
  // an equity claim for QJ or proof that every completion card wins the pot.
  const d = chooseBotAction(v, getBotProfile('balanced'), freshBotMood(), 'off', () => 0.99);
  assert.equal(d.trace.drawChance, (15 / 47) * 0.9);
  assert.ok(d.trace.odds > (9 / 47) * 0.9 && d.trace.odds < d.trace.drawChance);
  assert.equal(d.trace.drawContinue, true);
  assert.equal(d.action, 'call');
});

test('high equity estimates cannot label air or shared board pairs as ordinary value bets', () => {
  // Elevated synthetic estimates probe the value classification independently
  // of random range samples. Legal bluff and free-check choices remain valid.
  for (const [hole, board] of [
    ['As Kh', 'Qd 8c 2h'],
    ['As Kh', 'Qd Qc 8h 2s 7d'],
    ['4s 3d', 'Ks Kd Kh 2s 2d'],
  ]) {
    const v = deceptiveView(hole, board, { equity: 0.99 });
    assert.equal(v.features.ownMade, false, `${hole}/${board}`);
    for (const random of [() => 0, () => 0.99]) {
      const d = chooseBotAction(v, getBotProfile('balanced'), freshBotMood(), 'off', random);
      assert.equal(d.trace.value, false, `${hole}/${board}`);
      assert.equal(d.trace.style.thinValue, false, `${hole}/${board}`);
      assert.notEqual(d.trace.reason, 'value-raise');
      assert.notEqual(d.trace.reason, 'thin-value');
    }
  }
  const actualSet = deceptiveView('5s 5d', '5h Ks 9c', { equity: 0.95 });
  assert.equal(actualSet.features.ownMade, true);
  assert.equal(
    chooseBotAction(actualSet, getBotProfile('balanced'), freshBotMood(), 'off', () => 0.99).trace
      .value,
    true,
  );
});

test('real top-pair value donk trace explains making weaker hands pay rather than unbacked bluffing', () => {
  const game = topPairDonkResponse();
  game.difficulty = 'hard';
  const decision = botDecision(game, allInRandom(2), { trials: 120 }),
    review = explainOpponent(
      { ...decision, id: game.actor, name: game.players[game.actor].name },
      game.players,
    );
  assert.equal(decision.action, 'raise');
  assert.equal(decision.trace.reason, 'donk-lead');
  assert.equal(decision.trace.deception.kind, 'value');
  assert.equal(decision.trace.value, true);
  assert.match(review.detail, /donk 价值下注/);
  assert.match(review.detail, /顶对 J/);
  assert.match(review.detail, /付费/);
  assert.doesNotMatch(review.detail, /没有强牌托底|主要依赖对手弃牌|纯诈唬|EV|模拟器/);
});

test('near-all-in draw defense requires a whole-chip remainder and an affordable full-stack price', () => {
  const view = (hole = 'Qs Js', board = 'Ts 9d 2s', overrides = {}) =>
    deceptiveView(hole, board, {
      stack: 125,
      currentBet: 100,
      pot: 1400,
      contestable: 1500,
      rivals: 8,
      equity: 0.2,
      history: [{ id: 0, street: board.split(' ').length - 2, action: 'raise', amount: 100 }],
      legal: {
        enabled: true,
        canCheck: false,
        canRaise: true,
        toCall: 100,
        callAmount: 100,
        minRaiseTo: 125,
        maxRaiseTo: 125,
      },
      ...overrides,
    });
  const choose = (v) =>
    chooseBotAction(v, getBotProfile('balanced'), freshBotMood(), 'off', () => 0.9);
  const acceptable = choose(view());
  assert.equal(acceptable.action, 'call');
  assert.equal(acceptable.trace.nearAllInDraw, true);
  assert.equal(acceptable.trace.drawContinue, true);
  for (const bad of [
    view('Qs Js', 'Ts 9d 2s', { contestable: 300, pot: 200 }),
    view('Qs Js', 'Ts 9d 2s', {
      stack: 150,
      legal: { ...view().legal, minRaiseTo: 150, maxRaiseTo: 150 },
    }),
    view('7s 2d', '9h Tc Jd Qc'),
  ]) {
    const rejected = choose(bad);
    assert.equal(rejected.action, 'fold');
    assert.equal(rejected.trace.nearAllInDraw, false);
  }
  const game = nearAllInDrawResponse(),
    wealth = game.players.reduce((sum, p) => sum + p.stack + p.total, 0),
    decision = botDecision(game, allInRandom(1), { trials: 120 });
  assert.equal(decision.trace.view.stack, 125);
  assert.equal(decision.trace.view.legal.callAmount, 100);
  assert.equal(decision.trace.view.contestable, 650);
  assert.equal(decision.trace.nearAllInDraw, true);
  assert.equal(decision.action, 'call');
  finishAfterResponse(game, decision);
  assert.equal(
    game.players.reduce((sum, p) => sum + p.stack, 0),
    wealth,
  );
  for (const amount of [
    ...game.players.map((p) => p.stack),
    ...game.payouts,
    ...game.refunds.map((r) => r.amount),
  ])
    assert.equal(amount % 25, 0);
});

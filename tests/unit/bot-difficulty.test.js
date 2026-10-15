import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_DIFFICULTIES, observedBotMetrics } from '../../src/engine/bot-difficulty.js';
import {
  BOT_PROFILES,
  chooseBotAction,
  freshBotMood,
  getBotProfile,
} from '../../src/engine/bot-profiles.js';
import { aggressionSupport, decisionBasis } from '../../src/engine/decision-basis.js';
import { deceptiveView, deceptionCases } from '../fixtures/deceptive-decisions.js';
import { newGame, startHand, act, restartHand, advanceStreet } from '../../src/engine/poker.js';
import { explainOpponent } from '../../src/review/opponents.js';

test('skills strictly grow with difficulty while every profile and emotion stays within its tier', () => {
  const { easy, normal, hard } = BOT_DIFFICULTIES;
  assert.ok(easy.skills.length < normal.skills.length && normal.skills.length < hard.skills.length);
  assert.ok(easy.skills.every((s) => normal.skills.includes(s)));
  assert.ok(normal.skills.every((s) => hard.skills.includes(s)));
  for (const difficulty of ['easy', 'normal', 'hard'])
    for (const profile of BOT_PROFILES) {
      for (const mood of ['steady', 'frustrated', 'cautious', 'confident', 'reactive'])
        for (const mode of ['off', 'subtle', 'lively']) {
          const view = { ...deceptionCases()['seven-two-probe'], difficulty };
          const d = chooseBotAction(
            view,
            profile,
            { ...freshBotMood(), kind: mood },
            mode,
            () => 0,
          );
          assert.deepEqual(d.trace.skills, BOT_DIFFICULTIES[difficulty].skills);
          assert.equal(d.trace.difficulty, difficulty);
          assert.equal(d.trace.basis.reason, d.trace.reason);
          assert.equal(d.trace.basis.action, d.action);
          if (difficulty !== 'hard') assert.notEqual(d.trace.reason, 'seven-two-bluff');
        }
    }
});

test('medium made hands with showdown value are not classified as pure bluffs; multiway value needs a stronger range', () => {
  const hand = deceptiveView('Qs 8d', 'Qh 7c 2d 9s 3c', { equity: 0.5 });
  assert.equal(aggressionSupport(hand).bluffCandidate, false);
  const multiway = { ...hand, rivals: 3, publicEquity: { assumedOpponentIds: [0, 2, 3] } };
  assert.equal(aggressionSupport(multiway).valueCandidate, false);
  assert.equal(aggressionSupport({ ...multiway, equity: 0.8 }).valueCandidate, true);
  for (const profile of BOT_PROFILES)
    for (const value of [0, 0.2, 0.7, 0.99]) {
      const d = chooseBotAction(hand, profile, freshBotMood(), 'off', () => value);
      assert.notEqual(d.trace.reason, 'pure-bluff');
      assert.equal(d.trace.basis.version, 1);
    }
});

test('recorded reasons stay distinct from inferred old records and cannot be relabeled by stale trace data', () => {
  const view = deceptiveView('9s 9h', '9d Kc 2h', { equity: 0.9 });
  const d = chooseBotAction(view, getBotProfile('balanced'), freshBotMood(), 'off', () => 0);
  d.trace.view = view;
  const record = { ...d, id: 1, name: 'Mia' };
  assert.match(explainOpponent(record).detail, /依据当时记录/);
  const old = structuredClone(record);
  delete old.trace.basis;
  assert.match(explainOpponent(old).detail, /旧记录.*推断/);
  const mismatched = structuredClone(record);
  mismatched.trace.basis.action = 'fold';
  assert.match(explainOpponent(mismatched).detail, /旧记录.*推断/);
});

test('HUD denominators are real opportunities, AF excludes checks/folds, and retry retracts a hand exactly once', () => {
  const game = newGame(5);
  game.dealer = 4;
  startHand(game);
  act(game, 3, 'raise', 600);
  act(game, 4, 'raise', 1800);
  act(game, 0, 'fold');
  act(game, 1, 'fold');
  act(game, 2, 'fold');
  act(game, 3, 'call');
  assert.equal(game.players[4].botStats.threeBetOpportunities, 1);
  assert.equal(game.players[4].botStats.threeBets, 1);
  assert.equal(game.players[1].botStats.facedThreeBets, 1);
  assert.equal(game.players[1].botStats.foldsToThreeBet, 1);
  assert.equal(game.players[3].botStats.facedThreeBets, 1);
  assert.equal(game.players[3].botStats.foldsToThreeBet, 0);
  while (game.phase !== 'done') {
    if (game.phase === 'between') advanceStreet(game);
    else act(game, game.actor, 'check');
  }
  assert.equal(
    game.players.reduce((sum, p) => sum + p.stack, 0),
    100000,
  );
  assert.ok(game.players.every((p) => p.stack % 100 === 0));
  restartHand(game);
  assert.equal(game.players[4].botStats.threeBets, 0);
  while (game.phase !== 'done') {
    if (game.phase === 'between') advanceStreet(game);
    else act(game, game.actor, 'fold');
  }
  restartHand(game);
  assert.equal(game.players[4].botStats.threeBetOpportunities, 0);
  const metrics = observedBotMetrics({
    hands: 10,
    vpip: 4,
    pfr: 2,
    threeBets: 1,
    threeBetOpportunities: 5,
    facedThreeBets: 2,
    foldsToThreeBet: 1,
    postRaises: 3,
    postCalls: 2,
  });
  assert.deepEqual(metrics, {
    hands: 10,
    vpip: 0.4,
    pfr: 0.2,
    threeBet: 0.2,
    foldToThreeBet: 0.5,
    af: 1.5,
    afInfinite: false,
  });
  assert.equal(
    observedBotMetrics({ hands: 0, vpip: 0, pfr: 0, postRaises: 1, postCalls: 0 }).af,
    null,
  );
});

test('advanced blocker squeeze requires an open, exactly one caller, deep affordable price and live opponents', () => {
  const view = deceptiveView('As 5s', '', {
    difficulty: 'hard',
    position: 'BTN',
    inPosition: true,
    equity: 0.4,
    pot: 400,
    currentBet: 150,
    contestable: 550,
    rivals: 2,
    history: [
      { id: 0, street: 0, action: 'raise', amount: 150 },
      { id: 2, street: 0, action: 'call', amount: 150 },
    ],
    opponents: [
      { id: 0, stack: 4850, bet: 150, allin: false },
      { id: 2, stack: 4850, bet: 150, allin: false },
    ],
    actionContext: { pendingResponseCount: 2, pendingResponseIds: [0, 2], unactedBehindCount: 0 },
    legal: {
      enabled: true,
      chipUnit: 25,
      canRaise: true,
      canCheck: false,
      toCall: 150,
      callAmount: 150,
      minRaiseTo: 250,
      maxRaiseTo: 5000,
    },
  });
  const decide = (v) =>
    chooseBotAction(v, getBotProfile('balanced'), freshBotMood(), 'off', () => 0);
  const raised = decide(view);
  assert.equal(raised.action, 'raise');
  assert.equal(raised.trace.squeezeBluff, true);
  assert.equal(raised.trace.basis.squeeze, true);
  assert.ok(raised.amount >= 600 && raised.amount % 25 === 0);
  for (const changed of [
    { ...view, difficulty: 'easy' },
    { ...view, difficulty: 'normal' },
    { ...view, position: 'UTG' },
    { ...view, opponents: view.opponents.map((p) => ({ ...p, allin: true })) },
    { ...view, stack: 500 },
    { ...view, history: [view.history[0]] },
  ])
    assert.equal(decide(changed).trace.squeezeBluff, false);
});

test('a later fourth bet or an opener response is not mislabeled as a squeeze', () => {
  const view = deceptiveView('As Ks', '', {
    history: [
      { id: 0, street: 0, action: 'raise', amount: 150 },
      { id: 2, street: 0, action: 'call', amount: 150 },
      { id: 3, street: 0, action: 'raise', amount: 600 },
    ],
  });
  const basis = decisionBasis(view, {
    action: 'raise',
    amount: 1800,
    reason: 'value-raise',
    value: true,
  });
  assert.equal(basis.squeeze, false);
  assert.equal(basis.sequence, 4);
  assert.equal(
    decisionBasis(
      { ...view, id: 0, history: view.history.slice(0, 2) },
      { action: 'raise', amount: 600, reason: 'value-raise', value: true },
    ).squeeze,
    false,
  );
});

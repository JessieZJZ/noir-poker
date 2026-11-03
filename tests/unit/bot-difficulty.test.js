import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_DIFFICULTIES, observedBotMetrics } from '../../src/engine/bot-difficulty.js';
import {
  BOT_PROFILES,
  chooseBotAction,
  freshBotMood,
  getBotProfile,
} from '../../src/engine/bot-profiles.js';
import {
  aggressionSupport,
  decisionBasis,
  valueEquityThreshold,
} from '../../src/engine/decision-basis.js';
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

test('a multiway first bet scales with the fair share; heads-up and raises over a bet keep their bars', () => {
  assert.equal(valueEquityThreshold(1, true), 0.53);
  assert.equal(valueEquityThreshold(1, false), 0.53);
  let previous = 1;
  for (const rivals of [2, 3, 4, 5, 6, 9]) {
    const first = valueEquityThreshold(rivals, true);
    // Well above a fair share, never above the old fixed bar, never rising with more players.
    assert.ok(
      first >= 1 / (rivals + 1) + 0.2 && first < 0.62 && first >= 0.42 && first <= previous,
    );
    assert.equal(valueEquityThreshold(rivals, false), 0.62);
    previous = first;
  }
  assert.ok(valueEquityThreshold(2, true) > valueEquityThreshold(1, true));
});

// River's reported hand: Q♦ A♥ under the gun on K♣ J♦ A♠, four opponents left.
// The old fixed 62% bar made this top pair check every flop and turn.
function fiveWayTopPair(equity, legal = {}) {
  const opponents = [0, 2, 3, 4].map((id) => ({ id, stack: 5000, bet: 0, allin: false }));
  return deceptiveView('Qd Ah', 'Kc Jd As', {
    equity,
    rivals: 4,
    inPosition: false,
    position: 'UTG',
    opponents,
    publicEquity: { assumedOpponentIds: opponents.map((p) => p.id) },
    difficulty: 'normal',
    legal: { ...deceptiveView('Qd Ah', 'Kc Jd As').legal, ...legal },
  });
}

test('a five-way top pair above the multiway bar can value bet small; below it, or facing a bet, it does not', () => {
  const draws = Array.from({ length: 50 }, (_, i) => i / 50);
  for (const profile of BOT_PROFILES) {
    const view = fiveWayTopPair(0.5);
    const decisions = draws.map((value) =>
      chooseBotAction(view, profile, freshBotMood(), 'off', () => value),
    );
    const bets = decisions.filter((d) => d.action === 'raise');
    assert.ok(bets.length > 0, profile.id);
    for (const d of bets) {
      assert.equal(d.trace.reason, 'value-raise', profile.id);
      assert.equal(d.amount % view.chipUnit, 0);
      // Small multiway one-pair sizing: a third of the pot, rounded to whole chips.
      assert.ok(d.amount <= view.pot * 0.35 + view.chipUnit, `${profile.id} ${d.amount}`);
    }
    for (const value of draws) {
      // Standard difficulty adds up to ±4% noise; 40% stays under the 46% five-way bar.
      const low = chooseBotAction(fiveWayTopPair(0.4), profile, freshBotMood(), 'off', () => value);
      assert.notEqual(low.trace.reason, 'value-raise', profile.id);
      const facing = chooseBotAction(
        fiveWayTopPair(0.5, { canCheck: false, toCall: 200, callAmount: 200, minRaiseTo: 400 }),
        profile,
        freshBotMood(),
        'off',
        () => value,
      );
      assert.notEqual(facing.trace.reason, 'value-raise', profile.id);
    }
  }
});

// Kai's reported hand: J♦ 9♦ in the SB on 9♠ 2♣ J♣ after the CO raised
// preflop. Standard bots could never lead into that raiser, so top two pair
// always checked; now only a strong own hand that passed the value gate may.
function leadIntoRaiser(hole, equity, difficulty = 'normal') {
  const opponents = [0, 3, 4].map((id) => ({ id, stack: 5000, bet: 0, allin: false }));
  return deceptiveView(hole, '9s 2c Jc', {
    equity,
    rivals: 3,
    inPosition: false,
    position: 'SB',
    opponents,
    publicEquity: { assumedOpponentIds: opponents.map((p) => p.id) },
    history: [{ id: 0, street: 0, action: 'raise', amount: 150 }],
    difficulty,
  });
}

test('below advanced, only a strong value hand leads into the last aggressor; one pair, draws and air still check', () => {
  const draws = Array.from({ length: 50 }, (_, i) => i / 50);
  for (const difficulty of ['easy', 'normal']) {
    for (const profile of BOT_PROFILES) {
      const leads = draws
        .map((value) =>
          chooseBotAction(
            leadIntoRaiser('Jd 9d', 0.8, difficulty),
            profile,
            freshBotMood(),
            'off',
            () => value,
          ),
        )
        .filter((d) => d.action === 'raise');
      assert.ok(leads.length > 0, `${difficulty} ${profile.id}`);
      for (const d of leads) {
        assert.equal(d.trace.reason, 'donk-lead');
        assert.equal(d.trace.deception.kind, 'value');
      }
      // Top pair, a flush draw and air are not strong value leads.
      for (const hole of ['Ad Jd', 'Kc Qc', '4h 3d'])
        for (const value of draws)
          assert.equal(
            chooseBotAction(
              leadIntoRaiser(hole, 0.8, difficulty),
              profile,
              freshBotMood(),
              'off',
              () => value,
            ).action,
            'check',
            `${difficulty} ${profile.id} ${hole}`,
          );
    }
  }
});

test('a check to the last aggressor below advanced difficulty says it left the action to that player', () => {
  const view = leadIntoRaiser('Ad Jd', 0.8);
  const d = chooseBotAction(view, getBotProfile('vale'), freshBotMood(), 'off', () => 0.5);
  assert.equal(d.action, 'check');
  d.trace.view = view;
  const text = explainOpponent({ ...d, id: 1, name: 'Kai' }).detail;
  assert.match(text, /前一街的进攻者还没行动，.*没有抢先下注，而是过牌把行动留给进攻者/);
  // Advanced bots may lead, so their checks are not explained by this rule.
  const advanced = leadIntoRaiser('Ad Jd', 0.8, 'hard');
  const checked = Array.from({ length: 50 }, (_, i) =>
    chooseBotAction(advanced, getBotProfile('vale'), freshBotMood(), 'off', () => i / 50),
  ).find((decision) => decision.action === 'check');
  assert.ok(checked);
  checked.trace.view = advanced;
  assert.doesNotMatch(
    explainOpponent({ ...checked, id: 1, name: 'Kai' }).detail,
    /把行动留给进攻者/,
  );
});

test('recorded reasons stay distinct from inferred old records and cannot be relabeled by stale trace data', () => {
  const view = deceptiveView('9s 9h', '9d Kc 2h', { equity: 0.9 });
  const d = chooseBotAction(view, getBotProfile('balanced'), freshBotMood(), 'off', () => 0);
  d.trace.view = view;
  const record = { ...d, id: 1, name: 'Mia' };
  assert.equal(explainOpponent(record).basisSource, 'recorded');
  assert.doesNotMatch(explainOpponent(record).detail, /依据当时记录|旧记录|推断/);
  const old = structuredClone(record);
  delete old.trace.basis;
  assert.equal(explainOpponent(old).basisSource, 'inferred');
  const mismatched = structuredClone(record);
  mismatched.trace.basis.action = 'fold';
  assert.equal(explainOpponent(mismatched).basisSource, 'inferred');
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

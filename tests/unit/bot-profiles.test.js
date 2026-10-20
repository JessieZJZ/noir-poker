import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  startHand,
  botDecision,
  playBotTurn,
  act,
  advanceStreet,
  legalActions,
  restartHand,
  applyBotSettings,
  potSize,
  evaluate,
} from '../../src/engine/poker.js';
import {
  BOT_PROFILES,
  sanitizeBotSettings,
  freshBotMood,
  freshBotStats,
  recordPressureFold,
  finishBotHand,
  effectiveBotAxes,
  chooseBotAction,
  getBotProfile,
  botBoardFeatures,
} from '../../src/engine/bot-profiles.js';
const copy = (v) => JSON.parse(JSON.stringify(v));
function seeded(seed) {
  let n = seed;
  return () => (n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function finish(g, random = seeded(42)) {
  const wealth = g.players.reduce((sum, p) => sum + p.stack, 0) + potSize(g);
  let actions = 0;
  while (g.phase !== 'done') {
    assert.ok(++actions < 1000, 'A hand must finish');
    if (g.phase === 'between') advanceStreet(g);
    else {
      const d = botDecision(g, random),
        legal = legalActions(g);
      if (d.trace.view.equityPots)
        assert.equal(
          d.trace.view.equityPots.reduce((sum, pot) => sum + pot.amount, 0),
          d.trace.view.callPrice.contestable,
        );
      if (d.action === 'raise') {
        assert.ok(legal.canRaise);
        assert.equal(d.amount % 25, 0);
        assert.ok(d.amount >= legal.minRaiseTo && d.amount <= legal.maxRaiseTo);
      }
      if (d.action === 'check') assert.ok(legal.canCheck);
      act(g, g.actor, d.action, d.amount);
    }
    for (const amount of [
      g.currentBet,
      g.minRaise,
      ...g.players.flatMap((p) => [p.stack, p.bet, p.total]),
      ...g.payouts,
    ])
      assert.equal(amount % 25, 0);
    assert.equal(
      g.players.reduce((sum, p) => sum + p.stack, 0) + (g.phase === 'done' ? 0 : potSize(g)),
      wealth,
    );
  }
}
test('saved settings reject unknown profiles and malformed modes', () => {
  const result = sanitizeBotSettings({
    emotionMode: 'hack',
    assignments: { 1: 'rook', 2: 'nope', 9: 'jett' },
  });
  assert.equal(result.emotionMode, 'subtle');
  assert.equal(result.assignments[1], 'rook');
  assert.equal(result.assignments[2], 'balanced');
  assert.equal(Object.keys(result.assignments).length, 8);
});
test('all eight mixed 9-max assignments reach the executed policy with the corresponding parameter vector', () => {
  const assignments = {
    1: 'rook',
    2: 'vale',
    3: 'slate',
    4: 'jett',
    5: 'mira',
    6: 'knox',
    7: 'theo',
    8: 'finn',
  };
  for (let id = 1; id <= 8; id++) {
    const g = newGame(9, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
    applyBotSettings(g, { assignments, emotionMode: 'off' });
    startHand(g);
    while (g.actor !== id) act(g, g.actor, 'call');
    const chosen = playBotTurn(g, seeded(id));
    const executed = g.botDecisions.at(-1);
    assert.equal(executed.id, id);
    assert.equal(executed.action, chosen.action);
    assert.equal(executed.trace.profile, assignments[id]);
    assert.equal(executed.trace.profileName, getBotProfile(assignments[id]).name);
    assert.deepEqual(executed.trace.baseAxes, getBotProfile(assignments[id]).axes);
    assert.deepEqual(executed.trace.axes, getBotProfile(assignments[id]).axes);
    assert.equal(g.players.reduce((sum, p) => sum + p.stack, 0) + potSize(g), 45000);
  }
});
test('each profile decision ignores opponent holes, future deck and eventual results', () => {
  for (const profile of BOT_PROFILES) {
    const g = newGame(9, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
    startHand(g);
    g.players[g.actor].botProfile = profile.id;
    const expected = botDecision(g, seeded(50));
    for (const p of g.players.filter((p) => p.id !== g.actor))
      Object.defineProperty(p, 'hole', {
        get() {
          throw Error('Hidden hole accessed');
        },
      });
    for (const key of ['deck', 'winners', 'decisions'])
      Object.defineProperty(g, key, {
        get() {
          throw Error('Future or result accessed');
        },
      });
    assert.deepEqual(botDecision(g, seeded(50)), expected);
  }
});
test('all profiles and emotion strengths play legal 5–9 person hands and conserve chips', () => {
  for (let count = 5; count <= 9; count++)
    for (const emotionMode of ['off', 'subtle', 'lively']) {
      const g = newGame(count, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 }),
        assignments = {};
      for (let id = 1; id < count; id++)
        assignments[id] = BOT_PROFILES[id % BOT_PROFILES.length].id;
      applyBotSettings(g, { assignments, emotionMode });
      for (let hand = 0; hand < 4; hand++) {
        // Unequal stacks exercise short raises, capped calls and multiple pots.
        g.players.forEach((p, id) => {
          p.stack = 300 + id * 175;
        });
        startHand(g);
        const wealth = g.players.reduce((n, p) => n + p.stack, 0) + potSize(g);
        finish(g, seeded(100 + count + hand));
        assert.equal(
          g.players.reduce((n, p) => n + p.stack, 0),
          wealth,
        );
      }
    }
});
test('no profile raises when a short all-in has not reopened action', () => {
  const g = newGame(undefined, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  startHand(g);
  const first = g.actor;
  act(g, first, 'raise', 100);
  const second = g.actor;
  g.players[second].stack = 125 - g.players[second].bet;
  act(g, second, 'raise', 125);
  while (g.actor !== first) act(g, g.actor, 'call');
  assert.equal(legalActions(g).canRaise, false);
  for (const profile of BOT_PROFILES) {
    g.players[first].botProfile = profile.id;
    for (let seed = 0; seed < 10; seed++)
      assert.notEqual(botDecision(g, seeded(seed)).action, 'raise');
  }
});
test('loss, win and pressure triggers are bounded, cooled down and can be disabled', () => {
  const p = { id: 1, botMood: freshBotMood() };
  assert.equal(finishBotHand(p, -1249, 'subtle', 50), null);
  assert.equal(finishBotHand(p, -1250, 'subtle', 50).kind, 'frustrated');
  assert.equal(finishBotHand(p, -5000, 'subtle', 50), null, 'Cooldown prevents repeated triggers');
  const q = { id: 2, botMood: freshBotMood() };
  assert.equal(finishBotHand(q, -1250, 'lively', 50).kind, 'cautious');
  const off = { id: 1, botMood: freshBotMood() };
  assert.equal(finishBotHand(off, -5000, 'off', 50), null);
  assert.equal(off.botMood.kind, 'steady');
  const winner = { id: 1, botMood: freshBotMood() };
  assert.equal(finishBotHand(winner, 500, 'subtle', 50), null);
  assert.equal(finishBotHand(winner, 500, 'subtle', 50).kind, 'confident');
  const mood = freshBotMood();
  recordPressureFold(mood, 2, 'subtle');
  recordPressureFold(mood, 3, 'subtle');
  assert.equal(recordPressureFold(mood, 2, 'subtle'), null);
  assert.equal(recordPressureFold(mood, 2, 'subtle'), null);
  assert.equal(recordPressureFold(mood, 2, 'subtle').kind, 'reactive');
});
test('emotions adjust actual policy controls with a smaller subtle effect', () => {
  const profile = BOT_PROFILES[1],
    mood = { kind: 'frustrated' };
  assert.deepEqual(effectiveBotAxes(profile, mood, 'off'), profile.axes);
  const mild = effectiveBotAxes(profile, mood, 'subtle'),
    strong = effectiveBotAxes(profile, mood, 'lively');
  assert.ok(mild[0] > profile.axes[0]);
  assert.ok(strong[0] > mild[0]);
  assert.ok(strong[4] < mild[4]);
});
test('an intervening hand without pressure breaks the consecutive-fold trigger', () => {
  const g = newGame(undefined, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  for (let hand = 0; hand < 5; hand++) {
    g.dealer = 2;
    startHand(g);
    assert.equal(g.actor, 0);
    act(g, 0, hand % 2 ? 'fold' : 'raise', 100);
    while (g.phase !== 'done') act(g, g.actor, 'fold');
  }
  assert.equal(g.players[1].botMood.kind, 'steady');
});
test('style differences change entry and value-trap behavior over common decision samples', () => {
  const view = {
    bigBlind: 50,
    chipUnit: 25,
    id: 1,
    hole: [
      { rank: 9, suit: 0 },
      { rank: 7, suit: 0 },
    ],
    board: [],
    street: 0,
    position: 'CO',
    count: 6,
    stack: 5000,
    bet: 0,
    pot: 75,
    currentBet: 50,
    contestable: 125,
    rivals: 5,
    equity: 0.35,
    difficulty: 'hard',
    history: [],
    features: { wet: false, draw: false, overpair: false },
    playsBoard: false,
    legal: {
      chipUnit: 25,
      enabled: true,
      toCall: 50,
      callAmount: 50,
      canCheck: false,
      canRaise: true,
      minRaiseTo: 100,
      maxRaiseTo: 5000,
    },
  };
  const decisions = (profile, input) =>
    Array.from({ length: 300 }, (_, seed) =>
      chooseBotAction(input, profile, freshBotMood(), 'off', seeded(seed + 100)),
    );
  const peter = BOT_PROFILES.find((p) => p.id === 'jett'),
    st = BOT_PROFILES.find((p) => p.id === 'vale');
  assert.ok(
    decisions(peter, view).filter((d) => d.action === 'raise').length >
      decisions(st, view).filter((d) => d.action === 'raise').length,
  );
  const value = {
    ...view,
    hole: [
      { rank: 9, suit: 0 },
      { rank: 9, suit: 1 },
    ],
    board: [
      { rank: 9, suit: 3 },
      { rank: 13, suit: 2 },
      { rank: 2, suit: 1 },
      { rank: 6, suit: 2 },
    ],
    street: 2,
    equity: 0.9,
    rivals: 1,
    pot: 800,
    currentBet: 0,
    contestable: 800,
    inPosition: false,
    opponents: [{ id: 0, stack: 5000, bet: 0, allin: false }],
    legal: { ...view.legal, toCall: 0, callAmount: 0, canCheck: true, minRaiseTo: 50 },
  };
  value.features = botBoardFeatures(
    value.hole,
    value.board,
    evaluate([...value.hole, ...value.board]).score,
  );
  assert.equal(value.features.strongMade, true);
  assert.ok(
    decisions(st, value).filter((d) => d.action === 'check').length >
      decisions(peter, value).filter((d) => d.action === 'check').length,
  );
});
test('uncalled shove refunds are not losses; blind-only hands are not VPIP', () => {
  const g = newGame(undefined, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  g.dealer = 3;
  startHand(g);
  assert.equal(g.actor, 1);
  act(g, 1, 'raise', 5000);
  while (g.phase !== 'done') act(g, g.actor, 'fold');
  assert.ok(g.refunds.some((r) => r.id === 1));
  assert.equal(g.players[1].botMood.kind, 'steady');
  assert.deepEqual(
    [g.players[1].botStats.hands, g.players[1].botStats.vpip, g.players[1].botStats.pfr],
    [1, 1, 1],
  );
  for (const p of g.players.slice(2)) assert.equal(p.botStats.vpip, 0);
});
test('post-flop bot fractions use the after-call pot with whole 25 chips', () => {
  const hole = [
      { rank: 14, suit: 0 },
      { rank: 13, suit: 0 },
    ],
    board = [
      { rank: 14, suit: 1 },
      { rank: 9, suit: 2 },
      { rank: 6, suit: 3 },
      { rank: 2, suit: 1 },
    ];
  const view = {
    bigBlind: 50,
    chipUnit: 25,
    id: 1,
    hole,
    board,
    street: 2,
    position: 'BTN',
    count: 6,
    stack: 5000,
    bet: 0,
    pot: 400,
    currentBet: 225,
    contestable: 625,
    rivals: 1,
    equity: 0.9,
    difficulty: 'hard',
    history: [],
    features: botBoardFeatures(hole, board, evaluate([...hole, ...board]).score),
    playsBoard: false,
    legal: {
      chipUnit: 25,
      enabled: true,
      toCall: 225,
      callAmount: 225,
      canCheck: false,
      canRaise: true,
      minRaiseTo: 450,
      maxRaiseTo: 5000,
    },
  };
  const decision = chooseBotAction(
    view,
    getBotProfile('balanced'),
    freshBotMood(),
    'off',
    () => 0.5,
  );
  assert.equal(view.features.ownMade, true, 'The sizing probe uses an actual made top pair');
  assert.equal(decision.action, 'raise');
  assert.equal(decision.trace.sizing.fraction, 0.625);
  assert.equal(decision.trace.sizing.desired, 625); // 225 + round-to-25(625 × .625)
  assert.equal(decision.amount, 625);
});
test('retry restores frozen profile, emotion and simulation statistics exactly once', () => {
  const g = newGame(undefined, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  applyBotSettings(g, { assignments: { 1: 'rook', 2: 'vale' }, emotionMode: 'lively' });
  g.players[1].botMood = {
    ...freshBotMood(),
    kind: 'frustrated',
    remaining: 3,
    cooldown: 4,
    reason: '测试公开损失',
  };
  startHand(g);
  const baseline = copy(
    g.players.map((p) => ({ profile: p.botProfile, mood: p.botMood, stats: p.botStats })),
  );
  for (let attempt = 0; attempt < 4; attempt++) {
    finish(g, seeded(attempt + 5));
    applyBotSettings(g, { assignments: { 1: 'jett' }, emotionMode: 'off' });
    restartHand(g);
    assert.equal(g.emotionMode, 'lively');
    assert.deepEqual(
      g.players.map((p) => ({ profile: p.botProfile, mood: p.botMood, stats: p.botStats })),
      baseline,
    );
    assert.equal(g.stats.hands, 0);
  }
  assert.throws(() => applyBotSettings(g, {}), /下一手/);
});
test('a reassigned profile starts a separate observed sample', () => {
  const g = newGame(undefined, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  g.players[1].botStats = { ...freshBotStats(), hands: 20, vpip: 10 };
  applyBotSettings(g, { assignments: { 1: 'jett' } });
  assert.equal(g.players[1].botStats.hands, 0);
});

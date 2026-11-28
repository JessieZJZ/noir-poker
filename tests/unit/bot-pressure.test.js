import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckOfCards } from '../../src/engine/poker.js';
import { BOT_PROFILES, chooseBotAction, freshBotMood } from '../../src/engine/bot-profiles.js';
import { explainOpponent } from '../../src/review/opponents.js';
const deck = deckOfCards();
const cards = (keys) =>
  keys
    .split(' ')
    .map((key) =>
      deck.find(
        (c) => c.rank === '23456789TJQKA'.indexOf(key[0]) + 2 && c.suit === 'shcd'.indexOf(key[1]),
      ),
    );
const input = (hole = 'Ks Qh') => ({
  bigBlind: 50,
  chipUnit: 25,
  id: 1,
  hole: cards(hole),
  board: [],
  street: 0,
  position: 'UTG+1',
  count: 9,
  stack: 4875,
  bet: 125,
  pot: 450,
  currentBet: 200,
  contestable: 525,
  rivals: 8,
  equity: 0.05,
  difficulty: 'normal',
  playsBoard: false,
  history: [
    { id: 1, street: 0, action: 'raise', amount: 125 },
    { id: 0, street: 0, action: 'raise', amount: 200 },
  ],
  opponents: [0, 2, 3, 4, 5, 6, 7, 8].map((id) => ({
    id,
    stack: 4800,
    bet: id === 0 ? 200 : 0,
    allin: false,
  })),
  features: { draw: false, wet: false, overpair: false },
  legal: {
    chipUnit: 25,
    enabled: true,
    canCheck: false,
    canRaise: true,
    toCall: 75,
    callAmount: 75,
    minRaiseTo: 275,
    maxRaiseTo: 5000,
  },
});
const decide = (v, profile = BOT_PROFILES[0], kind = 'steady') =>
  chooseBotAction(v, profile, { ...freshBotMood(), kind }, 'subtle', () => 0.9);

test('normal/hard KQ defends a tiny 3-bet across every style and subtle moods', () => {
  for (const difficulty of ['normal', 'hard'])
    for (const profile of BOT_PROFILES)
      for (const kind of ['steady', 'cautious', 'reactive', 'frustrated', 'confident']) {
        const v = { ...input(), difficulty };
        const d = decide(v, profile, kind);
        assert.equal(d.action, 'call', `${difficulty}/${profile.id}/${kind}`);
        assert.equal(d.trace.reason, 'small-reraise-continue');
        assert.equal(d.trace.affordableThreeBet, true);
        assert.ok(!d.trace.checks.some((c) => c.code === 'insufficient-equity'));
      }
  const v = input(),
    d = decide(v);
  const explanation = explainOpponent({ action: d.action, trace: { ...d.trace, view: v } });
  assert.match(explanation.detail, /小尺度 3-bet 防守/);
  assert.match(explanation.detail, /75/);
  assert.match(explanation.detail, /4\.8K/);
  assert.equal(explanation.warning, '');
  assert.deepEqual(explanation.metrics, []);
  assert.doesNotMatch(explanation.detail, /EV|模型|模拟器|抽样|它/);
});

test('priced 3-bet defense stops at large sizes, short stacks, all-ins and 4-bets', () => {
  const v = input();
  for (const overrides of [
    { difficulty: 'easy' },
    { currentBet: 525 },
    { stack: 500 },
    // Over the 38% price ceiling.
    { contestable: 195 },
    { opponents: v.opponents.map((p) => (p.id === 0 ? { ...p, stack: 999 } : p)) },
    { opponents: v.opponents.map((p) => (p.id === 0 ? { ...p, allin: true } : p)) },
    { legal: { ...v.legal, toCall: 375, callAmount: 375 } },
    { history: [...v.history, { id: 2, street: 0, action: 'raise', amount: 300 }] },
    { opponents: [] },
  ])
    assert.equal(
      decide({ ...v, ...overrides }).trace.affordableThreeBet,
      false,
      JSON.stringify(overrides),
    );
  assert.equal(decide(input('7s 2h')).action, 'fold');
  const large = {
    ...v,
    currentBet: 1500,
    legal: { ...v.legal, toCall: 1375, callAmount: 1375 },
    contestable: 3000,
  };
  assert.equal(decide(large).action, 'fold');
});

// Default 100/200 stakes: UTG opens to 1.2K (6BB), BTN 3-bets to 2.6K and the
// blinds fold, so the opener calls 1.4K into 5.5K heads-up.
const openerFacing = (hole = 'Ks Qh', currentBet = 2600, overrides = {}) => {
  const call = currentBet - 1200;
  return {
    bigBlind: 200,
    chipUnit: 100,
    id: 3,
    hole: cards(hole),
    board: [],
    street: 0,
    position: 'UTG',
    count: 5,
    stack: 18800,
    bet: 1200,
    pot: 1500 + currentBet,
    currentBet,
    contestable: 1500 + currentBet + call,
    rivals: 1,
    equity: 0.3,
    difficulty: 'normal',
    playsBoard: false,
    history: [
      { id: 3, street: 0, action: 'raise', amount: 1200 },
      { id: 4, street: 0, action: 'fold', amount: 0 },
      { id: 0, street: 0, action: 'raise', amount: currentBet },
      { id: 1, street: 0, action: 'fold', amount: 0 },
      { id: 2, street: 0, action: 'fold', amount: 0 },
    ],
    opponents: [{ id: 0, stack: 20000 - currentBet, bet: currentBet, allin: false }],
    features: { draw: false, wet: false, overpair: false },
    legal: {
      chipUnit: 100,
      enabled: true,
      canCheck: false,
      canRaise: true,
      toCall: call,
      callAmount: call,
      minRaiseTo: currentBet * 2 - 1200,
      maxRaiseTo: 20000,
    },
    ...overrides,
  };
};

test('a large opener treats a 3-bet to about twice its open as small', () => {
  for (const difficulty of ['normal', 'hard'])
    for (const profile of BOT_PROFILES)
      for (const hole of ['Ks Qh', '7s 7h']) {
        const d = decide(openerFacing(hole, 2600, { difficulty }), profile);
        const label = `${difficulty}/${profile.id}/${hole}`;
        assert.equal(d.trace.affordableThreeBet, true, label);
        assert.deepEqual(
          d.trace.threeBetLimits,
          { reopenedOpener: true, threeBetLimit: 3000, threeBetCallLimit: 2000 },
          label,
        );
        assert.equal(d.action, 'call', label);
        assert.equal(d.trace.reason, 'small-reraise-continue', label);
      }
  // 2.5x the open in total is an inclusive limit; the call limit is the larger
  // of 1.5x the open and a tenth of the opener's own chips (2K here).
  const atLimit = openerFacing('Ks Qh', 3000, { contestable: 6500 });
  assert.equal(decide(atLimit).trace.affordableThreeBet, true);
  const overLimit = openerFacing('Ks Qh', 3100, { contestable: 9000 });
  assert.equal(decide(overLimit).trace.affordableThreeBet, false);
  // The 38% price ceiling still applies.
  assert.equal(decide(openerFacing('Ks Qh', 3000)).trace.affordableThreeBet, true);
  assert.equal(
    decide(openerFacing('Ks Qh', 3000, { contestable: 4700 })).trace.affordableThreeBet,
    false,
  );
  // A cold caller facing the same 2.6K: a tenth of 20K allows a 2K call and
  // about 2.86K in total, so this call is over the limit.
  const cold = decide({
    ...openerFacing('Ks Qh'),
    id: 5,
    position: 'CO',
    stack: 20000,
    bet: 0,
    contestable: 6700,
    history: [
      { id: 3, street: 0, action: 'raise', amount: 1200 },
      { id: 0, street: 0, action: 'raise', amount: 2600 },
    ],
    legal: { ...openerFacing().legal, toCall: 2600, callAmount: 2600 },
  });
  assert.equal(cold.trace.threeBetLimits.reopenedOpener, false);
  assert.equal(cold.trace.threeBetLimits.threeBetCallLimit, 2000);
  assert.equal(Math.round(cold.trace.threeBetLimits.threeBetLimit), 2857);
  assert.equal(cold.trace.affordableThreeBet, false);
});

test('offsuit A9-class hands mix their small 3-bet defense by style', () => {
  const balanced = BOT_PROFILES.find((p) => p.id === 'balanced');
  const marginal = (hole, currentBet = 2600, overrides = {}, random = () => 0.9) =>
    chooseBotAction(
      openerFacing(hole, currentBet, overrides),
      balanced,
      { ...freshBotMood(), kind: 'steady' },
      'subtle',
      random,
    );
  // ATo is already inside the balanced continuing range, so it never mixes.
  const ato = marginal('As Td');
  assert.equal(ato.trace.marginalThreeBet.candidate, false);
  assert.equal(ato.action, 'call');
  for (const hole of ['As 9d', 'Ks Th', 'Qs Jh']) {
    const folds = marginal(hole);
    assert.equal(folds.trace.marginalThreeBet.candidate, true, hole);
    assert.equal(folds.trace.marginalThreeBet.rate, 0.5, hole);
    assert.equal(folds.action, 'fold', hole);
    const calls = marginal(hole, 2600, {}, () => 0.1);
    assert.equal(calls.trace.marginalThreeBet.call, true, hole);
    assert.equal(calls.action, 'call', hole);
    assert.equal(calls.trace.reason, 'small-reraise-continue', hole);
  }
  // Dominated aces, suited hands and pairs are not part of the mixed tier.
  for (const hole of ['As 8d', 'As 9s', '7s 7h'])
    assert.equal(marginal(hole).trace.marginalThreeBet.candidate, false, hole);
  assert.equal(marginal('As 8d').action, 'fold');
  // The tier ends above 2.3x the open, multiway and on easy difficulty.
  assert.equal(marginal('As 9d', 2700).trace.marginalThreeBet.candidate, true);
  const wider = marginal('As 9d', 2800);
  assert.equal(wider.trace.affordableThreeBet, true);
  assert.equal(wider.trace.marginalThreeBet.candidate, false);
  assert.equal(marginal('As 9d', 2600, { rivals: 2 }).trace.marginalThreeBet.candidate, false);
  assert.equal(
    marginal('As 9d', 2600, { difficulty: 'easy' }).trace.marginalThreeBet.candidate,
    false,
  );
  // Looser styles call more often than tighter ones; every rate stays mixed.
  const rate = (id) =>
    decide(
      openerFacing('Ks Th'),
      BOT_PROFILES.find((p) => p.id === id),
    ).trace.marginalThreeBet.rate;
  assert.ok(rate('owen') < rate('balanced'));
  assert.ok(rate('balanced') < rate('rook'));
  for (const profile of BOT_PROFILES) {
    const r = decide(openerFacing('Ks Th'), profile).trace.marginalThreeBet.rate;
    assert.ok(r >= 0.2 && r <= 0.85, profile.id);
  }
});

test("the 3-bettor's public raising frequency shifts the A9-class mix", () => {
  const withRead = (publicRead, hole = 'As 9d', profileId = 'balanced', random = () => 0.6) => {
    const v = openerFacing(hole);
    return chooseBotAction(
      { ...v, opponents: [{ ...v.opponents[0], publicRead }] },
      BOT_PROFILES.find((p) => p.id === profileId),
      { ...freshBotMood(), kind: 'steady' },
      'subtle',
      random,
    );
  };
  const read = (hands, raisingHands) => ({ hands, voluntaryHands: hands, raisingHands });
  const unread = withRead(null);
  assert.equal(unread.trace.marginalThreeBet.observed, null);
  assert.equal(unread.trace.marginalThreeBet.rate, 0.5);
  assert.equal(unread.action, 'fold');
  // 16 raises in 32 hands: wider 3-bets, capped at +0.25.
  const loose = withRead(read(32, 16));
  assert.equal(loose.trace.marginalThreeBet.observed.shift, 0.25);
  assert.equal(loose.trace.marginalThreeBet.rate, 0.75);
  assert.equal(loose.action, 'call');
  assert.equal(loose.trace.reason, 'small-reraise-continue');
  // 2 raises in 32 hands: a value-heavy 3-bettor, capped at -0.15.
  const tight = withRead(read(32, 2), 'As 9d', 'balanced', () => 0.4);
  assert.equal(tight.trace.marginalThreeBet.observed.shift, -0.15);
  assert.ok(Math.abs(tight.trace.marginalThreeBet.rate - 0.35) < 1e-9);
  assert.equal(tight.action, 'fold');
  // Three raises in three hands move the mix far less than a full sample.
  const early = withRead(read(3, 3)).trace.marginalThreeBet;
  assert.ok(early.observed.shift > 0 && early.observed.shift < 0.1);
  // Every combined rate stays mixed, and the read does not touch other hands.
  assert.ok(withRead(read(64, 1), 'Ks Th', 'owen').trace.marginalThreeBet.rate >= 0.15);
  assert.equal(withRead(read(64, 60), 'Ks Th', 'jett').trace.marginalThreeBet.rate, 0.9);
  const kq = withRead(read(32, 16), 'Ks Qh');
  assert.equal(kq.trace.marginalThreeBet.observed, null);
  assert.equal(kq.action, 'call');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckOfCards } from '../../src/engine/poker.js';
import { chooseBotAction, getBotProfile, freshBotMood } from '../../src/engine/bot-profiles.js';
import { explainOpponent } from '../../src/review/opponents.js';

const deck = deckOfCards();
const cards = (text) =>
  text
    .split(' ')
    .map((key) =>
      deck.find(
        (c) => c.rank === '23456789TJQKA'.indexOf(key[0]) + 2 && c.suit === 'shcd'.indexOf(key[1]),
      ),
    );
const decision = (v, profile = 'balanced', random = () => 0.9) =>
  chooseBotAction(v, getBotProfile(profile), freshBotMood(), 'off', random);
function smallOpen(hole = '7s 6s', overrides = {}) {
  return {
    bigBlind: 50,
    chipUnit: 25,
    id: 1,
    hole: cards(hole),
    board: [],
    street: 0,
    position: 'CO',
    count: 6,
    stack: 5000,
    bet: 0,
    pot: 225,
    currentBet: 150,
    contestable: 375,
    rivals: 5,
    equity: 0.05,
    difficulty: 'hard',
    playsBoard: false,
    history: [{ id: 0, street: 0, action: 'raise', amount: 150 }],
    opponents: [0, 2, 3, 4, 5].map((id) => ({
      id,
      stack: id === 0 ? 4850 : 5000,
      bet: id === 0 ? 150 : 0,
      allin: false,
    })),
    features: { draw: false, wet: false, overpair: false },
    legal: {
      chipUnit: 25,
      enabled: true,
      canCheck: false,
      canRaise: true,
      toCall: 150,
      callAmount: 150,
      minRaiseTo: 250,
      maxRaiseTo: 5000,
    },
    ...overrides,
  };
}
test('deep small opens keep playable calls without turning every admission into a 3-bet', () => {
  // Low synthetic all-player showdown equity probes the new price branch;
  // these inputs are not a measured equity claim for the example hands.
  for (const count of [6, 9])
    for (const hole of ['7s 6s', 'Qs 7s', '2s 2h', 'As 5s', 'Ks Jh']) {
      const v = smallOpen(hole, { count });
      const d = decision(v);
      assert.equal(d.action, 'call', `${count} players, ${hole}`);
      assert.equal(d.trace.reason, 'affordable-open');
      assert.equal(d.trace.affordableRangePassed, true);
      assert.equal(d.trace.cheapRangePassed, false);
      assert.equal(d.trace.value, false);
      assert.ok(!d.trace.checks.some((c) => c.code === 'insufficient-equity'));
    }
  const premium = decision(smallOpen('As Ah'), 'balanced', () => 0.1);
  assert.equal(premium.action, 'raise', 'The price branch must still permit a premium 3-bet');
  assert.ok(premium.amount >= 250);
});
test('limp then small isolation preserves speculative calls; caller counts use unique live opponents', () => {
  const v = smallOpen('7s 6s', {
    bet: 50,
    stack: 4950,
    currentBet: 175,
    contestable: 525,
    history: [
      { id: 1, street: 0, action: 'call', amount: 50 },
      { id: 2, street: 0, action: 'call', amount: 50 },
      { id: 0, street: 0, action: 'raise', amount: 175 },
      { id: 3, street: 0, action: 'call', amount: 175 },
      { id: 3, street: 0, action: 'call', amount: 25 },
      { id: 4, street: 0, action: 'call', amount: 0 },
      { id: 5, street: 0, action: 'call', amount: 175 },
      { id: 5, street: 0, action: 'fold', amount: 0 },
    ],
    opponents: [0, 2, 3, 4].map((id) => ({ id, stack: 4800, bet: 175, allin: false })),
    legal: { ...smallOpen().legal, toCall: 125, callAmount: 125 },
  });
  const d = decision(v);
  assert.equal(d.action, 'call');
  assert.equal(d.trace.entryContext.limpers, 1);
  assert.equal(d.trace.entryContext.openCallers, 1);
  const unraised = smallOpen('7s 6s', {
    position: 'UTG',
    currentBet: 50,
    pot: 175,
    contestable: 225,
    history: [
      { id: 2, street: 0, action: 'call', amount: 50 },
      { id: 3, street: 0, action: 'call', amount: 50 },
    ],
    legal: { ...smallOpen().legal, toCall: 50, callAmount: 50, minRaiseTo: 100 },
  });
  assert.equal(decision(unraised).action, 'call');
  assert.equal(decision(unraised).trace.reason, 'affordable-entry');
});
test('small-open continuation keeps style and position differences and rejects garbage', () => {
  const v = smallOpen('7s 6s', { count: 9 });
  assert.equal(decision({ ...v, position: 'CO' }).action, 'call');
  assert.equal(decision({ ...v, position: 'UTG' }).action, 'fold');
  assert.equal(decision(smallOpen('7s 2h')).action, 'fold');
  const totals = ['owen', 'balanced', 'jett'].map((profile) => {
    let continues = 0;
    for (let a = 0; a < deck.length; a++)
      for (let b = a + 1; b < deck.length; b++) {
        if (decision({ ...v, hole: [deck[a], deck[b]] }, profile).action !== 'fold') continues++;
      }
    return continues;
  });
  assert.ok(totals[0] < totals[1] && totals[1] < totals[2], `ST / balanced / Peter: ${totals}`);
});
test('the ordinary-open branch stops above five BB and at stack, all-in and re-raise boundaries', () => {
  const v = smallOpen();
  const atLimit = { ...v, currentBet: 250, legal: { ...v.legal, toCall: 250, callAmount: 250 } };
  assert.equal(decision(atLimit).trace.affordableOpen, true);
  const shortRaiser = {
    ...v,
    opponents: v.opponents.map((p) => (p.id === 0 ? { ...p, stack: 2249 } : p)),
  };
  const enoughRaiser = {
    ...v,
    opponents: v.opponents.map((p) => (p.id === 0 ? { ...p, stack: 2250 } : p)),
  };
  assert.equal(decision(enoughRaiser).trace.affordableOpen, true);
  const unsafe = [
    { ...v, opponents: undefined },
    { ...v, opponents: v.opponents.filter((p) => p.id !== 0) },
    { ...atLimit, currentBet: 251, legal: { ...v.legal, toCall: 251, callAmount: 251 } },
    { ...v, stack: 1000 },
    shortRaiser,
    { ...v, opponents: v.opponents.map((p) => (p.id === 0 ? { ...p, allin: true, stack: 0 } : p)) },
    {
      ...v,
      history: [...v.history, { id: 2, street: 0, action: 'raise', amount: 175 }],
      currentBet: 175,
      legal: { ...v.legal, toCall: 175, callAmount: 175 },
    },
    { ...v, street: 1, board: cards('2s 4h Jd') },
    { ...v, history: [{ id: 1, street: 0, action: 'raise', amount: 150 }] },
    { ...v, legal: { ...v.legal, toCall: 5000, callAmount: 5000, canRaise: false } },
  ];
  for (const input of unsafe) {
    const d = decision(input);
    assert.equal(d.trace.affordableOpen, false);
    assert.equal(d.trace.affordableRangePassed, false);
    assert.equal(d.action, 'fold');
  }
});
test('a cheap blind completion is not a cheap all-in with a tiny remaining stack', () => {
  const v = smallOpen('9s 8s', {
    currentBet: 50,
    history: [],
    stack: 625,
    legal: { ...smallOpen().legal, toCall: 50, callAmount: 50 },
  });
  assert.equal(decision(v).trace.cheapRangePassed, true);
  const tooShort = decision({ ...v, stack: 624 });
  assert.equal(tooShort.trace.cheapRangePassed, false);
  const capped = decision({
    ...v,
    stack: 25,
    legal: { ...v.legal, toCall: 50, callAmount: 25, canRaise: false },
  });
  assert.equal(capped.trace.affordableRangePassed, false);
});
test('opponent review explains the exact small-open call and separate re-raising range', () => {
  const v = smallOpen();
  const d = decision(v);
  const explanation = explainOpponent({ ...d, trace: { ...d.trace, view: v } });
  assert.match(explanation.detail, /只补 150/);
  assert.match(explanation.detail, /还留 4\.85K/);
  assert.match(explanation.detail, /同花/);
  assert.match(explanation.detail, /开池(?:至|到) 150/);
  assert.deepEqual(explanation.metrics, []);
  assert.doesNotMatch(explanation.detail, /EV|模型|模拟器|抽样|它/);
  assert.doesNotMatch(explanation.detail, /这是未加注底池/);
  assert.doesNotMatch(explanation.warning, /这次继续尤其/);
  const premium = decision(smallOpen('As Ah'), 'balanced', () => 0.1);
  assert.match(
    explainOpponent({
      ...premium,
      trace: { ...premium.trace, view: smallOpen('As Ah') },
    }).detail,
    /加注至|再加注/,
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../../src/engine/poker.js';
import { chooseBotAction, getBotProfile, freshBotMood } from '../../src/engine/bot-profiles.js';
import { COMMITTED_SPR } from '../../src/engine/bot-preflop-commitment.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { allInRandom } from '../fixtures/all-in-decisions.js';

const deck = engine.deckOfCards();
const cards = (text) =>
  text
    .split(' ')
    .map((key) =>
      deck.find(
        (c) => c.rank === '23456789TJQKA'.indexOf(key[0]) + 2 && c.suit === 'shcd'.indexOf(key[1]),
      ),
    );
const chipsInPlay = (g) => g.players.reduce((sum, p) => sum + p.stack + p.total, 0);

// The reported hand: 9 seats at 100/200, Theo on the button, the player in
// UTG with 3.7K (18.5BB) opening to 1.2K. Every bot covers the opener.
const REPORTED = {
  1: 'Ks 8h',
  2: '6c Td',
  3: '6d 4d',
  4: '7h Qs',
  5: 'Th 6s',
  6: '3d 9s',
  7: '2c Ks',
  8: '9c 8d',
};
function openedHand({
  heroStack = 3700,
  openTo = 1200,
  holes = {},
  stacks = {},
  difficulty = 'normal',
} = {}) {
  const g = engine.newGame(9, {
    smallBlind: 100,
    bigBlind: 200,
    startingStack: 20000,
    chipUnit: 100,
  });
  g.difficulty = difficulty;
  g.dealer = 5;
  g.players.forEach((p, id) => (p.stack = id ? (stacks[id] ?? 20000) : heroStack));
  engine.startHand(g);
  assert.equal(engine.seatPosition(g, 0), 'UTG');
  const used = new Set();
  const deal = (id, text) => {
    g.players[id].hole = cards(text);
    g.players[id].hole.forEach((c) => used.add(c.key));
  };
  deal(0, 'As 5s');
  for (const [id, text] of Object.entries({ ...REPORTED, ...holes })) deal(+id, text);
  g.deck = engine.deckOfCards().filter((c) => !used.has(c.key));
  engine.act(g, 0, 'raise', openTo);
  return g;
}
// Fold earlier seats so `id` acts next, without changing the public open.
function actorAt(g, id) {
  while (g.actor !== id) engine.act(g, g.actor, 'fold');
  return g;
}

test('reported 6BB open from 18.5BB: the call leaves SPR < 1, so weak and speculative hands fold', () => {
  for (const difficulty of ['normal', 'hard'])
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8])
      for (const seed of [1, 2, 3, 4, 5]) {
        const g = actorAt(openedHand({ difficulty }), id);
        const d = engine.botDecision(g, allInRandom(seed));
        const plan = d.trace.committedOpen;
        assert.equal(d.action, 'fold', `${difficulty} seat ${id} seed ${seed}`);
        assert.equal(d.trace.reason, 'committed-fold');
        assert.ok(plan.spr < 1.05 && plan.spr <= COMMITTED_SPR, `spr ${plan.spr}`);
        assert.equal(plan.matched, 3700, 'The price is the opener’s whole stack, not the open');
        assert.equal(plan.depthBB, 18.5);
      }
});

test('strong hands move the committed opener all-in instead of flatting at SPR < 1', () => {
  const holes = { 1: 'Jh Jd', 2: '9c 9d', 3: 'Ah Kc' };
  for (const id of [1, 2, 3])
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = actorAt(openedHand({ holes, difficulty: 'hard' }), id);
      const before = chipsInPlay(g);
      const d = engine.botDecision(g, allInRandom(seed));
      assert.equal(d.action, 'raise', `seat ${id} seed ${seed}`);
      assert.equal(d.trace.reason, 'committed-reshove');
      assert.equal(d.trace.committedOpen.valueTier, true);
      assert.equal(d.amount, 3700, 'Raise exactly to the opener’s total stack');
      assert.equal(d.amount % g.chipUnit, 0);
      assert.ok(d.amount >= engine.legalActions(g).minRaiseTo);
      engine.act(g, id, d.action, d.amount);
      assert.equal(chipsInPlay(g), before);
      assert.equal(g.players[id].stack, 20000 - 3700, 'The covering bot keeps the rest');
    }
});

test('a bot shorter than the committed opener moves all-in for its own stack', () => {
  const g = actorAt(
    openedHand({ heroStack: 20000, openTo: 2000, holes: { 1: 'Qh Qd' }, stacks: { 1: 7000 } }),
    1,
  );
  const d = engine.botDecision(g, allInRandom(3));
  assert.equal(d.trace.reason, 'committed-reshove');
  assert.equal(d.trace.committedOpen.openerAllIn, false);
  assert.equal(d.amount, 7000);
  assert.match(explainRecord(g, 1).detail, /直接全下/);
});

test('deep opens and easy bots keep the existing open logic', () => {
  for (const id of [1, 8]) {
    const deep = engine.botDecision(actorAt(openedHand({ heroStack: 20000 }), id), allInRandom(1));
    assert.equal(deep.trace.committedOpen, null);
    assert.notEqual(deep.trace.reason, 'committed-fold');
    const easy = engine.botDecision(
      actorAt(openedHand({ difficulty: 'easy' }), id),
      allInRandom(1),
    );
    assert.equal(easy.trace.committedOpen, null);
  }
});

function explainRecord(g, id) {
  const plan = engine.planBotTurn(actorAt(g, id), allInRandom(4));
  engine.executeBotTurn(g, plan);
  const record = g.botDecisions.at(-1);
  assert.equal(record.id, id);
  return explainOpponent(record);
}

test('review explains the committed fold and reshove with public SPR and price only', () => {
  const fold = explainRecord(openedHand(), 1);
  assert.equal(fold.title, '跟注后翻牌没有下注空间，弃牌');
  assert.match(fold.detail, /SPR）约 0\.9/);
  assert.match(fold.detail, /全下大约需要的/);
  assert.doesNotMatch(fold.detail, /5♠/, 'The opener’s hidden cards never appear');
  const shove = explainRecord(openedHand({ holes: { 1: 'Jh Jd' } }), 1);
  assert.equal(shove.title, '对方开池已投入大半后手，加注逼全下');
  assert.match(shove.detail, /最强的一档起手牌/);
  assert.match(shove.detail, /加注到 3\.7K，对方要继续就得全下/);
});

// Synthetic public view: a 6BB single open, matched depth set by `depth`.
function sixBigBlindOpen(depthBB, hole = 'Ks 9h') {
  const bigBlind = 200,
    stack = depthBB * bigBlind;
  return {
    bigBlind,
    chipUnit: 100,
    id: 1,
    hole: cards(hole),
    board: [],
    street: 0,
    position: 'CO',
    count: 6,
    stack,
    bet: 0,
    pot: 1500,
    currentBet: 1200,
    contestable: 2700,
    rivals: 5,
    equity: 0.05,
    difficulty: 'hard',
    playsBoard: false,
    history: [{ id: 0, street: 0, action: 'raise', amount: 1200 }],
    opponents: [0, 2, 3, 4, 5].map((id) => ({
      id,
      stack: id === 0 ? stack - 1200 : stack,
      bet: id === 0 ? 1200 : 0,
      allin: false,
    })),
    features: { draw: false, wet: false, overpair: false },
    legal: {
      chipUnit: 100,
      enabled: true,
      canCheck: false,
      canRaise: true,
      toCall: 1200,
      callAmount: 1200,
      minRaiseTo: 2200,
      maxRaiseTo: stack,
    },
  };
}
test('open-size limits scale with depth beyond 100BB and stay unchanged at or below it', () => {
  const decide = (v) =>
    chooseBotAction(v, getBotProfile('balanced'), freshBotMood(), 'off', () => 0.9).trace;
  const at100 = decide(sixBigBlindOpen(100));
  const at60 = decide(sixBigBlindOpen(60));
  const at200 = decide(sixBigBlindOpen(200));
  assert.equal(at100.entryContext.openDepthScale, 1);
  assert.equal(at60.entryContext.openDepthScale, 1);
  assert.ok(Math.abs(at200.entryContext.openDepthScale - Math.SQRT2) < 1e-9);
  assert.equal(at100.affordableOpen, true);
  assert.equal(at200.affordableOpen, true);
  assert.ok(at200.range > at100.range, 'More behind makes the same open relatively cheaper');
  // An 8BB-plus open past the old fixed ceiling still prices in at 200BB.
  const big = sixBigBlindOpen(200);
  Object.assign(big, { currentBet: 2000, pot: 2300, contestable: 4300 });
  Object.assign(big.legal, { toCall: 2000, callAmount: 2000, minRaiseTo: 3800 });
  big.history[0].amount = 2000;
  big.opponents[0] = { ...big.opponents[0], stack: 38000, bet: 2000 };
  assert.equal(decide(big).affordableOpen, true);
  const shallow = sixBigBlindOpen(100);
  Object.assign(shallow, { currentBet: 2000, pot: 2300, contestable: 4300 });
  Object.assign(shallow.legal, { toCall: 2000, callAmount: 2000, minRaiseTo: 3800 });
  shallow.history[0].amount = 2000;
  shallow.opponents[0] = { ...shallow.opponents[0], stack: 18000, bet: 2000 };
  assert.equal(decide(shallow).affordableOpen, false);
});

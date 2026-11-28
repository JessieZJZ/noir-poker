import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  advanceStreet,
  botDecision,
  deckOfCards,
  legalActions,
  newGame,
  startHand,
} from '../../src/engine/poker.js';
import { chooseBotAction, getBotProfile, freshBotMood } from '../../src/engine/bot-profiles.js';
import { allInRandom } from '../fixtures/all-in-decisions.js';

const deck = deckOfCards();
const cards = (text) =>
  text
    .split(' ')
    .map((key) =>
      deck.find(
        (c) => c.rank === '23456789TJQKA'.indexOf(key[0]) + 2 && c.suit === 'shcd'.indexOf(key[1]),
      ),
    );

// A public facing-one-open view. The opener is seat 0; limpers (seats 2+)
// each paid one big blind before it. Synthetic low equity isolates the range
// gate: only hands the range admits continue.
function facingOpen({
  hole = '7s 6s',
  position = 'CO',
  openerPosition = 'HJ',
  ownBB = 100,
  openerBB = 100,
  openBB = 3,
  limpers = 0,
  bigBlind = 50,
} = {}) {
  const open = openBB * bigBlind,
    bet = position === 'BB' ? bigBlind : position === 'SB' ? bigBlind / 2 : 0,
    stack = ownBB * bigBlind - bet,
    limperIds = Array.from({ length: limpers }, (_, i) => i + 2);
  return {
    bigBlind,
    chipUnit: bigBlind / 2,
    id: 1,
    hole: cards(hole),
    board: [],
    street: 0,
    position,
    count: 6,
    stack,
    bet,
    pot: open + 1.5 * bigBlind + limpers * bigBlind,
    currentBet: open,
    contestable: 2 * open + 1.5 * bigBlind + limpers * bigBlind,
    rivals: 5,
    equity: 0.05,
    difficulty: 'hard',
    playsBoard: false,
    history: [
      ...limperIds.map((id) => ({ id, street: 0, action: 'call', amount: bigBlind })),
      { id: 0, street: 0, action: 'raise', amount: open },
    ],
    opponents: [
      {
        id: 0,
        position: openerPosition,
        stack: openerBB * bigBlind - open,
        bet: open,
        allin: false,
      },
      ...limperIds.map((id) => ({
        id,
        position: 'UTG',
        stack: 100 * bigBlind - bigBlind,
        bet: bigBlind,
        allin: false,
      })),
    ],
    features: { draw: false, wet: false, overpair: false },
    legal: {
      chipUnit: bigBlind / 2,
      enabled: true,
      canCheck: false,
      canRaise: true,
      toCall: open - bet,
      callAmount: open - bet,
      minRaiseTo: 2 * open,
      maxRaiseTo: stack + bet,
    },
  };
}
const decide = (view, profile = 'balanced') =>
  chooseBotAction(view, getBotProfile(profile), freshBotMood(), 'off', () => 0.9);
const traceOf = (options, profile) => decide(facingOpen(options), profile).trace;
const everyHand = () => {
  const hands = [];
  for (let a = 0; a < deck.length; a++)
    for (let b = a + 1; b < deck.length; b++) hands.push([deck[a], deck[b]]);
  return hands;
};

// Hand 6 of a reported session: 5 seats at 100/200, hero on the button
// isolates two limpers to 1.1K with 13.3K behind.
function reportedIsolation() {
  const game = newGame(5, { smallBlind: 100, bigBlind: 200, startingStack: 20000, chipUnit: 100 });
  game.difficulty = 'hard';
  game.emotionMode = 'lively';
  Object.assign(game.players[1], { botProfile: 'iris' });
  Object.assign(game.players[2], { botProfile: 'vale' });
  Object.assign(game.players[3], { botProfile: 'jett' });
  Object.assign(game.players[4], { botProfile: 'rook' });
  [14400, 30900, 16600, 19800, 38500].forEach((stack, id) => (game.players[id].stack = stack));
  game.dealer = 4;
  startHand(game);
  const holes = ['Qd 9h', 'Kd 4d', '8d 6s', 'Qh 3c', '8h 2d'].map(cards);
  const used = new Set(holes.flat().map((c) => c.key));
  game.players.forEach((p, id) => (p.hole = holes[id]));
  game.deck = deckOfCards().filter((c) => !used.has(c.key));
  act(game, 3, 'call');
  act(game, 4, 'call');
  act(game, 0, 'raise', 1100);
  return game;
}

test('a deep small blind covering a shorter isolator defends K4s; the big blind still folds 86o', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const game = reportedIsolation();
    assert.equal(game.actor, 1);
    const sb = botDecision(game, allInRandom(seed));
    const context = sb.trace.entryContext;
    assert.equal(sb.action, 'call', `seed ${seed}`);
    assert.equal(sb.trace.affordableOpen, true);
    assert.equal(context.effectiveBehind, 13300);
    assert.equal(context.openCoverScale, 1.25);
    assert.equal(context.isolationLimpers, 2);
    assert.equal(context.limperAllowanceBB, 3);
    assert.equal(context.isolatedPriceBB, 2);
    assert.ok(Math.abs(context.openDepthWeight - 0.66) < 1e-9);
    assert.equal(context.outOfPositionToOpener, true);

    const bank = game.players.reduce((sum, p) => sum + p.stack + p.total, 0);
    act(game, 1, sb.action, sb.amount);
    const bb = botDecision(game, allInRandom(seed));
    assert.equal(bb.trace.admitted, false);
    assert.ok(bb.trace.range < bb.trace.percentile);
    // Finish the hand passively and keep every chip whole and accounted for.
    act(game, 2, 'fold');
    let steps = 0;
    while (game.phase !== 'done') {
      assert.ok(++steps < 100);
      if (game.phase === 'between') advanceStreet(game);
      else act(game, game.actor, legalActions(game).canCheck ? 'check' : 'call');
    }
    assert.equal(
      game.players.reduce((sum, p) => sum + p.stack, 0),
      bank,
    );
    assert.ok(game.players.every((p) => p.stack >= 0 && p.stack % game.chipUnit === 0));
  }
});

test('chips behind the opener ramp the widening from ten to fifteen calls', () => {
  // A 3BB open: the floor is 10 calls (1500 behind), full depth 15 (2250).
  // A 400BB caller keeps the cover factor constant across these openers.
  const at = (openerBehind) => traceOf({ openerBB: (openerBehind + 150) / 50, ownBB: 400 });
  const floor = at(1500),
    partial = at(1875),
    full = at(2250),
    deeper = at(3000);
  assert.equal(floor.affordableOpen, false);
  assert.equal(floor.range, floor.openingRange);
  assert.equal(partial.entryContext.openDepthWeight, 0.5);
  assert.equal(full.entryContext.openDepthWeight, 1);
  assert.equal(deeper.entryContext.openDepthWeight, 1);
  // Half depth adds exactly half the widening above the facing-raise range.
  assert.ok(Math.abs(partial.range - (floor.range + full.range) / 2) < 1e-9);
  let last = -1;
  for (let behind = 1500; behind <= 2400; behind += 25) {
    const range = at(behind).range;
    assert.ok(range >= last, `range fell at ${behind}`);
    last = range;
  }
  // Strong hands keep the single ten-call requirement.
  const strong = traceOf({ hole: 'Ts Td', openerBB: (1525 + 150) / 50 });
  assert.equal(strong.entryContext.openDepthWeight, 1);
});

test('covering the opener reads the open as smaller, up to a quarter at twice its stack', () => {
  const cover = (ownBB) => traceOf({ ownBB, openerBB: 100, openBB: 6 });
  assert.equal(cover(100).entryContext.openCoverScale, 1);
  assert.equal(cover(80).entryContext.openCoverScale, 1);
  assert.ok(Math.abs(cover(150).entryContext.openCoverScale - (1 + 0.25 * (2 / 3))) < 1e-9);
  assert.equal(cover(200).entryContext.openCoverScale, 1.25);
  assert.equal(cover(400).entryContext.openCoverScale, 1.25);
  // 6BB facing a 100BB opener: 6 / 1.25 = 4.8BB, so no large-open tightening.
  assert.equal(cover(200).entryContext.isolatedPriceBB, 4.8);
  assert.ok(cover(200).range > cover(100).range);
  // Covering adds no implied odds: depth is still measured against the
  // opener, and a short opener still switches the widening off.
  const shortOpener = (ownBB, openerBB) => traceOf({ ownBB, openerBB, openBB: 3 });
  assert.equal(shortOpener(300, 36).entryContext.openCoverScale, 1.25);
  assert.equal(shortOpener(300, 36).entryContext.openDepthWeight, 0.2);
  assert.equal(shortOpener(100, 36).entryContext.openDepthWeight, 0.2);
  assert.equal(shortOpener(300, 33).affordableOpen, false);
});

test('limpers move the isolation limits instead of counting as an oversized open', () => {
  const iso = (openBB, options = {}) => traceOf({ openBB, limpers: 2, ...options });
  // At 60BB or deeper each limper is worth 1.5BB: at 100BB, 8BB is priced as 5BB.
  assert.equal(iso(8).entryContext.isolationLimpers, 2);
  assert.equal(iso(8).entryContext.limperAllowanceBB, 3);
  assert.equal(iso(8).entryContext.isolatedPriceBB, 5);
  // 225BB deep (scale 1.5): without limpers the ceiling is 12BB; two limpers
  // move it to 15BB, where only the stronger group still continues.
  const deep = { ownBB: 225, openerBB: 225 };
  assert.equal(traceOf({ ...deep, openBB: 12.5 }).affordableOpen, false);
  assert.equal(iso(10.5, deep).entryContext.isolatedPriceBB, 5);
  assert.equal(iso(14.9, deep).affordableOpen, true);
  assert.equal(iso(15, deep).affordableOpen, false);
  assert.equal(iso(15, { ...deep, hole: 'Ts Td' }).affordableOpen, true);
  assert.equal(iso(15.1, { ...deep, hole: 'Ts Td' }).affordableOpen, false);
  // Under 60BB effective each limper is worth 1BB.
  const shallow = iso(6, { ownBB: 55, openerBB: 55 });
  assert.equal(shallow.entryContext.limperAllowanceBB, 2);
  // The price itself is not discounted: the range still scales with 8BB.
  const plain = traceOf({ openBB: 5 });
  assert.ok(iso(8).range < plain.range);
});

test('out of position against the opener narrows the widening by 0.85; the big blind keeps its allowance', () => {
  const pair = (position, ip, oop) => [
    traceOf({ position, openerPosition: ip }),
    traceOf({ position, openerPosition: oop }),
  ];
  const [ip, oop] = pair('CO', 'UTG', 'BTN');
  assert.equal(ip.entryContext.outOfPositionToOpener, false);
  assert.equal(oop.entryContext.outOfPositionToOpener, true);
  assert.ok(Math.abs(oop.range - 0.85 * ip.range) < 1e-9);
  const [bbVsSb, bbVsBtn] = pair('BB', 'SB', 'BTN');
  assert.equal(bbVsSb.entryContext.outOfPositionToOpener, false);
  assert.equal(bbVsBtn.entryContext.outOfPositionToOpener, true);
  assert.ok(Math.abs(bbVsBtn.range - ((bbVsSb.range - 0.08) * 0.85 + 0.08)) < 1e-9);
  const sb = traceOf({ position: 'SB', openerPosition: 'BTN' });
  assert.equal(sb.entryContext.outOfPositionToOpener, true);
  const btn = traceOf({ position: 'BTN', openerPosition: 'CO' });
  assert.equal(btn.entryContext.outOfPositionToOpener, false);
});

test('with cover, limpers and partial depth, a larger open never turns a fold into a call', () => {
  const hands = everyHand();
  for (const options of [
    { position: 'SB', openerPosition: 'BTN', ownBB: 155, openerBB: 72, limpers: 2 },
    { position: 'BB', openerPosition: 'BTN', ownBB: 83, openerBB: 72, limpers: 2 },
    { position: 'CO', openerPosition: 'UTG', ownBB: 200, openerBB: 90, limpers: 0 },
  ])
    for (const hole of hands) {
      let foldedSmaller = false;
      for (const openBB of [3, 4, 5, 5.5, 6, 7, 8, 9, 10, 11, 12]) {
        const view = { ...facingOpen({ ...options, openBB }), hole };
        const called = decide(view).action !== 'fold';
        assert.ok(!(called && foldedSmaller), `${JSON.stringify(options)} at ${openBB}BB`);
        foldedSmaller ||= !called;
      }
    }
});

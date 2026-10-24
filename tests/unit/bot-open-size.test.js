import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  startHand,
  botDecision,
  act,
  advanceStreet,
  applyBotSettings,
  deckOfCards,
  potSize,
  seatPosition,
} from '../../src/engine/poker.js';
import { getBotProfile, effectiveBotAxes } from '../../src/engine/bot-profiles.js';
import { botOpenRaiseTo, openBaseBB, resolveBotStyle } from '../../src/engine/bot-style.js';
import { deceptiveAction } from '../../src/engine/bot-deception.js';

const deck = deckOfCards();
const cards = (text) =>
  text
    .split(' ')
    .map((key) =>
      deck.find(
        (c) => c.rank === '23456789TJQKA'.indexOf(key[0]) + 2 && c.suit === 'shcd'.indexOf(key[1]),
      ),
    );
const seeded = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
// Every seat uses one style. A mid random passes the first-in and value-raise
// rolls without selecting the rare deep AA/KK open shove.
function table(count, profile = 'balanced', stakes) {
  const g = newGame(count, stakes);
  applyBotSettings(g, {
    emotionMode: 'off',
    assignments: Object.fromEntries(Array.from({ length: count - 1 }, (_, i) => [i + 1, profile])),
  });
  // The seat-0 player also decides through the bot policy in these probes.
  g.players[0].botProfile = profile;
  startHand(g);
  return g;
}
// Reach the named seat with folds or limps from the seats before it.
function reach(g, position, limps = 0) {
  const order = g.players.map((p) => seatPosition(g, p.id));
  while (seatPosition(g, g.actor) !== position) {
    assert.notEqual(g.actor, null, `${position} must still act (${order})`);
    act(g, g.actor, limps-- > 0 ? 'call' : 'fold');
  }
  return g;
}
const openWith = (g, hole, random = () => 0.5) => {
  g.players[g.actor].hole = cards(hole);
  return botDecision(g, random);
};

test('5-handed 100/200: UTG premiums open to 3.5 BB, the same size as the rest of the range', () => {
  for (const hole of ['Ad As', 'Kh Ks', 'Qs Qd', 'As Ks', 'Ah Kd', 'Js Ts', '8h 8d']) {
    const g = table(5);
    assert.equal(seatPosition(g, g.actor), 'UTG');
    const d = openWith(g, hole);
    assert.equal(d.action, 'raise', hole);
    // The reported AA open was 500 (2.5 BB); four seats remain behind UTG.
    assert.equal(d.amount, 700, hole);
    assert.equal(d.trace.sizing.opening, true);
    assert.equal(d.amount % g.chipUnit, 0);
  }
});

test('open size follows seats behind, blinds and limpers rather than hand strength', () => {
  const cases = [
    // [players, position, limpers, expected raise-to]
    [5, 'CO', 0, 600], // three behind: 2.5 + 0.5
    [5, 'BTN', 0, 500], // two behind: 2.5
    [5, 'SB', 0, 600], // one behind, out of position: 2.5 + 0.5
    [5, 'CO', 1, 1000], // 3 BB + 1 BB isolation + one limper
    [5, 'BTN', 2, 1100], // 2.5 BB + 1 BB isolation + two limpers
    [5, 'BB', 4, 1600], // 2.5 + 0.5 blind + 1 isolation + four limpers (SB completes)
    [6, 'UTG', 0, 700],
    [6, 'HJ', 0, 700], // HJ still has four seats behind
    [9, 'UTG', 0, 700], // capped at +1 BB however many seats remain
    [9, 'HJ', 0, 700],
    [9, 'CO', 0, 600],
    [9, 'BTN', 0, 500],
  ];
  for (const [count, position, limpers, expected] of cases)
    for (const hole of ['Ad As', 'Ah Kh']) {
      const g = reach(table(count), position, limpers);
      const d = openWith(g, hole);
      const label = `${count}-handed ${position} after ${limpers} limpers with ${hole}`;
      assert.equal(d.action, 'raise', label);
      assert.equal(d.amount, expected, label);
      assert.equal(d.trace.entryContext.limpers, limpers, label);
    }
});

test('style base sizes scale with the configured blinds in whole chips', () => {
  // Attack above 80 adds 0.5 BB; the small-pot style keeps its 2 BB base.
  for (const [profile, utg, btn] of [
    ['balanced', 3.5, 2.5],
    ['rook', 4, 3],
    ['nico', 3, 2],
  ])
    for (const stakes of [
      undefined,
      { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 },
      { smallBlind: 50000, bigBlind: 100000, startingStack: 10000000, chipUnit: 50000 },
    ]) {
      const first = table(5, profile, stakes);
      const bigBlind = first.bigBlind;
      const open = openWith(first, 'Ad As');
      assert.equal(open.amount, utg * bigBlind, `${profile} UTG ${bigBlind}`);
      const late = openWith(reach(table(5, profile, stakes), 'BTN'), 'Ad As');
      assert.equal(late.amount, btn * bigBlind, `${profile} BTN ${bigBlind}`);
      for (const amount of [open.amount, late.amount]) assert.equal(amount % first.chipUnit, 0);
    }
});

test('deceptive late opens use the value open size, so the amount is not a tell', () => {
  const g = reach(table(5, 'balanced'), 'BTN');
  g.difficulty = 'hard';
  g.players[g.actor].hole = cards('Kh 3c');
  const view = botDecision(g, () => 0.99).trace.view;
  const profile = getBotProfile('balanced');
  const valueSize = botOpenRaiseTo(
    view,
    openBaseBB(resolveBotStyle(profile), effectiveBotAxes(profile, null, 'off')[1] / 100),
  );
  const dirty = deceptiveAction(view, profile, () => 0);
  assert.equal(dirty.reason, 'dirty-open');
  assert.equal(dirty.amount, valueSize);
  assert.equal(dirty.amount, openWith(g, 'Ad As').amount);
});

test('first-in opens are identical per style, seat and limpers; chips stay conserved', () => {
  for (const [count, profile] of [
    [5, 'balanced'],
    [6, 'rook'],
    [9, 'nico'],
  ]) {
    const g = newGame(count);
    g.difficulty = 'hard';
    applyBotSettings(g, {
      emotionMode: 'off',
      assignments: Object.fromEntries(
        Array.from({ length: count - 1 }, (_, i) => [i + 1, profile]),
      ),
    });
    g.players[0].botProfile = profile;
    const random = seeded(count * 97),
      sizes = new Map(),
      total = count * g.stakes.startingStack;
    const previous = Math.random;
    Math.random = seeded(count);
    try {
      for (let hand = 0; hand < 20; hand++) {
        g.players.forEach((p) => (p.stack = g.stakes.startingStack));
        startHand(g);
        for (let actions = 0; g.phase !== 'done'; actions++) {
          assert.ok(actions < 1000, 'A hand must finish');
          if (g.phase === 'between') {
            advanceStreet(g);
            continue;
          }
          const d = botDecision(g, random);
          const firstIn =
            g.street === 0 &&
            g.actor !== 0 &&
            d.action === 'raise' &&
            !g.history.some((a) => a.street === 0 && a.action === 'raise');
          if (firstIn && d.amount < d.trace.view.legal.maxRaiseTo) {
            const key = `${d.trace.view.position}/${d.trace.entryContext.limpers}`;
            if (!sizes.has(key)) sizes.set(key, new Set());
            sizes.get(key).add(d.amount);
          }
          act(g, g.actor, d.action, d.amount);
          // Contributions stay recorded after settlement, so count them only mid-hand.
          if (g.phase !== 'done')
            assert.equal(g.players.reduce((sum, p) => sum + p.stack, 0) + potSize(g), total);
        }
        assert.equal(
          g.players.reduce((sum, p) => sum + p.stack, 0),
          total,
          'Settlement must conserve chips',
        );
      }
    } finally {
      Math.random = previous;
    }
    assert.ok(sizes.size >= 3, `${profile} should open from several seats`);
    for (const [key, amounts] of sizes) {
      assert.equal(amounts.size, 1, `${profile} ${key} opened with ${[...amounts]}`);
      const [amount] = amounts;
      assert.equal(amount % g.chipUnit, 0);
      assert.ok(amount >= 2 * g.bigBlind, `${profile} ${key} opened below 2 BB`);
    }
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseBotAction,
  freshBotMood,
  getBotProfile,
  startingPercentile,
} from '../../src/engine/bot-profiles.js';
import { botReraiseTo } from '../../src/engine/bot-style.js';
import { cards, deceptiveView } from '../fixtures/deceptive-decisions.js';

const seeded = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const decide = (id, v, seed) =>
  chooseBotAction(v, getBotProfile(id), freshBotMood(), 'off', seeded(seed));
const rate = (id, v, predicate, samples = 1200) =>
  Array.from({ length: samples }, (_, i) => decide(id, v, 4021 + i * 7919)).filter(predicate)
    .length / samples;
const raises = (d) => d.action === 'raise';
const continues = (d) => d.action !== 'fold';
// A single 3 BB open (150 at 25/50) from UTG, 100 BB deep, facing the bot.
const facingOpen = (hole, overrides = {}) =>
  deceptiveView(hole, '', {
    position: 'BTN',
    count: 6,
    pot: 225,
    currentBet: 150,
    contestable: 375,
    rivals: 5,
    equity: 0.3,
    difficulty: 'normal',
    history: [{ id: 0, street: 0, action: 'raise', amount: 150 }],
    opponents: [0, 2, 3, 4, 5].map((id) => ({
      id,
      position: id === 0 ? 'UTG' : 'HJ',
      stack: id === 0 ? 4850 : 5000,
      bet: id === 0 ? 150 : 0,
      allin: false,
    })),
    legal: {
      enabled: true,
      canCheck: false,
      canRaise: true,
      toCall: 150,
      callAmount: 150,
      minRaiseTo: 250,
      maxRaiseTo: 5000,
    },
    ...overrides,
  });
const resize = (v, bb) => ({
  ...v,
  currentBet: bb * 50,
  history: [{ id: 0, street: 0, action: 'raise', amount: bb * 50 }],
  legal: { ...v.legal, toCall: bb * 50, callAmount: bb * 50, minRaiseTo: bb * 100 },
});

test('the starting-hand order values suited connectors above offsuit gapped high cards', () => {
  const p = (hole) => startingPercentile(cards(hole));
  assert.equal(p('As Ad'), 0);
  for (const [better, worse] of [
    ['7s 6s', 'Qd 7c'],
    ['5s 4s', 'Kd 2c'],
    ['As 5s', 'Jd 8c'],
    ['Ks Qd', 'Ts 9s'],
    ['Ts Td', 'Ah Qc'],
  ])
    assert.ok(p(better) < p(worse), `${better} before ${worse}`);
  assert.ok(p('7d 2c') > 0.95);
});

test('one 3-bet size covers the whole re-raising range: 3x in position, 4x out, plus callers', () => {
  const open = { id: 0, street: 0, action: 'raise', amount: 150 };
  const base = { currentBet: 150, history: [open] };
  assert.equal(botReraiseTo({ ...base, inPosition: true }), 450);
  assert.equal(botReraiseTo({ ...base, inPosition: false }), 600);
  const called = {
    currentBet: 150,
    inPosition: true,
    history: [open, { id: 2, street: 0, action: 'call', amount: 150 }],
  };
  assert.equal(botReraiseTo(called), 600);
  const threeBet = {
    currentBet: 600,
    history: [open, { id: 1, street: 0, action: 'raise', amount: 600 }],
  };
  assert.equal(botReraiseTo(threeBet), 1380);
  // Premium and light re-raises use the same amount.
  const premium = decide('rook', facingOpen('As Ad', { inPosition: true }), 3);
  const light = facingOpen('Ks Qd', { inPosition: true });
  const lightRaise = Array.from({ length: 200 }, (_, i) => decide('rook', light, 50 + i)).find(
    raises,
  );
  assert.equal(premium.action, 'raise');
  assert.ok(lightRaise, 'rook re-raises KQ at least sometimes');
  assert.equal(premium.amount, lightRaise.amount);
  assert.equal(premium.amount % 25, 0);
});

test('calls against an open narrow smoothly with its size instead of stopping at 4 BB', () => {
  const hands = ['Ks Js', 'Qs Ts', 'Ad Th', '9s 9h', 'Kh Qd'];
  const share = (bb) =>
    hands.map((h) => decide('balanced', resize(facingOpen(h), bb), 9)).filter(continues).length;
  const shares = [2.5, 4, 5, 7].map(share);
  for (let i = 1; i < shares.length; i++) assert.ok(shares[i] <= shares[i - 1], `${shares}`);
  // A 4.5 BB open stays inside the priced single-open window; 7.5 BB does not.
  assert.equal(decide('balanced', resize(facingOpen('Ks Js'), 4.5), 9).trace.affordableOpen, true);
  assert.equal(decide('balanced', resize(facingOpen('Ks Js'), 7.5), 9).trace.affordableOpen, false);
});

test('deep small pairs and suited connectors call an open for implied odds, shallow ones do not', () => {
  for (const hole of ['2s 2h', '7s 6s', 'As 5s'])
    assert.equal(decide('balanced', facingOpen(hole), 5).action, 'call', hole);
  const shallow = facingOpen('2s 2h', {
    stack: 2000,
    opponents: [{ id: 0, position: 'UTG', stack: 1850, bet: 150, allin: false }],
  });
  assert.equal(decide('balanced', shallow, 5).action, 'fold');
  // The tight style keeps folding the small pair at the same price.
  assert.equal(decide('owen', facingOpen('2s 2h'), 5).action, 'fold');
});

test('air facing a postflop bet folds unless the style floats; calling styles float more', () => {
  const bet = deceptiveView('9s 8h', 'Ac Kd 3h', {
    difficulty: 'normal',
    currentBet: 400,
    contestable: 1200,
    history: [
      { id: 0, street: 0, action: 'raise', amount: 150 },
      { id: 1, street: 0, action: 'call', amount: 150 },
      { id: 0, street: 1, action: 'raise', amount: 400 },
    ],
    legal: {
      enabled: true,
      canCheck: false,
      canRaise: true,
      toCall: 400,
      callAmount: 400,
      minRaiseTo: 800,
      maxRaiseTo: 5000,
    },
  });
  assert.equal(bet.features.ownMade, false);
  assert.equal(bet.features.draw, false);
  assert.ok(rate('balanced', bet, continues) < 0.05);
  assert.ok(rate('jett', bet, continues) > 0.3);
  assert.ok(rate('rook', bet, raises) > 0.05, 'the aggressive style sometimes bluff-raises');
});

test('repeated bets by the same player narrow a weak pair; calling styles discount it less', () => {
  // Second pair facing a river bet after 0, 1 or 2 earlier bets by the same player.
  const river = (bets) =>
    deceptiveView('Ts 9s', 'Kd Th 4c 2s 7h', {
      difficulty: 'normal',
      pot: 3000,
      currentBet: 900,
      contestable: 3900,
      equity: 0.36,
      history: [
        { id: 0, street: 0, action: 'raise', amount: 150 },
        { id: 1, street: 0, action: 'call', amount: 150 },
        ...[1, 2].slice(0, bets).map((street) => ({ id: 0, street, action: 'raise', amount: 500 })),
        { id: 0, street: 3, action: 'raise', amount: 900 },
      ],
      legal: {
        enabled: true,
        canCheck: false,
        canRaise: true,
        toCall: 900,
        callAmount: 900,
        minRaiseTo: 1800,
        maxRaiseTo: 5000,
      },
    });
  const balanced = [0, 1, 2].map((bets) => rate('balanced', river(bets), continues, 400));
  assert.ok(balanced[0] > balanced[1] && balanced[1] > balanced[2], `${balanced}`);
  assert.ok(balanced[2] < 0.1);
  assert.ok(rate('jett', river(2), continues, 400) > 0.9);
});

test('c-bets and limped-pot stabs follow the style', () => {
  const cbet = deceptiveView('9s 8h', 'Kc 7d 2h', {
    difficulty: 'normal',
    equity: 0.25,
    history: [
      { id: 1, street: 0, action: 'raise', amount: 150 },
      { id: 0, street: 0, action: 'call', amount: 150 },
      { id: 0, street: 1, action: 'check', amount: 0 },
    ],
  });
  const rook = rate('rook', cbet, raises),
    balanced = rate('balanced', cbet, raises),
    vale = rate('vale', cbet, raises);
  assert.ok(rook > balanced && balanced > vale, `${rook} / ${balanced} / ${vale}`);
  assert.ok(balanced > 0.45);
  const limped = deceptiveView('9s 8h', 'Kc 7d 2h', {
    difficulty: 'normal',
    equity: 0.25,
    history: [
      { id: 0, street: 0, action: 'call', amount: 50 },
      { id: 1, street: 0, action: 'call', amount: 50 },
      { id: 0, street: 1, action: 'check', amount: 0 },
    ],
  });
  assert.ok(rate('rook', limped, raises) > rate('vale', limped, raises) + 0.3);
});

test('a limp keeps its story: only premiums or the trapping style re-raise later', () => {
  const limpThenRaise = (hole) =>
    deceptiveView(hole, '', {
      position: 'CO',
      difficulty: 'normal',
      bet: 50,
      stack: 4950,
      pot: 375,
      currentBet: 200,
      contestable: 525,
      equity: 0.4,
      history: [
        { id: 1, street: 0, action: 'call', amount: 50 },
        { id: 0, street: 0, action: 'raise', amount: 200 },
      ],
      legal: {
        enabled: true,
        canCheck: false,
        canRaise: true,
        toCall: 150,
        callAmount: 150,
        minRaiseTo: 350,
        maxRaiseTo: 5000,
      },
    });
  assert.equal(rate('jett', limpThenRaise('Ks Qs'), raises), 0);
  assert.ok(rate('jett', limpThenRaise('As Ad'), raises) > 0.5);
});

test('3-bet defence by the original raiser is a style dial', () => {
  const facing3Bet = (hole) =>
    deceptiveView(hole, '', {
      position: 'CO',
      difficulty: 'normal',
      bet: 150,
      stack: 4850,
      pot: 675,
      currentBet: 450,
      contestable: 975,
      rivals: 1,
      equity: 0.4,
      history: [
        { id: 1, street: 0, action: 'raise', amount: 150 },
        { id: 0, street: 0, action: 'raise', amount: 450 },
      ],
      opponents: [{ id: 0, stack: 4550, bet: 450, allin: false }],
      legal: {
        enabled: true,
        canCheck: false,
        canRaise: true,
        toCall: 300,
        callAmount: 300,
        minRaiseTo: 750,
        maxRaiseTo: 5000,
      },
    });
  const hands = ['As Td', 'Ks Qd', '8s 8d', 'Qs Js', 'Ah 9h', 'Kd Jc'];
  const kept = (id) => hands.filter((h) => decide(id, facing3Bet(h), 11).action !== 'fold').length;
  assert.ok(kept('rook') > kept('owen'), `rook ${kept('rook')} / owen ${kept('owen')}`);
});

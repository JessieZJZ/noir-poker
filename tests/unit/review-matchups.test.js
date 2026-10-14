import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, compare } from '../../src/engine/poker.js';
import { decisionContext } from '../../src/review/context.js';
import { handMatchups } from '../../src/review/matchups.js';
import { valuePlan } from '../../src/review/routes.js';
import { analyzeDecision } from '../../src/review/analysis.js';
import { cards } from '../fixtures/deceptive-decisions.js';
import { heroValueGame } from '../fixtures/review-spots.js';

// Public snapshots exercise explanation and route boundaries. Opponent hands
// below are examples generated from unseen cards, never actual private cards.
function spot(hole, board = '', changes = {}) {
  const community = board ? cards(board) : [];
  const street = community.length ? community.length - 2 : 0;
  const snapshot = {
    hole: cards(hole),
    board: community,
    street,
    position: 'BTN',
    stack: 4500,
    bet: 0,
    total: 500,
    pot: 1100,
    currentBet: 100,
    minRaise: 100,
    action: 'call',
    amount: 100,
    pending: [0],
    history: [{ id: 1, street, action: 'raise', amount: 100 }],
    legal: {
      enabled: true,
      canCheck: false,
      canRaise: true,
      raiseReopened: true,
      callAmount: 100,
      toCall: 100,
      minRaiseTo: 200,
      maxRaiseTo: 4500,
    },
    players: [
      { id: 0, name: '你', position: 'BTN', stack: 4500, total: 500, bet: 0 },
      { id: 1, name: 'River', position: 'BB', stack: 4400, total: 600, bet: 100 },
    ],
    ...changes,
  };
  snapshot.legal = {
    enabled: true,
    canCheck: false,
    canRaise: true,
    raiseReopened: true,
    callAmount: 100,
    toCall: 100,
    minRaiseTo: 200,
    maxRaiseTo: 4500,
    ...changes.legal,
  };
  if (!changes.players) {
    snapshot.players[0].stack = snapshot.stack;
    snapshot.players[0].position = snapshot.position;
  }
  return snapshot;
}
const table = [
  ['top pair top kicker', 'As Kd', 'Ks 7h 2c', false],
  ['overpair', 'As Ah', 'Ks 7h 2c', false],
  ['set', '5s 5d', '5h Ks 9c', false],
  ['top two pair', 'As Kd', 'Ah Ks 7c', false],
  ['flop nut straight', '8s 9d', '6c 7h Ts', true],
  ['river non-nut straight', '8s 9d', '6c 7h Ts Jc Qd', false],
  ['nut flush', 'Ah Th', 'Jh 7h 3h 2s 4c', true],
  ['non-nut flush', '9h 8h', 'Kh 7h 3h 2s 4c', false],
  ['full house facing possible quads', 'Ks Kd', 'Kh 7s 7h 2c 3d', false],
  ['ace quads', 'As Ad', 'Ah Ac 7s 2d 3c', true],
  ['shared full house can be beaten', '4s 3d', 'Ks Kd Kh 2s 2d', false],
  ['shared royal flush only ties', '2c 3d', 'As Ks Qs Js Ts', true],
  ['unmade high cards', '8s 9d', 'Ah Kc 3d 7s 2h', false],
];

test('across streets, every shown matchup is a legal current-board comparison rather than a hidden hand claim', () => {
  for (const [name, hole, board, nut] of table) {
    const s = spot(hole, board),
      c = decisionContext(s),
      m = handMatchups(s, c);
    assert.equal(m.nut, nut, name);
    assert.ok(['strong', 'medium', 'weak', 'board'].includes(m.strength), name);
    assert.ok(m.text, name);
    assert.doesNotMatch(m.text, /EV|模型|模拟器|抽样|\d(?:\.\d+)?%|最终赢家|已经拿到/, name);
    const known = new Set([...s.hole, ...s.board].map((card) => card.key));
    const hero = evaluate([...s.hole, ...s.board]);
    for (const [direction, expected] of [
      ['ahead', 1],
      ['behind', -1],
      ['tied', 0],
    ]) {
      assert.ok(Array.isArray(m[direction]) && m[direction].length <= 1, name + '/' + direction);
      for (const example of m[direction]) {
        assert.equal(example.cards.length, 2, name);
        assert.equal(new Set(example.cards.map((card) => card.key)).size, 2, name);
        assert.ok(
          example.cards.every((card) => !known.has(card.key)),
          name,
        );
        const current = evaluate([...example.cards, ...s.board]);
        assert.equal(
          Math.sign(compare(hero.score, current.score)),
          expected,
          name + '/' + direction,
        );
        assert.deepEqual(example.score, current.score, name);
      }
    }
    if (c.handClass === 'board') assert.equal(m.strength, 'board', name);
    if (nut) assert.deepEqual(m.behind, [], name);
  }
});

test('preflop pocket pairs and high cards compare conditional common holdings without calling rank order equity', () => {
  for (const [hole, expected] of [
    ['As Ah', /AA|A/],
    ['Ks Kd', /AA|A/],
    ['Qs Qd', /KK|K|AA|A/],
    ['As Kd', /A.*Q|A.*J|对子/],
    ['Ah Td', /A.*K|A.*Q|踢脚/],
  ]) {
    const s = spot(hole),
      m = handMatchups(s, decisionContext(s));
    assert.match(m.text, expected, hole);
    assert.equal(m.nut, false, 'preflop rank order cannot guarantee the final showdown');
    assert.doesNotMatch(m.text, /\d(?:\.\d+)?%|随机|抽样|EV|当前对手(?:拿|持有)/, hole);
  }
});

test('made-hand examples change when the same flush board becomes paired and remain private-information independent', () => {
  const s = spot('Ah Th', 'Jh 7h 3h 2s 4c');
  const before = handMatchups(s, decisionContext(s));
  const paired = { ...s, board: cards('Jh 7h 3h 2s 7c') };
  const after = handMatchups(paired, decisionContext(paired));
  assert.equal(before.nut, true);
  assert.equal(after.nut, false);
  assert.notEqual(after.text, before.text);
  assert.doesNotMatch(before.text, /保证(?:赢|获胜)|一定(?:赢|获胜)|永远不会输/);
  assert.ok(after.behind.length);
  const hidden = structuredClone(paired);
  hidden.players[1].hole = cards('Kh Qh');
  hidden.futureDeck = cards('As Ad');
  hidden.winners = [{ id: 1 }];
  hidden.result = 'River获胜';
  assert.deepEqual(handMatchups(hidden, decisionContext(hidden)), after);
});

function plan(s) {
  const context = decisionContext(s);
  return valuePlan(s, context, handMatchups(s, context));
}
function assertLegalPlan(s, result) {
  for (const route of [result.primary, result.secondary].filter(Boolean)) {
    if (route.action === 'raise') {
      assert.equal(s.legal.canRaise, true);
      assert.notEqual(s.legal.raiseReopened, false);
      assert.ok(route.amount <= s.legal.maxRaiseTo);
      assert.ok(
        route.amount >= s.legal.minRaiseTo ||
          (s.legal.isShortAllin && route.amount === s.legal.maxRaiseTo),
      );
      assert.equal(route.amount % 25, 0);
    } else if (route.action === 'check') assert.equal(s.legal.canCheck, true);
    else if (route.action === 'call') assert.equal(route.amount, s.legal.callAmount);
  }
}

test('value routes distinguish low-SPR value all-in, deep value raises and live dry-board traps', () => {
  const low = spot('5s 5d', '5h Ks 9c', { stack: 500, legal: { maxRaiseTo: 500 } });
  const shove = plan(low);
  assert.equal(shove.kind, 'value-shove');
  assert.equal(shove.primary.action, 'raise');
  assert.equal(shove.primary.amount, 500);
  assertLegalPlan(low, shove);
  const deep = spot('5s 5d', '5h Ks 9c');
  const trap = plan(deep);
  assert.equal(trap.kind, 'trap');
  assert.equal(trap.primary.action, 'call');
  assertLegalPlan(deep, trap);
  const checked = spot('5s 5d', '5h Ks 9c', {
    action: 'check',
    amount: 0,
    currentBet: 0,
    history: [{ id: 1, street: 1, action: 'check', amount: 0 }],
    legal: { canCheck: true, callAmount: 0, toCall: 0, minRaiseTo: 50 },
  });
  const value = plan(checked);
  assert.equal(value.kind, 'value-raise');
  assert.equal(value.primary.action, 'raise');
  assert.ok(value.primary.amount < checked.legal.maxRaiseTo);
  assertLegalPlan(checked, value);
});

test('multiway wet top pair, four-flush boards, closed betting and short raise rights prevent mechanical value shoves', () => {
  const wet = spot('As Kd', 'Kh Jh 9c Ts', {
    stack: 500,
    pot: 1700,
    legal: { maxRaiseTo: 500 },
    players: [
      { id: 0, name: '你', position: 'BTN', stack: 500, bet: 0, total: 500 },
      { id: 1, name: 'River', position: 'BB', stack: 4400, bet: 100, total: 600 },
      { id: 2, name: 'Mia', position: 'CO', stack: 4400, bet: 100, total: 600 },
    ],
  });
  assert.notEqual(plan(wet).kind, 'value-shove');
  const fourFlush = spot('As Qd', 'Qh 7h 3h 9h', { stack: 500, legal: { maxRaiseTo: 500 } });
  assert.notEqual(plan(fourFlush).kind, 'value-shove');
  const strong = spot('5s 5d', '5h Ks 9c', { stack: 500, legal: { maxRaiseTo: 500 } });
  for (const legal of [
    { canRaise: false },
    { raiseReopened: false },
    { minRaiseTo: 750, maxRaiseTo: 500, isShortAllin: true },
  ]) {
    const s = { ...strong, legal: { ...strong.legal, ...legal } },
      p = plan(s);
    assertLegalPlan(s, p);
    assert.notEqual(p.kind, 'value-shove');
  }
  const board = spot('2c 3d', 'As Ks Qs Js Ts', { stack: 500, legal: { maxRaiseTo: 500 } });
  assert.notEqual(plan(board).kind, 'value-shove');
  const river = spot('5s 5d', '5h Ks 9c 2d 3c');
  assert.notEqual(plan(river).kind, 'trap');
  const allin = spot('5s 5d', '5h Ks 9c');
  allin.players[1].allin = true;
  allin.players[1].stack = 0;
  assert.notEqual(plan(allin).kind, 'trap');
});

test('ordinary made-hand coaching names concrete winning and losing examples without using later outcomes', () => {
  const s = spot('As Kd', 'Ks 7h 2c');
  const before = analyzeDecision(s, { trials: 120, rolloutTrials: 12 });
  const matchups = handMatchups(s, before.context);
  assert.ok(before.coaching.paragraphs.some((paragraph) => paragraph.includes(matchups.text)));
  assert.ok(matchups.ahead.length && matchups.behind.length);
  const hidden = structuredClone(s);
  hidden.players[1].hole = cards('Ks Kc');
  hidden.futureDeck = cards('7s 7d');
  hidden.result = '你输了';
  hidden.winners = [{ id: 1 }];
  const after = analyzeDecision(hidden, { trials: 120, rolloutTrials: 12 });
  assert.deepEqual(after.coaching, before.coaching);
  assert.equal(after.status, before.status);
});

test('the same hand keeps its card comparisons but coaching follows actual position, chips and live opponents', () => {
  const inPosition = spot('As Kd', 'Ks 7h 2c');
  const baseline = analyzeDecision(inPosition, { trials: 120, rolloutTrials: 12 });
  const outOfPosition = spot('As Kd', 'Ks 7h 2c', { position: 'SB' });
  outOfPosition.players[1].position = 'BTN';
  const shifted = analyzeDecision(outOfPosition, { trials: 120, rolloutTrials: 12 });
  assert.equal(baseline.context.inPosition, true);
  assert.equal(shifted.context.inPosition, false);
  assert.deepEqual(
    handMatchups(outOfPosition, shifted.context),
    handMatchups(inPosition, baseline.context),
  );
  assert.notEqual(shifted.coaching.explanation, baseline.coaching.explanation);
  assert.match(shifted.evidence.join(''), /位置 SB/);
  assert.notEqual(plan(outOfPosition).primary.amount, plan(inPosition).primary.amount);
  const shorter = spot('As Kd', 'Ks 7h 2c', { stack: 500, legal: { maxRaiseTo: 500 } });
  const shortReview = analyzeDecision(shorter, { trials: 120, rolloutTrials: 12 });
  assert.notEqual(
    shortReview.coaching.explanation + shortReview.coaching.followUp,
    baseline.coaching.explanation + baseline.coaching.followUp,
  );
  assert.match(shortReview.evidence.join(''), /行动前你手里有 500/);
});

test('strong-flat support requires the recorded legal call and cannot replace expensive-call or crowding guards', () => {
  const s = heroValueGame('aa-flat').decisions[0];
  const supported = analyzeDecision(s, { trials: 120, rolloutTrials: 12 });
  assert.equal(supported.code, 'strong-flat-trap');
  assert.equal(supported.coaching.kind, 'keep');
  const hidden = structuredClone(s);
  hidden.players[5].hole = cards('Ks Kc');
  hidden.futureDeck = cards('Kd Kh 2s');
  hidden.winners = [{ id: 5 }];
  assert.deepEqual(
    analyzeDecision(hidden, { trials: 120, rolloutTrials: 12 }).coaching,
    supported.coaching,
  );
  const mismatched = { ...s, amount: s.amount - 25 };
  assert.notEqual(
    analyzeDecision(mismatched, { trials: 120, rolloutTrials: 12 }).code,
    'strong-flat-trap',
  );
  const crowded = structuredClone(s);
  crowded.players[3].folded = false;
  assert.notEqual(
    analyzeDecision(crowded, { trials: 120, rolloutTrials: 12 }).code,
    'strong-flat-trap',
  );
  for (const strong of [s, spot('5s 5d', '5h Ks 9c')]) {
    for (const rights of [{ canRaise: false }, { raiseReopened: false }, { isShortAllin: true }]) {
      const forced = { ...strong, legal: { ...strong.legal, ...rights } };
      assert.notEqual(plan(forced).kind, 'trap');
      const review = analyzeDecision(forced, { trials: 120, rolloutTrials: 12 });
      assert.notEqual(review.code, 'strong-flat-trap');
      assert.doesNotMatch(review.coaching.explanation, /藏在平跟|埋牌路线/);
    }
  }
  const expensive = spot('4s 3d', 'Ac Kd Js 9c 2h', {
    stack: 500,
    pot: 500,
    currentBet: 450,
    amount: 450,
    legal: { callAmount: 450, toCall: 450, canRaise: false, minRaiseTo: 900, maxRaiseTo: 500 },
    history: [{ id: 1, street: 3, action: 'raise', amount: 450 }],
    players: [
      { id: 0, name: '你', position: 'BTN', stack: 500, total: 50, bet: 0 },
      { id: 1, name: 'River', position: 'BB', stack: 0, total: 450, bet: 450, allin: true },
    ],
  });
  const rejected = analyzeDecision(expensive, { trials: 120, rolloutTrials: 12 });
  assert.equal(rejected.code, 'expensive-call');
  assert.equal(rejected.coaching.label, '弃牌');
  assert.equal(rejected.coaching.evKind, 'negative');
});

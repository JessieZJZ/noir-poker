import test from 'node:test';
import assert from 'node:assert/strict';
import { deckOfCards, evaluate, compare } from '../../src/engine/poker.js';
import { decisionContext } from '../../src/review/context.js';
import {
  handMatchups,
  matchupPresentation,
  reviewCommentary,
  matchupDrawLabel,
} from '../../src/review/matchups.js';
import { handFeatures } from '../../src/engine/hand-features.js';
import {
  bottomPairReview,
  topPairCheckReview,
  aceFourPreflopReview,
} from '../fixtures/bottom-pair-review.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { valuePlan } from '../../src/review/routes.js';
import { analyzeDecision } from '../../src/review/analysis.js';
import { cards } from '../fixtures/deceptive-decisions.js';
import { heroValueGame } from '../fixtures/review-spots.js';
import { actionReason } from '../../src/review/narrative.js';
import { weakSuitedShove } from '../fixtures/review-spots.js';
import { renderReviewParagraphs } from '../../src/ui/review-matchups.js';
import { pairedFlushReviewGame } from '../fixtures/paired-flush-review.js';

// Public snapshots exercise explanation and route boundaries. Opponent hands
// below are examples generated from unseen cards, never actual private cards.
test('consumer preflop ranges combine hand families and explain only actions already taken', () => {
  const s = aceFourPreflopReview(),
    c = decisionContext(s),
    m = handMatchups(s, c),
    p = matchupPresentation(m, 0),
    text = analyzeDecision(s, { trials: 120, rolloutTrials: 12 }).coaching.explanation;
  assert.equal(p.groups.length, 1);
  assert.equal(p.groups[0].label, '对手可能牌组');
  assert.ok(p.groups[0].examples.length > 0);
  assert.match(text, /Luna在 UTG\+1 位2-bet 开池至 4K/);
  assert.match(text, /Jade在 LJ 位已跟注这笔加注，补 4K/);
  assert.doesNotMatch(text, /Kai跟住/);
  assert.match(text, /A.*AA、AK、AQ、AJ/);
  const html = renderReviewParagraphs([m.text], m, 0);
  assert.doesNotMatch(html, /结构上较|不代表|记录|抽样|获胜概率/);
  const poisoned = structuredClone(s);
  poisoned.players.forEach((player) => {
    player.hole = cards('Ks Kh');
  });
  poisoned.deck = cards('Qs Qh Qd');
  poisoned.winners = [5];
  assert.deepEqual(handMatchups(poisoned, decisionContext(poisoned)), m);
  const reraised = structuredClone(s);
  reraised.history.push({ id: 7, street: 0, action: 'raise', amount: 14000 });
  assert.match(
    handMatchups(reraised, decisionContext(reraised)).rangeNotes.join(''),
    /Jade在 LJ 位3-bet 加注至 14K/,
  );
  assert.doesNotMatch(text, /需要结合尺度|不能只根据位置套用/);
});
function spot(hole, board = '', changes = {}) {
  const community = board ? cards(board) : [];
  const street = community.length ? community.length - 2 : 0;
  const snapshot = {
    bigBlind: 50,
    chipUnit: 25,
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
      chipUnit: 25,
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
    chipUnit: 25,
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

test('reported A4 bottom pair lists more meaningful stronger hands, including checked top pair, than weaker draws', () => {
  const s = bottomPairReview(),
    c = decisionContext(s),
    m = handMatchups(s, c);
  assert.equal(m.ahead.length, 1);
  assert.equal(m.behind.length, 4);
  assert.ok(
    m.behind.some(
      (x) => x.cards.some((card) => card.rank === 11) && x.cards.some((card) => card.rank >= 12),
    ),
  );
  assert.ok(m.behind.some((x) => x.score[0] === 1 && x.score[1] > 11));
  assert.equal(m.ahead[0].label, '同花听牌 + 两头顺听牌');
  assert.doesNotMatch(m.ahead[0].label, /高牌/);
  const changed = structuredClone(s);
  changed.players[5].hole = cards('2c 3c');
  changed.winners = [5];
  changed.futureDeck = cards('Ah Ac');
  assert.deepEqual(handMatchups(changed, decisionContext(changed)), m);
});

test('candidate labels retain both parts of open-ended, gutshot and double-gutshot combo draws', () => {
  for (const [hole, board, expected] of [
    ['6s 7s', '5d 4s Js', '同花听牌 + 两头顺听牌'],
    ['6s 8s', '5d 4s Js', '同花听牌 + 卡顺听牌'],
    ['7s 8s', '5d 4s Js', '同花听牌 + 卡顺听牌'],
    ['8s Ts', '6s 9s Qh', '同花听牌 + 双卡顺听牌'],
  ]) {
    const h = cards(hole),
      b = cards(board),
      features = handFeatures(h, b, evaluate([...h, ...b]).score);
    assert.equal(matchupDrawLabel(h, b, features), expected);
  }
});

test('top-pair checks explain foregone value, checking-range protection and wet multiway risk without inventing a trap', () => {
  const record = topPairCheckReview();
  const explanation = explainOpponent(record);
  assert.match(explanation.detail, /顶对 J，A 踢脚/);
  assert.match(explanation.detail, /较弱的一对或听牌取值/);
  assert.match(explanation.detail, /过牌也可能是在等后位先下注/);
  assert.match(explanation.detail, /多人底池/);
  assert.match(explanation.detail, /免费看下一张/);
  assert.match(explanation.detail, /后位仍可下注/);
  const last = structuredClone(record);
  last.trace.view.actionContext.pendingResponseIds = [];
  assert.match(explainOpponent(last).detail, /不能诱导本轮下注/);
  const trapped = structuredClone(record);
  trapped.trace.reason = 'trap';
  trapped.trace.basis.reason = 'trap';
  assert.match(explainOpponent(trapped).detail, /这是.*埋牌/);
  assert.doesNotMatch(explainOpponent(trapped).detail, /过牌也可能是在等后位先下注/);
});

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
      assert.ok(
        Array.isArray(m[direction]) &&
          m[direction].length <=
            (direction === 'tied' ? 1 : direction === 'behind' && s.street ? 4 : 3),
        name + '/' + direction,
      );
      assert.equal(new Set(m[direction].map((example) => example.group)).size, m[direction].length);
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

function rankedSpot(position = 'UTG', action = 'raise', multiway = false) {
  return spot('As Kd', 'Ks 7h 2c', {
    action: 'check',
    amount: 0,
    currentBet: 0,
    pot: multiway ? 450 : 300,
    legal: { canCheck: true, callAmount: 0, toCall: 0, minRaiseTo: 50 },
    players: [
      { id: 0, name: '你', position: 'BTN', stack: 4850, total: 150, bet: 0 },
      { id: 1, name: 'River', position, stack: 4850, total: 150, bet: 0 },
      ...(multiway
        ? [{ id: 2, name: 'Mia', position: 'CO', stack: 4850, total: 150, bet: 0 }]
        : []),
    ],
    history: [
      { id: 1, street: 0, action, amount: 150 },
      ...(multiway ? [{ id: 2, street: 0, action: 'raise', amount: 500 }] : []),
      { id: 1, street: 1, action: 'check', amount: 0 },
      ...(multiway ? [{ id: 2, street: 1, action: 'raise', amount: 100 }] : []),
    ],
  });
}

test('ranked examples follow public position, earlier action and multiple ranges with stable distinct top-three groups', () => {
  const early = rankedSpot(),
    late = rankedSpot('BB'),
    called = rankedSpot('UTG', 'call'),
    multi = rankedSpot('UTG', 'call', true);
  const match = (s) => handMatchups(s, decisionContext(s)),
    groups = (s, direction = 'ahead') =>
      match(s)[direction].map((example) => example.group + ':' + example.text);
  assert.equal(groups(early).length, 3);
  assert.ok(groups(early, 'behind').length >= 1);
  assert.notEqual(groups(early).length, groups(early, 'behind').length);
  // Coarser representative groups can remain the same for nearby ranges;
  // the underlying position/action descriptors must still change per snapshot.
  assert.notDeepEqual(match(early).rangeContext, match(late).rangeContext);
  assert.notDeepEqual(match(early).rangeContext, match(called).rangeContext);
  assert.notDeepEqual(match(called).rangeContext, match(multi).rangeContext);
  const reordered = structuredClone(multi);
  reordered.players = [reordered.players[0], reordered.players[2], reordered.players[1]];
  assert.deepEqual(match(reordered), match(multi));
  assert.deepEqual(match(early), match(early));
  for (const s of [early, late, called, multi]) {
    const m = match(s);
    assert.equal(m.nut, false);
    assert.equal(m.strength, 'medium');
    for (const direction of ['ahead', 'behind', 'tied'])
      assert.equal(new Set(m[direction].map((example) => example.group)).size, m[direction].length);
  }
});

test('presentation replaces one causal comparison paragraph with ordered rows and preserves structural and nuts limits', () => {
  for (const s of [
    rankedSpot(),
    spot('5s 5d', '5h Ks 9c'),
    spot('As Kd'),
    spot('2c 3d', 'As Ks Qs Js Ts'),
  ]) {
    const c = decisionContext(s),
      m = handMatchups(s, c),
      presentation = matchupPresentation(m, s.street),
      paragraphs = ['before', m.text, 'after'],
      commentary = reviewCommentary(paragraphs, m, s.street),
      html = renderReviewParagraphs(paragraphs, m, s.street);
    assert.equal(commentary.length, 3);
    assert.equal(commentary.filter((part) => part.matchups).length, 1);
    assert.deepEqual(commentary[1].matchups, presentation);
    assert.equal(m.handLabel, c.handLabel);
    assert.ok(presentation.handLabel.includes(c.handLabel));
    assert.ok(html.includes(c.handLabel));
    assert.equal(presentation.groups.length, s.street ? 2 : 1);
    if (s.hole.every((card) => card.rank === 5)) {
      assert.equal(c.handLabel, '暗三条 5');
      assert.match(html, /暗三条 5/);
    }
    for (const group of presentation.groups) {
      assert.ok(
        group.examples.length <=
          (['possible', 'behind'].includes(group.direction)
            ? 4
            : group.direction === 'tied'
              ? 1
              : 3),
      );
      for (const example of group.examples) assert.ok(html.includes(example.text));
    }
    assert.ok(html.indexOf('before') < html.indexOf('review-matchups'));
    assert.ok(html.indexOf('review-matchups') < html.indexOf('after'));
    assert.doesNotMatch(html, /\d(?:\.\d+)?%|likelihood|weight|mass|概率[:：]?\s*\d/);
    if (!s.street) {
      assert.match(html, /对手可能牌组/);
      assert.deepEqual(presentation.rangeNotes, []);
      assert.ok(m.rangeNotes.length > 0);
      assert.equal(html.includes(m.rangeNotes[0]), false);
      assert.doesNotMatch(html, /当前可能领先|当前可能落后|坚果/);
    }
    assert.doesNotMatch(html, /结构上较弱|结构上较强|不代表获胜概率|估计排序|不代表对手实际底牌/);
    if (m.nut) assert.match(html, /当前没有可能更强的牌组/);
  }
});

test('reported paired three-spade river keeps four distinct threats including the flush', () => {
  const games = ['8h 8d', 'Ks Qs'].map(pairedFlushReviewGame);
  const matchups = games.map((game) => {
    const snapshot = game.decisions.at(-1);
    assert.equal(snapshot.pot, 26600);
    assert.equal(snapshot.stack, 13600);
    const context = decisionContext(snapshot);
    const result = handMatchups(snapshot, context);
    assert.deepEqual(
      result.behind.map((example) => example.label),
      ['顺子', '三条', '葫芦', '同花'],
    );
    const known = new Set([...snapshot.hole, ...snapshot.board].map((card) => card.key));
    for (const example of result.behind) {
      assert.equal(
        compare(evaluate([...example.cards, ...snapshot.board]).score, context.made.score),
        1,
      );
      assert.ok(example.cards.every((card) => !known.has(card.key)));
    }
    assert.equal(
      game.players.reduce((sum, player) => sum + player.stack, 0),
      180000,
    );
    return result;
  });
  assert.notDeepEqual(games[0].winners, games[1].winners);
  assert.deepEqual(
    matchups[0],
    matchups[1],
    'Actual opponent cards and payout must not select examples',
  );
  const dry = spot('4c Ac', '7s Jd As Tc Jh');
  assert.ok(
    handMatchups(dry, decisionContext(dry)).behind.every((example) => example.score[0] !== 5),
  );
  const strongerTwoPair = spot('7h 6c', 'Kh 6s 7c 2c 3d');
  assert.ok(
    handMatchups(strongerTwoPair, decisionContext(strongerTwoPair)).behind.some(
      (example) => example.score[0] === 2 && example.score[1] === 13,
    ),
  );
});

test('ranked display cannot use hidden cards, a future board or final winners to prove nuts or choose value routes', () => {
  const s = rankedSpot(),
    c = decisionContext(s),
    m = handMatchups(s, c),
    before = valuePlan(s, c, m);
  const altered = structuredClone(s);
  Object.defineProperty(altered.players[1], 'hole', {
    get() {
      throw Error('Hidden cards read');
    },
  });
  Object.defineProperty(altered, 'futureDeck', {
    get() {
      throw Error('Future deck read');
    },
  });
  Object.defineProperty(altered, 'winners', {
    get() {
      throw Error('Final winners read');
    },
  });
  const alteredMatchups = handMatchups(altered, decisionContext(altered));
  assert.deepEqual(alteredMatchups, m);
  assert.deepEqual(
    matchupPresentation(alteredMatchups, altered.street),
    matchupPresentation(m, s.street),
  );
  assert.deepEqual(valuePlan(s, c, { ...m, ahead: [], behind: [], tied: [] }), before);
  const known = new Set([...s.hole, ...s.board].map((card) => card.key)),
    pool = deckOfCards().filter((card) => !known.has(card.key));
  let possibleBehind = false;
  for (let i = 0; i < pool.length - 1; i++)
    for (let j = i + 1; j < pool.length; j++)
      if (compare(c.made.score, evaluate([pool[i], pool[j], ...s.board]).score) < 0)
        possibleBehind = true;
  assert.equal(m.nut, !possibleBehind);
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
      assert.equal(route.amount % s.legal.chipUnit, 0);
    } else if (route.action === 'check') assert.equal(s.legal.canCheck, true);
    else if (route.action === 'call') assert.equal(route.amount, s.legal.callAmount);
  }
}

function scaledSpot(snapshot, smallBlind) {
  const scale = smallBlind / 25,
    scaled = structuredClone(snapshot),
    money = ['stack', 'bet', 'total', 'pot', 'currentBet', 'minRaise', 'amount'];
  for (const key of money) if (Number.isFinite(scaled[key])) scaled[key] *= scale;
  for (const player of scaled.players)
    for (const key of ['stack', 'bet', 'total'])
      if (Number.isFinite(player[key])) player[key] *= scale;
  for (const action of scaled.history) action.amount *= scale;
  for (const key of ['callAmount', 'toCall', 'minRaiseTo', 'fullRaiseTo', 'maxRaiseTo'])
    if (Number.isFinite(scaled.legal[key])) scaled.legal[key] *= scale;
  scaled.smallBlind = scaled.chipUnit = scaled.legal.chipUnit = smallBlind;
  scaled.bigBlind = 2 * smallBlind;
  return scaled;
}

test('merged value routes preserve 15BB and 30BB boundaries, sizing and whole chips across configured stakes', () => {
  const shallow = spot('As Ah', '', {
      stack: 750,
      pot: 100,
      currentBet: 50,
      amount: 50,
      history: [{ id: 1, street: 0, action: 'raise', amount: 50 }],
      legal: { callAmount: 50, toCall: 50, minRaiseTo: 100, maxRaiseTo: 750 },
    }),
    aboveShallow = { ...shallow, stack: 775, legal: { ...shallow.legal, maxRaiseTo: 775 } },
    trap = spot('As Ah', '', {
      stack: 1525,
      pot: 300,
      currentBet: 150,
      amount: 150,
      history: [{ id: 1, street: 0, action: 'raise', amount: 150 }],
      legal: { callAmount: 150, toCall: 150, minRaiseTo: 250, maxRaiseTo: 1525 },
    }),
    belowTrap = { ...trap, stack: 1500, legal: { ...trap.legal, maxRaiseTo: 1500 } };
  for (const smallBlind of [25, 100, 300, 50000]) {
    for (const [original, expected] of [
      [shallow, 'value-shove'],
      [aboveShallow, 'value-raise'],
      [trap, 'trap'],
      [belowTrap, 'value-raise'],
    ]) {
      const scaled = scaledSpot(original, smallBlind),
        actual = plan(scaled),
        baseline = plan(original);
      assert.equal(actual.kind, expected, `${smallBlind}: ${expected}`);
      assertLegalPlan(scaled, actual);
      for (const key of ['primary', 'secondary']) {
        assert.equal(actual[key]?.action, baseline[key]?.action);
        if (actual[key]) assert.equal(actual[key].amount, baseline[key].amount * (smallBlind / 25));
      }
    }
    const shove = scaledSpot(weakSuitedShove(), smallBlind),
      description = actionReason(shove, { context: decisionContext(shove) });
    assert.match(description, /100 BB/);
    assert.doesNotMatch(description, /(?:20,000|60,000|10,000,000)/);
  }
});

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
    handMatchups(outOfPosition, shifted.context).ahead,
    handMatchups(inPosition, baseline.context).ahead,
  );
  assert.notEqual(shifted.coaching.explanation, baseline.coaching.explanation);
  assert.match(shifted.evidence.join(''), /位置 SB/);
  assert.notEqual(plan(outOfPosition).primary.amount, plan(inPosition).primary.amount);
  const shorter = spot('As Kd', 'Ks 7h 2c', { stack: 500, legal: { maxRaiseTo: 500 } });
  const shortReview = analyzeDecision(shorter, { trials: 120, rolloutTrials: 12 });
  assert.equal(shortReview.context.effective, 500);
  assert.ok(shortReview.context.spr < baseline.context.spr);
  assert.equal(shortReview.context.valuePlan.kind, 'value-shove');
  assert.deepEqual(shortReview.context.valuePlan.primary, { action: 'raise', amount: 500 });
  assert.notEqual(
    shortReview.context.valuePlan.primary.amount,
    baseline.context.valuePlan.primary.amount,
  );
  assert.match(shortReview.evidence.join(''), /行动前你手里有 500/);
});

test('strong-flat support requires the recorded legal call and cannot replace unsupported-call or crowding guards', () => {
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
  assert.equal(rejected.code, 'unbacked-high-card-call');
  assert.equal(rejected.coaching.label, '弃牌');
  assert.equal(rejected.coaching.evKind, 'negative');
});

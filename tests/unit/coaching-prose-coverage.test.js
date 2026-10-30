import test from 'node:test';
import assert from 'node:assert/strict';
import { coachDecision } from '../../src/review/coaching.js';
import { decisionContext } from '../../src/review/context.js';
import { situationEntries, situationNotes } from '../../src/review/narrative.js';
import { REVIEW_TOPICS as TOPIC } from '../../src/review/prose-topics.js';
import { cards } from '../fixtures/deceptive-decisions.js';
import { turnBluffReview } from '../fixtures/review-summary.js';
import { semanticDrawCall } from '../fixtures/review-semantic-topics.js';

function scene({
  board = 'Ts 3c 2c 2s',
  hole = 'Ad 5d',
  closed = true,
  position = 'MP',
  sidePot = false,
} = {}) {
  const s = turnBluffReview();
  const players = [
    { id: 0, name: '你', position, stack: 20000, bet: 0, total: 1000 },
    {
      id: 1,
      name: 'Luna',
      position: position === 'BTN' ? 'BB' : 'BTN',
      stack: closed ? 0 : 10000,
      bet: 500,
      total: 1500,
      allin: closed,
    },
  ];
  if (sidePot)
    players.push({
      id: 2,
      name: 'Kai',
      position: 'CO',
      stack: 10000,
      bet: 500,
      total: 1500,
      allin: false,
    });
  const pot = players.reduce((sum, p) => sum + p.total, 0);
  return {
    ...s,
    hole: cards(hole),
    board: cards(board),
    street: board.split(' ').length - 2,
    position,
    players,
    stack: 20000,
    bet: 0,
    currentBet: 500,
    pot,
    action: 'call',
    amount: 500,
    pending: [0],
    history: [{ id: 1, street: board.split(' ').length - 2, action: 'raise', amount: 500 }],
    legal: { ...s.legal, canCheck: false, callAmount: 500, toCall: 500, maxRaiseTo: 20000 },
  };
}

function review(s, closing, { context: contextChanges = {}, metrics: metricChanges = {} } = {}) {
  const context = { ...decisionContext(s), ...contextChanges };
  return coachDecision(s, {
    context,
    draw: context.draw,
    code: 'priced-call',
    status: 'sound',
    reason: '',
    routes: { primary: { action: 'call', amount: 500 } },
    metrics: {
      closing,
      required: 500 / (s.pot + 500),
      contestable: s.pot + 500,
      equityLow: 0.4,
      uncertainty: 0.03,
      randomEV: 0,
      weightedEV: 0,
      ...metricChanges,
    },
  });
}

const summary = (r) => r.paragraphs.slice(r.paragraphs.indexOf('复盘分析总结') + 1).join('');

test('a covered all-opponents-all-in call is not supplemented with another all-in closure fact', () => {
  const s = scene();
  const r = review(s, true),
    text = summary(r);
  assert.ok(
    s.stack > s.legal.callAmount,
    'Hero retains chips; this is not the own-all-in shortcut',
  );
  assert.equal((text.match(/没有后续下注/g) || []).length, 1);
  assert.doesNotMatch(text, /没有后手可再弃牌|直接比较最终摊牌机会/);
  assert.ok(r.coveredTopics.includes(TOPIC.CLOSURE));
  assert.ok(r.coveredTopics.includes(TOPIC.FOLD_AVAILABILITY));
  assert.ok(r.coveredTopics.includes(TOPIC.PRICE));
  assert.ok(r.coveredTopics.includes(TOPIC.DRAW_CEILING));
  assert.match(text, /共 4 张直接成牌候选/);
  assert.match(text, /4 落下时可以补成顺子/);
});

test('a flop call against an all-in opponent explains both remaining cards without saying Hero is all-in', () => {
  const r = review(scene({ board: 'Ts 3c 2c' }), true),
    text = summary(r);
  assert.match(text, /共 4 张直接成牌候选.*可看完转牌和河牌.*约 16%/);
  assert.doesNotMatch(text, /你已投入全部剩余筹码|用剩下的.*全下跟注/);
  assert.equal((text.match(/没有后续下注/g) || []).length, 1);
});

test('a specific in-position turn bluff plan replaces, rather than follows, the generic next-street note', () => {
  const r = review(
      scene({ board: 'Tc 6c Kd 4d', hole: '8s 7c', closed: false, position: 'BTN' }),
      false,
    ),
    text = summary(r);
  assert.equal((text.match(/可以考虑转诈唬/g) || []).length, 1);
  assert.equal((text.match(/本轮跟注后即可看到最后一张河牌/g) || []).length, 1);
  assert.doesNotMatch(text, /河牌若再面对下注，仍需另作决定/);
  assert.ok(r.coveredTopics.includes(TOPIC.FUTURE_COST));
  assert.ok(!r.coveredTopics.includes(TOPIC.CLOSURE));
});

test('one all-in opponent does not close the future-cost explanation while a side-pot opponent retains chips', () => {
  const r = review(scene({ sidePot: true }), false),
    text = summary(r);
  assert.ok(!r.coveredTopics.includes(TOPIC.CLOSURE));
  assert.ok(r.coveredTopics.includes(TOPIC.FUTURE_COST));
  assert.doesNotMatch(text, /没有后续下注|剩下的.*都已全下/);
  assert.match(text, /河牌若再面对下注/);
});

test('a pending current-round raise is not marked as already explaining the next street cost', () => {
  const r = review(semanticDrawCall({ thirdLive: true }), false);
  assert.match(summary(r), /本轮仍有玩家可以行动.*加注或再加注/);
  assert.ok(r.coveredTopics.includes(TOPIC.CURRENT_RESPONSE));
  assert.ok(!r.coveredTopics.includes(TOPIC.FUTURE_COST));
});

test('structured situation entries preserve legacy detail text but never label board or closure facts as action lines', () => {
  const s = scene();
  const c = decisionContext(s),
    entries = situationEntries(s, c);
  assert.deepEqual(
    situationNotes(s, c),
    entries.flatMap((entry) => entry.parts),
  );
  assert.ok(entries.some((entry) => entry.kind === 'closure'));
  assert.ok(entries.some((entry) => entry.kind === 'board-change'));
  assert.ok(!entries.some((entry) => entry.kind === 'action-line'));
  const text = summary(review(s, true));
  assert.doesNotMatch(text, /转牌的.*让公共牌配对/);
  assert.match(text, /对子 2 来自公共牌/);
});

test('actual all-in call states the remaining-card entitlement without restating the action closure', () => {
  const s = scene();
  s.stack = s.players[0].stack = s.legal.callAmount;
  s.legal.maxRaiseTo = s.stack;
  const r = review(s, true),
    text = summary(r);
  assert.match(text, /全下跟注/);
  assert.match(text, /可以看完剩余公共牌，无需再支付筹码/);
  assert.doesNotMatch(text, /你已投入全部剩余筹码，之后不再参与下注决策/);
  assert.ok(r.coveredTopics.includes(TOPIC.CLOSURE));
});

test('an uncertain draw names the call and its range premise once', () => {
  const s = scene({ board: 'Ts 3c 2c' });
  const r = review(s, true, { metrics: { equityLow: 0.1 } }),
    text = summary(r);
  assert.match(text, /这手建议跟注.*下注范围里保留足够较弱牌或未成牌诈唬/);
  assert.equal(text.match(/不能只因有听牌就继续/g)?.length, 1);
  assert.doesNotMatch(text, /仅凭这些补牌还不能确认跟注划算，需要重新比较跟注与弃牌/);
});

test('a concrete river value-versus-missed-draw range owns the river-range topic', () => {
  const s = scene({ board: 'Ah 8h 3c Kd 2c', hole: 'As Qd' });
  const r = review(s, true, {
    context: {
      matchups: { behind: [{ text: '8♠ 8♦' }], missedDraws: [{ text: 'Q♥ J♥' }] },
    },
  });
  const text = summary(r);
  assert.match(text, /8♠ 8♦.*取值.*Q♥ J♥.*落空听牌诈唬/);
  assert.ok(r.coveredTopics.includes(TOPIC.RIVER_RANGE));
});

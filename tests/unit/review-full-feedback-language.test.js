import test from 'node:test';
import assert from 'node:assert/strict';
import { observerRecord } from '../fixtures/opponent-observer.js';
import { cards } from '../fixtures/deceptive-decisions.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { decisionContext, drawInfo } from '../../src/review/context.js';
import { handMatchups } from '../../src/review/matchups.js';
import { defenseReason } from '../../src/review/defense-reason.js';
import { strategyNotes } from '../../src/review/strategy-reasoning.js';
import { evaluate } from '../../src/engine/poker.js';
import { turnStraightCallRecord } from '../fixtures/review-summary.js';

const summary = (review) =>
  review.paragraphs.slice(review.paragraphs.indexOf('复盘分析总结') + 1).join('');

test('a final-action strong check combines free-card cost and closing instead of repeating them', () => {
  const record = observerRecord({
    action: 'check',
    reason: 'pot-control',
    hole: 'Ks Kd',
    board: 'Qs 7h 3d 2c',
    actionContext: { pendingResponseIds: [] },
  });
  const text = summary(explainOpponent(record));
  assert.equal((text.match(/免费见(?:到)?下一张/g) || []).length, 1);
  assert.match(text, /最后行动.*不能诱导本轮下注.*免费见下一张.*补成更强牌/);
  assert.match(text, /较弱成牌.*价值/);
});

function preflop(hole) {
  const r = observerRecord({ hole, board: '', action: 'call', cost: 200 });
  const s = r.trace.view;
  return {
    ...s,
    id: 0,
    action: 'call',
    amount: 200,
    pending: [0],
    history: [{ id: 1, street: 0, action: 'raise', amount: 200 }],
    players: [
      { id: 0, name: '你', position: 'SB', stack: s.stack, bet: 0, total: 200 },
      { id: 1, name: 'River', position: 'BTN', stack: 2000, bet: 200, total: 400 },
    ],
  };
}

test('a small pocket pair is already paired rather than having a higher kicker than broadways', () => {
  for (const hole of ['2s 2d', '3s 3d', '4s 4d']) {
    const s = preflop(hole);
    const text = handMatchups(s, decisionContext(s)).text;
    assert.match(text, /已经成对.*仍未成对.*更大对子/);
    assert.doesNotMatch(text, /踢脚更好|点数或踢脚/);
  }
  const s = preflop('Ks Qd');
  assert.doesNotMatch(handMatchups(s, decisionContext(s)).text, /已经成对|踢脚更好/);
});

function pairDraw(action, reason) {
  return observerRecord({
    action,
    reason,
    hole: 'As Js',
    board: 'Qs 7s Jd 4c',
    cost: 800,
    stack: 19800,
    pot: 3400,
    contestable: 4200,
    callPrice: { cost: 800, contestable: 4200 },
    opponents: [
      { id: 0, name: '你', position: 'HJ', stack: 19000, bet: 800 },
      { id: 2, name: 'River', position: 'CO', stack: 19000, bet: 800 },
      { id: 3, name: 'Luna', position: 'BTN', stack: 19000, bet: 800 },
    ],
    history: [
      { id: 0, street: 2, action: 'raise', amount: 800 },
      { id: 2, street: 2, action: 'call', amount: 800 },
      { id: 3, street: 2, action: 'call', amount: 800 },
    ],
    actionContext: { pendingResponseIds: [] },
  });
}

test('a recorded pair-and-nut-draw fold states price and lost opportunities without proving a fold from generic bigger-hand risk', () => {
  const r = pairDraw('fold', 'insufficient-equity');
  const text = summary(explainOpponent(r));
  assert.match(text, /非顶对 J.*同花听牌/);
  assert.match(text, /800.*4.2K.*19.0%/);
  assert.match(text, /已有 2 位对手跟注.*多人付费继续的路线估得偏强.*收紧了防守范围/);
  assert.match(text, /已有成牌的摊牌机会和听牌的改善机会/);
  assert.match(text, /9 张.*19.6%.*不是全部获胜概率/);
  assert.doesNotMatch(text, /补中也可能遇到更大的成牌。因此|不足以承担|因此.*追牌|应当|建议/);
});

test('the same pair-and-draw call is not called unsupported or loose merely because its pair is below top pair', () => {
  const r = pairDraw('call', 'loose-exception');
  const expected = explainOpponent(r);
  const text = summary(expected);
  assert.match(text, /成牌和补牌都提供摊牌机会/);
  assert.match(text, /800.*4.2K.*19.0%/);
  assert.doesNotMatch(text, /牌力支撑有限|较松的跟注|没有收紧防守|建议|应当/);
  for (const rival of r.trace.view.opponents)
    Object.defineProperty(rival, 'hole', {
      get() {
        throw Error('Private rival cards must not be read');
      },
    });
  Object.defineProperty(r.trace.view, 'deck', {
    get() {
      throw Error('Future runout must not be read');
    },
  });
  assert.deepEqual(explainOpponent(r), expected);
});

test('checked value and assessed size payment form one reason while retaining the larger-size tradeoff', () => {
  const r = observerRecord({
    action: 'raise',
    reason: 'value-raise',
    hole: 'As Qd',
    board: 'Ah 8h 3c',
    cost: 0,
    history: [{ id: 0, street: 1, action: 'check' }],
    publicStrategy: {
      options: [
        { amount: 600, worseMadeCallMass: 0.4, drawCallMass: 0.2 },
        { amount: 1000, worseMadeCallMass: 0.1, drawCallMass: 0.1 },
      ],
      draw: { madeCategory: 1 },
    },
  });
  r.trace.style = {
    linePlan: { action: 'raise', kind: 'checked-value-protection', executed: true },
  };
  const text = summary(explainOpponent(r));
  assert.match(text, /对手本轮均已过牌.*仍可能付费/);
  assert.match(text, /再加大到 1K.*赶走较弱成牌/);
  assert.equal(text.match(/仍可能付费|仍有.*可能付费/g)?.length, 1);
  assert.doesNotMatch(text, /按这个尺度的继续范围估计|希望更弱成牌.*付费/);
  const notes = strategyNotes(
    { ...r.trace.view, action: 'raise', amount: 600 },
    r.trace.view.publicStrategy,
    { action: 'raise', amount: 600, plan: r.trace.style.linePlan },
  );
  assert.equal(notes.filter((entry) => /可能付费/.test(entry.text)).length, 1);
});

test('pending responders do not imply later payments when the hypothetical call itself exhausts this actor', () => {
  const s = preflop('As Qd');
  s.street = 1;
  s.stack = 200;
  s.contestable = 1200;
  s.reviewSubject = 'Alex';
  const c = { pendingOthers: 2, made: { score: [1, 14] } };
  const allIn = defenseReason(s, c, {}).join('');
  assert.match(allIn, /若跟注即已全下.*本人不再需要补筹码/);
  assert.doesNotMatch(allIn, /后续投入.*未.*封顶/);
  s.stack = 1000;
  assert.match(defenseReason(s, c, {}).join(''), /其余玩家仍可跟注或加注.*后续投入/);
});

test('unmade combo-draw pressure separates draw calls from value and only states an assessed fold-rate increase', () => {
  const r = observerRecord({ action: 'raise', hole: 'Js Ts', board: 'Qs 9s 2d', cost: 0 });
  const assessment = {
    draw: { madeCategory: 0, flushDraw: true, straightDraw: true, comboDraw: true },
    options: [
      { amount: 1000, worseMadeCallMass: 0, drawCallMass: 0.3, foldProbability: 0.2 },
      { amount: 1700, worseMadeCallMass: 0, drawCallMass: 0.1, foldProbability: 0.45 },
    ],
  };
  const options = { action: 'raise', amount: 1000, subject: 'Kai', audience: 'observer' };
  const text = strategyNotes(r.trace.view, assessment, options)
    .map((entry) => entry.text)
    .join('');
  assert.match(text, /听牌可能跟注.*并不一定来自更弱的牌/);
  assert.match(text, /1.7K.*整体弃牌率会上升.*听牌会减少/);
  assert.doesNotMatch(text, /听牌可能付费|向.*听牌.*取值|更好的牌.*(?:必|一定).*弃/);
  delete assessment.options[1].foldProbability;
  const unknown = strategyNotes(r.trace.view, assessment, options)
    .map((entry) => entry.text)
    .join('');
  assert.match(unknown, /1.7K.*继续跟注的听牌会减少/);
  assert.doesNotMatch(unknown, /整体弃牌率会上升/);
});

test('a first-to-act turn lead cites the previous actual check-through and not opponents who have yet to act', () => {
  const r = observerRecord({
    action: 'raise',
    hole: 'Js Ts',
    board: 'Qs 9s 2d 3c',
    cost: 0,
    history: [
      { id: 1, street: 1, action: 'check' },
      { id: 0, street: 1, action: 'check' },
    ],
    actionContext: { pendingResponseIds: [0] },
  });
  const text = strategyNotes(
    r.trace.view,
    {
      draw: { madeCategory: 0, flushDraw: true, straightDraw: true, comboDraw: true },
      options: [{ amount: 600, drawCallMass: 0.2 }],
    },
    {
      action: 'raise',
      amount: 600,
      subject: 'Alex',
      audience: 'observer',
      plan: {
        action: 'raise',
        kind: 'draw-pressure',
        rangeRead: 'prior-checkthrough-marginal-or-unmade',
      },
    },
  )
    .map((entry) => entry.text)
    .join('');
  assert.match(text, /对手上一街均已过牌.*按这些行动估计/);
  assert.doesNotMatch(text, /本轮也尚未加压|对手本轮均已过牌/);
});

test('A83 retains the valid wheel gutshot counterexample instead of adopting the rejected reviewer claim', () => {
  const hole = cards('4s 5s');
  const board = cards('Ah 8h 3c');
  assert.equal(drawInfo(hole, board).straight, true);
  assert.deepEqual(drawInfo(hole, board).straightRanks, [2]);
  assert.equal(evaluate([...hole, ...board, ...cards('2c')]).score[0], 4);
});

test('straight draw calls retain specific public flush-completion risks without inventing a private flush draw', () => {
  const record = turnStraightCallRecord();
  const expected = explainOpponent(record);
  const text = summary(expected);
  assert.match(text, /8 张牌可能补成顺子/);
  assert.match(text, /9♦.*帮对手成更大的牌.*两张对应花色.*同花.*领先这手顺子/);
  assert.doesNotMatch(text, /8 张牌可能补成(?:同花|顺子或同花)|建议|应该|应当/);
  Object.defineProperty(record.trace.view.opponents[0], 'hole', {
    get() {
      throw Error('Hidden opponent cards must not support dirty-out wording');
    },
  });
  Object.defineProperty(record.trace.view, 'deck', {
    get() {
      throw Error('No actual future card may support dirty-out wording');
    },
  });
  assert.deepEqual(explainOpponent(record), expected);
  const dry = turnStraightCallRecord();
  dry.trace.view.board = cards('Kd Jh 7s 8c');
  assert.doesNotMatch(summary(explainOpponent(dry)), /对应花色.*同花/);
  const nutDraw = pairDraw('call', 'loose-exception');
  assert.doesNotMatch(summary(explainOpponent(nutDraw)), /对应花色.*同花.*领先这手顺子/);
});

test('a multiway fold connects the current bet and callers without promising future costs after closure', () => {
  const s = preflop('As Qd');
  s.street = 2;
  s.board = cards('Ac 7h 8s Kd');
  s.action = 'fold';
  s.stack = 12000;
  s.reviewSubject = 'Alex';
  s.legal = { callAmount: 2600 };
  s.callPrice = { cost: 2600, contestable: 13900 };
  s.history = [
    { id: 1, street: 2, action: 'raise', amount: 2600 },
    { id: 2, street: 2, action: 'call', amount: 2600 },
    { id: 3, street: 2, action: 'call', amount: 2600 },
  ];
  s.players = [0, 1, 2, 3].map((id) => ({ id, stack: 12000, bet: id ? 2600 : 0 }));
  s.pending = [0];
  const c = decisionContext(s);
  const text = defenseReason(s, c, handMatchups(s, c)).join('');
  assert.match(text, /18.7%/);
  assert.match(text, /本街下注后已有 2 位对手跟注.*多人继续路线估得偏强/);
  assert.match(text, /后街下注.*这次收紧/);
  s.players.slice(1).forEach((p) => {
    p.stack = 0;
    p.allin = true;
  });
  assert.doesNotMatch(defenseReason(s, c, handMatchups(s, c)).join(''), /后街下注计入/);
  s.players[1].stack = 1000;
  s.players[1].allin = false;
  s.stack = 2600;
  assert.doesNotMatch(defenseReason(s, c, handMatchups(s, c)).join(''), /后街下注计入/);
});

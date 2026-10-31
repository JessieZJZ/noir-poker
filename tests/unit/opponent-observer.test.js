import test from 'node:test';
import assert from 'node:assert/strict';
import { observerRecord } from '../fixtures/opponent-observer.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { decisionContext } from '../../src/review/context.js';
import { checkReasoning } from '../../src/review/check-reasoning.js';
import { strategyNotes } from '../../src/review/strategy-reasoning.js';

const summary = (review) =>
  review.paragraphs.slice(review.paragraphs.indexOf('复盘分析总结') + 1).join('');
const advice =
  /再遇下注时|需要按新的价格|应比较|应避免|不能只凭|仍需.*(?:决定|判断)|要结合.*(?:金额|范围)|过牌不保证本轮无需再付筹码/;

test('observer fold does not turn a free option into an alternative-action lesson', () => {
  const r = observerRecord({ action: 'fold', reason: 'unknown', board: '', cost: 0 });
  const text = summary(explainOpponent(r));
  assert.match(text, /选择弃牌/);
  assert.doesNotMatch(text, /当时可以|免费过牌看翻牌|不节省额外筹码|也可结合/);
});

test('reported A2 fold retains concrete threats and price without becoming a check or coaching the actor', () => {
  const r = observerRecord();
  const e = explainOpponent(r);
  assert.equal(e.title, '弃牌');
  assert.equal(e.basisSource, 'inferred');
  const text = summary(e);
  assert.match(text, /Alex在 SB 位拿 A♠ 2♦.*选择弃牌/);
  assert.match(text, /三张同花色.*同花/);
  assert.match(text, /6 和 9.*顺子/);
  assert.match(text, /继续要补 300.*27.3%/);
  assert.doesNotMatch(text, /过牌|控池|再遇下注|应比较/);
  assert.doesNotMatch(text, advice);
});

test('a real check keeps control and free-card tradeoffs while hero coaching retains its next-action reminder', () => {
  const r = observerRecord({ action: 'check', hole: '5c 5d', board: '4d Qh Ah 5h' });
  const text = summary(explainOpponent(r));
  assert.match(text, /选择过牌/);
  assert.match(text, /同花.*领先当前成牌/);
  assert.match(text, /过牌避免主动扩大/);
  assert.match(text, /葫芦或四条/);
  assert.doesNotMatch(text, advice);
  const s = {
    ...r.trace.view,
    id: 0,
    pending: [2],
    players: [
      { id: 0, stack: 1500 },
      { id: 2, stack: 2000 },
    ],
  };
  const c = decisionContext(s);
  c.pendingOthers = 1;
  assert.match(checkReasoning(s, c).join(''), /再遇下注时，要结合金额、人数和此前行动判断/);
});

test('observer strategy notes describe draws and a recorded check-raise intention without prescribing later choices', () => {
  const r = observerRecord({
    action: 'check',
    reason: 'free-check',
    hole: 'As Js',
    board: 'Kh 7s 2s 9d',
  });
  const assessment = {
    draw: { nutFlushDraw: true, flushDraw: true, madeCategory: 0 },
    call: {},
    range: {},
  };
  const options = {
    action: 'check',
    subject: 'Alex',
    plan: { action: 'check', kind: 'check-for-raise' },
  };
  const observed = strategyNotes(r.trace.view, assessment, { ...options, audience: 'observer' })
    .map((n) => n.text)
    .join('');
  assert.match(observed, /对手下注后再加注的空间/);
  assert.match(observed, /最大同花听牌/);
  assert.doesNotMatch(observed, /按金额|再按价格|重新|比较跟注|要确认/);
  assert.match(
    strategyNotes(r.trace.view, assessment, options)
      .map((n) => n.text)
      .join(''),
    /再按价格|重新|重估/,
  );
});

test('a stale or mismatching policy reason never overrides the action; summaries are stable under secret changes', () => {
  const r = observerRecord();
  r.trace.basis = { version: 1, action: 'fold', reason: 'pot-control' };
  const expected = explainOpponent(r);
  assert.equal(expected.basisSource, 'inferred');
  Object.defineProperty(r.trace.view.opponents[0], 'hole', {
    get() {
      throw Error('hidden hole read');
    },
  });
  r.trace.view.deck = [{ rank: 14, suit: 1 }];
  r.trace.view.winners = [1];
  assert.deepEqual(explainOpponent(r), expected);
});

function pendingShoveFold() {
  const waiting = [2, 3, 4, 5, 6];
  const r = observerRecord({
    reason: 'insufficient-equity',
    hole: 'Qc Qs',
    board: '',
    position: 'HJ',
    cost: 20000,
    stack: 20000,
    count: 9,
    bigBlind: 200,
    pot: 21200,
    contestable: 41200,
    callPrice: { cost: 20000, contestable: 41200 },
    opponents: [
      { id: 0, name: '你', position: 'LJ', stack: 0, bet: 20000, allin: true },
      ...waiting.map((id) => ({ id, stack: 20000, bet: 0, allin: false })),
    ],
    actionContext: { pendingResponseIds: waiting },
    allIn: {
      pendingBuffer: 0.042,
      line: 'reraise-shove',
      depthBB: 100,
      aggressorId: 0,
      committedIds: [0],
      waitingIds: waiting,
      ranges: [{ id: 0 }],
    },
  });
  r.trace.basis = { version: 1, action: 'fold', reason: 'insufficient-equity' };
  return r;
}

test('a recorded QQ multiway shove fold explains the pending callers rather than only raw pot odds', () => {
  const r = pendingShoveFold();
  const e = explainOpponent(r);
  assert.equal(e.basisSource, 'recorded');
  const text = summary(e);
  assert.match(text, /Alex.*Q♣ Q♠.*选择弃牌/);
  assert.match(text, /当前保本门槛为 48\.5%/);
  assert.match(text, /Alex担心后面 5 位尚未回应这次全下的玩家会用强牌跟入，因此收紧了继续范围/);
  assert.doesNotMatch(text, /这次没有用当前起手牌|玩家持有强牌|模型|机器人/);
  assert.doesNotMatch(text, advice);
  const before = explainOpponent(r);
  for (const opponent of r.trace.view.opponents)
    Object.defineProperty(opponent, 'hole', {
      get() {
        throw Error('hidden hole read');
      },
    });
  r.trace.view.deck = [{ rank: 14, suit: 1 }];
  r.trace.view.winners = [0];
  assert.deepEqual(explainOpponent(r), before);
});

test('pending-call caution is absent when no risk was recorded, no players wait, or the policy reason is stale', () => {
  const cases = [
    (r) => {
      r.trace.view.allIn.pendingBuffer = 0;
    },
    (r) => {
      r.trace.view.actionContext.pendingResponseIds = [];
    },
    (r) => {
      r.trace.view.opponents.slice(1).forEach((p) => {
        p.allin = true;
      });
    },
    (r) => {
      r.trace.basis.action = 'call';
    },
    (r) => {
      r.trace.provenance = 'scripted-action-only';
    },
  ];
  for (const change of cases) {
    const r = pendingShoveFold();
    change(r);
    assert.doesNotMatch(summary(explainOpponent(r)), /担心后面.*尚未回应这次全下/);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDecision } from '../../src/review/analysis.js';
import { coachDecision } from '../../src/review/coaching.js';
import { explainOpponent } from '../../src/review/opponents.js';
import {
  reportedKeyInfoCall,
  reportedGutshotCall,
  reportedLowConnectorCall,
  turnStraightCallRecord,
} from '../fixtures/review-summary.js';
import { cards } from '../fixtures/deceptive-decisions.js';
import { decisionContext } from '../../src/review/context.js';

const options = { trials: 120, rolloutTrials: 12 };
const summary = (c) => c.paragraphs.slice(c.paragraphs.indexOf('复盘分析总结') + 1).join('');

test('connector labels distinguish consecutive ranks from suited gaps and pairs', () => {
  for (const [hole, label] of [
    ['4d 5d', '4 / 5 同花连接牌'],
    ['4d 5s', '4 / 5 不同花连接牌'],
    ['4d 6d', '4 / 6 同花底牌'],
    ['4d 4s', '口袋 4'],
  ]) {
    const s = reportedLowConnectorCall();
    s.hole = cards(hole);
    assert.equal(decisionContext(s).handLabel, label);
  }
});

test('a fold recommendation for a low connector explains potential, price and actual risks', () => {
  const s = reportedLowConnectorCall();
  const before = structuredClone(s);
  const r = analyzeDecision(s, options);
  const text = summary(r.coaching);
  assert.match(text, /有机会在翻后形成顺子、同花听牌/);
  assert.match(text, /100K（5.0 BB）/);
  assert.match(text, /跟注，继续争夺 270K 的底池.*需要至少 37.0% 的胜率/);
  assert.match(text, /击中一对.*点数仍偏低.*更高同花/);
  assert.match(text, /本轮还有 6 位对手等待回应.*若出现加注或者再加注.*需要重新决定/);
  assert.match(text, /后续下注和成牌后的收益还要另算.*不能把连接牌一律当成弃牌.*建议弃牌/);
  assert.doesNotMatch(text, /被强 A.*压制|踢脚.*压制|[。；，]{2}/);
  assert.deepEqual(s, before);
  for (const player of s.players.filter((p) => p.id))
    Object.defineProperty(player, 'hole', {
      get() {
        throw Error('hidden cards read');
      },
    });
  s.futureDeck = cards('3d 6d 7d');
  assert.deepEqual(analyzeDecision(s, options).coaching, r.coaching);
  const off = reportedLowConnectorCall();
  off.hole = cards('4d 5s');
  const offText = summary(analyzeDecision(off, options).coaching);
  assert.match(offText, /点数相连.*顺子听牌/);
  assert.doesNotMatch(offText, /成花机会|更高同花/);
});

test('key information uses the agreed price wording and before-action values', () => {
  const s = reportedKeyInfoCall();
  const before = structuredClone(s);
  const r = analyzeDecision(s, options);
  assert.deepEqual(r.evidence.slice(2), [
    '翻牌前加注 2 次，本轮还有 0 位对手等待回应',
    '行动前你手里有 2.65M，这次跟注拿出 140K，跟注前底池 460K，底池赔率约 3.29:1',
    '跟注 140K 后可争夺 600K 底池，需要至少 23.3% 的胜率，风险和收益才能持平。',
    '入池情境：最高 3-bet，跛入 0 人',
  ]);
  assert.deepEqual(s, before);
  s.pending.push(1, 2);
  s.players[1].allin = true;
  assert.match(analyzeDecision(s, options).evidence[2], /本轮还有 1 位对手等待回应/);
  s.players[2].folded = true;
  assert.match(analyzeDecision(s, options).evidence[2], /本轮还有 0 位对手等待回应/);
});

test('fold, check, raise and both kinds of all-in state actual cost without inventing a call', () => {
  const variants = [
    ['fold', 0, /弃牌不再投入.*保留 2.65M/, /若跟注 140K 后/],
    ['check', 0, /过牌无需投入.*460K/, null],
    ['raise', 400000, /加注拿出 340K.*4-bet 加注至 400K/, null],
    ['raise', 2710000, /全下拿出 2.65M.*全下至 2.71M/, null],
  ];
  for (const [action, amount, expected, price] of variants) {
    const s = reportedKeyInfoCall();
    s.action = action;
    s.amount = amount;
    if (action === 'check') Object.assign(s.legal, { canCheck: true, callAmount: 0, toCall: 0 });
    const r = analyzeDecision(s, options);
    assert.match(r.evidence[3], expected);
    if (price) assert.match(r.evidence.join(' '), price);
    else assert.doesNotMatch(r.evidence.join(' '), /风险和收益才能持平/);
  }
  const call = reportedKeyInfoCall();
  call.stack = call.players[0].stack = 140000;
  Object.assign(call.legal, {
    canRaise: false,
    minRaiseTo: 200000,
    maxRaiseTo: 200000,
    isShortAllin: true,
  });
  assert.match(analyzeDecision(call, options).evidence[3], /跟注全下拿出 140K/);
});

test('suited ace continuation explains nut-flush potential and top-pair value with clear hero subjects', () => {
  const r = analyzeDecision(reportedKeyInfoCall(), options);
  const text = summary(r.coaching);
  assert.match(text, /你若再加注.*加注范围和跟注入池的范围.*再补 140K 跟注/);
  assert.match(text, /你持有 A 同花底牌.*坚果同花听牌/);
  assert.match(text, /你若击中 A.*顶对.*较弱 Ax.*取值/);
  assert.doesNotMatch(text, /因此再加注|只跟入|；/);
  const off = summary(analyzeDecision(reportedKeyInfoCall('Ad Qs'), options).coaching);
  assert.doesNotMatch(off, /坚果同花听牌/);
  const weak = summary(analyzeDecision(reportedKeyInfoCall('3c 4s'), options).coaching);
  assert.doesNotMatch(weak, /击中 A|坚果同花/);
});

test('gutshot advice and keep/compare/fold labels follow the same evidence, without hidden cards', () => {
  const s = reportedGutshotCall();
  const r = analyzeDecision(s, options);
  assert.equal(r.draw.outs, 4);
  assert.equal(r.coaching.assessmentLabel, '需要比较');
  assert.equal(r.coaching.label, '建议跟注 520K');
  assert.equal(r.coaching.suggestion, r.coaching.label);
  assert.match(summary(r.coaching), /A 落下.*顶对/);
  assert.match(summary(r.coaching), /这手建议跟注.*下注范围.*诈唬/);
  assert.doesNotMatch(summary(r.coaching), /成牌后再赢筹码。|同花听牌/);
  const positive = structuredClone(r);
  positive.status = 'sound';
  positive.simulation = null;
  positive.metrics = {
    ...positive.metrics,
    randomEV: 300000,
    weightedEV: 300000,
    equityLow: 0.6,
    uncertainty: 0.01,
  };
  const kept = coachDecision(s, positive);
  assert.equal(kept.assessmentLabel, '值得保留');
  assert.equal(kept.label, '建议跟注 520K');
  assert.match(summary(kept), /综合当前牌力.*跟注有继续依据/);
  assert.doesNotMatch(summary(kept), /还不能确认跟注划算/);
  const negative = structuredClone(positive);
  negative.metrics.randomEV = negative.metrics.weightedEV = -300000;
  const fold = coachDecision(s, negative);
  assert.equal(fold.label, '建议弃牌');
  assert.match(summary(fold), /不足以支持.*建议弃牌/);
  const hidden = structuredClone(s);
  Object.defineProperty(hidden.players[1], 'hole', {
    get() {
      throw Error('hidden cards read');
    },
  });
  hidden.futureDeck = cards('Js Ah');
  hidden.winners = [1];
  assert.deepEqual(analyzeDecision(hidden, options).coaching, r.coaching);
});

test('opponent summary names its subject once, then uses the recorded pronoun', () => {
  const record = turnStraightCallRecord();
  record.action = 'fold';
  record.amount = 0;
  record.trace.reason = 'stack-pressure';
  let text = summary(explainOpponent(record));
  assert.equal(text.match(/Kai/g)?.length, 1);
  assert.match(text, /他选择保住后手/);
  record.gender = 'female';
  text = summary(explainOpponent(record));
  assert.equal(text.match(/Kai/g)?.length, 1);
  assert.match(text, /她选择保住后手/);
  assert.doesNotMatch(text, /；/);
});

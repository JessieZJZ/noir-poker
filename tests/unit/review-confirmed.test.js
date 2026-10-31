import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeDecision } from '../../src/review/analysis.js';
import { decisionContext } from '../../src/review/context.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { strengthParts } from '../../src/review/presentation.js';
import { actionLabel } from '../../src/engine/action-labels.js';
import { cards } from '../fixtures/deceptive-decisions.js';
import {
  reportedFivesAllIn,
  reportedLowConnectorCall,
  reportedGutshotCall,
} from '../fixtures/review-summary.js';
import { causalReraiseGame } from '../fixtures/review-spots.js';
const options = { trials: 120, rolloutTrials: 4 };
const summary = (c) => c.paragraphs.slice(c.paragraphs.indexOf('复盘分析总结') + 1).join('');

test('55 all-in keeps its verdict, states its basis once, and never invents later hero decisions', () => {
  const s = reportedFivesAllIn(),
    r = analyzeDecision(s, options),
    text = summary(r.coaching);
  assert.equal(r.metrics.closing, false);
  assert.equal(r.coaching.assessmentLabel, '值得保留');
  assert.match(r.coaching.label, /^建议全下跟注/);
  assert.equal(r.metrics.contestable, 6010000);
  assert.match(text, /全下跟注.*27.0%.*看完剩余公共牌.*AK.*获胜不只依赖.*值得保留的依据/);
  assert.equal(text.match(/1.62M/g)?.length, 1);
  assert.equal(text.match(/6.01M/g)?.length, 1);
  assert.doesNotMatch(text, /还留.*0|你在翻后有位置|下一街的投入|你需要重新决定|；/);
  for (const p of s.players.filter((p) => p.id))
    Object.defineProperty(p, 'hole', {
      get() {
        throw Error('hidden card');
      },
    });
  s.futureDeck = cards('5s 5d As');
  assert.deepEqual(analyzeDecision(s, options).coaching, r.coaching);
});

test('paired board explains private top pair, shared two pairs, and actual effective kickers', () => {
  const s = reportedGutshotCall();
  s.hole = cards('Ks Ad');
  s.board = cards('6d 5h 3s 5d Kh');
  s.street = 3;
  let c = decisionContext(s);
  assert.equal(
    strengthParts(s, c).join('，'),
    '底牌击中顶对 K，与公共牌的一对 5 共同组成两对，A 作为踢脚',
  );
  s.hole = cards('Js Ts');
  s.board = cards('2s 2c 4c 4s 5h');
  c = decisionContext(s);
  assert.equal(c.handClass, 'board-pair');
  assert.match(strengthParts(s, c).join(''), /两对来自公共牌，J 踢脚/);
  const r = analyzeDecision(s, options);
  assert.notEqual(r.code, 'value-check');
  s.hole = cards('5c 4c');
  s.board = cards('3s 9h Tc 8s 5d');
  assert.match(decisionContext(s).handLabel, /踢脚来自公共牌 10/);
  assert.doesNotMatch(decisionContext(s).handLabel, /4 踢脚/);
});

test('limp-reraise updates the current actor role instead of repeating a stale limp range', () => {
  const s = reportedLowConnectorCall();
  s.history.push({ id: 2, street: 0, action: 'raise', amount: 400000 });
  s.currentBet = 400000;
  const text = summary(analyzeDecision(s, options).coaching);
  assert.match(text, /Theo.*加注至 400K/);
  assert.doesNotMatch(text, /Theo在 UTG\+1 位先跟注 20K 入池/);
});

test('premium raises explain value, and first postflop aggression is a bet', () => {
  const record = causalReraiseGame().botDecisions[0];
  for (const hole of ['Kh Kd', 'As Ah']) {
    record.trace.view.hole = cards(hole);
    record.trace.reason = 'value-raise';
    // This is an explicit presentation-branch probe. An execution basis for
    // the original AQ action cannot certify the newly assigned KK/AA reason.
    delete record.trace.basis;
    const text = summary(explainOpponent(record));
    assert.match(text, /最强起手牌|顶级起手牌/);
    assert.match(text, /付出更多筹码.*减少对手人数.*强牌仍足以支持/);
    assert.doesNotMatch(text, /更大对子.*落后|遇到 AA|跟注可以留住/);
  }
  assert.equal(
    actionLabel({ street: 1, history: [], currentBet: 0, legal: {}, action: 'raise', amount: 500 }),
    '下注至 500',
  );
});

test('guide ends with shared, individually explained review terminology', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const glossary = html.split('id="review-glossary"')[1].split('</section>')[0];
  for (const term of [
    '术语解释',
    '同花连接牌',
    '坚果',
    '底池赔率',
    '主动权',
    '范围优势',
    '隐含收益',
    '继续范围／付费范围',
    '过牌加注',
    '胜率／权益',
    '弃牌权益／下注尺度',
    '2-bet',
    '封口',
    '彩虹面',
    'Ax',
    '取值',
    '踢脚',
  ])
    assert.ok(glossary.includes(term), term);
  assert.ok(html.indexOf('id="review-glossary"') > html.indexOf('5. 打完后'));
});

test('a shared pair does not turn a private bottom pair into a strong value-check', () => {
  const s = reportedGutshotCall();
  s.hole = cards('4h 2h');
  s.board = cards('2c 9d 9h 6s');
  s.action = 'check';
  s.amount = 0;
  Object.assign(s.legal, { canCheck: true, callAmount: 0, toCall: 0, canRaise: true });
  const r = analyzeDecision(s, options);
  assert.equal(r.context.made.score[0], 2);
  assert.equal(r.context.handClass, 'middle-pair');
  assert.notEqual(r.code, 'value-check');
  assert.doesNotMatch(summary(r.coaching), /过牌.*少收.*价值/);
  s.hole = cards('Qc Qh');
  s.board = cards('6h 9d 6c 4d As');
  const c = decisionContext(s);
  assert.deepEqual(strengthParts(s, c), [
    '口袋对子 Q',
    '与公共牌的一对 6 共同组成两对',
    'A 作为踢脚',
  ]);
});

test('playing the board explains a possible share instead of beating weaker hands', () => {
  const s = reportedGutshotCall();
  s.hole = cards('9d Td');
  s.board = cards('2h Ah 9h 5h 3h');
  s.street = 3;
  const r = analyzeDecision(s, options),
    text = summary(r.coaching);
  assert.equal(r.context.handClass, 'board');
  assert.equal(r.context.matchups.nut, false);
  assert.match(text, /落后与平分.*底池份额/);
  assert.doesNotMatch(text, /需要对手.*较弱牌或诈唬|底牌提供的踢脚/);
});

test('a value raise capped at the whole stack describes an all-in candidate', () => {
  const s = JSON.parse(
    readFileSync(new URL('../fixtures/capped-kings.json', import.meta.url), 'utf8'),
  );
  const r = analyzeDecision(s, options);
  assert.equal(r.context.valuePlan.primary.amount - s.bet, s.stack);
  assert.match(r.context.valuePlan.reason, /价值全下/);
  assert.doesNotMatch(r.context.valuePlan.reason, /不必一次全部推出/);
});

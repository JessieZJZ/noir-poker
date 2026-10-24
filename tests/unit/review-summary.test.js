import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDecision } from '../../src/review/analysis.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { decisionContext } from '../../src/review/context.js';
import { handMatchups, matchupPresentation } from '../../src/review/matchups.js';
import { cards } from '../fixtures/deceptive-decisions.js';
import {
  turnBluffReview,
  turnStraightCallRecord,
  suitedBroadwayFiveBetFold,
  pocketNinesCheckedBoard,
} from '../fixtures/review-summary.js';

const options = { trials: 120, rolloutTrials: 12 };
const summary = (r) => r.paragraphs.slice(r.paragraphs.indexOf('复盘分析总结') + 1).join('');

test('reported turn call merges action and motive, names only its real straight draw', () => {
  const record = turnStraightCallRecord();
  const r = explainOpponent(record),
    text = summary(r);
  assert.equal(r.paragraphs.length, 3);
  assert.match(text, /选择跟注 6.3K，当前主要依靠听牌改善争取获胜/);
  assert.match(text, /8 张牌可能补成顺子/);
  assert.match(text, /帮对手成更大的牌/);
  assert.match(text, /还留 7K/);
  assert.match(text, /下一街.*补牌和新的下注/);
  assert.doesNotMatch(text, /补成.*同花|顺子／同花/);
  assert.equal(text.match(/6.3K/g).length, 1);
  assert.equal(text.match(/Kai/g).length, 1);
  const flush = structuredClone(record);
  flush.trace.view.hole = cards('Ts Qs');
  assert.match(summary(explainOpponent(flush)), /同花听牌.*两头顺听牌/);
  assert.match(summary(explainOpponent(flush)), /补成顺子或同花/);
});

test('reported 52 turn raise explains a bluff once without internal labels or old action recaps', () => {
  const r = analyzeDecision(turnBluffReview(), options).coaching,
    text = summary(r);
  assert.match(text, /尝试诈唬.*更好的牌弃掉/);
  assert.equal(text.match(/诈唬/g).length, 1);
  assert.doesNotMatch(text, /不能只按成牌标签|此前在翻牌前|是在回应这笔下注|高牌难从更弱/);
});

test('five-bet KQs fold concludes fold with price and domination risk, never encourages an automatic call', () => {
  const s = suitedBroadwayFiveBetFold(),
    r = analyzeDecision(s, options),
    text = summary(r.coaching);
  assert.equal(r.coaching.suggestedAction, '弃牌');
  assert.match(text, /大对子和 AK.*AQ、同花高张/);
  assert.match(text, /再加注通常.*更集中.*5-bet/);
  assert.match(text, /击中一对.*踢脚压制/);
  assert.match(text, /再补 8.3K.*弃牌可以保留.*19K/);
  assert.doesNotMatch(text, /不必.*弃牌|本身有较强|是在决定|是在回应/);
  assert.deepEqual(matchupPresentation(r.context.matchups, 0).rangeNotes, []);
  assert.equal(text.match(/5-bet 加注至/g).length, 1);
  const hidden = structuredClone(s);
  Object.defineProperty(hidden.players[1], 'hole', {
    get() {
      throw Error('hidden cards read');
    },
  });
  Object.defineProperty(hidden, 'futureDeck', {
    get() {
      throw Error('future deck read');
    },
  });
  assert.deepEqual(analyzeDecision(hidden, options).coaching, r.coaching);
});

test('pocket nines on T22 explain weaker hands paying and denying free overcard improvement', () => {
  const r = analyzeDecision(pocketNinesCheckedBoard(), options),
    text = summary(r.coaching);
  assert.match(text, /Leo.*过牌后.*更小对子.*高张付费/);
  assert.match(text, /高张若弃牌.*免费.*反超/);
  assert.match(text, /过牌.*控制底池/);
  assert.match(text, /更大的对子或慢打的强牌/);
  assert.doesNotMatch(text, /已有过牌之后争取底池|目前已有成牌，下注的价值来自/);
});

test('pair explanations respect deuces, aces and the absence of another card on the river', () => {
  const s = pocketNinesCheckedBoard();
  s.board = cards('3d Th 3s');
  s.hole = cards('2c 2h');
  assert.doesNotMatch(summary(analyzeDecision(s, options).coaching), /更小对子|尝试诈唬/);
  s.hole = cards('Ac Ah');
  assert.doesNotMatch(summary(analyzeDecision(s, options).coaching), /更大的对子/);
  s.hole = cards('9d 9c');
  s.board = cards('3d Th 3s 4c 6h');
  s.street = 3;
  s.history[0].street = 3;
  assert.doesNotMatch(summary(analyzeDecision(s, options).coaching), /免费.*下一张|免费改善/);
  const aa = suitedBroadwayFiveBetFold();
  aa.hole = cards('Ac Ah');
  const review = analyzeDecision(aa, options).coaching;
  assert.match(summary(review), /AA 翻前领先/);
  assert.doesNotMatch(summary(review), /这手对子遇到更大对子|弃牌可以保留/);
});

test('range notes preserve caller families while keeping an actual fold focused on its public pressure', () => {
  const s = suitedBroadwayFiveBetFold();
  s.history = [s.history[0]];
  const range = (s) => handMatchups(s, decisionContext(s)).rangeNotes.join('');
  assert.match(range(s), /前位.*更多玩家.*较紧.*开池尺度.*翻后潜力/);
  s.players[1].position = 'BTN';
  assert.match(range(s), /后位.*较少.*范围.*同花牌/);
  s.history.push({ id: 2, street: 0, action: 'call', amount: 600 });
  const r = analyzeDecision(s, options),
    text = summary(r.coaching);
  assert.match(text, /Theo.*小中对子、同花高张、同花连接牌.*藏着强牌/);
  assert.match(text, /多人继续.*不能只按最初开池者的范围判断/);
  assert.doesNotMatch(text, /你若再加注|你若只跟注/);
  assert.equal(text.match(/已经跟注这笔加注/g).length, 1);
  // An actual call still needs the opener/caller distinction. Shortening a
  // fold must not remove the public range explanation from a live defense.
  assert.match(
    range({ ...s, action: 'call' }),
    /同时考虑加注者和跟注者的继续范围.*多人竞争.*小中对子.*同花高张、同花连接牌/,
  );
  for (const spot of [turnBluffReview(), pocketNinesCheckedBoard(), suitedBroadwayFiveBetFold()]) {
    const c = decisionContext(spot),
      m = handMatchups(spot, c);
    assert.doesNotMatch(matchupPresentation(m, spot.street).nutsNote, /相同牌力/);
  }
});

test('opponent rationale uses a hand noun without inserting a board explanation into it', () => {
  const record = turnStraightCallRecord();
  record.action = 'fold';
  record.amount = 0;
  record.trace.reason = 'outside-range';
  record.trace.view.hole = cards('5c 5s');
  record.trace.view.board = cards('Ad Kc 7h 2s');
  const text = explainOpponent(record).detail;
  assert.match(text, /口袋 5，公共牌有更高点数/);
  assert.doesNotMatch(text, /用口袋 5，公共牌/);
});

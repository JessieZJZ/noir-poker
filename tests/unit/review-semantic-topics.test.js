import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDecision } from '../../src/review/analysis.js';
import { decisionContext } from '../../src/review/context.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { observerRecord } from '../fixtures/opponent-observer.js';
import { strategyRiver } from '../fixtures/strategy-review.js';
import { allInPressureSnapshot } from '../fixtures/review-sidepots.js';
import {
  semanticDrawCall,
  summaryText,
  reviewSemanticTopics,
} from '../fixtures/review-semantic-topics.js';

const analyze = (snapshot) => analyzeDecision(snapshot, { trials: 12, rolloutTrials: 2 });

test('reported turn draw call keeps price, real outs and paired-board risk but states closed betting only once', () => {
  const snapshot = semanticDrawCall();
  assert.equal(snapshot.position, 'MP');
  assert.equal(snapshot.pot, 28200);
  assert.equal(snapshot.legal.callAmount, 8500);
  assert.ok(snapshot.stack > snapshot.legal.callAmount);
  assert.equal(snapshot.deck, undefined);
  assert.ok(snapshot.players.every((player) => player.hole === undefined));
  const context = decisionContext(snapshot);
  assert.equal(context.draw.outs, 4);
  assert.deepEqual(context.draw.straightRanks, [4]);
  const review = analyze(snapshot);
  assert.equal(review.metrics.contestable, 36700);
  assert.equal(review.metrics.closing, true);
  const text = summaryText(review);
  const topics = reviewSemanticTopics(text);
  assert.ok(topics.closure.length >= 1, 'Closed betting must remain explicit');
  assert.ok(
    topics.closure.length <= 1,
    `Closed betting is repeated: ${topics.closure.join(' | ')}`,
  );
  assert.match(text, /8\.5K/);
  assert.match(text, /36\.7K/);
  assert.match(text, /23\.2%/);
  assert.match(text, /4 张/);
  assert.match(text, /4[^。]*顺子/);
  assert.match(text, /葫芦[^。]*四条|四条[^。]*葫芦/);
  assert.ok(
    topics.chanceCaution.length >= 1,
    'Candidate outs must not be equated to a guaranteed win',
  );
  assert.doesNotMatch(text, /下一街的投入还要另算|下一张没改善且再遇|后面仍有玩家可以下注/);
});

test('an open draw call retains a real later-street cost instead of a closed-betting warning', () => {
  const review = analyze(semanticDrawCall({ opponentAllIn: false }));
  const text = summaryText(review);
  assert.equal(review.metrics.closing, false);
  const topics = reviewSemanticTopics(text);
  assert.equal(topics.closure.length, 0);
  assert.ok(
    topics.futureDecision.length <= 1,
    `The same later-street plan is repeated: ${topics.futureDecision.join(' | ')}`,
  );
  assert.match(text, /下一街|后续下注|后续新增下注成本|下一张没改善|河牌若再面对下注/);
  assert.match(text, /4 张/);
});

test('one all-in opponent plus a live third player cannot close Hero future betting', () => {
  const review = analyze(semanticDrawCall({ thirdLive: true }));
  const text = summaryText(review);
  assert.equal(review.metrics.closing, false);
  const topics = reviewSemanticTopics(text);
  assert.equal(topics.closure.length, 0);
  assert.ok(topics.futureDecision.length <= 1, topics.futureDecision.join(' | '));
  assert.match(text, /本轮仍有玩家可以行动.*加注或再加注/);
  assert.match(text, /下一街再被下注仍要另算成本|河牌若再面对下注|下一张没改善.*再遇/);
  assert.doesNotMatch(text, /对手都已全下|对手全部全下|已没有后续下注|没有对他们继续诈唬的空间/);
});

test('a Hero all-in call has a single closed-betting explanation without claiming its live opponent is all-in', () => {
  const review = analyze(semanticDrawCall({ opponentAllIn: false, heroAllIn: true }));
  const text = summaryText(review);
  assert.equal(review.metrics.closing, true);
  assert.ok(reviewSemanticTopics(text).closure.length <= 1);
  assert.doesNotMatch(text, /对手都已全下|对手全部全下|剩下的 1 位对手都已全下/);
  assert.doesNotMatch(text, /下一街的投入还要另算|下一张没改善且再遇/);
  assert.match(text, /葫芦[^。]*四条|四条[^。]*葫芦/);
  assert.ok((text.match(/不等于(?:你的)?(?:全部权益|全部获胜机会)/g) || []).length <= 1);
});

test('a flop call against the lone all-in opponent preserves both remaining board cards without later betting advice', () => {
  const review = analyze(semanticDrawCall({ flopOnly: true }));
  const text = summaryText(review);
  assert.equal(review.metrics.closing, true);
  assert.ok(reviewSemanticTopics(text).closure.length <= 1);
  assert.match(text, /转牌(?:与|和)河牌|剩余公共牌/);
  assert.doesNotMatch(text, /下一张没改善且再遇|下一街的投入还要另算/);
});

test('river call summaries do not invent unissued public cards or future betting decisions', () => {
  const review = analyze(strategyRiver({ hole: 'Ad 5d', board: 'Ts 3c 2c 2s 9h' }));
  const text = summaryText(review);
  assert.equal(review.metrics.closing, true);
  assert.doesNotMatch(text, /下一张|剩余公共牌|下一街|后街诈唬|补成顺子/);
  assert.ok(reviewSemanticTopics(text).closure.length <= 1);
});

test('a draw raise with an actual live side-pot target is not described as having no future betting', () => {
  const review = analyze(allInPressureSnapshot());
  const text = summaryText(review);
  assert.equal(reviewSemanticTopics(text).closure.length, 0);
  assert.match(text, /仍有筹码|边池|已全下者/);
});

test('opponent draw checks retain concrete draw facts and avoid Hero next-action advice', () => {
  const review = explainOpponent(
    observerRecord({ action: 'check', hole: 'As Ks', board: 'Ts 9s 8d 7c' }),
  );
  const text = summaryText(review);
  assert.match(text, /选择过牌/);
  assert.match(text, /同花听牌/);
  assert.doesNotMatch(text, /建议|应该|再遇下注时|需要重新比较|要结合金额|你应/);
  assert.doesNotMatch(text, /[,，:：]$/);
});

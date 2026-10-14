import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewedAllInGame } from '../fixtures/all-in-decisions.js';
import { deceptiveView } from '../fixtures/deceptive-decisions.js';
import { chooseBotAction, getBotProfile, freshBotMood } from '../../src/engine/bot-profiles.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { drawInfo } from '../../src/review/context.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';

function actualReview(kind) {
  const game = reviewedAllInGame(kind),
    record = game.botDecisions[0];
  return { game, record, review: explainOpponent(record, game.players) };
}
function highCardControl() {
  const view = deceptiveView('As Kh', 'Qd 8c 2h', { equity: 0.5 }),
    decision = chooseBotAction(view, getBotProfile('negreanu'), freshBotMood(), 'off', () => 0.1),
    record = { ...decision, id: 1, name: 'Mia', trace: { ...decision.trace, view } };
  return { record, review: explainOpponent(record) };
}

test('real set plus redraw all-in call keeps made-hand support and ends future betting', () => {
  const { record, review } = actualReview('made-redraw');
  assert.equal(record.action, 'call');
  assert.equal(record.trace.reason, 'price-continue');
  assert.equal(record.trace.view.features.ownMade, true);
  assert.equal(record.trace.view.features.strongMade, true);
  assert.equal(record.trace.view.features.flushDraw, true);
  assert.equal(record.trace.view.features.drawOuts, 9);
  assert.equal(record.trace.view.features.straightOuts, 0);
  const draw = drawInfo(record.trace.view.hole, record.trace.view.board);
  assert.equal(draw.straight, false);
  assert.equal(draw.outs, 9);
  assert.equal(record.trace.allIn.closing, true);
  assert.equal(record.trace.allIn.cost, 4950);
  assert.equal(record.trace.allIn.contestable, 10000);
  assert.match(review.detail, /暗三条 7/);
  assert.match(review.detail, /暗三条 7的摊牌价值/);
  assert.match(review.detail, /(?:另有|另外还有)同花听牌/);
  assert.doesNotMatch(review.detail, /卡顺听牌|两头顺听牌/);
  assert.doesNotMatch(review.detail, /赔率支持继续追/);
  assert.match(review.detail, /只能等发牌或摊牌/);
  assert.deepEqual(review.metrics, []);
});

test('real heads-up all-in draw fold does not invent later betting pressure', () => {
  const { record, review } = actualReview('draw-fold');
  assert.equal(record.action, 'fold');
  assert.equal(record.trace.reason, 'insufficient-equity');
  assert.equal(record.trace.view.rivals, 1);
  assert.equal(record.trace.view.features.flushDraw, true);
  assert.equal(record.trace.allIn.closing, true);
  assert.equal(record.trace.view.opponents[0].allin, true);
  assert.match(review.detail, /同花听牌/);
  assert.match(review.detail, /4\.95K/);
  assert.doesNotMatch(review.detail, /后续下注|接住后续|还会.*施压|后街诈唬/);
  assert.doesNotMatch(review.detail, /EV|模型|模拟器|抽样|它/);
});

test('a real high-card pot-control trace describes its current showdown value without inventing a made hand', () => {
  const { record, review } = highCardControl();
  assert.equal(record.action, 'check');
  assert.equal(record.trace.reason, 'pot-control');
  assert.equal(record.trace.view.features.madeCategory, 0);
  assert.equal(record.trace.view.features.ownMade, false);
  assert.match(review.detail, /高牌控池/);
  assert.match(review.detail, /800/);
  assert.doesNotMatch(review.detail, /中等成牌|已经成牌|EV|模拟器/);
});

test('closing draw folds, made plus redraw calls and high-card pot control localize their exact facts', async () => {
  const cases = [actualReview('made-redraw'), actualReview('draw-fold'), highCardControl()];
  for (const locale of SUPPORTED_LOCALES) {
    await loadLocale(locale);
    for (const { record, review } of cases)
      for (const text of [review.title, ...review.paragraphs, ...review.reasons]) {
        const translated = localizeText(text);
        assert.doesNotMatch(translated, /\{\d+\}/, `${locale}: ${translated}`);
        if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
          assert.doesNotMatch(translated, /\p{Script=Han}/u, `${locale}: ${translated}`);
        for (const fact of [record.name, '4.95K', '10K', '800'])
          if (text.includes(fact)) assert.ok(translated.includes(fact), `${locale}: ${fact}`);
      }
  }
});

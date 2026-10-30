import test from 'node:test';
import assert from 'node:assert/strict';
import { observerRecord } from '../fixtures/opponent-observer.js';
import { enrichStrategy } from '../../src/review/strategy-context.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';
import { checkedPostflopGame } from '../fixtures/checked-postflop.js';
import { botDecision } from '../../src/engine/poker.js';
import { clarityRandom } from '../fixtures/review-clarity-followup.js';

test('removing an already explained check leaves a complete distinct nut-draw fact', async () => {
  const r = observerRecord({ action: 'check', hole: 'As Ks', board: 'Ts 9s 8d 7c' });
  const base = explainOpponent(r);
  const text = base.paragraphs.at(-1);
  const result = enrichStrategy(
    { paragraphs: [text], paragraphParts: base.paragraphParts.slice(-1) },
    r.trace.view,
    { draw: { nutFlushDraw: true, flushDraw: true }, options: [] },
    { action: 'check', subject: 'Alex', audience: 'observer' },
  );
  assert.match(result.explanation, /A♠ K♠ 带最大同花听牌。$/);
  assert.doesNotMatch(result.explanation, /，$|过牌保留改善机会/);
  for (const locale of SUPPORTED_LOCALES) {
    await loadLocale(locale);
    const translated = result.paragraphParts.flat().map(localizeText).join('');
    assert.doesNotMatch(translated, /\{\d+\}/);
    if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
      assert.doesNotMatch(translated, /\p{Script=Han}/u, `${locale}: ${translated}`);
    assert.doesNotMatch(localizeText('A♠ K♠ 带最大同花听牌。'), /[,，:]$/);
  }
  await loadLocale('zh-CN');
});

test('a pair plus draw call explains improvement once and keeps the separate future-payment fact', () => {
  const r = observerRecord({
    action: 'call',
    reason: 'price-continue',
    hole: 'As Js',
    board: 'Qs 7s Jd 4c',
    cost: 800,
    stack: 19800,
  });
  const text =
    'Alex选择跟注 800。当前成牌已有摊牌机会，听牌提供额外改善，共有 9 张牌可能补成同花。';
  const result = enrichStrategy(
    { paragraphs: [text], paragraphParts: [[text]] },
    r.trace.view,
    {
      draw: { nutFlushDraw: true, flushDraw: true },
      call: { eligible: true, futurePayBound: 1000, impliedValue: 100 },
      options: [],
    },
    { action: 'call', subject: 'Alex', audience: 'observer' },
  );
  assert.match(result.explanation, /9 张牌可能补成同花/);
  assert.match(result.explanation, /补中后向较弱牌取值/);
  assert.match(result.explanation, /最大同花听牌。$/);
  assert.doesNotMatch(result.explanation, /这次跟注保留了听牌的改善机会|，$/);
});

test('checking back an overpair acknowledges missed value and free-card cost without inventing a stronger-only range', () => {
  const r = observerRecord({
    action: 'check',
    hole: 'Ks Kd',
    board: 'Jh 8h 3c',
    actionContext: { pendingResponseIds: [] },
  });
  const text = explainOpponent(r).paragraphs.at(-1);
  assert.match(text, /超对 K.*选择过牌/);
  assert.match(text, /较弱成牌.*少收一轮价值/);
  assert.match(text, /免费见(?:到)?下一张.*补成更强/);
  assert.equal((text.match(/免费见(?:到)?下一张/g) || []).length, 1);
  assert.doesNotMatch(text, /只留下更强|诱导其弱牌或诈唬|应该|建议/);
});

test('an actual multiway top-pair call connects the check-call-to-lead story, two callers and closing price', () => {
  const game = checkedPostflopGame({ scenario: 'strong-turn-response', count: 9 });
  const decision = botDecision(game, clarityRandom(71));
  assert.equal(decision.action, 'call');
  const review = explainOpponent({ id: game.actor, name: 'Kai', ...decision });
  const text = review.paragraphs.join('');
  assert.match(text, /翻牌 过牌.*翻牌 跟注 600.*转牌 下注至 2.6K/);
  assert.match(text, /2 位对手跟注/);
  assert.match(text, /2.6K.*13.9K.*18.7%/);
  assert.match(text, /本轮最后行动.*不会再遭到本轮加注/);
  assert.doesNotMatch(text, /免费摊牌|已经领先|必然获胜|只剩强牌/);
});

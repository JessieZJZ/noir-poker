import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeDecision } from '../../src/review/analysis.js';
import { explainOpponent } from '../../src/review/opponents.js';
const fixtures = JSON.parse(
  readFileSync(new URL('../fixtures/review-practice-focus.json', import.meta.url)),
);
const options = { trials: 120, rolloutTrials: 4 };
for (const name of ['kings-fold-allin-call', 'ace-king-fold-allin-call'])
  test(`${name} recommends an all-in call without zero-stack or future betting plans`, () => {
    const s = fixtures.heroes[name],
      r = analyzeDecision(s, { trials: 600, rolloutTrials: 40 }),
      text = summary(r);
    assert.equal(r.coaching.recommendedAction.action, 'call');
    assert.match(text, /若继续，建议用剩余 .* 全下跟注/);
    assert.match(text, /之后不再参与下注决策/);
    assert.doesNotMatch(text, /还留有\s*0|后续公共牌调整|你在翻后有位置|这手保留全下跟注/);
    assert.doesNotMatch(text, /向它们取值|控制投入/);
    assert.equal((text.match(/风险和收益才能持平/g) || []).length, 1);
    assert.equal((text.match(/值得保留的依据/g) || []).length, 1);
  });
test('an ace all-in call explains kicker risk without future investment choices', () => {
  const r = analyzeDecision(fixtures.heroes['weak-ace-allin-call'], options);
  assert.match(summary(r), /但仍可能输给更大踢脚的 Ax/);
  assert.doesNotMatch(summary(r), /向它们取值|仍需控制投入/);
});
for (const name of ['unbacked-highcard-allin', 'unbacked-highcard-near-allin'])
  test(`${name} does not mistake a large unsupported high-card call for a supported keep`, () => {
    const s = fixtures.heroes[name],
      r = analyzeDecision(s, { trials: 600, rolloutTrials: 40 }),
      text = summary(r);
    assert.equal(r.code, 'unbacked-high-card-call');
    assert.equal(r.status, 'consider');
    assert.equal(r.coaching.recommendedAction.action, 'fold');
    assert.notEqual(r.coaching.kind, 'keep');
    assert.match(text, /当前只有高牌.*行动前筹码的一半/);
    assert.match(text, /较宽范围的估计也没有稳定余量/);
    assert.doesNotMatch(text, /值得保留的依据|两种.*都.*亏/);
    if (s.legal.callAmount >= s.stack)
      assert.doesNotMatch(text, /下一街的投入还要另算|你在翻后有位置/);
  });
test('a very cheap high-card river call retains its independent range and price comparison', () => {
  const s = fixtures.heroes['cheap-highcard-river-call'],
    r = analyzeDecision(s, { trials: 600, rolloutTrials: 40 });
  assert.ok(r.metrics.required < 0.03);
  assert.ok(r.metrics.randomEquity - r.metrics.uncertainty > r.metrics.required);
  assert.notEqual(r.code, 'unbacked-high-card-call');
  assert.equal(r.coaching.recommendedAction.action, 'call');
});
const summary = (r) =>
  r.coaching.paragraphs.slice(r.coaching.paragraphs.indexOf('复盘分析总结') + 1).join('');

for (const name of ['same-check', 'same-raise', 'supported-open', 'fold-future']) {
  test(`practice focus offers a real comparison and preserves the action state: ${name}`, () => {
    const r = analyzeDecision(fixtures.heroes[name], options);
    assert.doesNotMatch(
      r.coaching.followUp,
      /对照免费过牌与过牌|下注至 200与下注至 200|不要为了争夺/,
    );
    if (name === 'fold-future') assert.match(r.coaching.followUp, /若改为跟注/);
  });
}
test('public pair all-in uses a sentence rather than a hand description in a noun slot', () => {
  const text = summary(analyzeDecision(fixtures.heroes['shared-pair-allin'], options));
  assert.match(text, /当前主要靠公共牌上的对子和底牌踢脚争取摊牌/);
  assert.doesNotMatch(text, /底牌提供踢脚的摊牌价值/);
});
test('short value re-raise all-in explains pot and strength without a deep-stack flatting warning', () => {
  const r = analyzeDecision(fixtures.heroes['short-value-shove'], options),
    text = summary(r);
  assert.equal(
    r.context.valuePlan.primary.amount,
    fixtures.heroes['short-value-shove'].legal.maxRaiseTo,
  );
  assert.match(text, /强牌可比较价值全下/);
  assert.equal(text.match(/强牌可比较价值全下/g)?.length, 1);
  assert.doesNotMatch(text, /直接全下可能让|不必一次全部推出/);
});
test('air overbet shove explains bluff cost rather than retaining value callers', () => {
  const text = summary(analyzeDecision(fixtures.heroes['air-large-shove'], options));
  assert.match(text, /全下主要依赖对手弃掉更好的牌/);
  assert.doesNotMatch(text, /需要比较较小加注能留下哪些跟注牌/);
});
test('deep preflop value shove explains its sizing tradeoff once', () => {
  const text = summary(analyzeDecision(fixtures.heroes['deep-value-shove'], options));
  assert.equal(text.match(/如此大的尺度会让/g)?.length, 1);
  assert.doesNotMatch(text, /直接全下可能让/);
});
test('preflop free checks never insert an empty public board', () => {
  const text = summary(analyzeDecision(fixtures.heroes['preflop-check'], options));
  assert.match(text, /免费过牌，保留看翻牌的机会/);
  assert.doesNotMatch(text, /在\s+上是/);
});
test('shared-board check explains the lack of private improvement once in the action paragraph', () => {
  const r = analyzeDecision(fixtures.heroes['shared-board-check'], options);
  const paragraph = r.coaching.paragraphs.findLast((p) => p.includes('这次过牌没有增加投入'));
  assert.ok(paragraph);
  assert.equal(paragraph.match(/底牌未提高牌力/g)?.length, 1);
  assert.doesNotMatch(paragraph, /没有提高公共牌的牌力/);
});
test('made straight and trips plus redraw keep made-hand support before draw improvement', () => {
  for (const record of fixtures.opponents) {
    const review = explainOpponent(record, fixtures.roster);
    assert.match(review.detail, /当前成牌已有摊牌机会，听牌提供额外改善/);
    assert.doesNotMatch(review.detail, /目的不是只靠|而是在追/);
  }
});

test('deep oversized postflop value shove offers a concrete smaller value raise', () => {
  const s = fixtures.heroes['oversized-postflop-value'];
  const r = analyzeDecision(s, options);
  assert.equal(r.code, 'deep-value-shove');
  assert.notEqual(r.coaching.kind, 'keep');
  assert.equal(r.coaching.recommendedAction.action, 'raise');
  assert.ok(r.coaching.recommendedAction.amount < s.legal.maxRaiseTo);
});
test('a low-cost bluff without a value target or draw is not automatically endorsed', () => {
  const r = analyzeDecision(fixtures.heroes['unbacked-short-bluff'], options);
  assert.notEqual(r.coaching.kind, 'keep');
  assert.equal(r.coaching.recommendedAction.action, 'check');
  assert.match(summary(r), /这手建议直接过牌/);
});
test('small pairs are already paired and strong hands still need range support facing repeated raises', () => {
  const pair = summary(analyzeDecision(fixtures.heroes['small-pair-fold'], options));
  assert.match(pair, /小对子已有摊牌机会/);
  assert.doesNotMatch(pair, /击中一对后仍可能偏弱/);
  const pressure = summary(analyzeDecision(fixtures.heroes['strong-pressure-call'], options));
  assert.match(pressure, /起手牌较强不代表可以自动跟注/);
});

test('deep oversized draw shoves compare a smaller legal semi-bluff without forcing a fold', () => {
  const s = fixtures.heroes['oversized-draw-shove'],
    r = analyzeDecision(s, options);
  assert.equal(r.code, 'oversized-draw-shove');
  assert.notEqual(r.coaching.kind, 'keep');
  assert.equal(r.coaching.recommendedAction.action, 'raise');
  assert.ok(r.coaching.recommendedAction.amount < s.legal.maxRaiseTo);
});
test('made trips plus a draw explain value before semi-bluff pressure', () => {
  const r = analyzeDecision(fixtures.heroes['made-redraw-value-check'], options),
    text = summary(r);
  assert.equal(r.code, 'value-check');
  assert.equal(r.context.made.score[0], 3);
  assert.equal(r.context.made.score[1], 14);
  assert.match(text, /是三条.*过牌/);
  assert.match(text, /让较弱成牌或起手牌付费/);
  assert.doesNotMatch(text, /额外投入[^。]*保留补牌机会，同时给对手弃牌的压力/);
});

test('a speculative all-in facing re-raises needs showdown price support, not future position', () => {
  const s = fixtures.heroes['speculative-allin-reraise'],
    r = analyzeDecision(s, { trials: 600, rolloutTrials: 40 });
  assert.equal(r.code, 'unbacked-speculative-allin');
  assert.equal(r.coaching.recommendedAction.action, 'fold');
  assert.notEqual(r.coaching.kind, 'keep');
  assert.doesNotMatch(summary(r), /你在翻后有位置|下一街的投入还要另算/);
});

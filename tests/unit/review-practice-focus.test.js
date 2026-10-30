import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeDecision } from '../../src/review/analysis.js';
import { explainOpponent } from '../../src/review/opponents.js';
const fixtures = JSON.parse(
  readFileSync(new URL('../fixtures/review-practice-focus.json', import.meta.url)),
);
const options = { trials: 120, rolloutTrials: 4 };
test('weak offsuit overlimps need more than a small nominal price', () => {
  const r = analyzeDecision(fixtures.heroes['unsupported-overlimp'], {
    trials: 600,
    rolloutTrials: 40,
  });
  assert.equal(r.code, 'weak-late-limp');
  assert.equal(r.coaching.recommendedAction.action, 'fold');
  assert.notEqual(r.coaching.kind, 'keep');
});
for (const key of ['small-pair-min-squeeze', 'small-pair-five-bet', 'small-pair-seven-bet'])
  test(`${key} does not default to keeping a pressure raise`, () => {
    const r = analyzeDecision(fixtures.heroes[key], options);
    assert.equal(r.code, 'unbacked-small-pair-reraise');
    assert.notEqual(r.coaching.kind, 'keep');
    assert.ok(['call', 'fold'].includes(r.routes.primary.action));
    assert.match(summary(r), /需要有对手会放弃哪些牌的依据/);
    assert.match(
      r.coaching.followUp,
      r.coaching.recommendedAction.action === 'call' ? /先比较跟注 .*与弃牌/ : /先比较弃牌与再补 /,
    );
    assert.doesNotMatch(r.coaching.followUp, /能否争取足够弃牌或让较弱牌付费/);
    assert.doesNotMatch(summary(r), /面对多次再加注，不能只凭起手牌较强就当作价值加注/);
  });
test('a multiway top pair with a public pair and flush draw does not become an automatic value raise', () => {
  const r = analyzeDecision(fixtures.heroes['multiway-public-two-pair-call'], options);
  assert.equal(r.context.handClass, 'top-pair');
  assert.equal(r.context.made.score[0], 2);
  assert.ok(r.context.draw.flush);
  assert.equal(r.context.valuePlan.primary, null);
  assert.equal(r.routes.primary.action, 'call');
});
test('a river top-pair three-bet needs an explicit weaker range instead of automatic value', () => {
  const r = analyzeDecision(fixtures.heroes['river-pair-three-bet'], options);
  assert.equal(r.code, 'unbacked-pair-reraise');
  assert.notEqual(r.coaching.kind, 'keep');
  assert.ok(['call', 'fold'].includes(r.routes.primary.action));
  assert.doesNotMatch(summary(r), /目前已有成牌，下注的价值来自对手用更弱成牌跟注/);
});
test('folding a suited connector explains its potential before the expensive entry', () => {
  const text = summary(
    analyzeDecision(fixtures.heroes['suited-connector-large-open-fold'], options),
  );
  assert.match(text, /有机会在翻后形成顺子、同花听牌/);
  assert.match(text, /8\.0 BB/);
  assert.match(text, /本轮还有 1 位对手等待回应/);
  assert.doesNotMatch(text, /这两张低牌不是对子或强高牌/);
});
test('the original opener reraising a bluff needs opponents to fold, not himself', () => {
  // The original 55 snapshot now correctly uses the small-pair price guard.
  // A weak non-pair isolates the bluff paragraph whose actor must be checked.
  const s = structuredClone(fixtures.heroes['hero-open-reraise-bluff']);
  s.hole = s.hole.map((card, index) => ({
    ...card,
    rank: index ? 2 : 7,
    key: `${card.suit}-${index ? 2 : 7}`,
  }));
  const text = summary(analyzeDecision(s, options));
  assert.match(text, /需要所有仍在底池里的对手都弃牌/);
  assert.doesNotMatch(text, /需要开池者愿意弃牌/);
});
test('opponent continuation distinguishes a previous reraise from opening the pot', () => {
  const text = explainOpponent(
    fixtures.opponentCorrections['previous-reraise'],
    fixtures.roster,
  ).detail;
  assert.match(text, /此前加注至 300/);
  assert.doesNotMatch(text, /此前开池至/);
});
test('a public pair does not make two-pair check reasoning switch to a one-pair hand', () => {
  const text = explainOpponent(
    fixtures.opponentCorrections['public-pair-two-pair'],
    fixtures.roster,
  ).detail;
  assert.match(text, /两对/);
  assert.match(text, /多人底池里，这手成牌并不是坚果/);
  assert.doesNotMatch(text, /多人底池里，一对并不是坚果/);
});
test('all-in showdown reasoning does not insert compound hand labels into a noun slot', () => {
  for (const key of ['allin-labeled-pocket', 'allin-labeled-overpair']) {
    const text = summary(analyzeDecision(fixtures.heroes[key], options));
    assert.match(text, /需要结合对手的成牌与诈唬范围，判断你当前牌力的摊牌价值/);
    assert.doesNotMatch(text, /公共牌[^。]*的摊牌价值/);
  }
});
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
for (const name of [
  'unbacked-highcard-allin',
  'unbacked-highcard-near-allin',
  'unbacked-highcard-strong-line',
  'unbacked-highcard-pending-flop',
])
  test(`${name} does not mistake a large unsupported high-card call for a supported keep`, () => {
    const s = fixtures.heroes[name],
      r = analyzeDecision(s, { trials: 600, rolloutTrials: 40 }),
      text = summary(r);
    assert.equal(r.code, 'unbacked-high-card-call');
    assert.equal(r.status, 'consider');
    assert.equal(r.coaching.recommendedAction.action, 'fold');
    assert.notEqual(r.coaching.kind, 'keep');
    assert.match(text, /当前只有高牌，没有顺子、同花的直接听牌/);
    assert.match(text, /根据对手之前的行动估计/);
    assert.match(text, /即使按更宽的底牌范围估计，也还不能确认这笔跟注划算/);
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
for (const name of ['aces-flat-clamped-value-shove', 'aces-flat-explicit-value-shove'])
  test(`${name} explains value sizing without an impossible larger preflop hand`, () => {
    const s = fixtures.heroes[name],
      r = analyzeDecision(s, { trials: 600, rolloutTrials: 40 });
    assert.equal(s.action, 'call');
    assert.equal(r.coaching.recommendedAction.action, 'raise');
    assert.equal(r.coaching.recommendedAction.amount, s.legal.maxRaiseTo);
    assert.match(r.coaching.followUp, /AA 是翻前最强起手牌/);
    assert.match(r.coaching.followUp, /较弱牌付费.*全下尺度/);
    assert.doesNotMatch(r.coaching.followUp, /更大.*牌|再补.*跟注/);
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
  assert.match(text, /让较弱成牌付费/);
  assert.doesNotMatch(text, /起手牌付费/);
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

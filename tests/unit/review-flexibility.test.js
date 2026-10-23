import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDecision } from '../../src/review/analysis.js';
import { decisionContext } from '../../src/review/context.js';
import { candidateActions } from '../../src/review/counterfactual.js';
import { valuePlan } from '../../src/review/matchups.js';
import { positionedEntry, preflopContext, preflopRaiseTarget } from '../../src/review/preflop.js';
import { comparisonRoutes } from '../../src/review/routes.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';
import {
  matchedLimpCallerGame,
  closedLimpEntryGame,
  reviewFlexibilityGame,
  reviewFlexibilitySnapshot,
  strongMadeRedrawGame,
} from '../fixtures/review-flexibility.js';

const options = { trials: 600, rolloutTrials: 40 };
const summary = (r) =>
  r.coaching.paragraphs.slice(r.coaching.paragraphs.indexOf('复盘分析总结') + 1).join('');
const profile = (s) => positionedEntry(s, decisionContext(s), preflopContext(s));
const fullCases = [
  ['reported 87s fold', {}],
  ['same public state, call', { action: 'call' }],
  ['same public state, ordinary raise', { action: 'raise', amount: 2000 }],
  ['same public state, shove', { action: 'raise', amount: 42300 }],
  ['99 BB matched opponents', { openerBB: 99, callerBB: 99 }],
  ['100 BB matched opponents', { openerBB: 100, callerBB: 100 }],
  ['suited ace with no flat caller', { hole: 'Ac 5c', caller: false }],
  ['small pair', { hole: '5c 5d' }],
];
const fullResults = new Map();
const fullAnalysis = (fixture) => {
  const key = JSON.stringify(fixture);
  if (!fullResults.has(key)) {
    const snapshot = reviewFlexibilitySnapshot(fixture);
    fullResults.set(key, { snapshot, result: analyzeDecision(snapshot, options) });
  }
  return fullResults.get(key);
};

test('flexibility fixtures use legal actions and exactly one complete 52-card deal', () => {
  const games = [
    [reviewFlexibilityGame(), 142300],
    [reviewFlexibilityGame({ position: 'SB' }), 142300],
    [reviewFlexibilityGame({ threeBet: true }), 142300],
    [matchedLimpCallerGame(), 37500],
    [matchedLimpCallerGame({ limperBB: 2 }), 35100],
    [closedLimpEntryGame(), 122300],
    [strongMadeRedrawGame(), 75000],
  ];
  for (const [game, total] of games) {
    const all = [
      ...game.board,
      ...game.deck,
      ...game.players.flatMap((p) => p.hole),
      ...(game.fixtureBurnedCards || []),
    ];
    assert.equal(all.length, 52);
    assert.equal(new Set(all.map((card) => card.key)).size, 52);
    assert.ok(game.players.every((p) => p.stack >= 0 && p.stack % game.chipUnit === 0));
    assert.equal(
      game.players.reduce((sum, p) => sum + p.stack + p.total, 0),
      total,
    );
    const decision = game.decisions.at(-1);
    assert.ok(decision.legal.enabled);
    assert.ok(decision.players.every((p) => !('hole' in p)));
  }
  const reported = reviewFlexibilitySnapshot();
  assert.equal(reported.position, 'BTN');
  assert.equal(reported.stack, 42300);
  assert.equal(reported.currentBet, 500);
  assert.equal(reported.pot, 1300);
  assert.deepEqual(profile(reported).involved, [3, 5]);
});

// Eight independent analyses use the real default-sized public-equity and
// rollout samples. The remaining boundary cases only inspect the pure profile.
for (const [name, fixture] of fullCases) {
  test(`positioned entry: ${name}`, () => {
    const { result: r } = fullAnalysis(fixture);
    assert.equal(r.code, 'positioned-entry');
    assert.deepEqual(r.alternative, { action: 'call', amount: 500 });
    assert.equal(r.routes.primary.action, 'call');
    assert.equal(r.coaching.recommendedAction.action, 'call');
    assert.equal(r.metrics.trials, 600);
    assert.equal(r.simulation.trials, 40);
    const text = summary(r);
    assert.doesNotMatch(text, /；|跟住|因此天然拥有范围优势|有主动权就有范围优势/);
    if (fixture.amount === 42300) {
      assert.match(text, /实际已经全下.*不再有控制投入或弃牌的选择/);
      assert.doesNotMatch(text, /你在翻后有位置.*再决定/);
    } else {
      assert.equal(r.context.inPosition, true);
      assert.match(text, /有效筹码至少约/);
      assert.match(text, /先看对手行动/);
      assert.match(text, /免费过牌.*保留机会/);
      assert.match(text, /不代表天然拥有范围优势/);
    }
    if (fixture.hole === 'Ac 5c') assert.match(text, /坚果同花听牌/);
    if (fixture.hole === '5c 5d') assert.match(text, /小对子已有摊牌机会.*暗三条/);
    if (fixture.caller === false) {
      assert.doesNotMatch(text, /平跟者/);
      assert.doesNotMatch(r.routes.secondary.condition, /平跟者/);
    }
  });
}

test('matched limpers and short all-in callers bound effective depth', () => {
  const s = matchedLimpCallerGame().decisions.at(-1);
  const limper = s.players[3];
  assert.equal(limper.bet, s.currentBet);
  assert.equal(s.history.findLast((a) => a.id === 3).amount, s.currentBet - s.bigBlind);
  const entry = profile(s);
  assert.deepEqual(entry.involved, [2, 3]);
  assert.equal(entry.depthBB, 50);
  assert.equal(entry.eligible, false);

  const allIn = matchedLimpCallerGame({ limperBB: 2 }).decisions.at(-1);
  assert.equal(allIn.players[3].allin, true);
  assert.ok(allIn.players[3].bet < allIn.currentBet);
  assert.ok(profile(allIn).involved.includes(3));
  assert.equal(profile(allIn).eligible, false);

  const shortOpener = reviewFlexibilitySnapshot({ openerBB: 50, caller: false, blindBB: 500 });
  assert.equal(profile(shortOpener).depthBB, 50);
  assert.equal(profile(shortOpener).eligible, false);
});

test('position, matched depth, open size and re-raises constrain the new branch', () => {
  for (const fixture of [
    { position: 'SB' },
    { openerBB: 50 },
    { callerBB: 50 },
    { heroStack: 10000 },
    { openTo: 1000 },
    { threeBet: true },
    { hole: '7c 8d' },
  ])
    assert.equal(
      profile(reviewFlexibilitySnapshot(fixture)).eligible,
      false,
      JSON.stringify(fixture),
    );

  for (const bb of [99, 100])
    assert.equal(profile(reviewFlexibilitySnapshot({ openerBB: bb, callerBB: bb })).eligible, true);
  assert.equal(
    profile(reviewFlexibilitySnapshot({ openTo: 400, openerBB: 75, callerBB: 75 })).eligible,
    true,
  );
  assert.equal(
    profile(reviewFlexibilitySnapshot({ openTo: 400, openerBB: 74, callerBB: 74 })).eligible,
    false,
  );
  assert.equal(profile(reviewFlexibilitySnapshot({ openTo: 600 })).eligible, true);
  assert.equal(profile(reviewFlexibilitySnapshot({ openTo: 600, openerBB: 99 })).eligible, false);
  assert.equal(
    profile(reviewFlexibilitySnapshot({ hole: '7c 5c', openTo: 400, openerBB: 80 })).eligible,
    true,
  );
  assert.equal(
    profile(reviewFlexibilitySnapshot({ hole: '7c 5c', openTo: 400, openerBB: 79 })).eligible,
    false,
  );
});

test('ordinary three-bets do not invent callers and squeeze sizes follow real stakes', () => {
  const noCaller = reviewFlexibilitySnapshot({ caller: false });
  const entry = profile(noCaller);
  assert.equal(entry.eligible, true);
  assert.equal(entry.callers, 0);
  assert.equal(entry.raiseTo, 1500);

  for (const smallBlind of [25, 100, 10000]) {
    const s = reviewFlexibilitySnapshot({ smallBlind });
    const c = decisionContext(s);
    const pre = preflopContext(s);
    const target = preflopRaiseTarget(s, c, pre);
    assert.equal(pre.callersAfterOpen, 1);
    assert.equal(target, s.currentBet * 4);
    assert.equal(profile(s).raiseTo, target);
    assert.ok(candidateActions(s).some((a) => a.action === 'raise' && a.amount === target));
    assert.equal(target % smallBlind, 0);
    assert.ok(target >= s.legal.minRaiseTo && target <= s.legal.maxRaiseTo);
  }
});

test('AA, KK, QQ and AK value candidates use the same open-plus-caller squeeze size', () => {
  for (const hole of ['Ac Ad', 'Kc Kd', 'Qc Qd', 'Ac Kc']) {
    const s = reviewFlexibilitySnapshot({ hole });
    const plan = valuePlan(s, decisionContext(s));
    const raises = [plan.primary, plan.secondary].filter((a) => a?.action === 'raise');
    assert.equal(raises.length, 1, hole);
    assert.equal(raises[0].amount, 2000, hole);
    assert.ok(['value-raise', 'trap'].includes(plan.kind), hole);
  }
});

test('a closing positioned call does not invent pending blind raises this round', () => {
  const s = closedLimpEntryGame().decisions.at(-1);
  const pre = preflopContext(s);
  const c = decisionContext(s);
  c.positionedEntry = positionedEntry(s, c, pre);
  assert.equal(s.legal.callAmount, 300);
  assert.deepEqual(s.pending, [0]);
  assert.equal(c.positionedEntry.eligible, true);
  assert.equal(c.positionedEntry.waiting, 0);
  const routes = comparisonRoutes(s, c, {
    code: 'positioned-entry',
    status: 'sound',
    alternative: { action: 'call', amount: 300 },
    pre,
  });
  assert.doesNotMatch(routes.primary.tradeoff, /身后仍可能再加注|身后.*待行动/);
  assert.match(routes.primary.tradeoff, /本轮|封口/);
});

test('a flopped nut straight with a flush redraw compares value sizes, not semi-bluffs', () => {
  const s = strongMadeRedrawGame().decisions.at(-1);
  assert.equal(s.street, 1);
  assert.equal(s.position, 'CO');
  assert.equal(s.pot, 1075);
  assert.equal(s.stack, 12000);
  const r = analyzeDecision(s, { trials: 600, rolloutTrials: 12 });
  assert.equal(r.context.made.score[0], 4);
  assert.equal(r.context.matchups.nut, true);
  assert.equal(r.draw.flush, true);
  assert.equal(r.draw.outs, 9);
  assert.equal(r.code, 'deep-value-shove');
  assert.deepEqual(r.alternative, { action: 'raise', amount: 700 });
  assert.match(summary(r), /较小加注|较弱成牌/);
  assert.doesNotMatch(`${r.title}${summary(r)}`, /半诈唬/);
});

test('flexibility review combinations localize in every non-source locale', async () => {
  const texts = fullCases.flatMap(([, fixture]) => {
    const { result: r } = fullAnalysis(fixture);
    return [
      ...(r.coaching.paragraphParts?.flat() || r.coaching.paragraphs),
      r.coaching.followUp,
      ...r.evidence,
      r.routes.primary.condition,
      r.routes.primary.tradeoff,
      r.routes.secondary?.condition,
      r.routes.secondary?.tradeoff,
    ].filter(Boolean);
  });
  const locales = SUPPORTED_LOCALES.filter((locale) => locale !== 'zh-CN');
  assert.equal(locales.length, 10);
  try {
    for (const locale of locales) {
      await loadLocale(locale);
      for (const text of texts) {
        const translated = localizeText(text);
        assert.doesNotMatch(translated, /\{\d+\}/, `${locale}: unresolved placeholder`);
        if (!['ja', 'zh-TW'].includes(locale))
          assert.doesNotMatch(translated, /\p{Script=Han}/u, `${locale}: ${translated}`);
        // Japanese and Traditional Chinese legitimately contain Han characters.
        // Check source-language fragments or simplified-only glyphs instead.
        else if (locale === 'ja')
          assert.doesNotMatch(
            translated,
            /这笔跟注|与你已入池|底牌没有改善|有效筹码|先用较小成本|平跟者有足够/,
            `${locale}: ${translated}`,
          );
        else assert.doesNotMatch(translated, /[这筹较弃听补]/u, `${locale}: ${translated}`);
        for (const amount of text.match(/\b\d+(?:\.\d+)?(?:[KM]|\s*BB|%)/g) || [])
          assert.ok(translated.includes(amount), `${locale}: lost ${amount}`);
        for (const card of text.match(/(?:[AKQJ]|10|[2-9])[♠♥♣♦]/g) || [])
          assert.ok(translated.includes(card), `${locale}: lost ${card}`);
      }
    }
  } finally {
    await loadLocale('zh-CN');
  }
});

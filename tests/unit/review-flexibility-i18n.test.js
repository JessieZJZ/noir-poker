import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeDecision } from '../../src/review/analysis.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';
import { allInPressureSnapshot, cheapMiddlePairRaise } from '../fixtures/review-sidepots.js';
import { reviewFlexibilitySnapshot } from '../fixtures/review-flexibility.js';
const fixtures = JSON.parse(
  readFileSync(new URL('../fixtures/review-practice-focus.json', import.meta.url)),
);

test('contextual advice and existing-side-pot clauses localize as displayed with all numeric facts intact', async () => {
  const cases = [
    reviewFlexibilitySnapshot(),
    allInPressureSnapshot(),
    allInPressureSnapshot({ sidePot: true }),
    cheapMiddlePairRaise(),
    ...[
      'preflop-check',
      'made-redraw-value-check',
      'speculative-allin-reraise',
      'small-pair-min-squeeze',
      'unbacked-highcard-pending-flop',
      'cheap-highcard-river-call',
    ].map((k) => fixtures.heroes[k]),
  ];
  const results = cases.map((s) => analyzeDecision(s, { trials: 60, rolloutTrials: 2 }));
  for (const locale of SUPPORTED_LOCALES) {
    await loadLocale(locale);
    for (const r of results) {
      const strings = [
        ...r.coaching.paragraphParts.flat(),
        r.coaching.followUp,
        r.coaching.label,
        r.coaching.suggestion,
        ...Object.values(r.routes)
          .filter(Boolean)
          .flatMap((a) => [a.label, a.summary, a.condition, a.tradeoff]),
      ].filter((x) => typeof x === 'string');
      for (const text of strings) {
        const value = localizeText(text);
        assert.doesNotMatch(value, /\{\d+\}/, `${locale}: ${value}`);
        if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
          assert.doesNotMatch(value, /\p{Script=Han}/u, `${locale}: ${value}`);
        if (['zh-TW', 'ja'].includes(locale))
          assert.doesNotMatch(
            value,
            /已全下者参与的底池仍需摊牌|只有盲位明显过度弃牌/,
            `${locale}: ${value}`,
          );
        for (const fact of text.match(/\d+(?:\.\d+)?(?:K|M|%| BB)?/g) || [])
          assert.ok(value.includes(fact), `${locale} omitted ${fact}: ${value}`);
      }
    }
  }
});

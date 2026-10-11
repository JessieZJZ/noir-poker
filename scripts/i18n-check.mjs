import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUPPORTED_LOCALES } from '../src/i18n/index.js';
import { BOT_PROFILES, PROFILE_AXES } from '../src/engine/bot-profiles.js';
const root = new URL('../', import.meta.url);
execFileSync(process.execPath, [new URL('scripts/i18n-extract.mjs', root).pathname, '--check'], {
  stdio: 'inherit',
});
const messages = JSON.parse(readFileSync(new URL('src/i18n/messages.json', root), 'utf8'));
const overrides = JSON.parse(readFileSync(new URL('src/i18n/overrides.json', root), 'utf8'));
const slots = (s) => [...s.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();
const research = JSON.parse(readFileSync(new URL('src/data/player-research.json', root), 'utf8'));
const researchMessages = new Set();
function collectResearch(value) {
  if (typeof value === 'string') {
    if (/\p{Script=Han}/u.test(value)) researchMessages.add(value.trim().replace(/\s+/g, ' '));
  } else if (value && typeof value === 'object') Object.values(value).forEach(collectResearch);
}
collectResearch(research);
const structuredResearchCount = researchMessages.size;
// Summaries and parameter labels sit above the structured evidence. They must
// retain the same facts and limits instead of using stale partial translations.
for (const profile of BOT_PROFILES)
  collectResearch([
    profile.name,
    profile.short,
    profile.tag,
    profile.description,
    profile.evidence,
  ]);
collectResearch([...PROFILE_AXES, '训练原型', '常用翻后下注：', '{4}–{5}% 池']);
const facts = (value) => value.match(/\d+(?:[.,]\d+)*/g) ?? [];
const terms = (value) =>
  value.match(
    /\b(?:NLHE|PLO|VPIP|PFR|ICM|GTO|[AKQJT2-9]{2}[so]?|WSOP|SCOOP|WCOOP|GPI|PGT|SHRB|Triton|Isildur1|Jungleman12|durrrr|Stevie444|CrownUpGuy)\b/g,
  ) ?? [];
for (const locale of SUPPORTED_LOCALES.filter((l) => l !== 'zh-CN')) {
  const catalog = {
    ...JSON.parse(readFileSync(new URL(`src/i18n/locales/${locale}.json`, root), 'utf8')),
    ...overrides[locale],
  };
  for (const source of messages) {
    const value = catalog[source];
    assert.ok(typeof value === 'string' && value.trim(), `${locale}: missing ${source}`);
    assert.deepEqual(slots(value), slots(source), `${locale}: dynamic value changed: ${source}`);
  }
  for (const source of researchMessages) {
    assert.ok(messages.includes(source), `Research not extracted: ${source}`);
    const translation = catalog[source];
    const remaining = facts(translation);
    for (const number of facts(source)) {
      const index = remaining.indexOf(number);
      assert.ok(index >= 0, `${locale}: research number changed: ${number} in ${source}`);
      remaining.splice(index, 1);
    }
    for (const term of terms(source))
      assert.ok(
        translation.includes(term),
        `${locale}: research term changed: ${term} in ${source}`,
      );
    if (!['zh-TW', 'ja'].includes(locale))
      assert.doesNotMatch(
        translation,
        /\p{Script=Han}/u,
        `${locale}: Chinese research remains: ${source}`,
      );
  }
}
const release = JSON.parse(readFileSync(new URL('mobile/store-readiness.json', root), 'utf8'));
assert.deepEqual(release.locales, SUPPORTED_LOCALES);
console.log(
  `11 locales verified: ${messages.length} messages, no missing entries or changed placeholders. Linguistic review is separate.`,
);
console.log(
  `Research verified: ${structuredResearchCount} structured messages and ${researchMessages.size - structuredResearchCount} profile messages in all target locales; numbers, cards and protected terms preserved.`,
);

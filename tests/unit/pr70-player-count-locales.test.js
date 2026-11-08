import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';
import overrides from '../../src/i18n/overrides.json' with { type: 'json' };
import { playerCountLocaleLabels } from '../fixtures/pr70-player-count-locales.js';

afterEach(() => loadLocale('zh-CN'));

test('PR70 all eleven locales describe five to nine players in flat and effective table labels', async () => {
  assert.deepEqual(Object.keys(playerCountLocaleLabels), SUPPORTED_LOCALES);
  let checked = 0;
  for (const locale of SUPPORTED_LOCALES) {
    const catalog =
      locale === 'zh-CN'
        ? null
        : JSON.parse(
            readFileSync(new URL(`../../src/i18n/locales/${locale}.json`, import.meta.url), 'utf8'),
          );
    await loadLocale(locale);
    for (const count of [5, 6, 7, 8, 9]) {
      const source = `${count} 人无限注`;
      const expected = playerCountLocaleLabels[locale](count);
      const flat = catalog
        ? (catalog[source] ?? catalog['{0} 人无限注']).replace('{0}', count)
        : source;
      assert.equal(flat, expected, `${locale}/${count} flat`);
      assert.equal(localizeText(source), expected, `${locale}/${count} effective`);
      checked++;
    }
  }
  assert.equal(checked, 55);
});

test('PR70 seven repaired player-count keys stay synchronized in the override layer', () => {
  const repairs = [
    ['pt', '5 人无限注', '5 jogadores sem limite'],
    ['pt', '6 人无限注', '6 jogadores sem limite'],
    ['pt', '{0} 人无限注', '{0} jogadores sem limite'],
    ['es', '{0} 人无限注', '{0} jugadores sin límite'],
    ['it', '{0} 人无限注', '{0} giocatori senza limite'],
    ['fr', '{0} 人无限注', '{0} joueurs sans limite'],
    ['ru', '{0} 人无限注', '{0} игроков без ограничений'],
  ];
  for (const [locale, key, expected] of repairs)
    assert.equal(overrides[locale][key], expected, `${locale}/${key}`);
});

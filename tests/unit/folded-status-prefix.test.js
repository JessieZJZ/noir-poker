import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLocale, localizeText, SUPPORTED_LOCALES } from '../../src/i18n/index.js';

const prefixes = {
  'zh-CN': '已弃牌 ·',
  en: 'Folded ·',
  'zh-TW': '已棄牌 ·',
  ja: 'フォールド済み ·',
  ko: '폴드 ·',
  es: 'Se retiró ·',
  it: 'Ha fatto fold ·',
  pt: 'Desistiu ·',
  de: 'Gepasst ·',
  fr: 'Couché ·',
  ru: 'Фолд ·',
};

test('every effective locale identifies the completed fold before the rank separator', async () => {
  assert.deepEqual(Object.keys(prefixes).sort(), [...SUPPORTED_LOCALES].sort());
  try {
    for (const locale of SUPPORTED_LOCALES) {
      await loadLocale(locale);
      const prefix = localizeText('已弃牌 ·');
      assert.equal(prefix, prefixes[locale], locale);
      assert.equal(prefix.split('·').length, 2, `${locale}: one middle-dot separator`);
      assert.ok(prefix.endsWith(' ·'), `${locale}: separator follows the folded status`);
    }
  } finally {
    await loadLocale('zh-CN');
  }
});

test('a folded hero retains the status and separator for every best-five category', async () => {
  const ranks = ['同花顺', '四条', '葫芦', '同花', '顺子', '三条', '两对', '一对', '高牌'];
  try {
    for (const locale of SUPPORTED_LOCALES) {
      await loadLocale(locale);
      for (const rank of ranks) {
        const output = localizeText(`已弃牌 · ${rank}`);
        assert.equal(output, `${prefixes[locale]} ${localizeText(rank)}`, `${locale}: ${rank}`);
        assert.equal(output.split('·').length, 2, `${locale}: ${rank} keeps its separator`);
        assert.doesNotMatch(output, /\{\d+\}/, locale);
      }
    }
  } finally {
    await loadLocale('zh-CN');
  }
});

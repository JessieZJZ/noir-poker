import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';

test('review draw connectors never override actual raise labels during locale switching', async () => {
  for (const locale of SUPPORTED_LOCALES) {
    await loadLocale(locale);
    for (const source of ['3-bet 加注至 350', '转牌 · 加注至 1,250']) {
      const text = localizeText(source);
      assert.ok(text.includes(source.includes('350') ? '350' : '1,250'));
      assert.doesNotMatch(text, /\{\d+\}/);
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
        assert.doesNotMatch(text, /\p{Script=Han}/u, `${locale}: ${text}`);
    }
  }
});

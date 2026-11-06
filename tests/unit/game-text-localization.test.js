import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLocale, localizeGameText, SUPPORTED_LOCALES } from '../../src/i18n/index.js';
import { renderActivityParts } from '../../src/ui/activity.js';

test('generated game amounts retain every chip, signs and protected facts in each locale', async () => {
  for (const locale of SUPPORTED_LOCALES) {
    await loadLocale(locale);
    const comma = ['es', 'it', 'pt', 'de', 'fr', 'ru'].includes(locale);
    const value = localizeGameText('1.025K / +1.000025M / -1.001K');
    assert.equal(
      value,
      comma ? '1,025K / +1,000025M / -1,001K' : '1.025K / +1.000025M / -1.001K',
      locale,
    );
    const facts =
      'https://example.com/1.1K?q=2.5M www.example.com/1.1K Version1.1K Stage-1.1K Q♠ 2026-11-06';
    assert.equal(localizeGameText(facts), facts, locale);
    assert.equal(
      localizeGameText('1.2345K'),
      '1.2345K',
      'fractional chips are not rounded into new facts',
    );
  }
  await loadLocale('zh-CN');
});

test('actor labels stay intact while pot distribution and generated activity amounts localize', async () => {
  await loadLocale('pt');
  const html = renderActivityParts([
    { actor: true, name: 'Version1.1K', position: 'BTN' },
    { text: ' 获胜 · 获得 3.4K 筹码' },
  ]);
  assert.match(html, /Version1\.1K/);
  assert.match(html, /3,4K/);
  assert.match(renderActivityParts([{ text: '主池 3.4K → Alex 3.4K' }]), /3,4K → Alex 3,4K/);
  await loadLocale('zh-CN');
});

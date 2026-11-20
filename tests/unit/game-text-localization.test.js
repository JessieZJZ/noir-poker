import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadLocale,
  localizeGameText,
  formatChips,
  formatDecimal,
  SUPPORTED_LOCALES,
} from '../../src/i18n/index.js';
import { renderActivityParts } from '../../src/ui/activity.js';

test('generated game amounts retain every chip, signs and protected facts in each locale', async () => {
  for (const locale of SUPPORTED_LOCALES) {
    await loadLocale(locale);
    const value = localizeGameText('1.025K / +1.000025M / -1.001K');
    assert.equal(value, '1.025K / +1.000025M / -1.001K', locale);
    assert.equal(localizeGameText('42.40% / 4.0 BB'), '42.40% / 4.0 BB', locale);
    assert.equal(
      localizeGameText('A。B'),
      locale.startsWith('zh') || locale === 'ja' ? 'A。B' : 'A. B',
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

test('decimal points, exact precision, signs and ungrouped counts survive every language change', async () => {
  for (const locale of [...SUPPORTED_LOCALES, 'zh-CN', 'pt', 'en']) {
    await loadLocale(locale);
    assert.equal(formatChips(7400), '7.4K', locale);
    assert.equal(formatChips(-1000025), '-1.000025M', locale);
    assert.equal(formatDecimal(62.3, 1), '62.3', locale);
    assert.equal(formatDecimal(0.5), '0.50', locale);
    assert.equal(formatDecimal(-0, 2), '-0.00', locale);
    assert.equal(formatDecimal(1712304, 0), '1712304', locale);
    assert.equal(
      localizeGameText('+42.40% / -0.00 BB / 4.0BB / 2.50:1 / 0.123456789012345678901%'),
      '+42.40% / -0.00 BB / 4.0BB / 2.50:1 / 0.123456789012345678901%',
      locale,
    );
    const facts = 'Doe, Jane / https://example.com/1,2K?q=62.3% / Version1.1K / Stage-4.0BB';
    assert.equal(localizeGameText(facts), facts, locale);
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
  assert.match(html, /3\.4K/);
  assert.match(renderActivityParts([{ text: '主池 3.4K → Alex 3.4K' }]), /3\.4K → Alex 3\.4K/);
  await loadLocale('zh-CN');
});

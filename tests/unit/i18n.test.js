import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocale, loadLocale, localizeText, formatChips } from '../../src/i18n/index.js';
import { createPreferenceStorage } from '../../src/platform/storage.js';
import { newGame, startHand } from '../../src/engine/poker.js';

test('saved choice wins; system variants map to available catalogs; unsupported languages use English', () => {
  assert.equal(resolveLocale('ko', ['ja-JP']), 'ko');
  assert.equal(resolveLocale('invalid', ['zh-Hant-HK']), 'zh-TW');
  assert.equal(resolveLocale(null, ['zh-Hans-SG']), 'zh-CN');
  assert.equal(resolveLocale(null, ['zh-Hans-HK']), 'zh-CN');
  assert.equal(resolveLocale(null, ['pt-BR']), 'pt');
  assert.equal(resolveLocale(null, ['xx', 'de-DE']), 'de');
  assert.equal(resolveLocale(null, ['ar-SA']), 'en');
  assert.equal(resolveLocale(null, []), 'en');
});

test('English templates preserve and reorder dynamic values, while rule state remains unchanged', async () => {
  const game = newGame(6);
  startHand(game, () => 0.42);
  const before = JSON.stringify(game);
  await loadLocale('en');
  assert.equal(localizeText('第 12 手 · 决策复盘'), 'Hand 12 · Decision review');
  assert.equal(
    localizeText('轮到你了，跟注需要 75 筹码。本轮加注权未重开，仅可跟注或弃牌。'),
    'Your turn. Calling costs 75 chips. Raising has not reopened. You may only call or fold.',
  );
  assert.equal(
    localizeText('本次补入 100，本轮累计投入 150'),
    'Added 100; total bet this round 150',
  );
  assert.equal(
    localizeText('跟注占可争夺底池约 40%。随机范围与行动加权范围下，底池权益分别约 50% / 47%。'),
    'Calling costs about 40% of the eligible pot.Pot equity against random and action-weighted ranges is approximately 50% / 47%, respectively.',
  );
  assert.equal(JSON.stringify(game), before);
  assert.equal(formatChips(5000), '5,000');
  await loadLocale('zh-CN');
  assert.equal(localizeText('第 12 手 · 决策复盘'), '第 12 手 · 决策复盘');
});

test('locale preference hydrates and preserves ordered writes through native storage', async () => {
  const native = new Map([['noir-locale', 'ru']]);
  const store = createPreferenceStorage(() => ({ getItem: () => null, setItem() {} }));
  await store.connect({
    get: async ({ key }) => ({ value: native.get(key) ?? null }),
    set: async ({ key, value }) => native.set(key, value),
  });
  assert.equal(store.getItem('noir-locale'), 'ru');
  store.setItem('noir-locale', 'ja');
  store.setItem('noir-locale', 'en');
  await store.flush();
  assert.equal(native.get('noir-locale'), 'en');
});

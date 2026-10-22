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
  const game = newGame(6, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  startHand(game, () => 0.42);
  const before = JSON.stringify(game);
  await loadLocale('en');
  assert.equal(localizeText('轮到你行动，'), 'Your turn,');
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
  assert.equal(formatChips(5000), '5K');
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

test('practice comparisons translate complete trailing sentences after adjacent optional values', async () => {
  const cases = [
    '重打 Q♦ 10♥ 这手，面对当前 50 的下注，先比较跟注 50与弃牌。本轮还没封口，后面的玩家再加注时，你需要重新决定要不要跟。',
    '重打 Q♦ 10♥ 这手，面对当前 50 的下注，先比较弃牌与再补 50。若改为跟注，跟注后只能等摊牌，不能再靠后街下注赶走更好的牌。',
    '重打 Q♦ 10♥ 这手，面对当前 50 的下注，先比较跟注 50与弃牌。这一轮已经轮到你最后回应，继续后，下一街还要面对新的牌面与下注。',
    '重打 Q♦ 10♥ 这手，面对当前 50 的下注，先比较弃牌与再补 50。若改为跟注，本轮还没封口，后面的玩家再加注时，你需要重新决定要不要跟。',
    '重打 Q♦ 10♥ 这手，面对当前 50 的下注，先比较弃牌与再补 50。若改为跟注，这一轮已经轮到你最后回应，继续后，下一街还要面对新的牌面与下注。',
    '重打 Q♦ 10♥ 这手，面对当前 50 的下注，先比较跟注 50与弃牌。跟注后只能等摊牌，不能再靠后街下注赶走更好的牌。',
  ];
  for (const locale of ['en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru']) {
    await loadLocale(locale);
    for (const source of cases) {
      const value = localizeText(source);
      assert.doesNotMatch(value, /\{\d+\}/, `${locale}: ${value}`);
      assert.ok(value.includes('Q♦ 10♥'), `${locale}: ${value}`);
      assert.equal(value.match(/50/g)?.length, 2, `${locale}: ${value}`);
      if (!['zh-TW', 'ja'].includes(locale))
        assert.doesNotMatch(value, /\p{Script=Han}/u, `${locale}: ${value}`);
    }
  }
  await loadLocale('en');
  assert.match(localizeText(cases[0]), /first compare Call 50 with Fold/);
  assert.match(localizeText(cases[0]), /Betting is not closed this round/);
  assert.match(localizeText(cases[1]), /If you call instead/);
  assert.match(localizeText(cases[2]), /last player responding this round/);
  assert.match(localizeText(cases[2]), /next street brings a new board/);
  for (const source of [cases[1], cases[5]]) {
    assert.match(localizeText(source), /only showdown/);
    assert.doesNotMatch(localizeText(source), /next street/);
  }
  await loadLocale('zh-CN');
});

test('the practice heading describes the current session in every supported locale', async () => {
  for (const [locale, expected] of Object.entries({
    'zh-CN': '本局练习',
    en: 'Session practice',
    'zh-TW': '本局練習',
    ja: 'このセッションの練習',
    ko: '이번 세션 연습',
    es: 'Práctica de esta sesión',
    it: 'Pratica della sessione',
    pt: 'Prática desta sessão',
    de: 'Übung dieser Sitzung',
    fr: 'Pratique de cette session',
    ru: 'Практика в этой сессии',
  })) {
    await loadLocale(locale);
    assert.equal(localizeText('本局练习'), expected, locale);
  }
  await loadLocale('zh-CN');
});

test('starting-blind settings preserve compact amounts and validation limits in every locale', async () => {
  const sources = [
    '起始盲注',
    '点击小盲修改，大盲为小盲的两倍。',
    '小盲只能输入25的正整数倍，且不超过50K。',
    '修改起始小盲',
    '起始小盲',
    '起始大盲',
  ];
  for (const locale of ['en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru']) {
    await loadLocale(locale);
    for (const source of sources) {
      const translated = localizeText(source);
      if (locale !== 'zh-TW') assert.notEqual(translated, source, `${locale}: ${source}`);
      assert.ok(translated.trim());
    }
    const note = localizeText('下一手起始盲注50K/100K·筹码恢复为10M，统计重新开始');
    assert.notEqual(note, '下一手起始盲注50K/100K·筹码恢复为10M，统计重新开始');
    for (const amount of ['50K', '100K', '10M']) assert.ok(note.includes(amount), locale);
    const error = localizeText('小盲只能输入25的正整数倍，且不超过50K。');
    assert.ok(error.includes('25'), locale);
    assert.ok(error.includes('50K'), locale);
  }
  await loadLocale('zh-CN');
});

test('Japanese and Korean catalogs contain no damaged repetition or replacement markers', async () => {
  for (const locale of ['ja', 'ko']) {
    const catalog = (
      await import(`../../src/i18n/locales/${locale}.json`, {
        with: { type: 'json' },
      })
    ).default;
    for (const [source, translation] of Object.entries(catalog)) {
      assert.doesNotMatch(translation, /[⁇�]|\?{2}|(.{1,12})\1{5}/u, `${locale}: ${source}`);
    }
    await loadLocale(locale);
    assert.equal(localizeText('60–100% 池'), locale === 'ja' ? 'ポットの 60–100%' : '팟의 60–100%');
    assert.equal(localizeText('谭老板'), locale === 'ja' ? 'タン・シュアン' : '탄 쉬안');
    assert.equal(localizeText('臧书奴'), locale === 'ja' ? 'アーロン・ザン' : '아론 장');
  }
  await loadLocale('zh-CN');
});

test('first-visit language follows the named timezone, while saved choices and unknown-zone fallbacks remain reliable', () => {
  for (const [zone, expected] of Object.entries({
    'Asia/Shanghai': 'zh-CN',
    'Asia/Urumqi': 'zh-CN',
    'Asia/Taipei': 'zh-TW',
    'Asia/Hong_Kong': 'zh-TW',
    'Asia/Tokyo': 'ja',
    Japan: 'ja',
    'Asia/Seoul': 'ko',
    'Europe/Madrid': 'es',
    'America/Mexico_City': 'es',
    'Europe/Rome': 'it',
    'America/Sao_Paulo': 'pt',
    'Europe/Berlin': 'de',
    'Europe/Paris': 'fr',
    'Europe/Moscow': 'ru',
    'Asia/Vladivostok': 'ru',
    'America/New_York': 'en',
  })) {
    assert.equal(resolveLocale(null, ['en-US'], zone), expected, zone);
    assert.equal(resolveLocale('fr', ['ja-JP'], zone), 'fr', zone);
  }
  for (const zone of [undefined, 'UTC', 'Etc/GMT-8', 'unknown', '__proto__', 'toString']) {
    assert.equal(resolveLocale(null, ['ko-KR'], zone), 'ko');
    assert.equal(resolveLocale(null, ['xx'], zone), 'en');
  }
});

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';

const readJSON = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const overrides = readJSON('../../src/i18n/overrides.json');
const source = Object.fromEntries(
  readJSON('../../src/i18n/messages.json').map((key) => [key, key]),
);

// Check contiguous repeated prose, including scripts without spaces. Eight
// consecutive copies indicate the translation degeneration seen in the app;
// repeated amounts or punctuation alone do not establish that prose defect.
function repeatedProse(value) {
  const normalized = value.normalize('NFKC').replace(/\s+/gu, ' ').toLowerCase();
  for (const match of normalized.matchAll(/(.+?)\1{7}/gu)) {
    if (/\p{L}/u.test(match[1])) return match[1];
  }
  return null;
}

afterEach(() => loadLocale('zh-CN'));

test('prose degeneration detection catches eight consecutive fragments across scripts', () => {
  for (const fragment of [
    'cuarto ',
    'strong to be ',
    'ser forte ',
    'il costo del call ',
    '強い',
    '강한 ',
  ]) {
    assert.ok(repeatedProse(fragment.repeat(8)), fragment);
    assert.equal(repeatedProse(fragment.repeat(7)), null, fragment);
  }
  assert.ok(repeatedProse('0000000000000000 ' + 'cuarto '.repeat(8)));
  for (const text of [
    '1000000000000000',
    '100, 100, 100, 100, 100, 100, 100, 100',
    'https://example.com/1000000000000000',
    'A weak ace can be dominated; an ace blocker alone does not ensure enough folds.',
  ])
    assert.equal(repeatedProse(text), null, text);
});

test('all eleven flat and effective locale catalogs exclude eightfold prose degeneration', () => {
  const failures = [];
  for (const locale of SUPPORTED_LOCALES) {
    const flat = locale === 'zh-CN' ? source : readJSON(`../../src/i18n/locales/${locale}.json`);
    for (const [layer, catalog] of [
      ['flat', flat],
      ['effective', { ...flat, ...overrides[locale] }],
    ]) {
      for (const [key, value] of Object.entries(catalog)) {
        const fragment = repeatedProse(value);
        if (fragment) failures.push({ locale, layer, key, fragment: fragment.slice(0, 80) });
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('Spanish turn caption identifies the fourth community card without repetition', async () => {
  await loadLocale('es');
  const caption = localizeText('TURN · 第四张公共牌');
  assert.equal(caption, 'TURN · 4.ª carta comunitaria');
  assert.ok(caption.length <= 40);
  assert.equal(repeatedProse(caption), null);
});

test('document titles preserve the NOIR Poker brand and offline Hold’em practice meaning', async () => {
  const titles = {
    en: "NOIR Poker · Offline Hold'em Practice",
    es: "NOIR Poker · Práctica de Hold'em sin conexión",
    it: 'NOIR Poker · Allenamento a Hold’em offline',
    pt: "NOIR Poker · Prática de Hold'em offline",
  };
  for (const [locale, expected] of Object.entries(titles)) {
    await loadLocale(locale);
    const title = localizeText('NOIR Poker · 德州扑克单机练习');
    assert.equal(title, expected, locale);
    assert.match(title, /^NOIR Poker · /, locale);
    assert.doesNotMatch(title, /en línea|\bonline\b/i, locale);
  }
});

test('weak-ace notes preserve domination risk and do not promise enough folds from blockers', async () => {
  const sources = [
    '避免弱 A 被强继续范围压制；阻断部分强 A 不等于足够弃牌率。',
    '避免弱 A 被强继续范围压制，阻断部分强 A 不等于足够弃牌率。',
  ];
  const meanings = {
    en: [
      /may be dominated/,
      /stronger continuing range/,
      /blocking some strong Ax/,
      /alone does not mean opponents will fold often enough/,
    ],
    es: [
      /puede quedar dominada/,
      /rango de continuación más fuerte/,
      /bloquear algunas manos fuertes con as/,
      /no implica, por sí solo, que los rivales se retiren con suficiente frecuencia/,
    ],
    it: [
      /può essere dominato/,
      /range di continuazione più forte/,
      /bloccare alcune mani forti con asso/,
      /non implica, di per sé, che gli avversari foldino abbastanza spesso/,
    ],
    pt: [
      /pode ser dominado/,
      /range de continuação mais forte/,
      /bloquear algumas mãos fortes com ás/,
      /não significa, por si só, que os adversários desistam com frequência suficiente/,
    ],
  };
  for (const [locale, expected] of Object.entries(meanings)) {
    await loadLocale(locale);
    for (const key of sources) {
      const value = localizeText(key);
      for (const meaning of expected) assert.match(value, meaning, locale);
      assert.equal(repeatedProse(value), null, locale);
    }
  }
});

test('Italian call-equity explanation retains the eligible-pot denominator and refund limits', async () => {
  await loadLocale('it');
  const text = localizeText(
    '需要权益 = 有效跟注成本 ÷ 跟注后你可争夺的底池。主池与边池按参与资格分别估计，未被跟注的退还不当作收益。',
  );
  assert.match(
    text,
    /Equity richiesta = costo effettivo del call ÷ piatto che puoi vincere dopo il call/,
  );
  assert.match(text, /piatto principale e i piatti laterali/);
  assert.match(text, /separatamente in base a chi può vincerli/);
  assert.match(text, /non chiamate che vengono restituite non sono guadagni/);
  assert.equal(repeatedProse(text), null);
});

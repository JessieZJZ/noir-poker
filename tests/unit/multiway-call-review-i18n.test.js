import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { explainOpponent } from '../../src/review/opponents.js';
import { deceptiveView } from '../fixtures/deceptive-decisions.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';
import overrides from '../../src/i18n/overrides.json' with { type: 'json' };

const sources = [
  '这笔下注已有 {0} 位对手跟注，{1}面对的是多人付费继续的范围。',
  '{0}按当前价格用{1}保留摊牌机会。',
  '{0}在本轮最后行动，跟注不会再遭到本轮加注。',
];

function continuedRecord(callers, pending = false) {
  const ids = [
    0,
    ...Array.from({ length: callers }, (_, index) => index + 2),
    ...(pending ? [4] : []),
  ];
  const opponents = ids.map((id) => ({
    id,
    name: { 0: '你', 2: 'River', 3: 'Mia', 4: 'Jade' }[id],
    position: { 0: 'SB', 2: 'BB', 3: 'HJ', 4: 'BTN' }[id],
    stack: 5000,
    bet: id === 4 ? 0 : 100,
    total: id === 4 ? 200 : 300,
    allin: false,
  }));
  const view = deceptiveView('Qs Qd', 'Kc 8h 3d 4s', {
    id: 1,
    count: opponents.length + 1,
    rivals: opponents.length,
    position: pending ? 'CO' : 'BTN',
    inPosition: !pending,
    stack: 5000,
    pot: 900,
    contestable: 1000,
    currentBet: 100,
    opponents,
    actionContext: { pendingResponseIds: pending ? [4] : [] },
    history: [
      ...ids.map((id) => ({ id, street: 1, action: 'check', amount: 0 })),
      { id: 1, street: 1, action: 'check', amount: 0 },
      { id: 0, street: 2, action: 'raise', amount: 100 },
      ...ids
        .filter((id) => id !== 0 && id !== 4)
        .map((id) => ({ id, street: 2, action: 'call', amount: 100 })),
    ],
    legal: {
      enabled: true,
      chipUnit: 25,
      canCheck: false,
      toCall: 100,
      callAmount: 100,
      canRaise: true,
      minRaiseTo: 200,
      maxRaiseTo: 5000,
    },
  });
  return {
    id: 1,
    name: 'Alex',
    action: 'call',
    amount: 100,
    trace: { view, reason: 'price-continue', profile: 'balanced', mode: 'off' },
  };
}

test('new multiway and action-closing observer templates are extracted in all ten translated catalogs', () => {
  const extracted = JSON.parse(
    readFileSync(new URL('../../src/i18n/messages.json', import.meta.url), 'utf8'),
  );
  const slots = (text) => [...text.matchAll(/\{\d+\}/g)].map((match) => match[0]).sort();
  for (const source of sources) {
    assert.ok(extracted.includes(source), `Missing source inventory: ${source}`);
    for (const locale of SUPPORTED_LOCALES.filter((value) => value !== 'zh-CN')) {
      const translated = overrides[locale][source];
      assert.ok(translated, `${locale}: missing new override`);
      assert.deepEqual(slots(translated), slots(source), `${locale}: altered dynamic values`);
    }
  }
});

test('actual observer fragments and named-subject variants retain counts, hand and current-round closing boundary in every locale', async () => {
  const cases = [
    { callers: 1, pending: false },
    { callers: 2, pending: false },
    { callers: 1, pending: true },
  ].map((config) => {
    const result = explainOpponent(continuedRecord(config.callers, config.pending));
    const fragments = result.paragraphParts
      .flat()
      .filter((part) => /这笔下注已有|按当前价格用|在本轮最后行动/.test(part));
    assert.equal(
      fragments.length,
      config.pending ? 2 : 3,
      'Exercise the actual new explanation branch',
    );
    assert.ok(fragments[0].includes(`${config.callers} 位对手`));
    assert.equal(
      fragments.some((part) => /本轮最后行动/.test(part)),
      !config.pending,
    );
    assert.doesNotMatch(fragments.join(''), /机器人|应该|建议|必须|下一街|后续无需/);
    assert.ok(result.paragraphParts.flat().some((part) => part.includes('Alex')));
    return { ...config, fragments };
  });
  try {
    for (const locale of SUPPORTED_LOCALES) {
      await loadLocale(locale);
      for (const entry of cases) {
        for (const named of [false, true]) {
          const translated = entry.fragments.map((part) =>
            localizeText(named ? part.replaceAll('他', 'Alex').replaceAll('她', 'Alex') : part),
          );
          assert.ok(translated[0].includes(String(entry.callers)), `${locale}: caller count lost`);
          for (const value of translated) {
            if (named) assert.ok(value.includes('Alex'), `${locale}: named subject lost`);
            assert.doesNotMatch(value, /\{\d+\}/, `${locale}: unresolved placeholder`);
            if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
              assert.doesNotMatch(value, /\p{Script=Han}/u, `${locale}: ${value}`);
          }
          if (locale === 'en') {
            assert.match(
              translated[0],
              entry.callers === 1 ? /1 opponent has/ : /2 opponents have/,
            );
            assert.match(translated[1], /calls with.*Q.*current price.*chance.*showdown/);
            if (!entry.pending) {
              assert.match(
                translated[2],
                /this betting round.*calling closes the action.*this round/,
              );
              assert.doesNotMatch(
                translated[2],
                /next street|free|guaranteed|all remaining|no future/i,
              );
            }
          }
        }
      }
    }
  } finally {
    await loadLocale('zh-CN');
  }
});

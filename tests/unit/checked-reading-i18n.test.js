import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { strategyNotes } from '../../src/review/strategy-reasoning.js';
import { deckOfCards } from '../../src/engine/poker.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';
import privacy from '../../src/i18n/privacy-source.json' with { type: 'json' };

const cards = (text) =>
  text
    .split(' ')
    .map((key) =>
      deckOfCards().find(
        (card) =>
          card.rank === '23456789TJQKA'.indexOf(key[0]) + 2 && card.suit === 'shcd'.indexOf(key[1]),
      ),
    );
const subject = 'Alex（均衡）';
function reading({ draw = false, prior = false, madeCalls = 0.2, drawCalls = 0.2 } = {}) {
  const street = prior ? 2 : 1;
  const s = {
    id: 1,
    hole: cards(draw ? 'As Js' : 'As Qd'),
    board: cards(prior ? 'Ts 7s 2d 4c' : draw ? 'Ts 7s 2d' : 'Ah 8h 3c'),
    street,
    bigBlind: 200,
    chipUnit: 100,
    stack: 5000,
    bet: 0,
    pot: 800,
    currentBet: 0,
    opponents: [
      { id: 0, stack: 5000 },
      { id: 4, stack: 5000 },
    ],
    history: [
      { id: 0, street: 0, action: 'call', amount: 200 },
      { id: 4, street: 0, action: 'call', amount: 200 },
      { id: 0, street: 1, action: 'check', amount: 0 },
      { id: 4, street: 1, action: 'check', amount: 0 },
      ...(prior ? [{ id: 1, street: 1, action: 'check', amount: 0 }] : []),
    ],
    legal: { canCheck: true, canRaise: true, callAmount: 0, minRaiseTo: 200, maxRaiseTo: 5000 },
  };
  const assessment = {
    options: [{ amount: 400, worseMadeCallMass: madeCalls, drawCallMass: drawCalls }],
    call: { amount: 0, cost: 0 },
    draw: {
      flushDraw: draw,
      nutFlushDraw: draw,
      comboDraw: false,
      straightDraw: false,
      pairedBoard: false,
      madeCategory: draw ? 0 : 1,
    },
  };
  const notes = strategyNotes(s, assessment, {
    action: 'raise',
    amount: 400,
    subject,
    audience: 'observer',
    plan: {
      kind: draw ? 'nut-draw-pressure' : 'checked-value-protection',
      action: 'raise',
      rangeRead: prior ? 'prior-checkthrough-marginal-or-unmade' : 'checked-marginal-or-unmade',
    },
  });
  const note = notes.find((entry) => entry.topic === 'checked-range');
  assert.ok(note, 'The public reading branch must actually produce observer prose');
  assert.doesNotMatch(note.text, /建议|应当|应该|要重新|需重新|要注意|必须/);
  return note;
}

test('checked value, draw pressure and prior check-through rationale localize in all eleven languages', async () => {
  const notes = [
    reading(),
    reading({ drawCalls: 0 }),
    reading({ madeCalls: 0 }),
    reading({ draw: true }),
    reading({ draw: true, prior: true }),
  ];
  for (const locale of SUPPORTED_LOCALES) {
    await loadLocale(locale);
    for (const note of notes) {
      for (const source of [note.text, ...note.parts, '复盘分析总结' + note.text]) {
        const value = localizeText(source);
        assert.ok(value.includes('Alex'), `${locale}: observer subject lost`);
        assert.doesNotMatch(value, /\{\d+\}/, `${locale}: unresolved placeholder`);
        if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
          assert.doesNotMatch(value, /\p{Script=Han}/u, `${locale}: ${value}`);
        if (locale !== 'zh-CN')
          assert.doesNotMatch(value, /对手本轮均已过牌|按这些行动估计|并收取看下一张的成本/);
        if (locale === 'en') {
          assert.doesNotMatch(value, /valuewhile|valueand|should|must|reassess/i);
          assert.match(value, /estimates|possible|possib/i);
        }
      }
    }
  }
  await loadLocale('zh-CN');
});

test('offline privacy localizes only the observation profile exclusion, alongside existing hand-record storage', async () => {
  const policy = readFileSync(new URL('../../public/app-privacy.html', import.meta.url), 'utf8');
  const normalized = (text) => text.trim().replace(/\s+/g, ' ');
  const escaped = (text) =>
    text.replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  assert.match(privacy.observations, /这份观察不包含底牌、完整牌谱或输赢结果/);
  assert.match(privacy.local, /设置、对局记录与筹码恢复数据/);
  for (const locale of SUPPORTED_LOCALES) {
    await loadLocale(locale);
    const text = localizeText(privacy.observations);
    assert.doesNotMatch(text, /\{\d+\}/);
    if (!['zh-CN', 'zh-TW', 'ja'].includes(locale)) assert.doesNotMatch(text, /\p{Script=Han}/u);
    const article = policy.match(
      new RegExp(`<article lang="${locale}"[\\s\\S]*?<\\/article>`),
    )?.[0];
    assert.ok(article, `${locale}: policy article missing`);
    assert.ok(
      normalized(article).includes(normalized(escaped(text))),
      `${locale}: observation disclosure absent from the offline policy`,
    );
  }
  await loadLocale('zh-CN');
});

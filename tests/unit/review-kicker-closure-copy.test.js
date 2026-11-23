import test from 'node:test';
import assert from 'node:assert/strict';
import { observerRecord } from '../fixtures/opponent-observer.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';

const summary = (record) => {
  const review = explainOpponent(record);
  return review.paragraphs.slice(review.paragraphs.indexOf('复盘分析总结') + 1).join('');
};
const weakTopPair = (changes = {}) =>
  observerRecord({
    action: 'check',
    reason: 'free-check',
    hole: 'Ad 6h',
    board: 'Ah 3h Ts',
    ...changes,
  });

test('a weak private kicker explains a top-pair check without inventing a strong-hand trap', () => {
  for (const reason of ['free-check', 'pot-control', 'unknown']) {
    const record = weakTopPair({ reason });
    const before = summary(record);
    assert.match(before, /6 踢脚偏弱.*踢脚更好.*落后.*过牌.*控制底池/);
    assert.doesNotMatch(before, /把较强牌保留在过牌范围|等后位先下注|并不是坚果/);
    assert.match(before, /免费看下一张|免费见到下一张/);
    for (const player of record.trace.view.opponents)
      Object.defineProperty(player, 'hole', {
        get() {
          throw Error('hidden cards read');
        },
      });
    record.trace.view.deck = [{ rank: 14, suit: 0 }];
    record.trace.view.winners = [0];
    assert.equal(summary(record), before);
  }
});

test('kicker control does not override a draw, an explicit trap or a kicker replaced by the board', () => {
  for (const changes of [
    { hole: 'Ad Qh' },
    { hole: 'Ah 6h', board: 'Ad 3h Th' },
    { reason: 'trap' },
    { board: 'Ah Kc Qs Jd' },
    { board: 'Ah 3h 6s' },
  ])
    assert.doesNotMatch(summary(weakTopPair(changes)), /6 踢脚偏弱/);
});

test('top pair on a paired board explains the shared pair, trips and the weak kicker', async () => {
  const pairedBoard = (changes = {}) =>
    weakTopPair({ hole: '5d Ad', board: 'Jc As Js', ...changes });
  for (const reason of ['free-check', 'pot-control', 'unknown'])
    for (const board of ['Jc As Js', 'Jc As Js 2h']) {
      const record = pairedBoard({ reason, board });
      const before = summary(record);
      assert.match(
        before,
        /公共牌的一对 J 是所有玩家共用的.*底牌这对 A 和 5 踢脚.*一张 J 就是三条.*同样拿 A 的对手另一张只要大于 5 也会领先.*过牌先控制底池/,
      );
      assert.doesNotMatch(before, /把较强牌保留在过牌范围|等后位先下注|并不是坚果|仍可向较弱/);
      for (const player of record.trace.view.opponents)
        Object.defineProperty(player, 'hole', {
          get() {
            throw Error('hidden cards read');
          },
        });
      record.trace.view.deck = [{ rank: 11, suit: 2 }];
      record.trace.view.winners = [0];
      assert.equal(summary(record), before);
    }
  // A strong kicker, a kicker the board replaced, a full house, two board pairs
  // and a draw keep their existing explanations.
  for (const changes of [
    { hole: 'Kd Ad' },
    { board: 'Jc As Js 8h' },
    { hole: 'Jd Ad' },
    { board: 'Jc As Js 2h 2d' },
    { hole: '5s Ad', board: 'Jc As Js 2s' },
  ])
    assert.doesNotMatch(summary(pairedBoard(changes)), /是所有玩家共用的/);
  try {
    for (const locale of SUPPORTED_LOCALES) {
      await loadLocale(locale);
      const text = explainOpponent(pairedBoard()).paragraphParts.at(-1).map(localizeText).join('');
      assert.doesNotMatch(text, /\{\d+\}|[。；，]{2}/u, locale);
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
        assert.doesNotMatch(text, /\p{Script=Han}/u, locale);
      assert.ok(text.includes('J') && text.includes('5'), locale);
    }
  } finally {
    await loadLocale('zh-CN');
  }
});

test('call and fold summaries state the required win probability with the exact contestable price', () => {
  for (const [action, reason] of [
    ['call', 'price-continue'],
    ['call', 'unknown'],
    ['fold', 'unknown'],
  ]) {
    const text = summary(
      observerRecord({
        action,
        reason,
        hole: 'Ad 6h',
        board: 'Ah 3h Ts',
        cost: 700,
        stack: 20000,
        pot: 3600,
        contestable: 4300,
      }),
    );
    assert.match(text, /继续要补 700，可争夺跟注后的 4.3K 底池，需要至少 16.3% 的胜率/);
    assert.doesNotMatch(text, /当前保本门槛/);
  }
});

test('all-in runout closure is one sentence and is absent when the river is already dealt', () => {
  for (const board of ['Jc Kd Qd', 'Jc Kd Qd 2h', 'Jc Kd Qd 2h 3s']) {
    const record = observerRecord({
      action: 'call',
      reason: 'price-continue',
      hole: 'Ac Th',
      board,
      cost: 15100,
      stack: 15100,
      contestable: 40300,
    });
    const text = summary(record);
    if (board.split(' ').length < 5)
      assert.match(text, /之后不再参与下注决策，可以看完剩余公共牌，无需再支付筹码。/);
    else {
      assert.match(text, /之后不再参与下注决策。/);
      assert.doesNotMatch(text, /剩余公共牌/);
    }
    assert.doesNotMatch(text, /下注决策。可以/);
  }
});

test('the rendered opponent paragraph localizes joined text nodes without dropping price or kicker facts', async () => {
  const records = [
    weakTopPair(),
    observerRecord({
      action: 'call',
      reason: 'price-continue',
      hole: 'Ad 6h',
      board: 'Ah 3h Ts',
      cost: 700,
      stack: 20000,
      pot: 3600,
      contestable: 4300,
    }),
    observerRecord({
      action: 'call',
      reason: 'price-continue',
      hole: 'Ac Th',
      board: 'Jc Kd Qd',
      cost: 15100,
      stack: 15100,
      contestable: 40300,
    }),
  ];
  try {
    for (const locale of SUPPORTED_LOCALES) {
      await loadLocale(locale);
      for (const record of records) {
        const review = explainOpponent(record);
        const text = review.paragraphParts.at(-1).map(localizeText).join('');
        assert.doesNotMatch(text, /\{\d+\}|[。；，]{2}/u, locale);
        if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
          assert.doesNotMatch(text, /\p{Script=Han}/u, locale);
        if (record.trace.view.legal.callAmount === 700) assert.ok(text.includes('16.3%'), locale);
        if (record.action === 'check') assert.ok(text.includes('6'), locale);
      }
    }
  } finally {
    await loadLocale('zh-CN');
  }
});

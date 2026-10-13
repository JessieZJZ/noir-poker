import test from 'node:test';
import assert from 'node:assert/strict';
import { deckOfCards } from '../../src/engine/poker.js';
import { analyzeDecision } from '../../src/review/analysis.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';
import { weakSuitedShove, pocketTensRecords } from '../fixtures/review-spots.js';

test('contextual draw rationale and bot motivation localize without losing cards, prices or evidence limits', async () => {
  const cards = (text) =>
    text
      .split(' ')
      .map((v) =>
        deckOfCards().find(
          (c) => c.rank === '23456789TJQKA'.indexOf(v[0]) + 2 && c.suit === 'shcd'.indexOf(v[1]),
        ),
      );
  const s = {
    hole: cards('Qd 8h'),
    board: cards('9h 7d 3d Ts'),
    street: 2,
    position: 'BTN',
    stack: 4600,
    pot: 2650,
    bet: 0,
    currentBet: 1250,
    action: 'call',
    amount: 1250,
    pending: [0],
    history: [
      { id: 1, street: 1, action: 'check', amount: 0 },
      { id: 1, street: 2, action: 'raise', amount: 1250 },
    ],
    legal: { callAmount: 1250, toCall: 1250, canRaise: true, minRaiseTo: 2500, maxRaiseTo: 4600 },
    players: [
      { id: 0, position: 'BTN', stack: 4600, total: 700, bet: 0 },
      { id: 1, name: 'River', position: 'BB', stack: 3300, total: 1950, bet: 1250 },
    ],
  };
  const r = analyzeDecision(s, { trials: 120 });
  const bot = explainOpponent({
    id: 1,
    action: 'raise',
    amount: 1250,
    trace: {
      view: {
        ...s,
        id: 1,
        inPosition: false,
        rivals: 1,
        opponents: [{ id: 0, stack: 4600 }],
        contestable: 3900,
      },
      reason: 'semi-bluff',
      exceptions: [],
      equity: 0.3,
      odds: 0.32,
      trials: 28,
      mode: 'off',
      mood: { kind: 'steady' },
      callTolerance: 0,
    },
  });
  const texts = [
    ...r.coaching.paragraphs,
    r.coaching.followUp,
    ...r.evidence,
    ...(bot.paragraphs || [bot.detail]),
    ...bot.reasons,
    ...bot.metrics,
  ];
  const reported = analyzeDecision(weakSuitedShove(), { trials: 120 });
  texts.push(...reported.coaching.paragraphs, reported.coaching.followUp, ...reported.evidence);
  for (const record of pocketTensRecords()) {
    const explanation = explainOpponent(record);
    texts.push(
      ...(explanation.paragraphs || [explanation.detail]),
      ...explanation.reasons,
      ...explanation.metrics,
    );
  }

  const defense = explainOpponent({
    action: 'call',
    amount: 75,
    trace: {
      ...botSnapshot(),
      reason: 'small-reraise-continue',
      affordableRangePassed: true,
      affordableThreeBet: true,
    },
  });
  texts.push(
    defense.title,
    ...(defense.paragraphs || [defense.detail]),
    ...defense.reasons,
    ...defense.metrics,
  );
  for (const locale of SUPPORTED_LOCALES) {
    await loadLocale(locale);
    for (const text of texts) {
      const result = localizeText(text);
      assert.doesNotMatch(result, /\{\d+\}/, `${locale}: unresolved placeholder`);
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
        assert.doesNotMatch(result, /\p{Script=Han}/u, `${locale}: ${result}`);
      for (const amount of [
        '1,250',
        '2,650',
        '4,600',
        '5,000',
        '4,650',
        '48.1%',
        '75',
        '525',
        '14.3%',
        '8',
        '6 / J',
      ])
        if (text.includes(amount)) assert.ok(result.includes(amount), `${locale}: lost ${amount}`);
    }
  }
});

function botSnapshot() {
  return {
    view: {
      hole: deckOfCards().filter(
        (card) => (card.rank === 13 && card.suit === 0) || (card.rank === 12 && card.suit === 1),
      ),
      board: [],
      street: 0,
      position: 'UTG+1',
      stack: 4875,
      pot: 450,
      bet: 125,
      currentBet: 200,
      contestable: 525,
      rivals: 1,
      history: [
        { id: 1, street: 0, action: 'raise', amount: 125 },
        { id: 0, street: 0, action: 'raise', amount: 200 },
      ],
      legal: { callAmount: 75, toCall: 75 },
    },
    exceptions: [],
    equity: 0.05,
    odds: 75 / 525,
    trials: 28,
    mode: 'off',
    mood: { kind: 'steady' },
    callTolerance: 0,
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { deckOfCards } from '../../src/engine/poker.js';
import { analyzeDecision, createReviewInput } from '../../src/review/analysis.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { decisionContext } from '../../src/review/context.js';
import { handMatchups } from '../../src/review/matchups.js';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';
import {
  causalReraiseGame,
  heroValueGame,
  weakSuitedShove,
  pocketTensRecords,
} from '../fixtures/review-spots.js';
import {
  turnBluffReview,
  turnStraightCallRecord,
  suitedBroadwayFiveBetFold,
  pocketNinesCheckedBoard,
} from '../fixtures/review-summary.js';

const clauses = (review) => review.paragraphParts?.flat() || review.paragraphs;

test('hand-specific rationale and actual public responses localize without losing cards, names or chips', async () => {
  const cards = (text) =>
    text
      .split(' ')
      .map((v) =>
        deckOfCards().find(
          (c) => c.rank === '23456789TJQKA'.indexOf(v[0]) + 2 && c.suit === 'shcd'.indexOf(v[1]),
        ),
      );
  const s = {
    bigBlind: 50,
    chipUnit: 25,
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
    legal: {
      chipUnit: 25,
      callAmount: 1250,
      toCall: 1250,
      canRaise: true,
      minRaiseTo: 2500,
      maxRaiseTo: 4600,
    },
    players: [
      { id: 0, position: 'BTN', stack: 4600, total: 700, bet: 0 },
      { id: 1, name: 'River', position: 'BB', stack: 3300, total: 1950, bet: 1250 },
    ],
  };
  const r = analyzeDecision(s, { trials: 120 });
  const bot = explainOpponent({
    id: 1,
    name: 'River',
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
    ...clauses(r.coaching),
    r.coaching.followUp,
    ...r.evidence,
    ...clauses(bot),
    ...bot.reasons,
    ...bot.metrics,
  ];
  for (const spot of [turnBluffReview(), suitedBroadwayFiveBetFold(), pocketNinesCheckedBoard()])
    texts.push(...clauses(analyzeDecision(spot, { trials: 120, rolloutTrials: 12 }).coaching));
  texts.push(...clauses(explainOpponent(turnStraightCallRecord())));
  const reported = analyzeDecision(weakSuitedShove(), { trials: 120 });
  texts.push(...clauses(reported.coaching), reported.coaching.followUp, ...reported.evidence);
  for (const record of pocketTensRecords()) {
    const explanation = explainOpponent(record);
    texts.push(...clauses(explanation), ...explanation.reasons, ...explanation.metrics);
  }

  const defense = explainOpponent({
    name: 'Kai',
    action: 'call',
    amount: 75,
    trace: {
      ...botSnapshot(),
      reason: 'small-reraise-continue',
      affordableRangePassed: true,
      affordableThreeBet: true,
    },
  });
  texts.push(defense.title, ...clauses(defense), ...defense.reasons, ...defense.metrics);
  const causal = createReviewInput(causalReraiseGame());
  for (const decision of causal.decisions) {
    const result = analyzeDecision(decision, { trials: 120, rolloutTrials: 12 });
    texts.push(...clauses(result.coaching), result.coaching.followUp, ...result.evidence);
  }
  const mia = explainOpponent(causal.opponents[0]);
  texts.push(...clauses(mia), ...mia.reasons, ...causal.activity.map((event) => event.text));
  assert.deepEqual(mia.metrics, []);
  assert.doesNotMatch(mia.detail, /它|EV|模型|模拟器|抽样/);
  for (const kind of ['set-shove', 'aa-flat']) {
    const input = createReviewInput(heroValueGame(kind));
    for (const decision of input.decisions) {
      const result = analyzeDecision(decision, { trials: 120, rolloutTrials: 12 });
      texts.push(
        ...clauses(result.coaching),
        result.context.matchups.handLabel,
        result.coaching.followUp,
        ...result.evidence,
      );
    }
    texts.push(...input.activity.map((event) => event.text));
  }
  for (const [hole, board] of [
    ['8s 9d', '6c 7h Ts'],
    ['Ah Th', 'Jh 7h 3h 2s 4c'],
    ['4s 3d', 'Ks Kd Kh 2s 2d'],
    ['2c 3d', 'As Ks Qs Js Ts'],
    ['2c 3d', 'As Kd Qh Jc'],
  ]) {
    const snapshot = {
      ...s,
      hole: cards(hole),
      board: cards(board),
      street: board.split(' ').length - 2,
    };
    texts.push(handMatchups(snapshot, decisionContext(snapshot)).text);
  }
  const compactAmounts = (text) => text.match(/\b\d+(?:\.\d+)?[KM]\b/g) || [];
  const observedAmounts = new Set(texts.flatMap(compactAmounts));
  for (const amount of ['1.25K', '5K', '4.65K', '1K', '4.05K'])
    assert.ok(observedAmounts.has(amount), `Missing source amount coverage: ${amount}`);
  for (const locale of SUPPORTED_LOCALES) {
    await loadLocale(locale);
    for (const text of texts) {
      const result = localizeText(text);
      assert.doesNotMatch(result, /\{\d+\}/, `${locale}: unresolved placeholder`);
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
        assert.doesNotMatch(result, /\p{Script=Han}/u, `${locale}: ${result}`);
      for (const amount of [
        ...compactAmounts(text),
        '1.25K',
        '2.65K',
        '4.6K',
        '5K',
        '4.65K',
        '75',
        '350',
        '200',
        '1K',
        '975',
        '950',
        '800',
        '650',
        '4.05K',
        '5.23',
        '16.0%',
        '8',
        '6 / J',
      ])
        if (text.includes(amount)) assert.ok(result.includes(amount), `${locale}: lost ${amount}`);
      for (const name of ['Kai', 'Mia', 'River', 'Luna', 'Alex'])
        if (text.includes(name)) assert.ok(result.includes(name), `${locale}: lost ${name}`);
    }
  }
});

function botSnapshot() {
  return {
    view: {
      bigBlind: 50,
      chipUnit: 25,
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
      legal: { chipUnit: 25, callAmount: 75, toCall: 75 },
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

test('public actor identities remain atomic inside translated action and board clauses', async () => {
  const text =
    '这是 2–7 诈唬：单挑、有位置，对手本轮已经过牌；River（多街施压）在 BTN 位在 A♠ K♦ 9♥ 6♣ 3♦ 上用 325 争取 800，没有成牌或大听牌托底，主要赌对手愿意弃牌。';
  try {
    for (const locale of SUPPORTED_LOCALES.filter(
      (locale) => !['zh-CN', 'zh-TW', 'ja'].includes(locale),
    )) {
      await loadLocale(locale);
      const translated = localizeText(text);
      assert.doesNotMatch(translated, /\p{Script=Han}|[\uE000-\uF8FF]/u, locale);
      assert.match(translated, /River/);
      assert.match(translated, /BTN/);
      assert.match(translated, /A♠ K♦ 9♥ 6♣ 3♦/);
      assert.match(translated, /325/);
      assert.match(translated, /800/);
    }
  } finally {
    await loadLocale('zh-CN');
  }
});

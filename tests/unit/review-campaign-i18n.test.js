import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';
import { strategyNotes } from '../../src/review/strategy-reasoning.js';
import { analyzeDecision } from '../../src/review/analysis.js';
import { reportedGutshotCall } from '../fixtures/review-summary.js';
import { observerRecord } from '../fixtures/opponent-observer.js';
import { explainOpponent } from '../../src/review/opponents.js';

function currentTexts() {
  const s = reportedGutshotCall();
  s.street = 2;
  s.action = 'check';
  s.amount = 0;
  s.history = [
    { id: 0, street: 0, action: 'raise', amount: 60000 },
    { id: 1, street: 0, action: 'raise', amount: 240000 },
    { id: 0, street: 0, action: 'call', amount: 180000 },
    { id: 1, street: 1, action: 'raise', amount: 100000 },
    { id: 0, street: 1, action: 'call', amount: 100000 },
  ];
  s.players = s.players.slice(0, 2).map((p) => ({ ...p, folded: false, out: false, allin: false }));
  const range = strategyNotes(s, { range: { advantage: -0.3, uncertainty: 0.1 } }).find(
    (entry) => entry.topic === 'range',
  ).text;
  assert.match(range, /加注后又跟注/);
  assert.match(range, /后续公开加注包括/);
  const covering = structuredClone(s);
  covering.action = 'raise';
  covering.stack = covering.amount = 1000000;
  covering.bet = covering.currentBet = 0;
  covering.players[0].stack = covering.stack;
  covering.players[0].bet = 0;
  covering.players[1].stack = 100000;
  covering.players[1].bet = 0;
  Object.assign(covering.legal, {
    canCheck: true,
    callAmount: 0,
    toCall: 0,
    canRaise: true,
    minRaiseTo: 20000,
    maxRaiseTo: 1000000,
  });
  const review = analyzeDecision(covering, { trials: 24, rollouts: false }).coaching;
  const text = review.paragraphs.join('');
  assert.match(text, /无法被匹配，会退回/);
  return [range, ...review.paragraphs, review.followUp].filter(Boolean);
}

function currentCheckTexts() {
  const records = [
    observerRecord({ action: 'check', hole: 'Ah Jh', board: 'Kh 7h 2c 9s' }),
    observerRecord({ action: 'check', hole: 'Tc 9s', board: '4d Td 9c' }),
    observerRecord({ action: 'check', hole: 'Ts Jh', board: 'Tc 9h Th As Ad' }),
    observerRecord({
      action: 'raise',
      reason: 'value-raise',
      hole: 'Ts Jh',
      board: 'Tc 9h Th As Ad',
    }),
    observerRecord({
      action: 'call',
      reason: 'small-price-call',
      hole: 'As Ah',
      board: 'Kh 7c 2d',
      cost: 50,
    }),
  ];
  records[2].trace.view.actionContext = { pendingResponseIds: [] };
  records[4].trace.mode = 'normal';
  records[4].trace.mood = { kind: 'cautious' };
  return records.flatMap((record) => explainOpponent(record).paragraphs);
}

test('real range and refund paragraphs remain translatable across sentence boundaries in every locale', async () => {
  const texts = [...currentTexts(), ...currentCheckTexts()];
  try {
    for (const locale of SUPPORTED_LOCALES) {
      await loadLocale(locale);
      for (const source of texts) {
        const translated = localizeText(source);
        assert.doesNotMatch(translated, /\{\d+\}|\uE000|\uE001/, `${locale}: placeholder leak`);
        if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
          assert.doesNotMatch(translated, /\p{Script=Han}/u, `${locale}: ${translated}`);
      }
    }
  } finally {
    await loadLocale('zh-CN');
  }
});

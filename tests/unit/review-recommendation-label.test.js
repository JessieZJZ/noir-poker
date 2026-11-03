import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendationLabel } from '../../src/review/recommendation-label.js';
import { coachDecision } from '../../src/review/coaching.js';
import { analyzeDecision, createReviewInput } from '../../src/review/analysis.js';
import { actionLabel } from '../../src/engine/action-labels.js';
import {
  act,
  advanceStreet,
  legalActions,
  newGame,
  playBotTurn,
  startHand,
} from '../../src/engine/poker.js';
import { reportedGutshotCall } from '../fixtures/review-summary.js';

test('all five recommended actions show their verb and real amount instead of an assessment', () => {
  const s = {
    street: 0,
    bigBlind: 200,
    currentBet: 1000,
    minRaise: 800,
    stack: 20000,
    history: [{ street: 0, action: 'raise', amount: 1000 }],
    legal: { callAmount: 1000, maxRaiseTo: 20000, fullRaiseTo: 1800 },
  };
  const before = structuredClone(s);
  for (const [action, expected] of [
    [{ action: 'fold', amount: 0 }, '建议弃牌'],
    [{ action: 'check', amount: 0 }, '建议过牌'],
    [{ action: 'call', amount: 1000 }, '建议跟注 1K'],
    [{ action: 'raise', amount: 3500 }, '建议加注至 3.5K'],
    [{ action: 'raise', amount: 20000 }, '建议全下至 20K'],
  ]) {
    assert.equal(recommendationLabel(s, action).label, expected);
  }
  assert.deepEqual(s, before);
  assert.equal(
    recommendationLabel({ ...s, stack: 1000 }, { action: 'call', amount: 1000 }).label,
    '建议全下跟注 1K',
  );
  assert.equal(
    recommendationLabel(
      { ...s, street: 2, currentBet: 0, history: [] },
      { action: 'raise', amount: 3500 },
    ).label,
    '建议下注至 3.5K',
  );
  assert.equal(
    recommendationLabel(
      { ...s, legal: { ...s.legal, maxRaiseTo: 1500 } },
      { action: 'raise', amount: 1500 },
    ).label,
    '建议短全下至 1.5K',
  );
});

test('an uncertain public-range recommendation remains actionable and conditional without changing the chosen action', () => {
  const s = reportedGutshotCall();
  const result = analyzeDecision(s, { trials: 120, rolloutTrials: 12 });
  const c = result.coaching;
  assert.equal(c.kind, 'compare');
  assert.equal(c.assessmentLabel, '需要比较');
  assert.equal(c.recommendationConditional, true);
  assert.equal(c.label, '需要比较', 'The call taken is not repeated as advice');
  assert.equal(c.recommendedAction.action, 'call');
  assert.equal(c.recommendedAction.amount, 520000);
  assert.equal(c.recommendedAction.summary, '建议跟注 520K');
  assert.equal(c.suggestion, '建议跟注 520K');
  assert.match(c.explanation, /跟注 520K的前提是对手的下注范围.*诈唬/);
  assert.equal(coachDecision(s, result).label, c.label);
});

test('a step never recommends the action the player already took', () => {
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let repeated = 0;
  for (let hand = 0; hand < 12; hand++) {
    const g = newGame(6);
    g.dealer = hand % 6;
    startHand(g);
    for (let guard = 0; guard < 200 && g.phase !== 'done'; guard++) {
      if (g.phase === 'between') advanceStreet(g);
      else if (g.actor !== 0) playBotTurn(g, random);
      else {
        const legal = legalActions(g, 0),
          roll = random();
        if (legal.canRaise && roll < 0.35)
          act(
            g,
            0,
            'raise',
            Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, g.currentBet * 3)),
          );
        else act(g, 0, roll < 0.85 || legal.canCheck ? 'call' : 'fold');
      }
    }
    for (const s of createReviewInput(g).decisions) {
      const c = analyzeDecision(s, { trials: 40, rollouts: false }).coaching;
      if (c.unchanged) {
        repeated++;
        assert.ok(['值得保留', '需要比较'].includes(c.label), `${actionLabel(s)}: ${c.label}`);
      } else assert.equal(c.label, c.suggestion);
    }
  }
  assert.ok(repeated > 0, 'The sample includes steps whose candidate matches the action taken');
});

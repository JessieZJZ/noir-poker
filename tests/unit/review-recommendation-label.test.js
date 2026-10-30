import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendationLabel } from '../../src/review/recommendation-label.js';
import { coachDecision } from '../../src/review/coaching.js';
import { analyzeDecision } from '../../src/review/analysis.js';
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
  assert.equal(c.label, '建议跟注 520K');
  assert.equal(c.recommendedAction.action, 'call');
  assert.equal(c.recommendedAction.amount, 520000);
  assert.equal(c.recommendedAction.summary, c.label);
  assert.equal(c.suggestion, c.label);
  assert.match(c.explanation, /建议跟注.*下注范围.*诈唬/);
  assert.equal(coachDecision(s, result).label, c.label);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDecision } from '../../src/review/analysis.js';
import { coachDecision } from '../../src/review/coaching.js';
import { decisionContext } from '../../src/review/context.js';
import { actionReason } from '../../src/review/narrative.js';
import { reportedLowConnectorCall } from '../fixtures/review-summary.js';

test('preflop call coaching preserves the requested exit wording and final period', () => {
  const snapshot = reportedLowConnectorCall();
  const result = analyzeDecision(snapshot, { trials: 120, rolloutTrials: 4 });
  // Exercise the wording for a retained call independently of the grader.
  result.code = 'priced-call';
  result.status = 'sound';
  result.simulation = null;
  result.routes.primary = { action: 'call', amount: snapshot.legal.callAmount };
  const coaching = coachDecision(snapshot, result);
  assert.ok(
    coaching.paragraphs
      .join('')
      .includes(
        '这条跟注路线的依据是当前价格下保留改善与摊牌机会，仍依赖对手范围较宽，底牌未改善时弃牌。',
      ),
  );
  assert.doesNotMatch(coaching.paragraphs.join(''), /不自动跟到底/);
});

test('executed preflop re-raises are called bluffs rather than bluff candidates', () => {
  const snapshot = reportedLowConnectorCall();
  snapshot.action = 'raise';
  snapshot.amount = snapshot.legal.minRaiseTo;
  for (const headsUp of [false, true]) {
    if (headsUp) {
      const aggressor = snapshot.history.findLast((action) => action.action === 'raise').id;
      snapshot.players = snapshot.players.filter((player) => !player.id || player.id === aggressor);
    }
    const text = actionReason(snapshot, { context: decisionContext(snapshot) });
    assert.match(text, /这次是再加注诈唬，需要所有仍在底池里的对手都弃牌/);
    assert.doesNotMatch(text, /再加注诈唬候选/);
    assert.doesNotMatch(text, /需要开池者愿意弃牌|开池者和其他未弃牌的玩家都放弃/);
  }
});

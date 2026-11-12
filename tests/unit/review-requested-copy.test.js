import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDecision } from '../../src/review/analysis.js';
import { coachDecision } from '../../src/review/coaching.js';
import { decisionContext } from '../../src/review/context.js';
import { actionReason } from '../../src/review/narrative.js';
import { reportedLowConnectorCall } from '../fixtures/review-summary.js';
import { guaranteedUncalledRaise } from '../../src/review/presentation.js';

test('preflop call coaching makes a later weak-hand exit conditional on facing a bet', () => {
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
        '这条跟注路线的依据是当前价格下保留改善与摊牌机会，仍依赖对手范围较宽。未改善且面对不利下注时可弃牌，能免费过牌则保留机会。',
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

test('a covering shove separates the button amount from chips opponents can match', () => {
  const s = reportedLowConnectorCall();
  Object.assign(s, {
    action: 'raise',
    amount: 12500,
    stack: 12500,
    bet: 0,
    total: 0,
    pot: 75,
    bigBlind: 50,
    chipUnit: 25,
    street: 0,
    position: 'BTN',
    history: [],
    legal: { ...s.legal, maxRaiseTo: 12500 },
    players: [
      { id: 0, stack: 12500, total: 0, bet: 0 },
      { id: 1, stack: 1975, total: 25, bet: 25, position: 'SB' },
      { id: 2, stack: 1950, total: 50, bet: 50, position: 'BB' },
    ],
  });
  assert.equal(guaranteedUncalledRaise(s, 12500), 10500);
  const text = actionReason(s, { context: decisionContext(s) });
  assert.match(text, /全下至 12.5K/);
  assert.match(text, /至少 10.5K 无法被匹配.*退回/);
  assert.match(text, /最多 2K（40 BB）可被匹配/);
  assert.doesNotMatch(text, /250 BB|166.7 倍/);
  s.players[1].stack = 12475;
  assert.equal(guaranteedUncalledRaise(s, 12500), 0);
});

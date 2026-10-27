import test from 'node:test';
import assert from 'node:assert/strict';
import { observedSqueeze } from '../fixtures/observed-preflop.js';
import { allInRandom } from '../fixtures/all-in-decisions.js';
import {
  botDecision,
  planBotTurn,
  executeBotTurn,
  act,
  legalActions,
  advanceStreet,
} from '../../src/engine/poker.js';
import { observedPreflopDefense } from '../../src/engine/bot-style.js';
import { explainOpponent } from '../../src/review/opponents.js';

test('an affordable strong squeeze defense uses observed range evidence instead of a fixed entry veto', () => {
  for (const difficulty of ['normal', 'hard'])
    for (const smallBlind of [25, 100, 50000]) {
      const cold = observedSqueeze({ hands: 0, difficulty, smallBlind });
      const known = observedSqueeze({ difficulty, smallBlind });
      const first = botDecision(cold, allInRandom(73));
      const second = botDecision(known, allInRandom(73));
      assert.equal(first.action, 'fold');
      assert.notEqual(second.action, 'fold');
      assert.ok(second.trace.observedDefense);
      assert.equal(second.trace.observedDefense.hands, 32);
      assert.ok(second.trace.observedDefense.realizedEquity >= second.trace.requiredEquity + 0.04);
      const money = known.players.reduce((n, p) => n + p.stack + p.total, 0);
      executeBotTurn(known, planBotTurn(known, allInRandom(73), { timingRandom: allInRandom(2) }), {
        expedited: true,
      });
      while (known.phase !== 'done') {
        if (known.phase === 'between') advanceStreet(known);
        else act(known, known.actor, legalActions(known).canCheck ? 'check' : 'fold');
      }
      assert.equal(
        known.players.reduce((n, p) => n + p.stack, 0),
        money,
      );
      for (const p of known.players) assert.equal(p.stack % smallBlind, 0);
      const text = explainOpponent(known.botDecisions[0], known.players).detail;
      assert.match(text, /此前 32 手中 32 手翻前加注.*没有把加注范围限于强牌/);
    }
});

test('the observation exemption is bounded by price, evidence, hand quality and still-active opponents', () => {
  const v = botDecision(observedSqueeze(), allInRandom(73)).trace.view;
  assert.ok(observedPreflopDefense(v, 0.6, 0.27));
  assert.equal(observedPreflopDefense(v, 0.3, 0.27), null);
  for (const changed of [
    { ...v, difficulty: 'easy' },
    { ...v, allIn: {} },
    { ...v, street: 1 },
    { ...v, rivals: 2 },
    { ...v, actionContext: { ...v.actionContext, pendingResponseCount: 1 } },
    { ...v, legal: { ...v.legal, callAmount: v.stack } },
    { ...v, legal: { ...v.legal, callAmount: (v.stack + v.total) * 0.25 } },
    { ...v, opponents: v.opponents.map((p) => ({ ...p, publicRead: null })) },
    {
      ...v,
      opponents: v.opponents.map((p) => ({ ...p, publicRead: { hands: 7, raisingHands: 7 } })),
    },
    {
      ...v,
      opponents: v.opponents.map((p) => ({ ...p, publicRead: { hands: 32, raisingHands: 2 } })),
    },
  ])
    assert.equal(observedPreflopDefense(changed, 0.6, 0.27), null);
  assert.equal(botDecision(observedSqueeze({ hole: '7s 2h' }), allInRandom(73)).action, 'fold');
});

test('the observed heads-up defense remains legal after other seats fold at every supported table size', () => {
  for (const count of [5, 6, 7, 8, 9])
    for (const difficulty of ['normal', 'hard']) {
      const game = observedSqueeze({ count, difficulty });
      const chips = game.players.reduce((sum, p) => sum + p.stack + p.total, 0);
      const decision = botDecision(game, allInRandom(73));
      assert.notEqual(decision.action, 'fold', `${count} seats, ${difficulty}`);
      assert.ok(decision.trace.observedDefense);
      assert.equal(decision.trace.view.rivals, 1);
      assert.equal(decision.trace.view.actionContext.pendingResponseCount, 0);
      executeBotTurn(game, planBotTurn(game, allInRandom(73)), { expedited: true });
      while (game.phase !== 'done') {
        if (game.phase === 'between') advanceStreet(game);
        else act(game, game.actor, legalActions(game).canCheck ? 'check' : 'fold');
      }
      assert.equal(
        game.players.reduce((sum, p) => sum + p.stack, 0),
        chips,
      );
    }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../../src/engine/poker.js';
import { allInRandom } from '../fixtures/all-in-decisions.js';
import { facingPotBet } from '../fixtures/reported-overpair.js';

test('an overpair facing a pot-size flop bet is not folded by sampling noise', () => {
  for (const difficulty of ['normal', 'hard']) {
    const base = difficulty === 'hard' ? 52 : 28;
    let refined = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const d = engine.botDecision(facingPotBet(difficulty), allInRandom(seed));
      const estimate = d.trace.view.publicEquity;
      assert.equal(d.action, 'call', `${difficulty} seed ${seed}`);
      if (estimate.closeCallRefined) {
        refined++;
        assert.equal(estimate.closeCallRefined, base);
        assert.equal(estimate.samples, engine.CLOSE_CALL_SAMPLES);
        assert.ok(estimate.priceEquity > d.trace.odds + 0.03, `${estimate.priceEquity}`);
      } else {
        // Only a first estimate far above the price skips the top-up.
        assert.equal(estimate.samples, base);
        assert.ok(estimate.priceEquity > d.trace.odds + (2.5 * 0.5) / Math.sqrt(base));
      }
    }
    assert.ok(refined >= 10, `${difficulty}: ${refined} of 40 close calls refined`);
  }
});

test('the top-up pools sample means and skips calls far from their price', () => {
  const g = facingPotBet('normal');
  const d = engine.botDecision(g, allInRandom(7));
  const estimate = d.trace.view.publicEquity;
  const sum = estimate.winProbability + estimate.tieProbability + estimate.lossProbability;
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(d.trace.view.equity, estimate.priceEquity);
  // A set is far above the call price: the base sample already decides it.
  const set = engine.botDecision(facingPotBet('normal', '7c 7d'), allInRandom(7));
  assert.equal(set.trace.view.publicEquity.samples, 28);
  assert.equal(set.trace.view.publicEquity.closeCallRefined, undefined);
  assert.notEqual(set.action, 'fold');
});

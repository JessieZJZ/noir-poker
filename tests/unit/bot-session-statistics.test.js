import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreInterval, finiteSessionSummary } from '../../scripts/bot-session-statistics.mjs';

const payoff = { winningProfitBB: 400, losingProfitBB: -400 };
const ended = (champion) => ({
  champion,
  censored: false,
  ended: true,
  profitBB: champion ? 400 : -400,
  buyinBB: 400,
  finalBB: champion ? 800 : 0,
  hands: 20,
});
test('zero observed wins retain nonzero uncertainty and cannot be assigned a degenerate bootstrap interval', () => {
  const [low, high] = scoreInterval(0, 8);
  assert.ok(low < 1e-12);
  assert.ok(high > 0.3 && high < 0.4);
  assert.deepEqual(
    scoreInterval(8, 8).map((p) => +p.toFixed(10)),
    [1 - high, 1 - low].map((p) => +p.toFixed(10)),
  );
  assert.throws(() => scoreInterval(0, 0));
});
test('the actual buy-in ledger separates championship probability from profit', () => {
  const s = finiteSessionSummary([ended(true), ended(false)], payoff);
  assert.equal(s.currentProfitBB, 0);
  assert.equal(s.currentReturnOnBuyin, 0);
  assert.equal(s.breakEvenChampionRate, 0.5);
  assert.deepEqual(s.terminalProfitPerSessionBoundsBB, [0, 0]);
  assert.ok(
    s.terminalMeanProfitScoreInterval95BB[0] < 0 && s.terminalMeanProfitScoreInterval95BB[1] > 0,
  );
  assert.equal(s.exploratory, true);
  assert.throws(() => finiteSessionSummary([{ ...ended(true), profitBB: 800 }], payoff), /ledger/);
});
test('a capped session contributes a range of terminal outcomes, never a fabricated win', () => {
  const capped = {
    champion: false,
    censored: true,
    ended: false,
    profitBB: 300,
    buyinBB: 100,
    finalBB: 400,
    hands: 200,
  };
  const s = finiteSessionSummary([ended(false), capped], payoff);
  assert.deepEqual(s.championRateBounds, [0, 0.5]);
  assert.deepEqual(s.terminalProfitPerSessionBoundsBB, [-400, 0]);
  assert.equal(s.currentProfitBB, -100);
  assert.throws(
    () => finiteSessionSummary([{ ...capped, champion: true }], payoff),
    /terminal win/,
  );
});

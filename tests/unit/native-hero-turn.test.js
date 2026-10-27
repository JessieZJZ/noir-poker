import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForNativeHeroTurn } from '../native/scenarios.mjs';
import { BOT_THINK_LIMITS } from '../../src/engine/bot-timing.js';

function harness(read) {
  let elapsed = 0;
  return {
    now: () => elapsed,
    app: {
      state: async () => ({ playerCount: 8 }),
      evaluate: async () => read(elapsed),
      waitFor: async (predicate, deadline, message) => {
        while (elapsed < deadline) {
          if (await predicate()) return true;
          elapsed += 1000;
        }
        throw Error(message);
      },
    },
  };
}
const waiting = (actor) => ({
  hand: 1,
  phase: 'playing',
  actor,
  enabled: false,
  controlEnabled: false,
});

test('installed eight-player feedback check permits sequential configured bot pauses', async () => {
  const fake = harness((elapsed) =>
    elapsed < 14000
      ? waiting(elapsed < 7000 ? 'River' : 'Theo')
      : { ...waiting('你'), enabled: true, controlEnabled: true },
  );
  const evidence = await waitForNativeHeroTurn(fake.app, { now: fake.now });
  assert.equal(evidence.elapsedMs, 14000);
  assert.equal(evidence.timeoutMs, 7 * BOT_THINK_LIMITS.maximum + 10000);
  assert.deepEqual(
    evidence.observations.map((entry) => entry.state.actor),
    ['River', 'Theo', '你'],
  );
});

test('stalled bot and mismatched hero controls fail within a finite unchanged budget', async () => {
  for (const snapshot of [
    waiting('River'),
    { ...waiting('你'), enabled: true },
    { ...waiting('River'), enabled: true, controlEnabled: true },
  ]) {
    const fake = harness(() => snapshot);
    await assert.rejects(waitForNativeHeroTurn(fake.app, { now: fake.now }), (error) => {
      assert.equal(error.turnDiagnostics.elapsedMs, 31000);
      assert.deepEqual(error.turnDiagnostics.observations[0].state, snapshot);
      return true;
    });
  }
});

test('review and background checks advance once when the preceding real hand has settled', async () => {
  let advances = 0;
  const fake = harness((elapsed) =>
    elapsed === 0
      ? { ...waiting(null), phase: 'done' }
      : { ...waiting('你'), hand: 2, enabled: true, controlEnabled: true },
  );
  fake.app.click = async (selector) => {
    assert.equal(selector, '#next-button');
    advances++;
  };
  const result = await waitForNativeHeroTurn(fake.app, { now: fake.now, advanceSettled: true });
  assert.equal(advances, 1);
  assert.equal(result.advancedSettlement, true);
  assert.equal(result.timeoutMs, 7 * BOT_THINK_LIMITS.maximum + 10000);
  assert.deepEqual(
    result.observations.map(({ state }) => state.phase),
    ['done', 'playing'],
  );
});

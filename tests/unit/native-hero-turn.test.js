import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForNativeHeroTurn, nativeOpponentActionsChanged } from '../native/scenarios.mjs';
import { BOT_THINK_LIMITS } from '../../src/engine/bot-timing.js';

function harness(read) {
  let elapsed = 0;
  return {
    now: () => elapsed,
    advance: (ms) => (elapsed += ms),
    app: {
      state: async () => ({ playerCount: 8 }),
      evaluate: async () => read(elapsed),
      waitFor: async (predicate, timeout, message) => {
        const deadline = elapsed + timeout;
        while (elapsed < deadline) {
          const result = await predicate();
          if (result) return result;
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

test('opponent progress requires changed public action values, not nested WebDriver key order', () => {
  const before = [{ id: 1, lastAction: { text: '跟注 200', street: 0, bet: 200 } }];
  const players = [{ id: 0 }, { lastAction: { bet: 200, street: 0, text: '跟注 200' }, id: 1 }];
  assert.notEqual(
    JSON.stringify(players.slice(1).map(({ id, lastAction }) => ({ id, lastAction }))),
    JSON.stringify(before),
    'The former byte comparison would falsely report progress for these identical actions',
  );
  assert.equal(nativeOpponentActionsChanged(before, players), false);
  for (const change of [
    (p) => p[1].lastAction.bet++,
    (p) => (p[1].lastAction.bet = '200'),
    (p) => p[1].lastAction.street++,
    (p) => (p[1].lastAction.text = '加注至 400'),
    (p) => p[1].id++,
    (p) => delete p[1].lastAction.text,
  ]) {
    const changed = structuredClone(players);
    change(changed);
    assert.equal(nativeOpponentActionsChanged(before, changed), true);
  }
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

test('a slow next-hand click leaves the following hand its full bot budget', async () => {
  const budget = 7 * BOT_THINK_LIMITS.maximum + 10000;
  let clickedAt = null;
  const fake = harness((elapsed) => {
    if (clickedAt === null) return { ...waiting(null), phase: 'done' };
    return elapsed < clickedAt + 20000
      ? waiting('River')
      : { ...waiting('你'), hand: 2, enabled: true, controlEnabled: true };
  });
  fake.app.click = async () => {
    clickedAt = fake.advance(budget);
  };
  const result = await waitForNativeHeroTurn(fake.app, { now: fake.now, advanceSettled: true });
  assert.equal(result.elapsedMs, budget + 20000);
});

test('a stalled hand after a slow click still fails within one budget', async () => {
  const budget = 7 * BOT_THINK_LIMITS.maximum + 10000;
  let clicked = false;
  const fake = harness(() => (clicked ? waiting('River') : { ...waiting(null), phase: 'done' }));
  fake.app.click = async () => {
    fake.advance(budget);
    clicked = true;
  };
  await assert.rejects(
    waitForNativeHeroTurn(fake.app, { now: fake.now, advanceSettled: true }),
    (error) => {
      assert.equal(error.turnDiagnostics.elapsedMs, budget * 2);
      return true;
    },
  );
});

test('a walk straight after the settled hand advances again', async () => {
  const clicks = [];
  let hand = 13;
  const fake = harness(() =>
    hand < 15
      ? { ...waiting(null), hand, phase: 'done' }
      : { ...waiting('你'), hand, enabled: true, controlEnabled: true },
  );
  fake.app.click = async (selector) => {
    clicks.push(selector);
    hand++;
  };
  await waitForNativeHeroTurn(fake.app, { now: fake.now, advanceSettled: true });
  assert.deepEqual(clicks, ['#next-button', '#next-button']);
});

test('a hero who never receives a turn fails instead of advancing forever', async () => {
  let hand = 1;
  const fake = harness(() => ({ ...waiting(null), hand, phase: 'done' }));
  let clicks = 0;
  fake.app.click = async () => {
    clicks++;
    hand++;
  };
  await assert.rejects(
    waitForNativeHeroTurn(fake.app, { now: fake.now, advanceSettled: true }),
    /never received a turn/,
  );
  assert.equal(clicks, 8);
});

test('public-memory checks retain a natural walk without advancing or increasing the turn budget', async () => {
  const fake = harness((elapsed) =>
    elapsed < 2000 ? waiting('River') : { ...waiting(null), phase: 'done' },
  );
  fake.app.click = async () => {
    throw Error('A naturally finished hand must remain available for its memory audit');
  };
  const result = await waitForNativeHeroTurn(fake.app, { now: fake.now, acceptSettled: true });
  assert.equal(result.settledBeforeHero, true);
  assert.equal(result.advancedSettlement, false);
  assert.equal(result.elapsedMs, 2000);
  assert.equal(result.timeoutMs, 7 * BOT_THINK_LIMITS.maximum + 10000);
  assert.deepEqual(
    result.observations.map(({ state }) => state.hand),
    [1, 1],
  );
});

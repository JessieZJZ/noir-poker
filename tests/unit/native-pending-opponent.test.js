import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForPendingOpponent } from '../native/scenarios.mjs';

test('native background setup follows real hero decisions after missing a brief opponent turn', async () => {
  const opponent = { phase: 'playing', actor: 'River', legal: { enabled: false } };
  const states = [
    { phase: 'playing', actor: '你', legal: { enabled: true } },
    { phase: 'playing', actor: '你', legal: { enabled: true } },
    { phase: 'playing', actor: '你', legal: { enabled: true } },
    { phase: 'between', actor: null, legal: { enabled: false } },
    { phase: 'done', actor: null, legal: { enabled: false } },
    opponent,
  ];
  const clicks = [];
  const result = await waitForPendingOpponent({
    state: async () => states.shift(),
    click: async (selector) => clicks.push(selector),
    waitFor: async (predicate) => {
      while (states.length) {
        const value = await predicate();
        if (value) return value;
      }
      throw Error('No pending opponent was observed');
    },
  });
  assert.equal(result, opponent);
  assert.deepEqual(clicks, ['#call-button', '#call-button', '#next-button']);
});

test('native background setup checks the fresh result after a slow action without extending its deadline', async () => {
  const opponent = { phase: 'playing', actor: 'Mia', legal: { enabled: false } };
  for (const [before, selector] of [
    [{ phase: 'playing', actor: '你', legal: { enabled: true } }, '#call-button'],
    [{ phase: 'done', actor: null, legal: { enabled: false } }, '#next-button'],
  ]) {
    let clicked = false;
    let reads = 0;
    const result = await waitForPendingOpponent({
      state: async () => {
        reads++;
        return clicked ? opponent : before;
      },
      click: async (actual) => {
        assert.equal(actual, selector);
        clicked = true;
      },
      waitFor: async (predicate, timeoutMs) => {
        assert.equal(timeoutMs, 15000);
        // Model a native command finishing at the deadline: another poll is
        // unavailable, but a true result from this awaited predicate counts.
        const value = await predicate();
        assert.ok(value, 'The first predicate must return the actual post-click opponent state');
        return value;
      },
    });
    assert.equal(result, opponent);
    assert.equal(reads, 2);
  }
});

test('native background setup does not charge a slow click to the app wait when the hero closes the street', async () => {
  const opponent = { phase: 'playing', actor: 'Kai', legal: { enabled: false } };
  let now = 0;
  let clicks = 0;
  const result = await waitForPendingOpponent({
    state: async () => {
      if (!clicks) return { phase: 'playing', actor: '你', legal: { enabled: true } };
      return now < 26000 ? { phase: 'between', actor: null, legal: { enabled: false } } : opponent;
    },
    click: async () => {
      clicks++;
      now += 22000;
    },
    // Mirrors the harness: the deadline is fixed when the wait starts.
    waitFor: async (predicate, timeoutMs, message) => {
      const deadline = now + timeoutMs;
      while (now < deadline) {
        const value = await predicate();
        if (value) return value;
        now += 1000;
      }
      throw Error(message);
    },
  });
  assert.equal(result, opponent);
  assert.equal(clicks, 1);
});

test('native background setup still fails within the window when the app stops', async () => {
  let now = 0;
  await assert.rejects(
    waitForPendingOpponent({
      state: async () => ({ phase: 'between', actor: null, legal: { enabled: false } }),
      click: async () => assert.fail('A stalled deal offers no decision to click'),
      waitFor: async (predicate, timeoutMs, message) => {
        const deadline = now + timeoutMs;
        while (now < deadline) {
          if (await predicate()) return true;
          now += 1000;
        }
        throw Error(message);
      },
    }),
    /needs a pending opponent action/,
  );
  assert.equal(now, 15000);
});

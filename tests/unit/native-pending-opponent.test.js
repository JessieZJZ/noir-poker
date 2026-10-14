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

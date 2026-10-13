import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForPendingOpponent } from '../native/scenarios.mjs';

test('native background setup follows real hero decisions after missing a brief opponent turn', async () => {
  const opponent = { phase: 'playing', actor: 'River', legal: { enabled: false } };
  const states = [
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

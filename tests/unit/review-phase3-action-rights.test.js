import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingRaiseOpportunity, coversOpponentStacks } from '../../src/review/presentation.js';
const short = () => ({
  bigBlind: 100,
  chipUnit: 50,
  currentBet: 600,
  minRaise: 300,
  pending: [0, 1],
  players: [
    { id: 0, stack: 5000, bet: 450, total: 450, actedTo: 450 },
    { id: 1, stack: 5000, bet: 450, total: 450, actedTo: 450 },
    { id: 2, stack: 0, bet: 600, total: 600, allin: true, actedTo: 600 },
  ],
});
test('waiting for a short all-in response is distinct from a reopened raise right', () => {
  const s = short();
  assert.equal(pendingRaiseOpportunity(s), false);
  s.players[1].actedTo = null;
  assert.equal(pendingRaiseOpportunity(s), true);
  s.players[1].actedTo = 450;
  s.currentBet = 750;
  s.players[2].bet = 750;
  s.players[2].total = 750;
  assert.equal(pendingRaiseOpportunity(s), true);
});
test('missing legacy rule fields remain unknown rather than inventing a raise right', () => {
  const s = short();
  delete s.players[1].actedTo;
  assert.equal(pendingRaiseOpportunity(s), null);
  s.pending = [0];
  assert.equal(pendingRaiseOpportunity(s), false);
});
test('covering all rival street stack bounds does not require exhausting the actor', () => {
  const s = short();
  s.players[1].bet = 1000;
  s.players[1].stack = 3000;
  assert.equal(coversOpponentStacks(s, 4000), true);
  assert.equal(coversOpponentStacks(s, 3950), false);
  s.players[1].folded = true;
  assert.equal(coversOpponentStacks(s, 600), true);
});
test('raise-right facts do not inspect hidden cards, future deck or payouts', () => {
  const s = short();
  for (const field of ['deck', 'winners', 'payouts', 'futureDeck'])
    Object.defineProperty(s, field, {
      enumerable: true,
      get() {
        throw Error(field);
      },
    });
  for (const p of s.players)
    Object.defineProperty(p, 'hole', {
      enumerable: true,
      get() {
        throw Error('hidden cards');
      },
    });
  assert.equal(pendingRaiseOpportunity(s), false);
  assert.equal(coversOpponentStacks(s, 600), false);
});

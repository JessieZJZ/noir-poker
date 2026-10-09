import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  startHand,
  act,
  deckOfCards,
  legalActions,
  advanceStreet,
} from '../../src/engine/poker.js';
import { compareCandidateActions, candidateActions } from '../../src/review/counterfactual.js';
import { rangeWeight } from '../../src/review/equity.js';
const cards = (s) =>
  s
    .split(' ')
    .map((v) =>
      deckOfCards().find(
        (c) => c.rank === '23456789TJQKA'.indexOf(v[0]) + 2 && c.suit === 'shcd'.indexOf(v[1]),
      ),
    );
function snap() {
  const g = newGame();
  g.dealer = 2;
  startHand(g);
  act(g, 0, 'call');
  return g.decisions[0];
}
test('counterfactual simulation is deterministic, public-only, and does not mutate original state', () => {
  const s = snap(),
    saved = JSON.stringify(s);
  const a = compareCandidateActions(s, [], { trials: 6 });
  assert.equal(JSON.stringify(s), saved);
  for (const p of s.players)
    Object.defineProperty(p, 'hole', {
      enumerable: true,
      get() {
        throw Error('Hidden opponent hole read');
      },
    });
  for (const key of ['deck', 'opponents', 'outcome'])
    Object.defineProperty(s, key, {
      get() {
        throw Error('Future/trace/outcome read');
      },
    });
  assert.deepEqual(a, compareCandidateActions(s, [], { trials: 6 }));
  assert.equal(a.rows[0].action.action, 'fold');
  assert.ok(a.rows[0].scenarios.every((v) => v.ev === 0));
  assert.ok(
    a.rows.every((r) =>
      r.scenarios.every((v) => Number.isFinite(v.ev) && Number.isFinite(v.margin)),
    ),
  );
  assert.equal(a.comparisonReady, false);
  const actual = a.rows.find((r) => r.action.action === s.action);
  assert.ok(actual.scenarios.every((v) => v.vsActual.delta === 0 && !v.vsActual.informative));
  assert.ok(a.rows.every((r) => r.scenarios.every((v) => v.winRate >= 0 && v.winRate <= 1)));
});
test('candidate generation respects closed raising and capped short-stack calls', () => {
  const s = snap();
  s.legal.canRaise = false;
  s.legal.callAmount = 25;
  s.stack = 25;
  const actions = candidateActions(s, [{ action: 'raise', amount: 5000 }]);
  assert.ok(actions.every((a) => a.action !== 'raise'));
  assert.equal(actions.find((a) => a.action === 'call').amount, 25);
});
test('a previous flat caller is not treated as defending a later unanswered 3bet', () => {
  const s = snap(),
    p = s.players[1];
  const h = cards('Qs 7s');
  s.history = [
    { id: 2, street: 0, action: 'raise', amount: 150 },
    { id: 1, street: 0, action: 'call', amount: 125 },
  ];
  const before = rangeWeight(h, s, p);
  s.history.push({ id: 3, street: 0, action: 'raise', amount: 650 });
  assert.equal(rangeWeight(h, s, p), before);
  s.history.push({ id: 1, street: 0, action: 'call', amount: 500 });
  assert.ok(rangeWeight(h, s, p) < before);
});
test('an opener who actually calls a 3bet receives the later defense range', () => {
  const s = snap(),
    p = s.players[1],
    h = cards('Qs 7s');
  s.history = [{ id: 1, street: 0, action: 'raise', amount: 150 }];
  const before = rangeWeight(h, s, p);
  s.history.push(
    { id: 2, street: 0, action: 'raise', amount: 650 },
    { id: 1, street: 0, action: 'call', amount: 500 },
  );
  assert.ok(rangeWeight(h, s, p) < before);
});
test('river all-in counterfactual uses pot eligibility and a board royal flush splits exactly', () => {
  const g = newGame();
  g.dealer = 2;
  startHand(g);
  while (g.street < 3) {
    if (g.phase === 'between') advanceStreet(g);
    else act(g, g.actor, 'call');
  }
  g.board = cards('As Ks Qs Js Ts');
  g.players[0].hole = cards('2h 3h');
  while (g.actor !== 0) act(g, g.actor, 'check');
  act(g, 0, 'check');
  const s = g.decisions.at(-1);
  const result = compareCandidateActions(s, [], { trials: 30 });
  const row = result.rows.find((r) => r.action.action === 'check');
  // All players using the same royal board share the pot without invented hole-card advantage.
  assert.ok(row.scenarios.every((v) => v.ev === 50));
  assert.ok(row.scenarios.every((v) => v.winRate === 1));
  assert.equal(result.comparisonReady, true);
  assert.ok(
    result.rows[0].scenarios.every((v) => v.vsActual.delta === -50 && !v.vsActual.informative),
  );
});

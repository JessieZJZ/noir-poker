import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  newGame,
  startHand,
  act,
  deckOfCards,
  legalActions,
  advanceStreet,
  partitionPots,
} from '../../src/engine/poker.js';
import { compareCandidateActions, candidateActions } from '../../src/review/counterfactual.js';
import { rangeWeight } from '../../src/review/equity.js';
import { causalReraiseGame, heroValueGame } from '../fixtures/review-spots.js';
const cards = (s) =>
  s
    .split(' ')
    .map((v) =>
      deckOfCards().find(
        (c) => c.rank === '23456789TJQKA'.indexOf(v[0]) + 2 && c.suit === 'shcd'.indexOf(v[1]),
      ),
    );
function snap() {
  const g = newGame(undefined, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
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

test('review candidates quantize fractional raise proposals and exclude off-grid actuals', () => {
  const s = snap();
  s.street = 2;
  s.currentBet = 125;
  s.legal.minRaiseTo = 250;
  s.legal.maxRaiseTo = 5000;
  const actions = candidateActions(s, [
    { action: 'raise', amount: 313 },
    { action: 'raise', amount: 656 },
  ]);
  assert.ok(actions.some((a) => a.action === 'raise' && a.amount === 325));
  assert.ok(actions.every((a) => a.amount % 25 === 0));
  assert.ok(!actions.some((a) => a.amount === 313 || a.amount === 656));
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
  const g = newGame(undefined, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
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

// The reference keeps the original complete rollout without adding a testing
// switch to production. It imports the same rules and range model; only the
// early-stop guard is removed, so all rows and paired statistics can be compared.
const referenceSourceURL = new URL('../../src/review/counterfactual.js', import.meta.url);
const referenceSource = await readFile(referenceSourceURL, 'utf8');
const sharedCacheOption = '{ trials: 8, allInCache }';
assert.ok(referenceSource.includes(sharedCacheOption));
const uncachedSource = referenceSource
  .replace(sharedCacheOption, '{ trials: 8 }')
  .replace(/from '([^']+)'/g, (_, relative) => `from '${new URL(relative, referenceSourceURL)}'`);
const uncachedRollout = await import(
  'data:text/javascript;base64,' + Buffer.from(uncachedSource).toString('base64')
);

test('one sampled-deal cache preserves every range, candidate and paired statistic', () => {
  for (const s of [causalReraiseGame().decisions[0], heroValueGame('set-shove').decisions.at(-1)]) {
    const before = JSON.stringify(s);
    const cached = compareCandidateActions(s, [], { trials: 12 });
    assert.deepEqual(cached, uncachedRollout.compareCandidateActions(s, [], { trials: 12 }));
    assert.equal(cached.policyTrials, 8);
    assert.equal(JSON.stringify(s), before);
  }
});

const stopGuard = 'if (hasFinalFold(g)) break;';
assert.ok(referenceSource.includes(stopGuard), 'The reference must disable the fold shortcut');
const fullRolloutSource = referenceSource
  .replace(stopGuard, '')
  .replace(/from '([^']+)'/g, (_, relative) => `from '${new URL(relative, referenceSourceURL)}'`)
  .replace('const copy =', 'export const referenceSettlements = [];\nconst copy =')
  .replace(
    'act(g, 0, candidates[c].action, candidates[c].amount);',
    `const budget = g.players.reduce((sum, p) => sum + p.stack + p.total, 0);
        act(g, 0, candidates[c].action, candidates[c].amount);`,
  )
  .replace(
    'values[c].push(g.players[0].stack - s.stack);',
    `referenceSettlements.push({
          budget,
          stacks: g.players.map(p => p.stack),
          pots: g.pots.map(p => ({amount: p.amount, awards: p.awards})),
          refunds: g.refunds,
        });
        values[c].push(g.players[0].stack - s.stack);`,
  );
const fullRollout = await import(
  'data:text/javascript;base64,' + Buffer.from(fullRolloutSource).toString('base64')
);
function assertReferenceChips() {
  assert.ok(fullRollout.referenceSettlements.length);
  for (const state of fullRollout.referenceSettlements) {
    assert.equal(
      state.stacks.reduce((sum, value) => sum + value, 0),
      state.budget,
    );
    for (const value of [
      ...state.stacks,
      ...state.refunds.map((refund) => refund.amount),
      ...state.pots.flatMap((pot) => [pot.amount, ...pot.awards.map((award) => award.amount)]),
    ]) {
      assert.ok(Number.isInteger(value) && value >= 0);
      assert.equal(value % 25, 0);
    }
    for (const pot of state.pots)
      assert.equal(
        pot.awards.reduce((sum, award) => sum + award.amount, 0),
        pot.amount,
      );
  }
  fullRollout.referenceSettlements.length = 0;
}
function publicMultiwayDecisions() {
  const g = newGame(5, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  g.emotionMode = 'lively';
  g.players[1].botProfile = 'tan';
  startHand(g);
  g.players[0].hole = cards('6d 5h');
  for (const [id, action, amount] of [
    [3, 'fold', 0],
    [4, 'raise', 125],
    [0, 'call', 0],
    [1, 'call', 0],
    [2, 'fold', 0],
  ])
    act(g, id, action, amount);
  advanceStreet(g);
  g.board = cards('8c Jd 3c');
  for (const [id, action, amount] of [
    [1, 'check', 0],
    [4, 'check', 0],
    [0, 'raise', 50],
    [1, 'call', 0],
    [4, 'raise', 375],
    [0, 'fold', 0],
  ])
    act(g, id, action, amount);
  return g.decisions;
}
test('folded continuations preserve all complete-rollout estimates and paired comparisons', () => {
  for (const s of publicMultiwayDecisions()) {
    const saved = JSON.stringify(s);
    const reference = fullRollout.compareCandidateActions(s, [], { trials: 40 });
    assert.deepEqual(compareCandidateActions(s, [], { trials: 40 }), reference);
    assert.equal(JSON.stringify(s), saved);
    assert.equal(reference.trials, 40);
    assert.equal(reference.policyTrials, 8);
    assert.equal(reference.comparisonReady, true);
    assertReferenceChips();
  }
});
test('folded unmatched chips still settle, including a 25-chip odd award', () => {
  // An imported public snapshot can contain an unmatched contribution. Do not
  // confuse a fold's lost pot eligibility with losing the right to a refund.
  const g = newGame(5, { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 });
  Object.assign(g, {
    dealer: 0,
    hand: 1,
    street: 3,
    phase: 'playing',
    actor: 0,
    board: cards('As Ks Qs Js Ts'),
    currentBet: 0,
    minRaise: 50,
    pending: [0, 1, 2],
  });
  g.players.forEach((player, id) => {
    const total = [125, 75, 75, 0, 0][id];
    Object.assign(player, { total, stack: 5000 - total, folded: id > 2 });
  });
  g.players[0].hole = cards('2h 3h');
  assert.deepEqual(partitionPots(g).refunds, [{ id: 0, amount: 50 }]);
  act(g, 0, 'fold');
  const s = g.decisions[0];
  const reference = fullRollout.compareCandidateActions(s, [], { trials: 30 });
  const actual = compareCandidateActions(s, [], { trials: 30 });
  assert.deepEqual(actual, reference);
  assert.ok(actual.rows[0].scenarios.every((value) => value.ev === 50 && value.winRate === 0));
  assertReferenceChips();
  // Continuing opponents may match that excess. Returning the current refund
  // immediately would overstate the fold's value in this second public state.
  const continuation = JSON.parse(JSON.stringify(s));
  continuation.board = cards('8c Jd 3c 7h Kc');
  continuation.hole = cards('6d 5h');
  continuation.players[1].botProfile = 'tan';
  continuation.players[2].botProfile = 'peter';
  const changingRefund = compareCandidateActions(continuation, [], { trials: 30 });
  assert.deepEqual(
    changingRefund,
    fullRollout.compareCandidateActions(continuation, [], { trials: 30 }),
  );
  assert.ok(changingRefund.rows[0].scenarios.every((value) => value.ev > 0 && value.ev < 50));
  assertReferenceChips();
  while (g.phase !== 'done') {
    if (g.phase === 'between') advanceStreet(g);
    else act(g, g.actor, 'check');
  }
  assert.deepEqual(g.refunds, [{ id: 0, amount: 50 }]);
  assert.deepEqual(
    g.pots[0].awards.map(({ id, amount }) => ({ id, amount })),
    [
      { id: 1, amount: 125 },
      { id: 2, amount: 100 },
    ],
  );
  assert.equal(
    g.players.reduce((sum, player) => sum + player.stack, 0),
    25000,
  );
  assert.ok(g.players.every((player) => player.stack % 25 === 0));
});

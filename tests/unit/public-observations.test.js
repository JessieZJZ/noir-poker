import test from 'node:test';
import assert from 'node:assert/strict';
import {
  publicHandObservations,
  summarizePublicRead,
  observedRangeModel,
  observedRangeWeight,
  observedAggressiveLikelihood,
  sanitizePublicRead,
  observedResponseShift,
} from '../../src/engine/public-observations.js';
import {
  newGame,
  startHand,
  act,
  legalActions,
  advanceStreet,
  restartHand,
  configureStakes,
  botDecision,
} from '../../src/engine/poker.js';
import { stakesFromSmallBlind } from '../../src/engine/stakes.js';
import { coldShoveResponse, allInRandom } from '../fixtures/all-in-decisions.js';

const sample = (raise = true) => ({
  hands: 1,
  voluntaryHands: 1,
  raisingHands: +raise,
  largeRaiseHands: +raise,
  postActions: 4,
  postRaises: raise ? 4 : 0,
});

test('a settlement without an original public history does not invent observation samples', () => {
  assert.equal(publicHandObservations({ dealtIds: [0, 1], bigBlind: 200 }).size, 0);
  assert.equal(publicHandObservations({ dealtIds: [0, 1], history: null, bigBlind: 200 }).size, 0);
});

test('observed response shifts need paid-bet opportunities and stay bounded under extreme histories', () => {
  const base = { hands: 32, postActions: 128, facedPostBet: 64, foldedPostBet: 0 };
  assert.equal(observedResponseShift({ ...base, hands: 7 }), 0);
  assert.equal(observedResponseShift({ ...base, facedPostBet: 11 }), 0);
  assert.equal(observedResponseShift({ hands: 64, postActions: 500, facedPostBet: 0 }), 0);
  assert.ok(observedResponseShift(base) > 0);
  assert.ok(observedResponseShift({ ...base, foldedPostBet: 64 }) < 0);
  assert.equal(observedResponseShift({ ...base, foldedPostBet: 32 }), 0);
  assert.ok(Math.abs(observedResponseShift({ ...base, foldedPostBet: 999 })) <= 1.3);
  assert.ok(
    observedResponseShift({ ...base, result: 'lost', hole: 'AA' }) === observedResponseShift(base),
  );
});
test('visible action counters distinguish free checks, betting, calls and folds without cards or outcomes', () => {
  const input = {
    dealtIds: [0, 1, 2],
    bigBlind: 200,
    history: [
      { id: 0, street: 0, action: 'raise', amount: 2000 },
      { id: 1, street: 0, action: 'call', amount: 2000 },
      { id: 2, street: 0, action: 'fold', amount: 0 },
      { id: 0, street: 1, action: 'raise', amount: 500 },
      { id: 1, street: 1, action: 'call', amount: 500 },
      { id: 0, street: 2, action: 'check', amount: 0 },
      { id: 1, street: 2, action: 'raise', amount: 500 },
      { id: 0, street: 2, action: 'fold', amount: 0 },
    ],
  };
  const r = publicHandObservations(input);
  assert.equal(r.get(0).largeRaiseHands, 1);
  assert.equal(r.get(1).largeCallHands, 1);
  assert.equal(r.get(1).calledPostBet, 1);
  assert.equal(r.get(0).foldedPostBet, 1);
  assert.equal(r.get(0).postRaises, 1);
  assert.equal(r.get(2).voluntaryHands, 0);
  assert.deepEqual(
    publicHandObservations({
      ...input,
      deck: ['royal'],
      hole: ['AA'],
      winners: [2],
      profit: 10000,
    }),
    r,
  );
});
test('one unusual hand cannot overwrite the prior; repeated broad aggression changes the inferred range gradually', () => {
  assert.equal(
    observedRangeModel(summarizePublicRead([sample()]), { action: 'raise', allIn: true }),
    null,
  );
  const eight = observedRangeModel(summarizePublicRead(Array.from({ length: 8 }, () => sample())), {
    action: 'raise',
    allIn: true,
  });
  const many = observedRangeModel(summarizePublicRead(Array.from({ length: 64 }, () => sample())), {
    action: 'raise',
    allIn: true,
  });
  assert.ok(many.width > eight.width && many.confidence > eight.confidence);
  assert.ok(observedRangeWeight(0.6, 0.003, many) > observedRangeWeight(0.6, 0.003, eight));
  assert.ok(observedRangeWeight(0.01, 1, many) > observedRangeWeight(0.6, 0.003, many));
  assert.ok(
    observedAggressiveLikelihood(summarizePublicRead(Array.from({ length: 64 }, () => sample()))) >
      0,
  );
  assert.equal(
    observedAggressiveLikelihood(
      summarizePublicRead(Array.from({ length: 64 }, () => sample(false))),
    ),
    0,
  );
});
test('memory stays bounded, discards unknown fields and preserves small-sample uncertainty', () => {
  const r = summarizePublicRead([
    ...Array.from({ length: 64 }, () => sample(false)),
    ...Array.from({ length: 64 }, () => sample()),
  ]);
  assert.equal(r.hands, 64);
  assert.equal(r.raisingHands, 64);
  assert.deepEqual(sanitizePublicRead({ ...r, hole: ['As', 'Ah'], future: 'flush' }), r);
  assert.equal(sanitizePublicRead({ hands: NaN }), null);
  assert.equal(observedRangeWeight(0.5, 0.2, null), 0.2);
});

test('completed public evidence rolls back on retry exactly once and clears with a new stakes session', () => {
  const g = newGame(5);
  const finish = () => {
    let steps = 0;
    while (g.phase !== 'done') {
      assert.ok(++steps < 1000);
      if (g.phase === 'between') advanceStreet(g);
      else act(g, g.actor, legalActions(g).canCheck ? 'check' : 'fold');
    }
    assert.equal(
      g.players.reduce((n, p) => n + p.stack, 0),
      5 * g.stakes.startingStack,
    );
  };
  startHand(g);
  finish();
  assert.ok(g.players.every((p) => p.publicReads.length === 1));
  startHand(g);
  finish();
  assert.ok(g.players.every((p) => p.publicReads.length === 2));
  restartHand(g);
  assert.ok(g.players.every((p) => p.publicReads.length === 1));
  finish();
  assert.ok(g.players.every((p) => p.publicReads.length === 2));
  configureStakes(g, stakesFromSmallBlind(25));
  assert.ok(g.players.every((p) => p.publicReads.length === 0));
});

test('public evidence is invariant to chip scale and all hidden cards', () => {
  const input = {
    dealtIds: [0, 1],
    bigBlind: 200,
    history: [
      { id: 0, street: 0, action: 'raise', amount: 1800 },
      { id: 1, street: 0, action: 'call', amount: 1800 },
      { id: 0, street: 1, action: 'raise', amount: 1000 },
      { id: 1, street: 1, action: 'call', amount: 1000 },
    ],
  };
  const changed = {
    ...input,
    bigBlind: 2000,
    history: input.history.map((e) => ({ ...e, amount: e.amount * 10 })),
  };
  assert.deepEqual(publicHandObservations(input), publicHandObservations(changed));
});

test('the actual normal/hard policy defends strong hands against repeated shoves without blindly calling junk', () => {
  for (const difficulty of ['normal', 'hard']) {
    const unknown = coldShoveResponse('As Kd');
    unknown.difficulty = difficulty;
    const known = coldShoveResponse('As Kd');
    known.difficulty = difficulty;
    known.players[0].publicReads = Array.from({ length: 32 }, () => sample());
    const before = botDecision(unknown, allInRandom(73));
    const after = botDecision(known, allInRandom(73));
    assert.ok(after.trace.equity > before.trace.equity + 0.07);
    assert.equal(after.action, 'call');
    const junk = coldShoveResponse('7s 2h');
    junk.difficulty = difficulty;
    junk.players[0].publicReads = known.players[0].publicReads;
    assert.equal(botDecision(junk, allInRandom(73)).action, 'fold');
    const concealed = structuredClone(known);
    concealed.players[0].hole = [
      { rank: 2, suit: 0, key: '0-2' },
      { rank: 3, suit: 1, key: '1-3' },
    ];
    concealed.deck.reverse();
    const hidden = botDecision(concealed, allInRandom(73));
    assert.equal(hidden.action, after.action);
    assert.equal(hidden.trace.equity, after.trace.equity);
  }
  const easy = coldShoveResponse('As Kd');
  easy.difficulty = 'easy';
  easy.players[0].publicReads = Array.from({ length: 32 }, () => sample());
  assert.equal(botDecision(easy, allInRandom(73)).trace.view.opponents[0].publicRead, null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  startHand,
  act,
  advanceStreet,
  legalActions,
  restartHand,
  configureStakes,
  exportPlayerObservations,
  importPlayerObservations,
  publicReadForPlayer,
} from '../../src/engine/poker.js';
import {
  sanitizePlayerObservationProfile,
  observedRangeModel,
  observedAggressiveLikelihood,
} from '../../src/engine/public-observations.js';
import { stakesFromSmallBlind } from '../../src/engine/stakes.js';
import { createGameRecords, createMemorySnapshots } from '../../src/engine/game-records.js';

function complete(game) {
  let actions = 0;
  while (game.phase !== 'done') {
    assert.ok(++actions < 200);
    if (game.phase === 'between') advanceStreet(game);
    else act(game, game.actor, legalActions(game).canCheck ? 'check' : 'fold');
  }
  assert.equal(
    game.players.reduce((sum, p) => sum + p.stack, 0),
    game.players.length * game.stakes.startingStack,
  );
}

test('shared player profiles whitelist public counts and reject malformed versions or counters', () => {
  const input = {
    version: 1,
    revision: 80,
    totalHands: 80,
    samples: Array.from({ length: 80 }, () => ({
      hands: 1,
      raisingHands: 1,
      hole: ['As', 'Ah'],
      winner: true,
    })),
    deck: ['secret'],
    personality: 'loose',
  };
  const profile = sanitizePlayerObservationProfile(input);
  assert.equal(profile.samples.length, 64);
  assert.equal(profile.totalHands, 80);
  assert.equal(profile.revision, 80);
  assert.doesNotMatch(JSON.stringify(profile), /hole|winner|secret|personality/);
  for (const broken of [
    null,
    { ...input, version: 2 },
    { ...input, revision: NaN },
    { ...input, totalHands: -1 },
  ])
    assert.equal(sanitizePlayerObservationProfile(broken), null);
  input.samples[79].raisingHands = 0;
  assert.equal(profile.samples[63].raisingHands, 1);
});

test('one completed hand contributes cautious evidence while historical v1 keeps its recorded threshold', () => {
  const read = { hands: 1, raisingHands: 1, largeRaiseHands: 1, postActions: 1, postRaises: 1 };
  const first = observedRangeModel(read, { action: 'raise', allIn: true });
  assert.ok(first.confidence > 0 && first.confidence < 0.2);
  assert.equal(observedRangeModel(read, { action: 'raise', allIn: true, legacy: true }), null);
  assert.ok(observedAggressiveLikelihood(read) > 0);
  assert.ok(observedAggressiveLikelihood(read) < 0.02);
  assert.equal(observedAggressiveLikelihood(read, { legacy: true }), 0);
});

test('legacy or corrupted optional checkpoint counters cannot prevent a hand from completing', () => {
  const game = newGame(5);
  game.playerObservationRevision = 'broken';
  game.playerObservationHands = Infinity;
  game.players[0].publicReads = {};
  assert.deepEqual(exportPlayerObservations(game), {
    version: 1,
    revision: 0,
    totalHands: 0,
    samples: [],
  });
  importPlayerObservations(game, exportPlayerObservations(game));
  startHand(game);
  complete(game);
  assert.equal(exportPlayerObservations(game).totalHands, 1);
});

test('learning survives JSON and a new table without changing bot styles, moods or chips', () => {
  const game = newGame(9);
  startHand(game);
  complete(game);
  const profile = JSON.parse(JSON.stringify(exportPlayerObservations(game)));
  assert.equal(profile.totalHands, 1);
  const next = newGame(5);
  next.players[1].botProfile = 'jett';
  const identities = next.players.map((p) => [p.botProfile, p.botMood, p.stack]);
  assert.equal(importPlayerObservations(next, profile), true);
  assert.deepEqual(
    next.players.map((p) => [p.botProfile, p.botMood, p.stack]),
    identities,
  );
  assert.deepEqual(publicReadForPlayer(next, 0), publicReadForPlayer(game, 0));
  profile.samples[0].raisingHands = 1;
  assert.notEqual(next.players[0].publicReads[0].raisingHands, profile.samples[0].raisingHands);
});

test('unfinished actions are not duplicated into cross-hand priors or exported durable memory', () => {
  const game = newGame(5);
  startHand(game);
  while (game.phase === 'playing' && game.actor !== 0)
    act(game, game.actor, legalActions(game).canCheck ? 'check' : 'call');
  act(game, 0, 'raise', legalActions(game).minRaiseTo);
  assert.equal(publicReadForPlayer(game, 0), null);
  assert.equal(exportPlayerObservations(game).totalHands, 0);
  complete(game);
  assert.equal(publicReadForPlayer(game, 0).raisingHands, 1);
  assert.equal(exportPlayerObservations(game).totalHands, 1);
});

test('retry retracts one observation with a newer write revision and stakes changes retain it', () => {
  const game = newGame(5);
  startHand(game);
  complete(game);
  const first = exportPlayerObservations(game);
  restartHand(game);
  const retracted = exportPlayerObservations(game);
  assert.equal(retracted.totalHands, 0);
  assert.equal(retracted.samples.length, 0);
  assert.ok(retracted.revision > first.revision);
  assert.equal(importPlayerObservations(game, first), false);
  complete(game);
  const replayed = exportPlayerObservations(game);
  assert.equal(replayed.totalHands, 1);
  assert.ok(replayed.revision > retracted.revision);
  configureStakes(game, stakesFromSmallBlind(50000));
  assert.deepEqual(exportPlayerObservations(game), replayed);
  assert.equal(game.stats.hands, 0);
  assert.ok(game.players.slice(1).every((p) => p.publicReads.length === 0));
});

test('record checkpoints preserve lifetime observation counters even without the separate profile key', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const snapshots = createMemorySnapshots();
  let clock = 1000;
  const options = { storage, snapshots, now: () => clock++, id: () => 'profile-record' };
  const records = createGameRecords(options);
  const game = newGame(5);
  importPlayerObservations(game, {
    version: 1,
    revision: 300,
    totalHands: 240,
    samples: Array.from({ length: 64 }, () => ({ hands: 1, raisingHands: 1 })),
  });
  startHand(game);
  records.begin(game);
  complete(game);
  records.capture(game);
  const expected = exportPlayerObservations(game);
  assert.equal(expected.totalHands, 241);
  assert.equal(expected.samples.length, 64);
  assert.equal(expected.revision, 301);
  const resumed = createGameRecords(options).resume();
  assert.ok(resumed);
  assert.deepEqual(exportPlayerObservations(resumed), expected);
});

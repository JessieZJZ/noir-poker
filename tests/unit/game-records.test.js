import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  startHand,
  restartHand,
  act,
  advanceStreet,
  legalActions,
  potSize,
  completeBoardForPractice,
  playBotTurn,
} from '../../src/engine/poker.js';
import {
  createGameRecords,
  GAME_RECORDS_KEY,
  recordResult,
} from '../../src/engine/game-records.js';
import { createReviewInput } from '../../src/review/analysis.js';
import { createPreferenceStorage } from '../../src/platform/storage.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
function memory() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
function records(storage = memory()) {
  let time = 1000,
    identity = 0;
  return createGameRecords({ storage, now: () => time++, id: () => `test-${++identity}` });
}
function finish(game, action = 'call') {
  let steps = 0;
  while (game.phase !== 'done') {
    assert.ok(++steps < 1000);
    if (game.phase === 'between') advanceStreet(game);
    else act(game, game.actor, action);
  }
}
const stakes = { smallBlind: 125, bigBlind: 250 };

test('zero-investment folds are settled losses while zero-net pot winners remain wins', () => {
  const store = records(),
    game = newGame(5, stakes);
  game.dealer = 1;
  startHand(game);
  assert.equal(game.actor, 0);
  store.begin(game);
  assert.equal(recordResult(store.sessions()[0].attempts[0]), 'playing');
  finish(game, 'fold');
  const saved = store.capture(game);
  assert.equal(saved.snapshot.players[0].folded, true);
  assert.equal(saved.snapshot.players[0].total, 0);
  assert.equal(saved.profit, 0);
  assert.equal(saved.wonPot, false);
  assert.equal(recordResult(saved), 'loss');
  assert.equal(store.sessions()[0].wins, 0);
  assert.equal(store.sessions()[0].completed, 1);
  assert.equal(store.sessions()[0].profit, 0);
  assert.equal(recordResult({ status: 'completed', wonPot: true, profit: 0 }), 'win');
  assert.equal(recordResult({ status: 'unfinished', wonPot: true, profit: 100 }), 'unfinished');
});

test('settled records retain immutable cards, public decisions and pots without a future deck', () => {
  const storage = memory(),
    store = records(storage),
    game = newGame(6, stakes);
  startHand(game);
  const first = store.begin(game);
  finish(game);
  const saved = store.capture(game);
  assert.equal(store.capture(game), null);
  assert.equal(store.sessions()[0].completed, 1);
  assert.equal(store.sessions()[0].profit, saved.profit);
  assert.equal(saved.profit, game.payouts[0] - game.players[0].total);
  assert.deepEqual(createReviewInput(saved.snapshot), createReviewInput(game));
  assert.ok(!storage.getItem(GAME_RECORDS_KEY).includes('"deck"'));
  const original = clone(saved);
  game.players[0].hole[0].rank = 2;
  game.decisions[0].amount = 999;
  saved.snapshot.players[0].hole[0].rank = 3;
  store.sessions()[0].attempts[0].snapshot.board[0].rank = 4;
  assert.deepEqual(store.getAttempt(first.id), original);
  const reloaded = records(storage);
  assert.equal(reloaded.error(), null);
  assert.deepEqual(reloaded.getAttempt(first.id), original);
});

test('completed actor-perspective bot traces reopen and corrupted trace arrays are rejected', () => {
  const storage = memory(),
    store = records(storage),
    game = newGame(5, stakes);
  startHand(game);
  store.begin(game);
  let count = 0;
  while (game.phase !== 'done') {
    assert.ok(++count < 1000);
    if (game.phase === 'between') advanceStreet(game);
    else if (game.actor === 0) act(game, 0, 'fold');
    else playBotTurn(game);
  }
  store.capture(game);
  assert.ok(game.botDecisions.length > 0);
  const reloaded = records(storage);
  assert.equal(reloaded.error(), null);
  const saved = reloaded.sessions()[0].attempts[0];
  assert.deepEqual(createReviewInput(saved.snapshot), createReviewInput(game));
  const raw = JSON.parse(storage.getItem(GAME_RECORDS_KEY));
  raw.sessions[0].attempts[0].snapshot.botDecisions[0].trace.view.history = null;
  storage.setItem(GAME_RECORDS_KEY, JSON.stringify(raw));
  assert.match(records(storage).error(), /读取失败/);
});

test('practice runout updates only settled presentation while awards and review remain immutable', () => {
  const storage = memory(),
    store = records(storage),
    game = newGame(5, stakes);
  startHand(game);
  store.begin(game);
  finish(game, 'fold');
  const first = store.capture(game),
    originalReview = createReviewInput(first.snapshot);
  completeBoardForPractice(game);
  game.revealed = true;
  // A changed live object cannot revise the already recorded outcome.
  game.payouts[0] += 125;
  game.stats.hands += 10;
  const updated = store.capture(game);
  assert.equal(updated.snapshot.practiceBoard.length, 5);
  assert.equal(updated.snapshot.revealed, true);
  assert.deepEqual(updated.snapshot.payouts, first.snapshot.payouts);
  assert.deepEqual(updated.snapshot.stats, first.snapshot.stats);
  assert.equal(updated.profit, first.profit);
  assert.deepEqual(createReviewInput(updated.snapshot), originalReview);
  assert.equal(first.snapshot.practiceBoard, null);
  assert.equal(store.capture(game), null);
  assert.equal(records(storage).error(), null);
});

test('each retry is retained in order and its old settlement leaves statistics immediately', () => {
  const store = records(),
    game = newGame(5, stakes);
  startHand(game);
  store.begin(game);
  for (let attempt = 0; attempt < 4; attempt++) {
    finish(game, attempt % 2 ? 'call' : 'fold');
    store.capture(game);
    assert.equal(store.sessions()[0].completed, 1);
    if (attempt < 3) {
      restartHand(game);
      store.begin(game);
      const session = store.sessions()[0];
      assert.equal(session.completed, 0);
      assert.equal(session.profit, 0);
      assert.equal(session.wins, 0);
      assert.equal(session.attempts.filter((row) => row.superseded).length, attempt + 1);
    }
  }
  const session = store.sessions()[0];
  assert.deepEqual(
    session.attempts.map((row) => row.attempt),
    [0, 1, 2, 3],
  );
  assert.deepEqual(
    session.attempts.map((row) => row.hand),
    [1, 1, 1, 1],
  );
  assert.deepEqual(
    session.attempts.map((row) => row.superseded),
    [true, true, true, false],
  );
  assert.equal(session.completed, 1);
  assert.equal(session.profit, session.attempts[3].profit);
  assert.equal(game.stats.hands, 1);
});

test('abrupt reload during a retry marks it unfinished and keeps the original excluded', () => {
  const storage = memory(),
    store = records(storage),
    game = newGame(5, stakes);
  game.stats = { hands: 13, wins: 5, buyin: 50000 };
  startHand(game);
  const baseline = clone(game);
  store.begin(game);
  finish(game);
  store.capture(game);
  restartHand(game);
  store.begin(game);
  act(game, game.actor, 'call');
  const recoveredStore = records(storage),
    recovered = recoveredStore.resume();
  const session = recoveredStore.sessions()[0];
  assert.deepEqual(
    session.attempts.map((row) => row.status),
    ['completed', 'unfinished'],
  );
  assert.equal(session.attempts[0].superseded, true);
  assert.equal(session.attempts[1].profit, null);
  assert.equal(session.attempts[1].snapshot, null);
  assert.equal(session.completed, 0);
  assert.equal(session.profit, 0);
  assert.deepEqual(recovered.stats, baseline.stats);
  startHand(recovered);
  recoveredStore.begin(recovered);
  assert.equal(recovered.hand, 2);
  assert.equal(recoveredStore.sessionNumber(), 1);
});

test('crash recovery returns all wagers in a custom denomination and counts refill once', () => {
  const storage = memory(),
    store = records(storage),
    game = newGame(9, stakes);
  game.players.forEach((player, index) => (player.stack = index === 0 ? 0 : 1000 + index * 125));
  const totalBefore = game.players.reduce((sum, player) => sum + player.stack, 0);
  game.stats = { hands: 7, wins: 4, buyin: 25000 };
  startHand(game);
  const beforeBlindStacks = game.players.map((player) => player.stack + player.total);
  const statsBefore = clone(game.stats),
    hole = clone(game.players[0].hole);
  store.begin(game);
  while (game.phase === 'playing') act(game, game.actor, 'call');
  advanceStreet(game);
  const legal = legalActions(game);
  act(game, game.actor, 'raise', legal.minRaiseTo);
  act(game, game.actor, 'call');
  const restoredStore = records(storage),
    recovered = restoredStore.resume();
  assert.equal(restoredStore.sessions()[0].attempts[0].refill, true);
  assert.deepEqual(restoredStore.sessions()[0].attempts[0].hole, hole);
  assert.deepEqual(
    recovered.players.map((player) => player.stack),
    beforeBlindStacks,
  );
  assert.deepEqual(recovered.stats, statsBefore);
  assert.equal(potSize(recovered), 0);
  assert.equal(
    recovered.players.reduce((sum, player) => sum + player.stack, 0),
    totalBefore + 25000,
  );
  assert.ok(
    recovered.players.every((player) => player.stack % 125 === 0 && player.hole.length === 0),
  );
  assert.equal(recovered.phase, 'idle');
  assert.equal(recovered.hand, 1);
  assert.equal(recovered.dealer, game.dealer);
  assert.deepEqual(recovered.deck, []);
  const repeated = restoredStore.resume();
  assert.deepEqual(repeated, recovered);
  startHand(recovered);
  restoredStore.begin(recovered);
  assert.equal(recovered.hand, 2);
  assert.equal(recovered.stats.buyin, 50000);
  assert.equal(restoredStore.sessions()[0].attempts[1].refill, false);
});

test('short all-ins, refunds and side pots keep settled whole-chip conservation', () => {
  const storage = memory(),
    store = records(storage),
    game = newGame(9, stakes);
  game.players.forEach((player, index) => (player.stack = (index + 1) * 500));
  const total = game.players.reduce((sum, player) => sum + player.stack, 0);
  startHand(game);
  store.begin(game);
  while (game.phase === 'playing') {
    const legal = legalActions(game);
    act(game, game.actor, legal.canRaise ? 'raise' : 'call', legal.maxRaiseTo);
  }
  finish(game);
  store.capture(game);
  const saved = store.sessions()[0].attempts[0].snapshot;
  assert.equal(
    saved.players.reduce((sum, player) => sum + player.stack, 0),
    total,
  );
  assert.ok(saved.pots.length > 1);
  assert.ok(saved.refunds.length > 0);
  assert.ok(saved.payouts.every((value) => value % 125 === 0));
  const recovered = records(storage).resume();
  assert.equal(
    recovered.players.reduce((sum, player) => sum + player.stack, 0),
    total,
  );
});

test('completed reload starts the next hand in the same session and uses latest real statistics', () => {
  const storage = memory(),
    store = records(storage),
    game = newGame(5, stakes);
  game.stats = { hands: 9, wins: 3, buyin: 50000 };
  startHand(game);
  store.begin(game);
  finish(game);
  store.capture(game);
  const reloaded = records(storage),
    resumed = reloaded.resume();
  assert.deepEqual(resumed.stats, game.stats);
  assert.deepEqual(
    resumed.players.map((p) => p.stack),
    game.players.map((p) => p.stack),
  );
  startHand(resumed);
  reloaded.begin(resumed);
  assert.equal(reloaded.sessionNumber(), 1);
  assert.deepEqual(
    reloaded.sessions()[0].attempts.map((row) => row.hand),
    [1, 2],
  );
  assert.deepEqual(
    reloaded.sessions()[0].attempts.map((row) => row.status),
    ['completed', 'playing'],
  );
});

test('configuration changes create new sessions only after applied, using semantic stake equality', () => {
  const store = records(),
    game = newGame(5, stakes);
  startHand(game);
  store.begin(game);
  const pendingStakes = { smallBlind: 250, bigBlind: 500 };
  assert.equal(store.sessionNumber(), 1);
  finish(game);
  store.capture(game);
  startHand(game);
  game.stakes = { ...game.stakes, ignoredProperty: true };
  store.begin(game);
  assert.equal(store.sessionNumber(), 1);
  store.abandon(game);
  const configured = newGame(5, pendingStakes);
  startHand(configured);
  store.begin(configured);
  assert.equal(store.sessionNumber(), 2);
  const another = newGame(5, pendingStakes);
  startHand(another);
  store.begin(another, { newSession: true });
  assert.equal(store.sessionNumber(), 3);
  assert.deepEqual(
    store.sessions().map((session) => session.number),
    [3, 2, 1],
  );
  assert.ok(
    store
      .sessions()
      .slice(1)
      .every((session) => session.endedAt !== null),
  );
  assert.equal(store.sessions()[2].attempts[1].status, 'unfinished');
});

test('resetting a playing game retains an unfinished row with no fabricated outcome', () => {
  const store = records(),
    game = newGame();
  startHand(game);
  const first = store.begin(game);
  store.abandon(game);
  const unfinished = store.getAttempt(first.id);
  assert.equal(unfinished.status, 'unfinished');
  assert.equal(unfinished.profit, null);
  assert.equal(unfinished.wonPot, null);
  assert.equal(unfinished.snapshot, null);
  assert.equal(store.sessions()[0].completed, 0);
  const reset = newGame();
  startHand(reset);
  store.begin(reset, { newSession: true });
  assert.equal(store.sessionNumber(), 2);
});

test('corrupt or incompatible saved records never enter the engine or record view', () => {
  const storage = memory(),
    store = records(storage),
    game = newGame(5, stakes);
  startHand(game);
  store.begin(game);
  const playing = JSON.parse(storage.getItem(GAME_RECORDS_KEY));
  finish(game);
  store.capture(game);
  const completed = JSON.parse(storage.getItem(GAME_RECORDS_KEY));
  const broken = [
    'not-json',
    'null',
    JSON.stringify({ version: 2, sessions: [] }),
    ...[
      (value) => (value.nextNumber = 1),
      (value) => (value.sessions[0].playerCount = 100),
      (value) => (value.sessions[0].stakes.smallBlind = 26),
      (value) => (value.sessions[0].attempts[0].hole[0].rank = 100),
      (value) => (value.active.baseline.players[1].stack = 1),
      (value) => (value.active.baseline.stats = null),
      (value) => (value.active.baseline.players[1].botMood = null),
      (value) => (value.active.attemptId = 'missing'),
      (value) => value.sessions[0].attempts.push(clone(value.sessions[0].attempts[0])),
    ].map((mutate) => {
      const value = clone(playing);
      mutate(value);
      return JSON.stringify(value);
    }),
    ...[
      (value) => (value.sessions[0].startedAt = 9e15),
      (value) => (value.sessions[0].endedAt = 9e15),
      (value) => (value.sessions[0].attempts[0].startedAt = 9e15),
      (value) => (value.sessions[0].attempts[0].endedAt = 9e15),
      (value) => (value.sessions[0].attempts[0].snapshot.decisions[0].hole = []),
      (value) => (value.sessions[0].attempts[0].snapshot.deck = []),
      (value) => (value.sessions[0].attempts[0].snapshot.payouts[0] += 125),
      (value) => (value.sessions[0].attempts[0].snapshot.decisions[0].players[1].hole = []),
      (value) => (value.sessions[0].attempts[0].profit += 125),
      (value) => (value.sessions[0].attempts[0].snapshot.decisions[0].legal = null),
      (value) => (value.sessions[0].attempts[0].snapshot.decisions[0].pending = null),
      (value) => (value.sessions[0].attempts[0].snapshot.pots[0].awards = null),
      (value) => (value.sessions[0].attempts[0].snapshot.pots[0].contributions = null),
      (value) => (value.sessions[0].attempts[0].snapshot.pots[0].contributions[0].amount = 1),
    ].map((mutate) => {
      const value = clone(completed);
      mutate(value);
      return JSON.stringify(value);
    }),
  ];
  for (const invalid of broken) {
    storage.setItem(GAME_RECORDS_KEY, invalid);
    const restored = records(storage);
    assert.match(restored.error(), /读取失败/);
    assert.deepEqual(restored.sessions(), []);
    assert.equal(restored.resume(), null);
  }
});

test('blocked storage reports errors while local practice and in-memory records continue', () => {
  const storage = {
    getItem: () => {
      throw Error('denied');
    },
    setItem: () => {
      throw Error('quota');
    },
  };
  const store = records(storage),
    game = newGame();
  assert.match(store.error(), /读取失败/);
  assert.equal(store.resume(), null);
  startHand(game);
  store.begin(game);
  finish(game);
  store.capture(game);
  assert.equal(store.sessions()[0].completed, 1);
  assert.match(store.error(), /保存失败/);
});

test('native hydration includes records and exposes failed asynchronous writes', async () => {
  const web = memory(),
    native = new Map(),
    game = newGame();
  const initial = records(web);
  startHand(game);
  initial.begin(game);
  const storage = createPreferenceStorage(() => web);
  let fail = false;
  await storage.connect({
    get: async ({ key }) => ({ value: native.get(key) ?? null }),
    set: async ({ key, value }) => {
      if (fail) throw Error('native write failed');
      native.set(key, value);
    },
  });
  assert.equal(native.get(GAME_RECORDS_KEY), web.getItem(GAME_RECORDS_KEY));
  const store = records(storage);
  fail = true;
  store.resume();
  await storage.flush();
  assert.match(store.error(), /保存失败/);
  fail = false;
  store.resume();
  await storage.flush();
  assert.equal(storage.error(GAME_RECORDS_KEY), null);
});

test('capture ignores unregistered games and begin is idempotent for the active attempt', () => {
  const store = records(),
    game = newGame();
  assert.throws(() => store.begin(game), /发牌后/);
  startHand(game);
  const first = store.begin(game);
  assert.deepEqual(store.begin(game), first);
  assert.equal(store.sessions()[0].attempts.length, 1);
  const other = newGame();
  startHand(other);
  finish(other);
  // A done game with a different hand is rejected rather than inventing a row.
  other.hand = 100;
  assert.equal(store.capture(other), null);
  finish(game);
  store.capture(game);
  assert.equal(store.getAttempt('missing'), null);
});

test('record list summaries omit snapshots, stay isolated and invalidate only for record changes', () => {
  const store = records(),
    game = newGame(9, stakes);
  const initial = store.revision();
  startHand(game);
  store.begin(game);
  const playing = store.revision();
  assert.ok(playing > initial);
  store.begin(game);
  store.capture(game);
  assert.equal(
    store.revision(),
    playing,
    'Idempotent reads and live bot renders do not dirty the list',
  );
  finish(game);
  store.capture(game);
  const completed = store.revision();
  assert.ok(completed > playing);
  const summaries = store.summaries();
  assert.equal(summaries[0].completed, 1);
  assert.equal(Object.hasOwn(summaries[0].attempts[0], 'snapshot'), false);
  const full = store.sessions();
  assert.deepEqual(
    summaries,
    full.map((session) => ({
      ...session,
      attempts: session.attempts.map(({ snapshot, ...attempt }) => attempt),
    })),
  );
  assert.ok(JSON.stringify(summaries).length < JSON.stringify(full).length / 5);
  summaries[0].stakes.smallBlind = 1;
  summaries[0].attempts[0].hole[0].rank = 99;
  assert.deepEqual(store.summaries()[0].stakes, game.stakes);
  assert.deepEqual(store.summaries()[0].attempts[0].hole, game.players[0].hole);
  assert.ok(
    store.getAttempt(full[0].attempts[0].id).snapshot,
    'The full hand remains available on demand',
  );
  assert.equal(store.capture(game), null);
  assert.equal(store.revision(), completed);
  restartHand(game);
  store.begin(game);
  assert.ok(store.revision() > completed);
  assert.equal(store.summaries()[0].completed, 0);
  assert.equal(store.summaries()[0].attempts[0].superseded, true);
  finish(game);
  store.capture(game);
  assert.equal(store.summaries()[0].completed, 1);
});

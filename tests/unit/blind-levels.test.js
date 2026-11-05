import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  startHand,
  restartHand,
  act,
  advanceStreet,
  playBotTurn,
  rebuyHero,
  heroRebuysLeft,
  needsHeroRebuy,
  MAX_HERO_REBUYS,
} from '../../src/engine/poker.js';
import {
  blindLevels,
  blindCap,
  finalTableSeats,
  FINAL_TABLE_AVERAGE_BB,
  BLIND_LEVEL_MULTIPLIERS,
  tournamentStage,
  HANDS_PER_LEVEL,
} from '../../src/engine/blind-levels.js';
import { stakesFromSmallBlind, DEFAULT_STAKES } from '../../src/engine/stakes.js';
import { createGameRecords, createMemorySnapshots } from '../../src/engine/game-records.js';

const foldOut = (g) => {
  while (g.phase !== 'done') {
    if (g.phase === 'between') advanceStreet(g);
    else act(g, g.actor, 'fold');
  }
};
const stakes = (smallBlind) => stakesFromSmallBlind(smallBlind);

test('every level is a whole multiple of the starting small blind and the cap leaves the final table at least 20 BB', () => {
  for (const smallBlind of [25, 75, 100, 125, 50000])
    for (const seats of [5, 6, 7, 8, 9]) {
      const s = stakes(smallBlind),
        levels = blindLevels(s, seats),
        cap = blindCap(s, seats),
        average = (s.startingStack * seats) / finalTableSeats(seats);
      assert.deepEqual(levels[0], { smallBlind, bigBlind: smallBlind * 2 });
      for (const level of levels) {
        assert.equal(level.smallBlind % s.chipUnit, 0);
        assert.equal(level.bigBlind, level.smallBlind * 2);
      }
      assert.ok(average / cap.bigBlind >= FINAL_TABLE_AVERAGE_BB);
      const next = BLIND_LEVEL_MULTIPLIERS[levels.length];
      if (next) assert.ok(average / (s.bigBlind * next) < FINAL_TABLE_AVERAGE_BB);
    }
  // The cap scales with the starting blind and depends only on the seat count.
  const caps = [5, 6, 7, 8, 9].map((seats) => blindCap(DEFAULT_STAKES, seats).smallBlind);
  assert.deepEqual(caps, [1200, 1500, 1000, 1200, 1500]);
  assert.deepEqual([5, 6, 7, 8, 9].map(finalTableSeats), [2, 2, 3, 3, 3]);
});

test('blinds rise every 10 hands, announce once and stop at the cap', () => {
  const g = newGame(5);
  const seen = [];
  for (let hand = 1; hand <= 200; hand++) {
    startHand(g);
    if (g.notices.length) seen.push([g.hand, ...g.notices.map((n) => n.smallBlind ?? n.kind)]);
    assert.equal(g.players[g.dealer].out, false);
    const posted = g.players.reduce((sum, p) => sum + p.total, 0);
    assert.equal(posted, g.smallBlind + g.bigBlind);
    foldOut(g);
  }
  // Every level is 10 hands.
  assert.deepEqual(seen.slice(0, 3), [
    [11, 200],
    [21, 300],
    [31, 400],
  ]);
  assert.equal(g.smallBlind, blindCap(g.stakes, 5).smallBlind);
  assert.equal(seen.length, blindLevels(g.stakes, 5).length - 1);
});

test('a level lasts 10 hands whatever the seats left', () => {
  assert.equal(newGame(9).levelLength, HANDS_PER_LEVEL);
  assert.equal(newGame(5).levelLength, HANDS_PER_LEVEL);
  const g = newGame(9);
  for (const p of g.players.slice(5)) Object.assign(p, { out: true, stack: 0, place: 9 });
  g.levelHands = g.levelLength;
  startHand(g);
  assert.deepEqual(g.notices, [
    { kind: 'blind-level', level: 1, smallBlind: 200, bigBlind: 400, last: false },
  ]);
  assert.equal(g.levelLength, HANDS_PER_LEVEL);
  assert.equal(g.levelHands, 1);
});

test('the final table is announced before a level change on the same hand and refills close', () => {
  const g = newGame(7);
  for (const p of g.players.slice(3)) Object.assign(p, { out: true, stack: 0, place: 4 });
  g.levelHands = g.levelLength;
  startHand(g);
  assert.deepEqual(
    g.notices.map((n) => n.kind),
    ['final-table', 'blind-level'],
  );
  assert.equal(g.finalTable, true);
  assert.equal(heroRebuysLeft(g), 0);
  foldOut(g);
  startHand(g);
  assert.deepEqual(g.notices, []);
});

test('retry restores the hand’s level and notices without counting the hand twice', () => {
  const g = newGame(5);
  g.levelHands = g.levelLength;
  startHand(g);
  const level = { index: g.levelIndex, hands: g.levelHands, sb: g.smallBlind };
  assert.equal(g.notices.length, 1);
  foldOut(g);
  restartHand(g);
  assert.deepEqual({ index: g.levelIndex, hands: g.levelHands, sb: g.smallBlind }, level);
  assert.equal(g.notices.length, 1);
  foldOut(g);
  startHand(g);
  assert.equal(g.levelHands, level.hands + 1);
  assert.deepEqual(g.notices, []);
});

test('the hero may refill before the final table but is eliminated at it', () => {
  // Bubble of a five-seat game: three left, refills still open.
  const g = newGame(5);
  for (const p of g.players.slice(3)) Object.assign(p, { out: true, stack: 0, place: 4 });
  startHand(g);
  assert.equal(g.finalTable, false);
  foldOut(g);
  g.players[0].stack = 0;
  g.players[1].stack += 0;
  assert.ok(needsHeroRebuy(g));
  assert.equal(heroRebuysLeft(g), MAX_HERO_REBUYS);
  rebuyHero(g);
  // At the final table a hero who loses every chip leaves, refills unused.
  const f = newGame(5);
  for (const p of f.players.slice(2)) Object.assign(p, { out: true, stack: 0, place: 3 });
  startHand(f);
  assert.equal(f.finalTable, true);
  assert.throws(() => rebuyHero(f), /决赛圈/);
  // Shove everything; whoever loses ends the game.
  while (f.phase !== 'done') {
    if (f.phase === 'between') advanceStreet(f);
    else if (f.actor === 0) act(f, 0, 'raise', f.players[0].stack + f.players[0].bet);
    else act(f, f.actor, 'call');
  }
  assert.ok(f.over);
  assert.equal(f.players.filter((p) => !p.out).length, 1);
});

test('stages follow the seats left: bubble one seat before the final table, heads-up last', () => {
  assert.equal(tournamentStage(4, 9, false), 'bubble');
  assert.equal(tournamentStage(3, 9, true), 'final');
  assert.equal(tournamentStage(5, 9, false), 'early');
  assert.equal(tournamentStage(3, 6, false), 'bubble');
  assert.equal(tournamentStage(2, 6, true), 'heads-up');
});

test('records accept hands at every level, carry the level through recovery and reject other blinds', () => {
  const values = new Map(),
    storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
  const store = createGameRecords({ storage, snapshots: createMemorySnapshots() });
  const g = newGame(5);
  g.levelIndex = 3;
  g.levelHands = g.levelLength;
  startHand(g);
  store.begin(g);
  foldOut(g);
  const saved = store.capture(g);
  assert.ok(saved.snapshot);
  assert.equal(saved.snapshot.smallBlind, 600);
  const resumed = store.resume();
  assert.equal(resumed.smallBlind, 600);
  assert.equal(resumed.levelIndex, 4);
  assert.equal(resumed.levelHands, 1);
  // A hand whose blinds are not on the ladder is not a valid record.
  const raw = JSON.parse(values.get([...values.keys()][0]));
  raw.checkpoint.smallBlind = 700;
  raw.checkpoint.bigBlind = 1400;
  values.set([...values.keys()][0], JSON.stringify(raw));
  const reread = createGameRecords({ storage, snapshots: createMemorySnapshots() });
  assert.equal(reread.resume(), null);
});

test('full tournaments conserve chips in whole denomination chips at every level', () => {
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (const seats of [5, 7, 9]) {
    const g = newGame(seats, stakes(25));
    g.difficulty = 'easy';
    g.rebuys = MAX_HERO_REBUYS;
    let hands = 0;
    while (!g.over && hands++ < 400) {
      startHand(g);
      while (g.phase !== 'done') {
        if (g.phase === 'between') advanceStreet(g);
        else if (g.actor === 0) act(g, 0, random() < 0.3 ? 'call' : 'fold');
        else playBotTurn(g, random);
      }
      const chips = g.players.reduce((sum, p) => sum + p.stack, 0);
      assert.equal(chips, g.stakes.startingStack * seats);
      for (const p of g.players) assert.equal(p.stack % g.chipUnit, 0);
      for (const pot of g.pots)
        for (const award of pot.awards) assert.equal(award.amount % g.chipUnit, 0);
    }
  }
});

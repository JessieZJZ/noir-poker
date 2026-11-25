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
  deckOfCards,
} from '../../src/engine/poker.js';
import {
  blindLevels,
  blindCap,
  finalTableSeats,
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

test('every level is a whole multiple of the starting small blind and the cap leaves heads-up stacks averaging about 14 BB', () => {
  for (const smallBlind of [25, 75, 100, 125, 50000])
    for (const seats of [5, 6, 7, 8, 9]) {
      const s = stakes(smallBlind),
        levels = blindLevels(s, seats),
        cap = blindCap(s, seats),
        average = (s.startingStack * seats) / 2;
      assert.deepEqual(levels[0], { smallBlind, bigBlind: smallBlind * 2 });
      for (const level of levels) {
        assert.equal(level.smallBlind % s.chipUnit, 0);
        assert.equal(level.bigBlind, level.smallBlind * 2);
      }
      assert.deepEqual(
        levels.slice(0, 6).map((l) => l.smallBlind / smallBlind),
        [1, 2, 3, 4, 6, 10],
      );
      assert.equal(levels.length, 8);
      assert.ok(Math.abs(average / cap.bigBlind - 14) < 0.5);
      for (let i = 5; i < levels.length; i++)
        assert.ok(levels[i].bigBlind >= 1.3 * levels[i - 1].bigBlind);
    }
  // The cap scales with the starting blind and depends only on the seat count.
  const caps = [5, 6, 7, 8, 9].map((seats) => blindCap(DEFAULT_STAKES, seats).smallBlind);
  assert.deepEqual(caps, [1800, 2100, 2500, 2900, 3200]);
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
  g.players[1].stack += g.players[0].stack;
  g.players[0].stack = 0;
  assert.ok(needsHeroRebuy(g));
  assert.equal(heroRebuysLeft(g), MAX_HERO_REBUYS);
  const beforeRefill = g.players.reduce((sum, p) => sum + p.stack, 0);
  rebuyHero(g);
  assert.equal(g.rebuys, 1);
  assert.equal(
    g.players.reduce((sum, p) => sum + p.stack, 0),
    beforeRefill + g.players[0].stack,
  );
  // At the final table a hero who loses every chip leaves, refills unused.
  const f = newGame(5);
  for (const p of f.players.slice(2)) Object.assign(p, { out: true, stack: 0, place: 3 });
  const chips = f.players.reduce((sum, p) => sum + p.stack, 0);
  startHand(f);
  assert.equal(f.finalTable, true);
  assert.throws(() => rebuyHero(f), /决赛圈/);
  // A dry K-9-4-3-Q runout makes the hero's 7-2 lose to aces, never a split.
  const deck = deckOfCards(),
    card = (rank, suit) => deck.find((c) => c.rank === rank && c.suit === suit),
    board = [card(13, 2), card(9, 3), card(4, 0), card(3, 1), card(12, 2)];
  f.players[0].hole = [card(7, 2), card(2, 3)];
  f.players[1].hole = [card(14, 0), card(14, 1)];
  const used = new Set([...f.players.flatMap((p) => p.hole), ...board].map((c) => c.key)),
    rest = deck.filter((c) => !used.has(c.key)),
    burns = rest.splice(0, 3);
  // The engine pops one burn then the street's cards from the end of the deck.
  f.deck = [
    ...rest,
    board[4],
    burns[2],
    board[3],
    burns[1],
    board[2],
    board[1],
    board[0],
    burns[0],
  ];
  const completeDeal = [...f.players.flatMap((p) => p.hole), ...f.deck];
  assert.equal(completeDeal.length, 52);
  assert.equal(new Set(completeDeal.map((c) => c.key)).size, 52);
  while (f.phase !== 'done') {
    if (f.phase === 'between') advanceStreet(f);
    else if (f.actor === 0) act(f, 0, 'raise', f.players[0].stack + f.players[0].bet);
    else act(f, f.actor, 'call');
  }
  assert.deepEqual(f.board, board);
  assert.equal(f.showdown, true);
  assert.equal(f.potAtShowdown, chips);
  assert.deepEqual(
    f.winners.map((p) => p.id),
    [1],
  );
  assert.equal(f.players[0].stack, 0);
  assert.equal(f.players[0].out, true);
  assert.equal(f.rebuys, 0);
  assert.equal(heroRebuysLeft(f), 0);
  assert.equal(needsHeroRebuy(f), false);
  assert.throws(() => rebuyHero(f), /决赛圈/);
  assert.deepEqual(f.over, { heroPlace: 2, championId: 1 });
  assert.equal(f.players.filter((p) => !p.out).length, 1);
  assert.equal(
    f.players.reduce((sum, p) => sum + p.stack, 0),
    chips,
  );
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
  g.smallBlind = 400;
  g.bigBlind = 800;
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

test('archived hands, settled checkpoints and interrupted hands keep old blinds until the next rise', () => {
  for (const [seats, oldIndex, multiple, nextMultiple] of [
    [5, 5, 8, 10],
    [7, 6, 10, 16],
    [5, 7, 12, 13],
    [9, 8, 15, 18],
  ]) {
    const data = new Map(),
      snapshots = createMemorySnapshots();
    const open = () =>
      createGameRecords({
        storage: { getItem: (k) => data.get(k), setItem: (k, v) => data.set(k, v) },
        snapshots,
      });
    const store = open(),
      g = newGame(seats);
    Object.assign(g, {
      levelIndex: oldIndex,
      smallBlind: 100 * multiple,
      bigBlind: 200 * multiple,
      levelHands: 8,
    });
    startHand(g);
    store.begin(g);
    foldOut(g);
    const { id } = store.capture(g);
    const reloaded = open();
    assert.equal(reloaded.getAttempt(id).snapshot.smallBlind, 100 * multiple);
    const restored = reloaded.resume();
    startHand(restored);
    assert.equal(restored.levelHands, 10);
    assert.equal(restored.smallBlind, 100 * multiple);
    reloaded.begin(restored);
    const interrupted = open().resume();
    startHand(interrupted);
    assert.equal(interrupted.smallBlind, 100 * nextMultiple);
    assert.equal(interrupted.levelHands, 1);
    assert.deepEqual(interrupted.notices, [
      {
        kind: 'blind-level',
        level: blindLevels(g.stakes, seats).findIndex(
          (l) => l.smallBlind === interrupted.smallBlind,
        ),
        smallBlind: 100 * nextMultiple,
        bigBlind: 200 * nextMultiple,
        last: false,
      },
    ]);
  }
});

test('hand 71 posts the capped blinds, refunds the unmatched chips and conserves the heads-up bankroll', () => {
  for (const seats of [5, 6, 7, 8, 9]) {
    const g = newGame(seats, stakes(125)),
      levels = blindLevels(g.stakes, seats);
    const chips = seats * g.stakes.startingStack;
    const cap = levels.at(-1);
    // The BB is all-in for one chip less than the SB. Completing the call
    // to the nominal BB must refund everything above the short stack.
    g.players[1].stack = cap.smallBlind - g.chipUnit;
    g.players[0].stack = chips - g.players[1].stack;
    for (const p of g.players.slice(2)) Object.assign(p, { stack: 0, out: true, place: p.id + 1 });
    Object.assign(g, levels.at(-2), { hand: 70, levelHands: 10, levelIndex: levels.length - 2 });
    startHand(g);
    assert.equal(g.hand, 71);
    assert.equal(g.bigBlind, cap.bigBlind);
    assert.equal(g.notices.at(-1).last, true);
    assert.equal(g.players[0].bet, cap.smallBlind);
    assert.equal(g.players[1].bet, cap.smallBlind - g.chipUnit);
    const finish = () => {
      while (g.phase !== 'done') {
        if (g.phase === 'between') advanceStreet(g);
        else act(g, g.actor, 'call');
      }
      assert.equal(
        g.players.reduce((sum, p) => sum + p.stack, 0),
        chips,
      );
      assert.ok(g.players.every((p) => p.stack % g.chipUnit === 0));
      assert.equal(
        g.refunds.reduce((sum, r) => sum + r.amount, 0),
        cap.bigBlind - (cap.smallBlind - g.chipUnit),
      );
    };
    finish();
    restartHand(g);
    assert.equal(g.levelHands, 1);
    finish();
  }
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

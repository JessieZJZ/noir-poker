import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  startHand,
  restartHand,
  act,
  advanceStreet,
  legalActions,
  playBotTurn,
  seatPosition,
  rebuyHero,
  heroRebuysLeft,
  needsHeroRebuy,
  MAX_HERO_REBUYS,
  deckOfCards,
} from '../../src/engine/poker.js';
import { publicActionContext } from '../../src/engine/public-action-context.js';
import { isPremiumStart } from '../../src/engine/starting-hands.js';
import {
  createGameRecords,
  createMemorySnapshots,
  sessionStanding,
  standingLabel,
  GAME_RECORDS_KEY,
} from '../../src/engine/game-records.js';

const stakes = { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 };
const card = (rank, suit) => ({ rank, suit, symbol: '♠♥♣♦'[suit], key: `${suit}-${rank}` });
// Chips on the table: stacks plus live wagers (settled wagers are paid out).
const total = (g) =>
  g.players.reduce((sum, p) => sum + p.stack + (g.phase === 'done' ? 0 : p.total), 0);
// Rig the deal: given holes per seat and a dry K-9-4-3-Q board.
function rig(g, holes) {
  const board = [card(13, 2), card(9, 3), card(4, 0), card(3, 1), card(12, 2)],
    used = new Set([...Object.values(holes).flat(), ...board].map((c) => c.key)),
    rest = deckOfCards().filter((c) => !used.has(c.key));
  for (const p of g.players) if (!p.out) p.hole = holes[p.id] || [rest.pop(), rest.pop()];
  g.deck = [
    ...rest.slice(0, 10),
    board[4],
    rest[10],
    board[3],
    rest[11],
    board[2],
    board[1],
    board[0],
    rest[12],
  ];
}
// Every seat still able to act shoves or calls, except the folders; the
// rigged board decides.
function shoveAll(g, folders = []) {
  while (g.phase !== 'done') {
    if (g.phase === 'between') advanceStreet(g);
    else if (folders.includes(g.actor)) act(g, g.actor, 'fold');
    else {
      const legal = legalActions(g);
      act(g, g.actor, legal.canRaise ? 'raise' : 'call', legal.maxRaiseTo);
    }
  }
}
const aces = [card(14, 0), card(14, 1)],
  eights = [card(8, 0), card(8, 1)],
  weak = [card(7, 2), card(2, 3)],
  weaker = [card(6, 2), card(2, 1)];

test('busted bots leave the ring, rank by starting stack, and share a place on equal stacks', () => {
  const g = newGame(6, stakes);
  g.players.forEach((p, i) => (p.stack = [5000, 1000, 1000, 2000, 5000, 5000][i]));
  const chips = total(g);
  startHand(g);
  rig(g, { 0: aces, 1: weak, 2: weaker, 3: [card(8, 2), card(2, 0)] });
  // Seats 4 and 5 fold; seats 1-3 shove into the hero's aces.
  while (g.phase === 'playing') {
    const legal = legalActions(g);
    if (g.actor === 4 || g.actor === 5) act(g, g.actor, legal.canCheck ? 'check' : 'fold');
    else act(g, g.actor, legal.canRaise ? 'raise' : 'call', legal.maxRaiseTo);
  }
  shoveAll(g);
  assert.equal(total(g), chips);
  assert.deepEqual(
    g.players.map((p) => [p.out, p.place]),
    [
      [false, null],
      [true, 5],
      [true, 5],
      [true, 4],
      [false, null],
      [false, null],
    ],
  );
  assert.equal(g.over, null);
  startHand(g);
  // The button moves on to the next seat still playing.
  assert.equal(g.dealer, 4);
  for (const id of [1, 2, 3]) {
    assert.equal(g.players[id].folded, true);
    assert.deepEqual(g.players[id].hole, []);
    assert.equal(seatPosition(g, id), '');
    assert.ok(!g.pending.includes(id));
  }
  assert.deepEqual(
    [0, 4, 5].map((id) => seatPosition(g, id)),
    ['BB', 'BTN', 'SB'],
  );
  assert.equal(total(g), chips);
});

test('the hero refills at most three times, each refill is explicit and counted once', () => {
  const g = newGame(5, stakes);
  for (let refill = 1; refill <= MAX_HERO_REBUYS + 1; refill++) {
    g.players[0].stack = 0;
    g.phase = 'done';
    if (refill > MAX_HERO_REBUYS) {
      assert.equal(heroRebuysLeft(g), 0);
      assert.throws(() => rebuyHero(g), /用完/);
      break;
    }
    assert.equal(needsHeroRebuy(g), true);
    assert.throws(() => startHand(g), /补充筹码/);
    rebuyHero(g);
    assert.equal(g.players[0].stack, stakes.startingStack);
    assert.equal(g.stats.buyin, stakes.startingStack * (refill + 1));
    assert.equal(heroRebuysLeft(g), MAX_HERO_REBUYS - refill);
    startHand(g);
    assert.match(g.logs.find((l) => l.player === 0 && l.type === 'info').text, /补充 5K/);
    assert.throws(() => rebuyHero(g), /只有筹码输光/);
    g.players.forEach((p) => {
      p.stack += p.total;
      p.bet = p.total = 0;
    });
  }
});

test('busting after the last refill ends the game at once without a champion', () => {
  const g = newGame(5, stakes);
  g.rebuys = MAX_HERO_REBUYS;
  g.dealer = 4;
  startHand(g);
  rig(g, { 0: weak, 1: aces });
  shoveAll(g, [2, 3, 4]);
  assert.equal(g.players[0].out, true);
  assert.equal(g.players[0].stack, 0);
  // Four seats remained; the hero leaves fifth, the others are not simulated.
  assert.ok(g.over);
  assert.equal(g.over.championId, null);
  assert.equal(g.over.heroPlace, 5 - g.players.filter((p) => p.out && p.id).length);
  assert.throws(() => startHand(g), /本局已结束/);
});

test('the last seat left is crowned, heads-up or by clearing the table', () => {
  for (const heroWins of [true, false]) {
    const g = newGame(5, stakes);
    g.rebuys = MAX_HERO_REBUYS;
    for (const p of g.players.slice(2)) Object.assign(p, { out: true, stack: 0, place: 6 - p.id });
    g.players[0].stack = 10000;
    g.players[1].stack = 10000;
    const chips = total(g);
    startHand(g);
    rig(g, { 0: heroWins ? aces : weak, 1: heroWins ? weak : aces });
    shoveAll(g);
    assert.equal(total(g), chips);
    assert.deepEqual(g.over, {
      heroPlace: heroWins ? 1 : 2,
      championId: heroWins ? 0 : 1,
    });
    assert.equal(g.players[heroWins ? 0 : 1].place, 1);
  }
  // A bot takes the hero's last chips along with the other bot: it is crowned.
  const g = newGame(5, stakes);
  g.rebuys = MAX_HERO_REBUYS;
  for (const p of g.players.slice(3)) Object.assign(p, { out: true, stack: 0, place: 7 - p.id });
  startHand(g);
  rig(g, { 0: weak, 1: aces, 2: eights });
  shoveAll(g);
  assert.equal(g.players[2].out, true);
  // Equal starting stacks share second place.
  assert.equal(g.players[2].place, 2);
  assert.equal(g.players[1].place, 1);
  assert.deepEqual(g.over, { heroPlace: 2, championId: 1 });
});

test('four left, one hand clears the other three and decides the champion', () => {
  const fourLeft = (rebuys) => {
    const g = newGame(5, stakes);
    g.rebuys = rebuys;
    Object.assign(g.players[4], { out: true, stack: 0, place: 5 });
    [4000, 10000, 3000, 2000].forEach((stack, id) => (g.players[id].stack = stack));
    return g;
  };
  // The hero covers every bot and clears the table in one hand.
  let g = fourLeft(0);
  g.players[0].stack = 12000;
  let chips = total(g);
  startHand(g);
  rig(g, { 0: aces, 1: eights, 2: weak, 3: weaker });
  shoveAll(g);
  assert.equal(total(g), chips);
  // The others ranked by the stack they started the hand with.
  assert.deepEqual(
    g.players.slice(0, 4).map((p) => p.place),
    [1, 2, 3, 4],
  );
  assert.deepEqual(g.over, { heroPlace: 1, championId: 0 });
  // A bot takes everyone, the hero's last chips included: it is champion.
  g = fourLeft(MAX_HERO_REBUYS);
  chips = total(g);
  startHand(g);
  rig(g, { 1: aces, 0: eights, 2: weak, 3: weaker });
  shoveAll(g);
  assert.equal(total(g), chips);
  assert.equal(g.players[1].place, 1);
  // Seats bust with the hand's starting stacks: the hero started largest.
  assert.deepEqual(g.over, { heroPlace: 2, championId: 1 });
  // With a refill left the hero is not out: the game goes on heads-up.
  g = fourLeft(MAX_HERO_REBUYS - 1);
  startHand(g);
  rig(g, { 1: aces, 0: eights, 2: weak, 3: weaker });
  shoveAll(g);
  assert.equal(g.over, null);
  assert.equal(g.players[0].out, false);
  assert.ok(needsHeroRebuy(g));
  assert.deepEqual(
    g.players.filter((p) => !p.out).map((p) => p.id),
    [0, 1],
  );
});

test('heads-up the button posts the small blind, acts first preflop and last after the flop', () => {
  const g = newGame(5, stakes);
  for (const p of g.players.slice(2)) Object.assign(p, { out: true, stack: 0, place: 5 });
  g.dealer = 1;
  startHand(g);
  assert.equal(g.dealer, 0);
  assert.equal(seatPosition(g, 0), 'BTN');
  assert.equal(seatPosition(g, 1), 'BB');
  assert.equal(g.players[0].bet, stakes.smallBlind);
  assert.equal(g.players[1].bet, stakes.bigBlind);
  assert.equal(g.actor, 0);
  assert.deepEqual(publicActionContext(g, 0).roundOrderIds, [0, 1]);
  act(g, 0, 'call');
  act(g, 1, 'check');
  advanceStreet(g);
  assert.equal(g.actor, 1);
  assert.deepEqual(publicActionContext(g, 1).roundOrderIds, [1, 0]);
});

test('three-handed action skips eliminated seats from the right blind', () => {
  const g = newGame(6, stakes);
  for (const id of [1, 3, 4]) Object.assign(g.players[id], { out: true, stack: 0, place: 6 });
  g.dealer = 2;
  startHand(g);
  assert.equal(g.dealer, 5);
  assert.deepEqual(
    g.players.map((p) => seatPosition(g, p.id)),
    ['SB', '', 'BB', '', '', 'BTN'],
  );
  // Preflop the button acts first, right after the big blind.
  assert.equal(g.actor, 5);
  assert.deepEqual(publicActionContext(g, 5).roundOrderIds, [5, 0, 2]);
});

test('random full games conserve chips plus refills until they end', () => {
  for (let run = 0; run < 10; run++) {
    const g = newGame(5 + (run % 5), stakes),
      start = total(g);
    let hands = 0;
    while (!g.over && hands++ < (run % 2 ? 400 : 60)) {
      if (needsHeroRebuy(g)) rebuyHero(g);
      startHand(g);
      while (g.phase !== 'done') {
        if (g.phase === 'between') advanceStreet(g);
        else if (g.actor === 0 || run % 2) {
          // Shoves bust seats quickly; odd runs make every seat shove.
          const legal = legalActions(g);
          act(g, g.actor, legal.canRaise ? 'raise' : 'call', legal.maxRaiseTo);
        } else playBotTurn(g, Math.random, { trials: 4 });
      }
      assert.equal(total(g), start + g.rebuys * stakes.startingStack);
      assert.ok(g.players.every((p) => p.stack % stakes.chipUnit === 0));
    }
    if (run % 2) assert.ok(g.over, 'an all-shove table always ends');
    const places = g.players.filter((p) => p.out).map((p) => p.place);
    assert.ok(places.every((place) => place >= 1 && place <= g.players.length));
  }
});

test('retrying the deciding hand withdraws the result, eliminations and refills exactly once', () => {
  const g = newGame(5, stakes);
  g.rebuys = 2;
  for (const p of g.players.slice(2)) Object.assign(p, { out: true, stack: 0, place: 6 - p.id });
  startHand(g);
  rig(g, { 0: aces, 1: weak });
  const before = JSON.parse(JSON.stringify(g));
  shoveAll(g);
  assert.deepEqual(g.over, { heroPlace: 1, championId: 0 });
  restartHand(g);
  assert.equal(g.over, null);
  assert.equal(g.players[1].out, false);
  assert.equal(g.rebuys, 2);
  assert.deepEqual(
    g.players.map((p) => p.stack),
    before.players.map((p) => p.stack),
  );
});

test('premium starts are pairs, AK/AQ/AJ and suited AT, KQ, KJ, QJ, JT', () => {
  const combos = deckOfCards().flatMap((a, i, deck) => deck.slice(i + 1).map((b) => [a, b]));
  assert.equal(combos.length, 1326);
  assert.equal(combos.filter(isPremiumStart).length, 78 + 48 + 20);
  assert.equal(isPremiumStart([card(2, 0), card(2, 1)]), true);
  assert.equal(isPremiumStart([card(14, 0), card(11, 2)]), true);
  assert.equal(isPremiumStart([card(14, 0), card(10, 2)]), false);
  assert.equal(isPremiumStart([card(14, 0), card(10, 0)]), true);
  assert.equal(isPremiumStart([card(12, 3), card(11, 3)]), true);
  assert.equal(isPremiumStart([card(12, 3), card(11, 2)]), false);
  assert.equal(isPremiumStart([card(10, 3), card(9, 3)]), false);
});

function storage() {
  const values = new Map();
  return {
    snapshots: createMemorySnapshots(),
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
function playOne(store, g) {
  startHand(g);
  store.begin(g);
  while (g.phase !== 'done') {
    if (g.phase === 'between') advanceStreet(g);
    else act(g, g.actor, 'fold');
  }
  store.capture(g);
}

test('records carry the final standing and label games in progress, won and lost', () => {
  const store = createGameRecords({ storage: storage() });
  const g = newGame(5, stakes);
  playOne(store, g);
  assert.deepEqual(sessionStanding(store.summaries()[0]), {
    text: '进行中',
    className: 'standing-live',
  });
  g.rebuys = MAX_HERO_REBUYS;
  for (const p of g.players.slice(2)) Object.assign(p, { out: true, stack: 0, place: 6 - p.id });
  g.players[1].stack = 1000;
  startHand(g);
  store.begin(g);
  rig(g, { 0: aces, 1: weak });
  shoveAll(g);
  store.capture(g);
  assert.deepEqual(store.summaries()[0].result, { place: 1, champion: true });
  assert.deepEqual(sessionStanding(store.summaries()[0]), {
    text: '冠军',
    className: 'standing-champion',
  });
  assert.equal(standingLabel(3), '第3名');
  // Retrying the final hand reopens the game.
  restartHand(g);
  store.begin(g);
  assert.equal(store.summaries()[0].result, null);
});

test('snapshots beyond the budget drop the oldest games first, then the oldest hands', () => {
  const store = createGameRecords({ storage: storage(), budget: 1 });
  let g = newGame(5, stakes);
  playOne(store, g);
  playOne(store, g);
  assert.deepEqual(
    store.summaries()[0].attempts.map((a) => a.hand),
    [2],
    'The current game keeps its newest hand',
  );
  store.abandon(g);
  g = newGame(5, stakes);
  startHand(g);
  store.begin(g, { newSession: true });
  assert.equal(store.summaries().length, 2);
  while (g.phase !== 'done') {
    if (g.phase === 'between') advanceStreet(g);
    else act(g, g.actor, 'fold');
  }
  store.capture(g);
  const sessions = store.summaries();
  assert.equal(sessions.length, 1, 'The finished game was dropped for space');
  assert.equal(sessions[0].attempts.length, 1);
  assert.ok(store.getAttempt(sessions[0].attempts[0].id).snapshot);
  assert.equal(store.takeNotice(), null, 'Pruning for space is silent');
});

test('records in any other format start fresh with one notice and keep no inline snapshot', () => {
  const source = storage(),
    store = createGameRecords({ storage: source }),
    g = newGame(5, stakes);
  playOne(store, g);
  const other = JSON.parse(source.getItem(GAME_RECORDS_KEY));
  other.version = 1;
  for (const row of other.sessions[0].attempts) row.snapshot = store.getAttempt(row.id).snapshot;
  const target = storage();
  target.setItem(GAME_RECORDS_KEY, JSON.stringify(other));
  const fresh = createGameRecords({ storage: target, snapshots: target.snapshots });
  assert.equal(fresh.takeNotice(), '本机对局记录读取失败，已开始新的记录。');
  assert.equal(fresh.takeNotice(), null);
  assert.deepEqual(fresh.sessions(), []);
  playOne(fresh, newGame(5, stakes));
  const saved = JSON.parse(target.getItem(GAME_RECORDS_KEY));
  assert.equal(saved.sessions.length, 1);
  assert.ok(saved.sessions.every((session) => session.attempts.every((a) => !('snapshot' in a))));
});

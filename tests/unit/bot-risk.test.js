import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deckOfCards,
  evaluate,
  newGame,
  startHand,
  botDecision,
  act,
  advanceStreet,
  potSize,
  applyBotSettings,
} from '../../src/engine/poker.js';
import {
  chooseBotAction,
  botBoardFeatures,
  getBotProfile,
  freshBotMood,
} from '../../src/engine/bot-profiles.js';

const deck = deckOfCards();
const cards = (text) =>
  text
    .split(' ')
    .map((key) =>
      deck.find(
        (c) => c.rank === '23456789TJQKA'.indexOf(key[0]) + 2 && c.suit === 'shcd'.indexOf(key[1]),
      ),
    );
const seeded = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
function view(hole = '5s 4s', board = '', overrides = {}) {
  const own = cards(hole),
    publicCards = board ? cards(board) : [];
  return {
    bigBlind: 50,
    chipUnit: 25,
    id: 1,
    hole: own,
    board: publicCards,
    street: publicCards.length ? 1 : 0,
    position: 'BTN',
    inPosition: true,
    count: 9,
    stack: 5000,
    bet: 0,
    pot: 75,
    currentBet: 50,
    contestable: 125,
    rivals: 8,
    equity: 0.05,
    difficulty: 'hard',
    playsBoard: false,
    history: [],
    opponents: [{ id: 0, stack: 5000, bet: 50, allin: false }],
    features: botBoardFeatures(own, publicCards, evaluate([...own, ...publicCards]).score),
    legal: {
      chipUnit: 25,
      enabled: true,
      canCheck: false,
      canRaise: true,
      toCall: 50,
      callAmount: 50,
      minRaiseTo: 100,
      maxRaiseTo: 5000,
    },
    ...overrides,
  };
}
const decide = (input, random = () => 0.1, profile = 'balanced') =>
  chooseBotAction(input, getBotProfile(profile), freshBotMood(), 'off', random);

test('styles without first-in discipline retain speculative calls and steals without a mandatory raise', () => {
  // The loose style opens by limping or raising; tight styles raise or fold.
  const mixed = (input, random = () => 0.1) => decide(input, random, 'jett');
  for (const hole of ['5s 4s', '8s 6s', '6s 6h', 'As 4s']) {
    const input = view(hole);
    assert.equal(mixed(input).action, 'raise', hole);
    const passive = mixed(input, () => 0.9);
    assert.equal(passive.action, 'call', hole);
    assert.equal(passive.trace.affordableRangePassed, true);
  }
  const sample = Array.from({ length: 500 }, (_, seed) => mixed(view(), seeded(seed + 100)));
  const raises = sample.filter((d) => d.action === 'raise').length;
  assert.ok(raises > 30 && raises < 250, `Actual sampled late steals: ${raises}/500`);
  assert.equal(sample.filter((d) => d.action === 'fold').length, 0);
  assert.equal(mixed(view('7s 2h'), () => 0.9).action, 'fold');
  // Steals are a late-seat line; early seats only enter with a real hand.
  assert.equal(mixed(view('5s 4s', '', { position: 'UTG' })).trace.lateSteal, false);
  assert.equal(mixed(view('9s 3h', '', { position: 'UTG' }), () => 0.9).action, 'fold');
  assert.equal(
    mixed(view('5s 4s', '', { history: [{ id: 0, street: 0, action: 'call', amount: 50 }] })).trace
      .lateSteal,
    false,
  );
});

test('priced flush and open-ended draws survive small bets and can semi-bluff before equity folding', () => {
  for (const [hole, board, outs] of [
    ['As 6s', 'Ks 8s 2h', 9],
    ['8s 7h', '6d 5c Kh', 8],
  ]) {
    const input = view(hole, board, { rivals: 1, pot: 400, contestable: 500 });
    const continued = decide(input, () => 0.9);
    assert.equal(continued.action, 'call');
    assert.equal(continued.trace.drawContinue, true);
    assert.ok(continued.trace.drawChance <= outs / 47);
    const raised = decide(input);
    assert.equal(raised.action, 'raise');
    assert.equal(raised.trace.reason, 'semi-bluff');
    assert.equal(raised.amount % 25, 0);
    assert.ok(!raised.trace.checks.some((c) => c.code === 'insufficient-equity'));
  }
  const gutshot = view('8s 6h', '5d 4c Kh', { rivals: 1, pot: 400, contestable: 500 });
  assert.equal(gutshot.features.straightOuts, 4);
  assert.equal(
    decide(gutshot, () => 0.9).action,
    'fold',
    'One-card gutter does not inherit eight outs',
  );
});

test('bluffs depend on price, position and public story; missed attacks do not flat-call air', () => {
  const input = view('Qs Js', 'Ah 7c 2d', { rivals: 1, pot: 400, contestable: 500 });
  assert.equal(decide(input).trace.reason, 'pure-bluff');
  // A chosen bluff that the hand's bluff budget cannot fund folds rather
  // than flat-calling with air.
  const missed = decide({ ...input, total: 2000 });
  assert.equal(missed.action, 'fold');
  assert.equal(missed.trace.pureBluff, true);
  for (const overrides of [
    { rivals: 4 },
    { opponents: [{ id: 0, stack: 0, bet: 1000, allin: true }] },
    { legal: { ...input.legal, toCall: 1000, callAmount: 1000 }, contestable: 2000 },
    { features: { ...input.features, wet: true } },
  ])
    assert.equal(decide({ ...input, ...overrides }, () => 0.9).action, 'fold');
  assert.equal(decide({ ...input, legal: { ...input.legal, canRaise: false } }).action, 'fold');
});

test('all styles retain legal whole-chip bets, conservation and no hidden-card policy input', () => {
  for (const count of [5, 6, 9]) {
    const game = newGame(count, {
        smallBlind: 25,
        bigBlind: 50,
        startingStack: 5000,
        chipUnit: 25,
      }),
      random = seeded(421 + count);
    applyBotSettings(game, {
      emotionMode: 'off',
      assignments: Object.fromEntries(
        Array.from({ length: count - 1 }, (_, i) => [
          i + 1,
          ['balanced', 'rook', 'jett', 'owen', 'vale', 'nico', 'mira', 'iris'][i % 8],
        ]),
      ),
    });
    for (let hand = 0; hand < 8; hand++) {
      game.players.forEach((p) => (p.stack = 5000));
      startHand(game);
      let turns = 0;
      while (game.phase !== 'done') {
        assert.ok(++turns < 500);
        if (game.phase === 'between') advanceStreet(game);
        else {
          const d = botDecision(game, random);
          assert.ok(!('deck' in d.trace.view));
          assert.ok(d.trace.view.opponents.every((p) => !('hole' in p)));
          if (d.amount !== undefined) assert.equal(d.amount % 25, 0);
          act(game, game.actor, d.action, d.amount);
        }
        assert.equal(
          game.players.reduce((sum, p) => sum + p.stack, 0) +
            (game.phase === 'done' ? 0 : potSize(game)),
          count * 5000,
        );
        for (const p of game.players)
          for (const amount of [p.stack, p.bet, p.total]) assert.equal(amount % 25, 0);
      }
    }
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame,
  configureStakes,
  startHand,
  act,
  advanceStreet,
  legalActions,
  potSize,
  settle,
  restartHand,
  botDecision,
  deckOfCards,
} from '../../src/engine/poker.js';
import { DEFAULT_STAKES, validateStakes } from '../../src/engine/stakes.js';
import { compactChips, compactActionAmounts } from '../../src/engine/chip-format.js';
import { fractionRaiseTo } from '../../src/engine/bet-sizing.js';
import { preflopContext } from '../../src/review/preflop.js';
import { candidateActions } from '../../src/review/counterfactual.js';
import { createWechatController } from '../../src/platform/wechat-controller.js';
const configurations = [
  DEFAULT_STAKES,
  { smallBlind: 25, bigBlind: 50, startingStack: 5000, chipUnit: 25 },
  { smallBlind: 25, bigBlind: 75, startingStack: 7500, chipUnit: 25 },
  { smallBlind: 500, bigBlind: 1000, startingStack: 100000, chipUnit: 500 },
];
const wealth = (g) =>
  g.players.reduce((sum, p) => sum + p.stack, 0) + (g.phase === 'done' ? 0 : potSize(g));
const finish = (g) => {
  let steps = 0;
  while (g.phase !== 'done') {
    assert.ok(++steps < 200);
    if (g.phase === 'between') advanceStreet(g);
    else act(g, g.actor, legalActions(g).canCheck ? 'check' : 'call');
  }
};
for (const stakes of configurations) {
  test(`blinds ${stakes.smallBlind}/${stakes.bigBlind}, unit ${stakes.chipUnit}: legal floors, snapshots, bots, settlement and retry conserve chips`, () => {
    const g = newGame(5, stakes);
    g.dealer = 1;
    startHand(g);
    assert.equal(g.players[3].bet, stakes.smallBlind);
    assert.equal(g.players[4].bet, stakes.bigBlind);
    assert.equal(g.actor, 0);
    assert.equal(legalActions(g).fullRaiseTo, 2 * stakes.bigBlind);
    const initial = JSON.stringify(g);
    const money = wealth(g);
    assert.throws(() => act(g, 0, 'raise', stakes.bigBlind), /合法/);
    assert.equal(JSON.stringify(g), initial);
    act(g, 0, 'raise', 2 * stakes.bigBlind);
    const snapshot = g.decisions[0];
    assert.equal(snapshot.bigBlind, stakes.bigBlind);
    assert.equal(snapshot.chipUnit, stakes.chipUnit);
    assert.equal(preflopContext(snapshot).unopened, true);
    assert.deepEqual(
      candidateActions(snapshot)
        .filter((a) => a.action === 'raise')
        .map((a) => a.amount),
      [2 * stakes.bigBlind, 3 * stakes.bigBlind],
    );
    const d = botDecision(g, () => 0.8, { trials: 2 });
    assert.equal(d.trace.view.bigBlind, stakes.bigBlind);
    assert.equal(d.trace.view.legal.chipUnit, stakes.chipUnit);
    finish(g);
    assert.equal(wealth(g), money);
    assert.equal(g.stats.hands, 1);
    for (const n of [
      ...g.payouts,
      ...g.refunds.map((r) => r.amount),
      ...g.pots.flatMap((p) => [p.amount, ...p.awards.map((a) => a.amount)]),
    ])
      assert.equal(n % stakes.chipUnit, 0);
    restartHand(g);
    assert.equal(JSON.stringify(g.players), JSON.stringify(JSON.parse(initial).players));
    assert.equal(g.bigBlind, stakes.bigBlind);
    assert.equal(g.chipUnit, stakes.chipUnit);
    assert.equal(g.stats.hands, 0);
    assert.equal(wealth(g), money);
    while (g.phase === 'playing') act(g, g.actor, 'call');
    advanceStreet(g);
    assert.equal(legalActions(g).fullRaiseTo, stakes.bigBlind);
  });
  test(`unit ${stakes.chipUnit}: short all-in does not reopen, uncalled bets are refunded`, () => {
    const g = newGame(5, stakes);
    g.dealer = 1;
    g.players[1].stack = 2 * stakes.bigBlind + stakes.chipUnit;
    const money = wealth(g);
    startHand(g);
    act(g, 0, 'raise', 2 * stakes.bigBlind);
    act(g, 1, 'raise', 2 * stakes.bigBlind + stakes.chipUnit);
    for (let id = 2; id < 5; id++) act(g, id, 'fold');
    assert.equal(legalActions(g).raiseReopened, false);
    act(g, 0, 'call');
    finish(g);
    assert.equal(wealth(g), money);
    const refundGame = newGame(5, stakes);
    refundGame.dealer = 1;
    startHand(refundGame);
    const refundMoney = wealth(refundGame);
    act(refundGame, 0, 'raise', 3 * stakes.bigBlind);
    while (refundGame.phase === 'playing') act(refundGame, refundGame.actor, 'fold');
    assert.ok(refundGame.refunds.some((r) => r.id === 0 && r.amount === 2 * stakes.bigBlind));
    assert.equal(wealth(refundGame), refundMoney);
  });
  test(`unit ${stakes.chipUnit}: tied pots allocate whole odd chips clockwise`, () => {
    const g = newGame(5, stakes);
    g.phase = 'between';
    g.street = 3;
    g.dealer = 0;
    const cards = deckOfCards();
    g.board = [10, 11, 12, 13, 14].map((rank) =>
      cards.find((c) => c.rank === rank && c.suit === 0),
    );
    g.players.forEach((p, id) => {
      p.total = (id < 3 ? 3 : id === 3 ? 1 : 0) * stakes.chipUnit;
      p.stack -= p.total;
      p.folded = id >= 3;
      p.hole = [
        cards.find((c) => c.rank === id + 2 && c.suit === 1),
        cards.find((c) => c.rank === id + 2 && c.suit === 2),
      ];
    });
    const money = wealth(g);
    settle(g);
    assert.equal(wealth(g), money);
    assert.deepEqual(
      g.payouts.slice(0, 3),
      [3, 4, 3].map((n) => n * stakes.chipUnit),
    );
  });
}
test('configuration is copied, validates before mutation, and rebuy uses configured starting stack', () => {
  const value = { ...DEFAULT_STAKES };
  const g = newGame(5, value);
  value.bigBlind = 1000;
  assert.equal(g.bigBlind, 200);
  for (const invalid of [
    { chipUnit: 0 },
    { smallBlind: 110 },
    { bigBlind: 100 },
    { startingStack: 15100.5 },
    { startingStack: 100 },
  ])
    assert.throws(() => validateStakes({ ...DEFAULT_STAKES, ...invalid }));
  g.players[0].stack = 0;
  startHand(g);
  assert.equal(g.stats.buyin, 40000);
  assert.equal(g.players[0].stack, 20000);
});
test('fraction rounding reads the denomination and display preserves every chip at K/M boundaries', () => {
  assert.equal(
    fractionRaiseTo({ currentBet: 200, pot: 300, callAmount: 200, chipUnit: 100 }, 0.5),
    500,
  );
  assert.equal(fractionRaiseTo({ currentBet: 7, pot: 13, callAmount: 7, chipUnit: 1 }, 0.5), 17);
  for (const [n, s] of [
    [999, '999'],
    [1000, '1K'],
    [1100, '1.1K'],
    [15000, '15K'],
    [999900, '999.9K'],
    [1000000, '1M'],
    [1000100, '1.0001M'],
    [-15000, '-15K'],
  ])
    assert.equal(compactChips(n), s);
  assert.equal(compactChips(1100, 'de'), '1,1K');
  assert.equal(compactActionAmounts('你 2-bet 全下至 15000'), '你 2-bet 全下至 15K');
  assert.equal(
    compactActionAmounts('Kai 小盲 500000 · River 大盲 1000000'),
    'Kai 小盲 500K · River 大盲 1M',
  );
});
test('stakes changes immediately rebuild Web engine and WeChat session, rejecting stale callbacks and retry state', () => {
  const jobs = new Map();
  let sequence = 0;
  const c = createWechatController({
    publish() {},
    storage: { getItem: () => null },
    schedule: (fn) => {
      jobs.set(++sequence, fn);
      return sequence;
    },
    unschedule: (id) => jobs.delete(id),
  });
  c.start();
  const old = c.getGame();
  assert.deepEqual(old.stakes, DEFAULT_STAKES);
  while (old.phase === 'playing') act(old, old.actor, 'fold');
  assert.equal(old.stats.hands, 1);
  const stale = [...jobs.values()];
  const custom = { smallBlind: 25, bigBlind: 75 };
  assert.equal(c.setStakes(custom), true);
  const game = c.getGame();
  assert.deepEqual(game.stakes, { ...custom, startingStack: 7500, chipUnit: 25 });
  assert.equal(game.stats.hands, 0);
  assert.equal(game.stats.wins, 0);
  assert.equal(game.stats.buyin, 7500);
  assert.equal(game.hand, 1);
  assert.equal(c.retry(), false);
  const snapshot = JSON.stringify(game);
  for (const callback of stale) callback();
  assert.equal(JSON.stringify(game), snapshot);
  assert.equal(c.setStakes(custom), false);
  assert.equal(c.setStakes({ smallBlind: 30, bigBlind: 60 }), false);
  assert.equal(JSON.stringify(game), snapshot);
  c.destroy();
  const g = newGame();
  startHand(g);
  act(g, g.actor, 'call');
  assert.equal(configureStakes(g, custom), true);
  assert.equal(g.phase, 'idle');
  assert.equal(g.hand, 0);
  assert.equal(g.stats.hands, 0);
  assert.equal(g.stats.buyin, 7500);
  assert.ok(g.players.every((p) => p.stack === 7500 && p.bet === 0 && p.total === 0));
  assert.equal(g.decisions, undefined);
});

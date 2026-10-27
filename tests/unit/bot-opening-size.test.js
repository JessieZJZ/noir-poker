import test from 'node:test';
import assert from 'node:assert/strict';
import { botOpeningSize, botReraiseSize } from '../../src/engine/bot-opening-size.js';
import { legalRaiseTo } from '../../src/engine/bet-sizing.js';
import { chooseBotAction, getBotProfile, freshBotMood } from '../../src/engine/bot-profiles.js';
import { resolveBotStyle } from '../../src/engine/bot-style.js';
import { stakesFromSmallBlind } from '../../src/engine/stakes.js';
import { deceptiveView } from '../fixtures/deceptive-decisions.js';
import {
  newGame,
  startHand,
  seatPosition,
  botDecision,
  act,
  legalActions,
} from '../../src/engine/poker.js';

const decide = (view, profile = getBotProfile('balanced')) =>
  chooseBotAction(view, profile, freshBotMood(), 'off', () => 0.4);

test('deep value hands open larger with overlapping bands rather than an AA-only size', () => {
  for (const count of [5, 6, 7, 8, 9]) {
    for (const position of ['UTG', 'HJ', 'CO', 'BTN', 'SB']) {
      const amounts = ['As Ah', 'Ks Kh', 'Qs Qh', 'As Ks', 'Ts Th'].map((hole) => {
        const view = deceptiveView(hole, '', { count, position, equity: 0.65 });
        const d = decide(view);
        assert.equal(d.action, 'raise');
        assert.equal(d.trace.sizing.openingPlan.limpers, 0);
        return d.amount;
      });
      const premium = ['CO', 'BTN'].includes(position) ? 300 : 325;
      assert.deepEqual(amounts, [premium, premium, premium, premium, premium - 50]);
    }
  }
  const style = resolveBotStyle(getBotProfile('balanced'));
  const aa = [0.1, 0.5, 0.9].map(
    (mix) => botOpeningSize(deceptiveView('As Ah', '', { position: 'UTG' }), style, 0, mix).desired,
  );
  const tt = [0.1, 0.5, 0.9].map(
    (mix) => botOpeningSize(deceptiveView('Ts Th', '', { position: 'UTG' }), style, 0, mix).desired,
  );
  assert.deepEqual(aa, [300, 325, 375]);
  assert.ok(tt.includes(aa[1]), 'TT and AA can both open 6.5BB');
});

test('the generic opening fallback does not restore the former 2.5BB first-in size', () => {
  const view = deceptiveView('As Ah', '', { position: 'UTG', equity: 0.65 });
  const normal = decide(view);
  const fallback = decide(view, {
    ...getBotProfile('balanced'),
    policy: { ...getBotProfile('balanced').policy, firstInRaise: 0 },
  });
  assert.equal(normal.amount, 325);
  assert.equal(fallback.amount, normal.amount);
  assert.deepEqual(fallback.trace.sizing.openingPlan, normal.trace.sizing.openingPlan);
  assert.equal(fallback.trace.sizing.fraction, normal.trace.sizing.fraction);
});

test('public stack boundaries reduce the baseline without letting a tiny third stack shrink a deep contest', () => {
  const style = resolveBotStyle(getBotProfile('balanced'));
  const make = (depth) => deceptiveView('As Ah', '', { position: 'UTG', stack: depth * 50 });
  for (const [depth, expected] of [
    [29.5, 125],
    [30, 175],
    [59.5, 175],
    [60, 275],
  ])
    assert.equal(botOpeningSize(make(depth), style).desired, expected);
  const view = make(100);
  assert.equal(
    botOpeningSize({ ...view, opponents: [{ stack: 1000, bet: 0 }] }, style).desired,
    125,
  );
  assert.equal(
    botOpeningSize(
      {
        ...view,
        opponents: [
          { stack: 1000, bet: 0 },
          { stack: 4975, bet: 25 },
        ],
      },
      style,
    ).desired,
    325,
  );
});

test('isolation charges distinct live limpers and stays separate from already raised pots', () => {
  const view = deceptiveView('As Ah', '', {
    position: 'BTN',
    equity: 0.65,
    opponents: [0, 2].map((id) => ({ id, stack: 4950, bet: 50, allin: false })),
    history: [0, 2].map((id) => ({ id, street: 0, action: 'call', amount: 50 })),
  });
  assert.equal(decide(view).amount, 450);
  // A repeated record for one caller must not become another full-BB surcharge.
  assert.equal(decide({ ...view, history: [...view.history, view.history[0]] }).amount, 450);
  const raised = {
    ...view,
    currentBet: 150,
    history: [{ id: 0, street: 0, action: 'raise', amount: 150 }],
    legal: { ...view.legal, toCall: 150, callAmount: 150, minRaiseTo: 250 },
  };
  assert.equal(decide(raised).trace.sizing?.openingPlan, undefined);
});

test('opening sizes use the game denomination and existing min/max raise constraints at every supported blind scale', () => {
  for (const smallBlind of [25, 100, 300, 50000]) {
    const stakes = stakesFromSmallBlind(smallBlind);
    for (const position of ['UTG', 'BTN']) {
      const view = {
        ...deceptiveView('As Ah'),
        ...stakes,
        position,
        stack: stakes.startingStack,
        bet: 0,
        opponents: [{ stack: stakes.startingStack, bet: 0 }],
      };
      const plan = botOpeningSize(view, resolveBotStyle(getBotProfile('balanced')));
      assert.equal(plan.desired / stakes.bigBlind, position === 'UTG' ? 6.5 : 6);
      const legal = {
        chipUnit: stakes.chipUnit,
        minRaiseTo: 2 * stakes.bigBlind,
        maxRaiseTo: 3 * stakes.bigBlind,
      };
      const amount = legalRaiseTo(plan.desired, legal);
      assert.equal(amount, legal.maxRaiseTo);
      assert.equal(amount % stakes.chipUnit, 0);
    }
  }
});

test('selected value 3-bets charge position and actual cold callers, without counting earlier or folded calls', () => {
  for (const inPosition of [true, false]) {
    for (const callers of [0, 1, 2]) {
      const view = deceptiveView('As Ah', '', {
        equity: 0.75,
        inPosition,
        currentBet: 200,
        pot: 300 + callers * 200,
        history: [
          { id: 9, street: 0, action: 'call', amount: 50 },
          { id: 0, street: 0, action: 'raise', amount: 200 },
          ...Array.from({ length: callers }, (_, i) => ({
            id: i + 2,
            street: 0,
            action: 'call',
            amount: 200,
          })),
        ],
        opponents: [0, ...Array.from({ length: callers }, (_, i) => i + 2)].map((id) => ({
          id,
          stack: 4800,
          bet: 200,
        })),
        legal: {
          enabled: true,
          canCheck: false,
          canRaise: true,
          toCall: 200,
          callAmount: 200,
          minRaiseTo: 350,
          maxRaiseTo: 5000,
        },
      });
      const decision = decide(view);
      assert.equal(decision.action, 'raise');
      assert.equal(decision.amount, 200 * ((inPosition ? 3.5 : 4.5) + callers));
      assert.equal(decision.trace.sizing.reraisePlan.callers, callers);
      assert.equal(
        botReraiseSize({ ...view, history: [...view.history, view.history.at(-1)] }).callers,
        callers,
      );
    }
  }
});

test('4-bets count only callers of the latest raise and preserve shallow-stack sizing boundaries', () => {
  const view = deceptiveView('Qs Qh', '', {
    inPosition: false,
    currentBet: 600,
    history: [
      { id: 1, street: 0, action: 'raise', amount: 200 },
      { id: 2, street: 0, action: 'call', amount: 200 },
      { id: 0, street: 0, action: 'raise', amount: 600 },
      { id: 3, street: 0, action: 'call', amount: 600 },
    ],
    opponents: [0, 2, 3].map((id) => ({ id, stack: 4400, bet: 600 })),
  });
  assert.deepEqual(
    [botReraiseSize(view).multiple, botReraiseSize({ ...view, inPosition: true }).multiple],
    [3.5, 3],
  );
  const shallow = { ...view, stack: 1950, bet: 0 };
  assert.equal(botReraiseSize(shallow, 0.9).multiple, 2.75);
  assert.equal(botReraiseSize({ ...shallow, stack: 2000 }, 0.9).multiple, 4);
  assert.equal(botReraiseSize({ ...view, street: 1 }), null);
});

test('larger ordinary opens retain bounded strong-hand defense without giving weak hands a cheap-entry exemption', () => {
  for (const bb of [5, 5.5, 6, 7, 8, 8.5]) {
    const make = (hole) =>
      deceptiveView(hole, '', {
        equity: 0.3,
        currentBet: bb * 50,
        pot: 75 + bb * 50,
        contestable: 75 + bb * 100,
        history: [{ id: 0, street: 0, action: 'raise', amount: bb * 50 }],
        opponents: [{ id: 0, stack: 5000 - bb * 50, bet: bb * 50 }],
        legal: {
          enabled: true,
          canCheck: false,
          canRaise: true,
          toCall: bb * 50,
          callAmount: bb * 50,
          minRaiseTo: (bb * 2 - 1) * 50,
          maxRaiseTo: 5000,
        },
      });
    for (const hand of ['As Kh', 'Qs Qh', 'Ts Th', 'Ks Qs'])
      assert.equal(decide(make(hand)).trace.affordableOpen, bb <= 8);
    for (const hand of ['As 3h', '6s 6h', '8s 7s'])
      assert.equal(decide(make(hand)).trace.affordableOpen, bb <= 5);
    const jam = make('As Kh');
    jam.opponents[0].allin = true;
    assert.equal(decide(jam).trace.affordableOpen, false);
    const shallow = { ...make('As Kh'), stack: 1500 };
    assert.equal(decide(shallow).trace.affordableOpen, false);
  }
});

test('real 5–9-seat AA opens execute and settle with chip conservation across supported blind boundaries', () => {
  for (const smallBlind of [25, 100, 300, 50000]) {
    for (const count of [5, 6, 7, 8, 9]) {
      const stakes = stakesFromSmallBlind(smallBlind),
        game = newGame(count, stakes);
      game.difficulty = 'normal';
      startHand(game);
      const target = game.players.find((p) => seatPosition(game, p.id) === 'UTG');
      const desired = deceptiveView('As Ah').hole;
      for (const [index, wanted] of desired.entries()) {
        let found;
        for (const group of [...game.players.map((p) => p.hole), game.deck])
          for (let j = 0; j < group.length; j++)
            if (group[j].rank === wanted.rank && group[j].suit === wanted.suit) found = [group, j];
        [target.hole[index], found[0][found[1]]] = [found[0][found[1]], target.hole[index]];
      }
      assert.equal(game.actor, target.id);
      const decision = botDecision(game, () => 0.4);
      assert.equal(decision.action, 'raise');
      assert.equal(decision.amount, 6.5 * stakes.bigBlind);
      act(game, target.id, 'raise', decision.amount);
      while (game.phase === 'playing') {
        const legal = legalActions(game);
        act(game, game.actor, legal.canCheck ? 'check' : 'fold');
      }
      assert.equal(game.phase, 'done');
      assert.equal(
        game.players.reduce((sum, p) => sum + p.stack, 0),
        count * stakes.startingStack,
      );
      for (const amount of [
        ...game.players.map((p) => p.stack),
        ...game.payouts,
        ...game.refunds.map((r) => r.amount),
      ])
        assert.equal(amount % stakes.chipUnit, 0);
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluate,
  compare,
  deckOfCards,
  botDecision,
  legalActions,
  act,
  advanceStreet,
} from '../../src/engine/poker.js';
import { handFeatures } from '../../src/engine/hand-features.js';
import { publicHandData } from '../../src/engine/public-equity.js';
import {
  hasPublicActionLine,
  hasPublicStory,
  publicPostflopLine,
} from '../../src/engine/public-story.js';
import { preparePublicRanges, publicComboWeight } from '../../src/engine/public-ranges.js';
import { publicStrategyPlan } from '../../src/engine/bot-strategy-plan.js';
import { getBotProfile } from '../../src/engine/bot-profiles.js';
import { resolveBotStyle } from '../../src/engine/bot-style.js';
import { checkedPostflopGame, CHECKED_POSTFLOP_CASES } from '../fixtures/checked-postflop.js';
import { cards, deceptiveView } from '../fixtures/deceptive-decisions.js';

const random = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const profile = getBotProfile('balanced');
const style = resolveBotStyle(profile);
const viewFor = (scenario, count = 5) =>
  botDecision(checkedPostflopGame({ scenario, count }), random(23)).trace.view;
const plan = (view, overrides = {}, roll = () => 0) =>
  publicStrategyPlan(view, { ...style, ...overrides }, profile, {
    equity: view.equity,
    required: 0,
    roll,
  });

function comboWeight(view, text) {
  const descriptor = preparePublicRanges(view)[0];
  const context = { evaluate, compare, features: handFeatures, cache: new Map() };
  const data = (hole, board) => publicHandData(hole, board, context);
  const hole = cards(text);
  return publicComboWeight(hole, descriptor, {
    board: descriptor.board,
    ...data(hole, descriptor.board),
    compare,
    handData: data,
  });
}

test('one visible check on a two-tone flop updates strong/draw/middle range weights without inventing a multi-street story', () => {
  const before = deceptiveView('As Qd', 'Ah 8h 3c', {
    history: [{ id: 0, street: 0, action: 'call', amount: 50 }],
  });
  const checked = {
    ...before,
    history: [...before.history, { id: 0, street: 1, action: 'check', amount: 0 }],
  };
  const line = preparePublicRanges(checked)[0].postflopLine;
  assert.equal(hasPublicActionLine(line), true);
  assert.equal(
    hasPublicStory(line),
    false,
    'one street cannot unlock multi-street exact-defense rules',
  );
  assert.ok(comboWeight(checked, '8s 8d') < comboWeight(before, '8s 8d') * 0.9);
  assert.ok(comboWeight(checked, '8s 8d') > 0, 'a check/raise trap remains possible');
  assert.equal(
    comboWeight(checked, 'Kh Jh'),
    comboWeight(before, 'Kh Jh'),
    'checking keeps an unmade flush draw in range',
  );
  assert.equal(
    comboWeight(checked, '8s 7d'),
    comboWeight(before, '8s 7d'),
    'middle-pair checks are not treated as evidence against that hand',
  );
});

test('a completed check-through is captured for every earlier checker, only after that street is over', () => {
  const history = [
    { id: 0, street: 0, action: 'call', amount: 50 },
    { id: 0, street: 1, action: 'check', amount: 0 },
    { id: 1, street: 1, action: 'check', amount: 0 },
  ];
  const turn = deceptiveView('As Qd', 'Ah 8h 3c 2d', { history });
  const line = publicPostflopLine(turn, 0);
  assert.equal(line[0].closedCheck, false);
  assert.equal(line[0].checkedThrough, true);
  const flop = { ...turn, street: 1, board: turn.board.slice(0, 3), history: history.slice(0, 2) };
  assert.equal(publicPostflopLine(flop, 0)[0].checkedThrough, false);
  const bet = {
    ...turn,
    history: [...history.slice(0, 2), { id: 1, street: 1, action: 'raise', amount: 100 }],
  };
  assert.equal(publicPostflopLine(bet, 0)[0].checkedThrough, false);
});

test('checked top pair and overpair use a bounded, supported protection bet in actual five/nine-seat engine fixtures', () => {
  for (const count of [5, 9]) {
    for (const scenario of ['top-pair-wet', 'overpair-wet']) {
      const view = viewFor(scenario, count);
      const result = plan(view);
      assert.ok(result, `${count}/${scenario} has a supported value candidate`);
      assert.equal(result.action, 'raise');
      assert.equal(result.motive, 'value');
      if (result.kind === 'checked-value-protection') {
        assert.equal(result.source, 'public-response-model');
        assert.ok(result.option.worseMadeCallMass + result.option.drawCallMass >= 0.18);
        assert.ok(result.option.opponents.every((opponent) => opponent.calledEquity >= 0.55));
        assert.ok(result.option.estimatedValue > view.publicStrategy.call.directCallValue);
      }
      assert.ok(result.option.fraction <= 0.5);
      assert.ok(result.amount < view.legal.maxRaiseTo);
    }
  }
});

test('protection needs paying ranges, manageable raises and a positive advantage over checking', () => {
  const view = viewFor('overpair-wet');
  assert.equal(plan(view).kind, 'checked-value-protection');
  const changed = (change) => ({
    ...view,
    publicStrategy: {
      ...view.publicStrategy,
      options: view.publicStrategy.options.map((option) => ({ ...option, ...change })),
    },
  });
  assert.equal(plan(changed({ worseMadeCallMass: 0, drawCallMass: 0 })), null);
  assert.equal(plan(changed({ raiseProbability: 0.5 })), null);
  assert.equal(plan(changed({ estimatedValue: -1 })), null);
  assert.equal(plan({ ...view, rivals: 4 }), null);
  assert.equal(plan({ ...view, allIn: { isAllIn: true } }), null);
});

test('nut and combo draws can pressure three checked marginal ranges with positive modeled value', () => {
  for (const count of [5, 9]) {
    for (const scenario of ['nut-draw-checked', 'combo-draw-checked']) {
      const view = viewFor(scenario, count);
      const result = plan(view);
      assert.equal(result?.kind, 'nut-draw-pressure', `${count}/${scenario}`);
      assert.equal(result.motive, 'semi-bluff');
      assert.equal(result.rangeRead, 'checked-marginal-or-unmade');
      assert.ok(result.option.foldProbability >= 0.04);
      assert.ok(result.option.calledEquity >= 0.4);
      assert.ok(result.option.raiseProbability <= 0.15);
      assert.ok(result.option.estimatedValue > view.publicStrategy.call.directCallValue);
      assert.ok(result.option.fraction <= 0.5);
    }
  }
});

test('a front-position strong draw can lead after a real full-flop check-through, using separate prior-street evidence', () => {
  const view = viewFor('prior-checkthrough-draw-lead');
  assert.equal(view.inPosition, false);
  assert.equal(view.features.flushDraw, true);
  assert.equal(view.publicStrategy.draw.nutFlushDraw, true);
  assert.equal(view.history.filter((event) => event.street === 2).length, 0);
  assert.ok(
    view.publicStrategy.range.opponentEvidence.every(
      (reading) => !reading.currentStreetCheck && reading.checkedThroughStreets.includes(1),
    ),
  );
  const result = plan(view);
  assert.equal(result.kind, 'nut-draw-pressure');
  assert.equal(result.rangeRead, 'prior-checkthrough-marginal-or-unmade');
  assert.equal(result.motive, 'semi-bluff');
  assert.ok(result.option.estimatedValue > view.publicStrategy.call.directCallValue);
  assert.ok(result.option.calledEquity >= 0.4);
  assert.ok(result.option.foldProbability >= 0.04);
  assert.ok(result.option.raiseProbability <= 0.15);
  assert.ok(result.option.fraction <= 0.5);
  const incomplete = {
    ...view,
    history: view.history.filter((event) => !(event.id === 0 && event.street === 1)),
  };
  assert.equal(
    plan(incomplete),
    null,
    'an incomplete public check history cannot borrow cached check-through metadata',
  );
  assert.equal(
    plan({
      ...view,
      history: [...view.history, { id: 0, street: 2, action: 'raise', amount: 400 }],
    }),
    null,
  );
  assert.equal(
    plan({
      ...view,
      publicStrategy: {
        ...view.publicStrategy,
        options: view.publicStrategy.options.map((option) => ({ ...option, estimatedValue: -1 })),
      },
    }),
    null,
  );
});

test('dangerous or contested turns do not receive the prior-checkthrough draw-pressure boost', () => {
  for (const count of [5, 9]) {
    for (const scenario of [
      'prior-checkthrough-paired-turn',
      'prior-checkthrough-flush-turn',
      'prior-checkthrough-four-connected',
      'prior-checkthrough-strong-response',
    ]) {
      const result = plan(viewFor(scenario, count));
      assert.notEqual(
        result?.rangeRead,
        'prior-checkthrough-marginal-or-unmade',
        `${count}/${scenario}`,
      );
    }
  }
});

test('a completed flush, marginal made hand or a real turn bet does not get the checked-range pressure plan', () => {
  for (const count of [5, 9]) {
    for (const scenario of ['turn-flush-completed', 'middle-pair-danger', 'strong-turn-response']) {
      const view = viewFor(scenario, count);
      const result = plan(view);
      assert.ok(
        !result || !['checked-value-protection', 'nut-draw-pressure'].includes(result.kind),
      );
      assert.ok(!result?.rangeRead);
    }
    assert.equal(plan(viewFor('turn-value-improved', count)).motive, 'value');
  }
});

test('style coefficients and mixed checking remain intact on the same supported protection opportunity', () => {
  const view = viewFor('overpair-wet');
  const original = structuredClone(profile);
  const ordinary = plan(view),
    trapping = plan(view, { topPairTrap: true });
  assert.ok(ordinary.rate > trapping.rate);
  assert.ok(trapping.rate > 0 && ordinary.rate < 1);
  assert.equal(
    plan(view, {}, () => 1),
    null,
  );
  assert.deepEqual(profile, original);
});

test('new range evidence uses public lines, preserves the before-action snapshot, and legal scripted fixtures conserve chips', () => {
  for (const scenario of Object.keys(CHECKED_POSTFLOP_CASES)) {
    const g = checkedPostflopGame({ scenario, count: 9 });
    const wealth = g.players.reduce((sum, player) => sum + player.stack + player.total, 0);
    const decision = botDecision(g, random(31));
    const before = JSON.stringify(decision.trace.view);
    const originalHole = g.players[0].hole;
    Object.defineProperty(g.players[0], 'hole', {
      get() {
        throw Error('Read hidden opponent cards');
      },
      configurable: true,
    });
    const originalDeck = g.deck;
    Object.defineProperty(g, 'deck', {
      get() {
        throw Error('Read future deck');
      },
      configurable: true,
    });
    assert.deepEqual(botDecision(g, random(31)), decision);
    assert.equal(JSON.stringify(decision.trace.view), before);
    Object.defineProperty(g.players[0], 'hole', {
      value: originalHole,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(g, 'deck', { value: originalDeck, configurable: true, writable: true });
    act(g, g.actor, decision.action, decision.amount);
    while (g.phase !== 'done') {
      if (g.phase === 'between') advanceStreet(g);
      else act(g, g.actor, legalActions(g).canCheck ? 'check' : 'fold');
    }
    assert.equal(
      g.players.reduce((sum, player) => sum + player.stack, 0),
      wealth,
    );
    assert.ok(g.players.every((player) => player.stack >= 0 && player.stack % g.chipUnit === 0));
  }
});

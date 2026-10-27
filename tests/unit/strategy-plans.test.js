import test from 'node:test';
import assert from 'node:assert/strict';
import { startingPercentile } from '../../src/engine/starting-range.js';
import { postflopStyleLine } from '../../src/engine/bot-style-lines.js';
import { publicStrategyPlan } from '../../src/engine/bot-strategy-plan.js';
import { getBotProfile } from '../../src/engine/bot-profiles.js';
import { deckOfCards } from '../../src/engine/poker.js';
import { deceptiveView } from '../fixtures/deceptive-decisions.js';

const profile = getBotProfile('balanced');
const style = { lineStrategy: 'balanced', valueAttack: 0.8, semiBluff: 0.6, trapRate: 0.8 };
function assessment(overrides = {}) {
  return {
    range: { advantage: 0.25, uncertainty: 0.05, actorTopMass: 0.2, opponentTopMass: 0.1 },
    call: { eligible: false, directCallValue: 0, price: 0.2 },
    draw: {},
    options: [
      {
        amount: 400,
        extra: 400,
        fraction: 0.5,
        calledEquity: 0.8,
        worseMadeCallMass: 0.4,
        drawCallMass: 0.1,
        estimatedValue: 250,
        foldProbability: 0.5,
        raiseProbability: 0.1,
      },
    ],
    ...overrides,
  };
}
const plan = (v, roll = () => 0) =>
  publicStrategyPlan(v, style, profile, { equity: 0.55, required: 0.3, roll });

test('starting-hand cache preserves the original strict percentile for all 1,326 combinations', () => {
  const value = (h) => {
    const [high, low] = h.map((c) => c.rank).sort((a, b) => b - a);
    const gap = high - low;
    return high === low
      ? 30 + high * 2
      : high * 1.9 +
          low * 0.9 +
          (h[0].suit === h[1].suit ? 4 : 0) +
          (gap === 1 ? 3 : gap === 2 ? 1 : 0) +
          (high === 14 ? 3 : 0);
  };
  const deck = deckOfCards(),
    hands = [];
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) hands.push([deck[a], deck[b]]);
  const scores = hands.map(value);
  for (const h of hands)
    assert.equal(startingPercentile(h), scores.filter((v) => v > value(h)).length / 1326);
});

test('an affordable nut draw can use future payment, but an all-in or reverse-risk draw cannot', () => {
  const v = deceptiveView('As Js', 'Ts 7s 2d', {
    stack: 5000,
    total: 0,
    publicStrategy: assessment({
      draw: { nutFlushDraw: true },
      call: {
        eligible: true,
        impliedValue: 100,
        directCallValue: -20,
        estimatedValue: 80,
        reverseImpliedDiscount: 0.1,
        price: 0.2,
      },
    }),
    legal: { canCheck: false, canRaise: false, callAmount: 200 },
  });
  assert.equal(plan(v).kind, 'implied-continue');
  assert.equal(plan({ ...v, allIn: { isAllIn: true } }), null);
  assert.equal(
    plan({
      ...v,
      publicStrategy: {
        ...v.publicStrategy,
        call: {
          ...v.publicStrategy.call,
          reverseImpliedDiscount: 0.8,
        },
      },
    }),
    null,
  );
  assert.equal(plan({ ...v, stack: 200 }), null);
});

test('value sizing needs actual worse-hand payment and respects risk, legal raise and skill bounds', () => {
  const v = deceptiveView('5s 5d', '5h Kc 2d', { publicStrategy: assessment() });
  assert.equal(plan(v).motive, 'value');
  assert.equal(plan(v).amount, 400);
  const none = (changes) => ({
    ...v,
    publicStrategy: assessment({ options: [{ ...v.publicStrategy.options[0], ...changes }] }),
  });
  assert.equal(plan(none({ worseMadeCallMass: 0, drawCallMass: 0 })), null);
  assert.equal(plan(none({ calledEquity: 0.2 })), null);
  assert.equal(plan(none({ extra: 3000, amount: 3000 })), null);
  assert.equal(plan({ ...v, legal: { ...v.legal, canRaise: false } }), null);
  assert.equal(plan({ ...v, difficulty: 'easy' }), null);
  assert.equal(plan({ ...v, opponents: [{ id: 0, allin: true, stack: 0 }] }), null);
});

test('a check-raise is conditional on a real check and bet, not a hidden persisted intention', () => {
  const v = deceptiveView('5s 5d', '5h Kc 2d', {
    publicStrategy: assessment(),
    history: [
      { id: 1, street: 1, action: 'check', amount: 0 },
      { id: 0, street: 1, action: 'raise', amount: 100 },
    ],
    legal: { canRaise: true, canCheck: false, callAmount: 100, minRaiseTo: 200, maxRaiseTo: 5000 },
  });
  assert.equal(plan(v).kind, 'check-raise-value');
  assert.equal(plan({ ...v, history: [] }).kind, 'paid-value');
  assert.equal(plan({ ...v, history: [], playsBoard: true }), null);
});

test('range pressure requires two public ranges and a responsive price, not initiative alone', () => {
  const v = deceptiveView('8s 4d', 'Kh 7c 2d', { publicStrategy: assessment() });
  assert.equal(plan(v).kind, 'range-bet');
  assert.equal(
    plan({
      ...v,
      publicStrategy: assessment({
        range: {
          advantage: 0,
          uncertainty: 0.05,
          actorTopMass: 0.1,
          opponentTopMass: 0.2,
        },
      }),
    }),
    null,
  );
  assert.equal(
    plan({
      ...v,
      publicStrategy: assessment({
        options: [{ ...v.publicStrategy.options[0], foldProbability: 0.1 }],
      }),
    }),
    null,
  );
});

// A high-card flop and preflop initiative must not override contrary public ranges.
test('legacy range-labelled c-bets also consult the two-range response model', () => {
  const v = deceptiveView('Qs Jh', 'Kh 7c 2d', {
    history: [{ id: 1, street: 0, action: 'raise', amount: 150 }],
    publicStrategy: assessment(),
  });
  assert.equal(postflopStyleLine(v, style, 0.4).kind, 'balanced-cbet');
  assert.equal(
    postflopStyleLine(
      {
        ...v,
        publicStrategy: assessment({
          range: { advantage: -0.2, actorTopMass: 0.1, opponentTopMass: 0.3 },
        }),
      },
      style,
      0.4,
    ),
    null,
  );
  assert.equal(
    postflopStyleLine(
      {
        ...v,
        publicStrategy: assessment({
          options: [{ fraction: 0.5, foldProbability: 0.1, estimatedValue: -20 }],
        }),
      },
      style,
      0.4,
    ),
    null,
  );
});

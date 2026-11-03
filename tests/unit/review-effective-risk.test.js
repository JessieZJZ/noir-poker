import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckOfCards } from '../../src/engine/poker.js';
import { decisionContext } from '../../src/review/context.js';
import { spotFacts } from '../../src/review/spot-facts.js';
import { guaranteedUncalledRaise, raiseExposureNote } from '../../src/review/presentation.js';
import { actionReason, investmentText } from '../../src/review/narrative.js';
import { analyzeDecision } from '../../src/review/analysis.js';
import { callPrice } from '../../src/review/equity.js';
import { coachDecision } from '../../src/review/coaching.js';

const cards = (text) =>
  text
    .split(' ')
    .map((value) =>
      deckOfCards().find(
        (card) =>
          card.rank === '23456789TJQKA'.indexOf(value[0]) + 2 &&
          card.suit === 'shcd'.indexOf(value[1]),
      ),
    );

function decision({
  hole = 'Qc 7c',
  board = 'Tc 4h 5h 5c 3c',
  street = 3,
  amount = 4300000,
  stack = 23800000,
  bet = 0,
  total = 1200000,
  pot = 2850000,
  chipUnit = 50000,
  opponents = [{ stack: 2800000, bet: 0, total: 1200000 }],
  dead = 450000,
} = {}) {
  const players = [
    {
      id: 0,
      name: '你',
      position: 'BTN',
      stack,
      bet,
      total,
      folded: false,
      allin: false,
      actedTo: null,
    },
    ...opponents.map((p, i) => ({
      id: i + 1,
      name: '对手' + (i + 1),
      position: i ? 'CO' : 'SB',
      folded: false,
      allin: false,
      actedTo: null,
      ...p,
    })),
    ...(dead
      ? [
          {
            id: opponents.length + 1,
            name: '已弃牌对手',
            position: 'BB',
            stack: chipUnit * 10,
            bet: 0,
            total: dead,
            folded: true,
            allin: false,
            actedTo: null,
          },
        ]
      : []),
  ];
  const currentBet = Math.max(bet, ...opponents.map((p) => p.bet || 0));
  return {
    index: 0,
    hand: 1,
    street,
    hole: cards(hole),
    board: cards(board),
    position: 'BTN',
    stack,
    bet,
    total,
    pot,
    smallBlind: chipUnit,
    bigBlind: chipUnit * 2,
    chipUnit,
    action: 'raise',
    amount,
    currentBet,
    minRaise: chipUnit * 2,
    pending: [0],
    players,
    history: [],
    legal: {
      enabled: true,
      chipUnit,
      canCheck: currentBet === bet,
      canRaise: true,
      toCall: currentBet - bet,
      callAmount: Math.min(stack, currentBet - bet),
      minRaiseTo: currentBet + chipUnit * 2,
      maxRaiseTo: bet + stack,
      isShortAllin: false,
    },
  };
}

test('Q-high flush keeps the real 4.3M offer but assesses at most 2.8M matched exposure', () => {
  const s = decision(),
    before = structuredClone(s),
    c = decisionContext(s),
    f = spotFacts(s, c);
  assert.equal(c.extra, 4300000);
  assert.equal(c.betRatio, 4300000 / 2850000);
  assert.equal(c.guaranteedUncalledRaise, 1500000);
  assert.equal(c.matchedExtra, 2800000);
  assert.equal(c.matchedBetRatio, 2800000 / 2850000);
  assert.equal(f.investment, c.extra);
  assert.equal(f.potRatio, c.betRatio);
  assert.equal(f.guaranteedUncalledInvestment, 1500000);
  assert.equal(f.matchedInvestment, 2800000);
  assert.equal(f.matchedPotRatio, c.matchedBetRatio);
  assert.ok(f.potRatio > 1.5 && f.matchedPotRatio < 1);
  const evidence = investmentText(s, c, callPrice(s));
  assert.match(evidence, /4\.3M/);
  assert.match(evidence, /至少 1\.5M 无法被匹配/);
  assert.match(evidence, /最多 2\.8M/);
  assert.deepEqual(
    s,
    before,
    'Public exposure estimates must not mutate wagers or settle a hypothetical call.',
  );
});

test('changing only the opponent cap changes exposure without changing the actual offer or cards', () => {
  const short = decision(),
    deep = structuredClone(short);
  deep.players[1].stack = 6000000;
  const a = decisionContext(short),
    b = decisionContext(deep);
  assert.deepEqual(short.hole, deep.hole);
  assert.equal(short.amount, deep.amount);
  assert.equal(a.extra, b.extra);
  assert.equal(a.betRatio, b.betRatio);
  assert.equal(a.matchedExtra, 2800000);
  assert.equal(b.matchedExtra, 4300000);
  assert.ok(a.matchedBetRatio < 1 && b.matchedBetRatio > 1.5);
  assert.equal(b.guaranteedUncalledRaise, 0);
  assert.equal(raiseExposureNote(deep), '');
});

test('two 7.6K opponents do not match a 15.2K layer of a nominal 49.6K shove', () => {
  const s = decision({
    hole: '7c 6h',
    board: 'Jd 2s 4h',
    street: 1,
    amount: 49600,
    stack: 49600,
    total: 400,
    pot: 1200,
    chipUnit: 100,
    opponents: [
      { stack: 7600, total: 400, bet: 0 },
      { stack: 7600, total: 400, bet: 0 },
    ],
    dead: 0,
  });
  const c = decisionContext(s),
    f = spotFacts(s, c);
  assert.equal(c.guaranteedUncalledRaise, 42000);
  assert.equal(c.matchedExtra, 7600);
  assert.notEqual(c.matchedExtra, 15200);
  assert.equal(f.matchedPotRatio, 7600 / 1200);
  const prose = actionReason(s, { context: c, code: 'large-unbacked-bet', metrics: callPrice(s) });
  assert.match(prose, /49\.6K/);
  assert.match(prose, /至少 42K 无法被匹配/);
  assert.match(prose, /最多 7\.6K/);
  assert.doesNotMatch(prose, /承担整笔筹码的风险|承担.*49\.6K.*风险/);
});

test('unequal depths and existing blind/street contributions use contribution totals, not summed stacks', () => {
  const s = decision({
    amount: 10100,
    stack: 10000,
    bet: 100,
    total: 100,
    pot: 400,
    chipUnit: 100,
    opponents: [
      { stack: 200, total: 200, bet: 200 },
      { stack: 5000, total: 100, bet: 0 },
    ],
    dead: 0,
  });
  const c = decisionContext(s);
  assert.equal(c.extra, 10000);
  assert.equal(c.guaranteedUncalledRaise, 5000);
  assert.equal(c.matchedExtra, 5000);
  const oldStreets = decision({
    amount: 11000,
    stack: 10000,
    bet: 1000,
    total: 5000,
    pot: 11000,
    chipUnit: 1000,
    opponents: [{ stack: 4000, total: 6000, bet: 2000 }],
    dead: 0,
  });
  const d = decisionContext(oldStreets);
  assert.equal(d.extra, 10000);
  assert.equal(d.guaranteedUncalledRaise, 5000);
  assert.equal(d.matchedExtra, 5000);
  assert.notEqual(
    d.matchedExtra,
    11000,
    'A raise-to amount must not be confused with this action’s additional investment.',
  );
});

test('existing unmatched old chips never make newly risked chips negative or exceed the new payment', () => {
  const s = decision({
    amount: 3000,
    stack: 10000,
    bet: 1000,
    total: 10000,
    pot: 18000,
    chipUnit: 1000,
    opponents: [{ stack: 1000, total: 8000, bet: 0 }],
    dead: 0,
  });
  const c = decisionContext(s);
  assert.equal(c.extra, 2000);
  assert.equal(c.guaranteedUncalledRaise, 2000);
  assert.equal(c.matchedExtra, 0);
  assert.equal(c.matchedBetRatio, 0);
});

test('folded stacks add no future matching capacity; non-raise actions preserve their original amounts', () => {
  const s = decision();
  s.players.at(-1).stack = 999999999;
  assert.equal(guaranteedUncalledRaise(s, s.amount), 1500000);
  for (const action of ['check', 'fold', 'call']) {
    const v = { ...s, action, amount: 0 };
    const c = decisionContext(v);
    assert.equal(c.guaranteedUncalledRaise, 0);
    assert.equal(c.matchedExtra, c.extra);
    assert.equal(c.matchedBetRatio, c.betRatio);
  }
});

test('matching/refund bounds retain whole chips across stake scales and short/deep caps', () => {
  for (const unit of [25, 100, 50000]) {
    for (const cap of [1, 5, 20, 40]) {
      const s = decision({
        amount: 20 * unit,
        stack: 40 * unit,
        bet: 0,
        total: 4 * unit,
        pot: 8 * unit,
        chipUnit: unit,
        opponents: [{ stack: cap * unit, total: 4 * unit, bet: 0 }],
        dead: 0,
      });
      const c = decisionContext(s);
      for (const value of [c.extra, c.guaranteedUncalledRaise, c.matchedExtra])
        assert.ok(Number.isSafeInteger(value) && value % unit === 0 && value >= 0);
      assert.equal(c.matchedExtra + c.guaranteedUncalledRaise, c.extra);
      assert.equal(c.matchedExtra, Math.min(20, cap) * unit);
    }
  }
});

test('Q-high flush summary never calls a sub-pot matched offer clearly overpot', () => {
  const r = analyzeDecision(decision(), { trials: 24, rollouts: false });
  assert.equal(r.context.matchedExtra, 2800000);
  assert.match(r.coaching.explanation, /至少 1\.5M 无法被匹配/);
  assert.match(r.coaching.explanation, /最多 2\.8M/);
  assert.doesNotMatch(r.coaching.explanation, /明显超过底池/);
});

test('a retained unraised strong-hand fold explains its opportunity cost without contradicting the fold label', () => {
  const s = decision({
    hole: 'Ks Qs',
    board: '',
    street: 0,
    amount: 0,
    stack: 20000,
    total: 0,
    pot: 300,
    chipUnit: 100,
    opponents: [
      { stack: 19900, total: 100, bet: 100 },
      { stack: 19800, total: 200, bet: 200 },
    ],
    dead: 0,
  });
  s.board = [];
  s.action = 'fold';
  s.position = 'UTG';
  s.players[0].position = 'UTG';
  const r = analyzeDecision(s, { trials: 24, rollouts: false });
  r.status = 'consider';
  r.routes.primary = { action: 'fold', amount: 0 };
  r.alternative = { action: 'fold', amount: 0 };
  const coaching = coachDecision(s, r);
  assert.equal(coaching.recommendedAction.action, 'fold');
  assert.match(coaching.explanation, /弃牌放弃了.*是否继续取决于对手的入池与再加注范围/);
  assert.doesNotMatch(coaching.explanation, /不必自动放弃/);
});

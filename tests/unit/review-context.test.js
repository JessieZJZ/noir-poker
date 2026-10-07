import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deckOfCards } from '../../src/engine/poker.js';
import { drawInfo, decisionContext } from '../../src/review/context.js';
import { analyzeDecision } from '../../src/review/analysis.js';

const cards = (s) =>
  s
    ? s
        .split(' ')
        .map((v) =>
          deckOfCards().find(
            (c) => c.rank === '23456789TJQKA'.indexOf(v[0]) + 2 && c.suit === 'shcd'.indexOf(v[1]),
          ),
        )
    : [];
function decision({
  hole = 'Qs Qh',
  board = 'Js 7h 2c',
  street = 1,
  action = 'check',
  amount = 0,
  stack = 5000,
  currentBet = 0,
  pot = 300,
} = {}) {
  const players = [
    {
      id: 0,
      name: '你',
      position: 'BTN',
      total: pot / 2,
      bet: 0,
      stack,
      folded: false,
      allin: false,
    },
    {
      id: 1,
      name: 'Mia',
      position: 'BB',
      total: pot / 2,
      bet: currentBet,
      stack,
      folded: false,
      allin: false,
    },
  ];
  return {
    index: 0,
    hand: 1,
    hole: cards(hole),
    board: cards(board),
    street,
    action,
    amount,
    position: 'BTN',
    stack,
    bet: 0,
    total: pot / 2,
    pot,
    currentBet,
    minRaise: 50,
    pending: [0],
    players,
    history: [],
    legal: {
      enabled: true,
      canCheck: currentBet === 0,
      canRaise: true,
      toCall: currentBet,
      callAmount: currentBet,
      minRaiseTo: currentBet + 50,
      maxRaiseTo: stack,
    },
  };
}
const options = { trials: 120 };

test('open-ended draw has eight distinct direct completion cards', () => {
  const draw = drawInfo(cards('8s 9h'), cards('6c 7d Kc'));
  assert.equal(draw.straightOuts, 8);
  assert.equal(draw.outs, 8);
  assert.equal(draw.nextChance, 8 / 47);
});

test('combined flush and straight draw deduplicates the shared ten of spades', () => {
  const draw = drawInfo(cards('As Ks'), cards('Qs Js 2h'));
  assert.equal(draw.flushOuts, 9);
  assert.equal(draw.straightOuts, 4);
  assert.equal(draw.outs, 12);
  assert.equal(draw.nextChance, 12 / 47);
});

test('made straight is not mislabeled as a straight draw; river has no next card', () => {
  const draw = drawInfo(cards('8s 9h'), cards('6c 7d Tc'));
  assert.equal(draw.straight, false);
  assert.equal(draw.outs, 0);
  assert.equal(drawInfo(cards('As Ks'), cards('Qs Js 2h 4d 5c')).outs, 0);
});

test('overpair, top pair kicker and a public pair get different factual descriptions', () => {
  assert.equal(decisionContext(decision()).handClass, 'overpair');
  const top = decisionContext(decision({ hole: 'As Jh' }));
  assert.equal(top.handClass, 'top-pair');
  assert.match(top.handLabel, /A 踢脚/);
  const publicPair = decisionContext(decision({ hole: 'As Kh', board: '7s 7h 2c' }));
  assert.equal(publicPair.handClass, 'board-pair');
  assert.match(publicPair.handLabel, /来自公共牌/);
  assert.notEqual(
    analyzeDecision(decision({ hole: 'As Kh', board: '7s 7h 2c' }), options).code,
    'value-check',
  );
});

test('deep pocket queens shove suggests a legal smaller value route; short aces do not get that verdict', () => {
  const q = decision({
    street: 0,
    board: '',
    action: 'raise',
    amount: 5000,
    pot: 75,
    currentBet: 50,
  });
  const r = analyzeDecision(q, options);
  assert.equal(r.code, 'deep-value-shove');
  assert.equal(r.alternative.action, 'raise');
  assert.equal(r.alternative.amount, 150);
  assert.match(r.reason, /100 BB/);
  const a = analyzeDecision(
    decision({
      hole: 'As Ah',
      street: 0,
      board: '',
      stack: 1000,
      action: 'raise',
      amount: 1000,
      currentBet: 50,
      pot: 75,
    }),
    options,
  );
  assert.equal(a.code, 'value-bet');
  assert.doesNotMatch(a.lesson, /哪些对手范围会退出/);
});

test('four-suit board with no flush does not produce a strong value-check recommendation', () => {
  const r = analyzeDecision(decision({ hole: 'Kh Kc', board: 'Ks 7s 2s 4s', street: 2 }), options);
  assert.notEqual(r.code, 'value-check');
  assert.match(r.evidence.join(' '), /四张同花色/);
});

test('river heads-up completely enumerates 990 legal pairs and ties on a royal board', () => {
  const r = analyzeDecision(
    decision({ hole: '2h 3h', board: 'As Ks Qs Js Ts', street: 3 }),
    options,
  );
  assert.equal(r.metrics.method, 'enumeration');
  assert.equal(r.metrics.trials, 990);
  assert.equal(r.metrics.uncertainty, 0);
  assert.equal(r.metrics.randomEquity, 0.5);
  assert.equal(r.metrics.weightedEquity, 0.5);
});

test('sampling keeps a nonzero protection band even for an observed all-win sample', () => {
  const r = analyzeDecision(decision({ hole: 'As Ah', board: 'Ac Ad 2s', street: 1 }), {
    trials: 10,
  });
  assert.equal(r.metrics.method, 'sampling');
  assert.ok(r.metrics.uncertainty > 0);
});

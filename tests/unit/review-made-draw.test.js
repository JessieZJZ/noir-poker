import test from 'node:test';
import assert from 'node:assert/strict';
import { deckOfCards } from '../../src/engine/poker.js';
import { analyzeDecision } from '../../src/review/analysis.js';

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
function turn(hole, board, action = 'raise', amount = 500) {
  return {
    hole: cards(hole),
    board: cards(board),
    street: 2,
    position: 'BTN',
    stack: 4500,
    pot: 1000,
    bet: 0,
    total: 500,
    currentBet: 0,
    minRaise: 50,
    action,
    amount,
    pending: [0],
    legal: {
      canCheck: true,
      callAmount: 0,
      toCall: 0,
      canRaise: true,
      minRaiseTo: 50,
      maxRaiseTo: 4500,
    },
    players: [
      { id: 0, name: '你', position: 'BTN', stack: 4500, total: 500, bet: 0 },
      { id: 1, name: 'Kai', position: 'BB', stack: 4500, total: 500, bet: 0 },
    ],
    history: [
      { id: 1, street: 0, action: 'raise', amount: 150 },
      { id: 0, street: 0, action: 'call', amount: 150 },
      { id: 1, street: 1, action: 'raise', amount: 350 },
      { id: 0, street: 1, action: 'call', amount: 350 },
      { id: 1, street: 2, action: 'check', amount: 0 },
    ],
  };
}

test('top pair without a heart on four-heart board is not narrated as a strong value bet', () => {
  const s = turn('As Qd', 'Qh 7h 3h 9h'),
    r = analyzeDecision(s, { trials: 120 });
  assert.equal(r.context.handClass, 'top-pair');
  assert.equal(r.context.texture.maxSuit, 4);
  assert.equal(r.draw.outs, 0);
  assert.equal(r.code, 'pressure-bet');
  assert.match(r.coaching.paragraphs[0], /Q.*7.*3.*9/);
  assert.match(r.coaching.paragraphs[0], /四张同花色.*没有同花/);
  assert.match(r.coaching.paragraphs[0], /500.*主要依赖对手弃牌/);
  assert.doesNotMatch(r.coaching.paragraphs[0], /已有成牌，下注的价值来自/);
});

test('set plus flush redraw call leads with made-hand showdown value and preserves public-only reasoning', () => {
  const s = turn('Ks Kh', 'Kd Qs 3s 8s', 'call', 125);
  s.currentBet = s.legal.callAmount = s.legal.toCall = 125;
  s.legal.canCheck = false;
  s.legal.minRaiseTo = 250;
  s.players[1].stack = 4375;
  s.players[1].total = 625;
  s.players[1].bet = 125;
  s.pot = 1125;
  s.history.at(-1).action = 'raise';
  s.history.at(-1).amount = 125;
  const r = analyzeDecision(s, { trials: 120 });
  assert.equal(r.context.handClass, 'set');
  assert.equal(r.draw.flush, true);
  assert.equal(r.draw.outs, 9);
  assert.equal(r.metrics.callCost, 125);
  assert.match(r.coaching.paragraphs[0], /已有暗三条 K.*同时还有同花听牌/);
  assert.match(r.coaching.paragraphs[0], /当前成牌的摊牌价值/);
  assert.doesNotMatch(r.coaching.paragraphs[0], /不是只靠暗三条/);
  const changed = structuredClone(s);
  changed.players[1].hole = cards('As Ts');
  changed.futureDeck = cards('Js 9s');
  changed.winner = 1;
  assert.deepEqual(
    analyzeDecision(changed, { trials: 120 }).coaching.paragraphs,
    r.coaching.paragraphs,
  );
});

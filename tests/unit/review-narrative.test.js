import test from 'node:test';
import assert from 'node:assert/strict';
import { deckOfCards } from '../../src/engine/poker.js';
import { drawInfo, decisionContext } from '../../src/review/context.js';
import { analyzeDecision } from '../../src/review/analysis.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { publicHistory } from '../../src/review/narrative.js';
const cards = (text) =>
  text
    .split(' ')
    .map((v) =>
      deckOfCards().find(
        (c) => c.rank === '23456789TJQKA'.indexOf(v[0]) + 2 && c.suit === 'shcd'.indexOf(v[1]),
      ),
    );
function drawDecision() {
  return {
    hole: cards('Qd 8h'),
    board: cards('9h 7d 3d Ts'),
    street: 2,
    position: 'BTN',
    stack: 4600,
    pot: 1000,
    bet: 0,
    currentBet: 125,
    minRaise: 125,
    action: 'call',
    amount: 125,
    pending: [0],
    legal: {
      canCheck: false,
      callAmount: 125,
      toCall: 125,
      canRaise: true,
      minRaiseTo: 250,
      maxRaiseTo: 4600,
    },
    players: [
      { id: 0, name: '你', position: 'BTN', stack: 4600, total: 500, bet: 0 },
      { id: 1, name: 'River', position: 'BB', stack: 3500, total: 500, bet: 125 },
    ],
    history: [
      { id: 1, street: 1, action: 'check', amount: 0 },
      { id: 0, street: 1, action: 'check', amount: 0 },
      { id: 1, street: 2, action: 'raise', amount: 125 },
    ],
  };
}
test('Q8 turn call describes open-ended draw, delayed bet, new connectivity and conditional river bluff', () => {
  const s = drawDecision(),
    r = analyzeDecision(s, { trials: 120 });
  assert.equal(r.draw.straightType, 'open-ended');
  assert.deepEqual(r.draw.straightRanks, [6, 11]);
  assert.equal(r.draw.outs, 8);
  assert.match(r.coaching.explanation, /支点是两头顺听牌/);
  assert.match(r.coaching.explanation, /River此前在翻牌过牌/);
  assert.match(r.coaching.explanation, /加强了顺子连接/);
  assert.match(r.coaching.explanation, /只有对手示弱.*才比较转诈唬/);
  assert.match(r.coaching.explanation, /下一张牌的机会/);
  assert.equal(publicHistory(s).length, 3);
  const changed = structuredClone(s);
  changed.history[0].action = 'raise';
  changed.history[0].amount = 100;
  assert.doesNotMatch(
    analyzeDecision(changed, { trials: 120 }).coaching.explanation,
    /此前在翻牌过牌/,
  );
  changed.players[1].hole = cards('As Ah');
  changed.futureDeck = cards('Js 6h');
  changed.winner = 1;
  assert.equal(
    analyzeDecision(changed, { trials: 120 }).coaching.explanation,
    analyzeDecision({ ...changed, winner: 0, futureDeck: [] }, { trials: 120 }).coaching
      .explanation,
  );
});
test('draw geometry distinguishes gutshot, double gutshot, ace edge and made straight', () => {
  assert.equal(drawInfo(cards('8s 9h'), cards('6c Tc Kd')).straightType, 'gutshot');
  assert.equal(drawInfo(cards('8s Tc'), cards('6c 9h Qd')).straightType, 'double-gutshot');
  assert.equal(drawInfo(cards('As 2h'), cards('3c 4d Kh')).straightType, 'gutshot');
  assert.equal(drawInfo(cards('8s 9h'), cards('6c 7d Tc')).straightType, null);
});
test('all-in opponents remove invented river bluff space and expensive call labels recommend fold', () => {
  const s = drawDecision();
  const folded = structuredClone(s);
  folded.action = 'fold';
  folded.legal.canCheck = true;
  folded.legal.callAmount = 0;
  assert.doesNotMatch(
    analyzeDecision(folded, { trials: 120 }).coaching.explanation,
    /才比较转诈唬/,
  );
  const shoved = structuredClone(s);
  shoved.action = 'raise';
  shoved.amount = shoved.legal.maxRaiseTo;
  assert.doesNotMatch(
    analyzeDecision(shoved, { trials: 120 }).coaching.explanation,
    /才比较转诈唬/,
  );
  s.players[1].allin = true;
  s.players[1].stack = 0;
  const r = analyzeDecision(s, { trials: 120 });
  assert.doesNotMatch(r.coaching.explanation, /才比较转诈唬/);
  assert.match(r.coaching.explanation, /没有.*诈唬.*空间/);
  s.legal.callAmount = s.legal.toCall = 3500;
  s.amount = s.currentBet = 3500;
  s.players[1].bet = 3500;
  s.players[1].total = 4000;
  s.pot = 4500;
  s.hole = cards('2h 4h');
  s.board = cards('Qs Jd 9c 8h 2s');
  s.street = 3;
  const costly = analyzeDecision(s, { trials: 120 });
  assert.equal(costly.coaching.label, '弃牌');
  assert.equal(costly.coaching.suggestedAction, '弃牌');
});
test('bot explanations separate real made hand/draw from optimistic value label and cap reference data', () => {
  const s = drawDecision(),
    context = decisionContext(s);
  const v = {
    ...s,
    id: 1,
    inPosition: true,
    rivals: 1,
    opponents: [{ id: 0, stack: 4600 }],
    contestable: 1125,
  };
  const trace = {
    view: v,
    reason: 'semi-bluff',
    exceptions: [],
    equity: 0.4,
    callTolerance: 0,
    trials: 28,
    odds: 0.12,
    mode: 'off',
    mood: { kind: 'steady' },
  };
  const explanation = explainOpponent({ id: 1, action: 'raise', amount: 250, trace });
  assert.match(explanation.detail, /两头顺听牌半诈唬/);
  assert.ok(explanation.metrics.length <= 2);
  trace.reason = 'value-raise';
  assert.match(explainOpponent({ id: 1, action: 'raise', amount: 250, trace }).detail, /过于乐观/);
  assert.equal(context.texture.connected, 3);
});

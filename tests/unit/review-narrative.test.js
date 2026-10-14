import test from 'node:test';
import assert from 'node:assert/strict';
import { deckOfCards } from '../../src/engine/poker.js';
import { drawInfo, decisionContext } from '../../src/review/context.js';
import { analyzeDecision } from '../../src/review/analysis.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { publicHistory } from '../../src/review/narrative.js';
import { weakSuitedShove, pocketTensRecords, causalReraiseGame } from '../fixtures/review-spots.js';
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
      { id: 0, name: '你', position: 'BTN', stack: 4600, total: 400, bet: 0 },
      { id: 1, name: 'River', position: 'BB', stack: 4475, total: 525, bet: 125 },
      { id: 2, name: 'Folded', position: 'SB', stack: 4925, total: 75, bet: 0, folded: true },
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
  assert.match(r.coaching.explanation, /两头顺听牌/);
  assert.match(r.coaching.explanation, /125/);
  assert.match(r.coaching.explanation, /River此前在翻牌过牌/);
  assert.equal(r.context.texture.connected, 3);
  assert.match(r.coaching.explanation, /6\s*\/\s*J/);
  assert.match(r.coaching.explanation, /河牌/);
  assert.match(r.coaching.explanation, /诈唬/);
  assert.match(r.coaching.explanation, /8.*(outs|补牌|补顺|张)/i);
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
test('draw rationale follows actual board, public line and price changes without inventing earlier calls', () => {
  const snapshot = drawDecision();
  const original = analyzeDecision(snapshot, { trials: 120 }).coaching.explanation;
  assert.doesNotMatch(original, /先前跟注不能|你(?:此前|先前|已经)[^。]*跟注/);

  const flushTurn = structuredClone(snapshot);
  flushTurn.board = cards('9h 7d 3d Td');
  const flush = analyzeDecision(flushTurn, { trials: 120 });
  assert.equal(flush.draw.flush, true);
  assert.notEqual(flush.coaching.explanation, original);
  assert.match(flush.coaching.explanation, /同花/);

  const disconnected = structuredClone(snapshot);
  disconnected.board = cards('9h 7d 3d 2c');
  const missed = analyzeDecision(disconnected, { trials: 120 });
  assert.equal(missed.draw.straight, false);
  assert.doesNotMatch(missed.coaching.explanation, /两头顺听牌/);

  const blankHistory = { ...snapshot, history: [] };
  assert.doesNotMatch(
    analyzeDecision(blankHistory, { trials: 120 }).coaching.explanation,
    /此前在翻牌过牌|翻牌过牌后|延迟下注/,
  );
  const dearer = structuredClone(snapshot);
  Object.assign(dearer, { currentBet: 750, amount: 750, pot: 1625 });
  Object.assign(dearer.legal, { callAmount: 750, toCall: 750, minRaiseTo: 1500 });
  Object.assign(dearer.players[1], { bet: 750, total: 1125 });
  dearer.history[2].amount = 750;
  const expensive = analyzeDecision(dearer, { trials: 120 });
  assert.notEqual(expensive.coaching.explanation, original);
  assert.match(expensive.coaching.explanation, /750/);
});
test('all-in opponents remove invented river bluff space and expensive call labels recommend fold', () => {
  const s = drawDecision();
  const folded = structuredClone(s);
  folded.action = 'fold';
  folded.legal.canCheck = true;
  folded.legal.callAmount = 0;
  assert.doesNotMatch(
    analyzeDecision(folded, { trials: 120 }).coaching.explanation,
    /(?:可以|考虑|比较|再|才).{0,12}(?:转诈唬|河牌诈唬)/,
  );
  const shoved = structuredClone(s);
  shoved.action = 'raise';
  shoved.amount = shoved.legal.maxRaiseTo;
  assert.doesNotMatch(
    analyzeDecision(shoved, { trials: 120 }).coaching.explanation,
    /(?:可以|考虑|比较|再|才).{0,12}(?:转诈唬|河牌诈唬)/,
  );
  s.players[1].allin = true;
  s.players[1].stack = 0;
  const r = analyzeDecision(s, { trials: 120 });
  assert.doesNotMatch(r.coaching.explanation, /(?:可以|考虑|比较|再|才).{0,12}(?:转诈唬|河牌诈唬)/);
  assert.match(r.coaching.explanation, /(?:没有.*(?:诈唬.*空间|后手)|都已全下)/);
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
test('bot explanations separate made hand and draw without a numeric reference module', () => {
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
  assert.deepEqual(explanation.metrics, []);
  trace.reason = 'value-raise';
  assert.match(
    explainOpponent({ id: 1, action: 'raise', amount: 250, trace }).detail,
    /高牌|听牌|尚未成牌/,
  );
  assert.equal(context.texture.connected, 3);
});

const oldGenericCopy =
  /位置、价格和对手继续范围，比单看一张高牌更重要|先前跟注不能替这次新增风险买单|一对和非坚果听牌要更谨慎|建议比较.*依据仍受对手继续范围限制|随机范围估计|抽样\s*\d+\s*次|价格门槛/;

test('reported 52s 100BB shove explains its actual size and early opener rather than unrelated pair or draw warnings', () => {
  const s = weakSuitedShove();
  const r = analyzeDecision(s, { trials: 120 });
  const text = r.coaching.explanation + r.coaching.followUp;
  assert.equal(r.coaching.suggestedAction, '弃牌');
  assert.match(text, /100\s*BB/);
  assert.match(text, /5,000/);
  assert.match(text, /225/);
  assert.match(text, /Kai/);
  assert.match(text, /UTG/);
  assert.match(text, /150/);
  assert.match(text, /(?:22\.2|22|二十).*(?:倍|底池)|(?:底池).*(?:22\.2|22)/);
  assert.doesNotMatch(text, oldGenericCopy);
  assert.doesNotMatch(text, /一对|非坚果听牌|此前.*跟注|先前.*跟注/);
  assert.doesNotMatch(r.evidence.join(''), /40%|40\.0%/);
  assert.equal(r.draw.outs, 0);

  const changed = structuredClone(s);
  changed.players[1].hole = cards('As Ah');
  changed.deck = cards('Ac Kd Qs');
  changed.winners = [1];
  assert.equal(
    analyzeDecision(changed, { trials: 120 }).coaching.explanation,
    r.coaching.explanation,
  );
});

test('hero rationale changes with chosen amount, opener position and effective stack', () => {
  const s = weakSuitedShove();
  const original = analyzeDecision(s, { trials: 120 }).coaching;
  const smaller = structuredClone(s);
  smaller.amount = 300;
  const small = analyzeDecision(smaller, { trials: 120 }).coaching;
  assert.notEqual(small.explanation, original.explanation);
  assert.match(small.explanation, /300/);
  assert.doesNotMatch(small.explanation, /100\s*BB.*全下|全下.*100\s*BB/);

  const lateOpener = structuredClone(s);
  lateOpener.players[1].position = 'BTN';
  const late = analyzeDecision(lateOpener, { trials: 120 }).coaching;
  assert.notEqual(late.explanation, original.explanation);
  assert.match(late.explanation, /BTN/);
  assert.doesNotMatch(late.explanation, /UTG/);

  const shorter = structuredClone(s);
  shorter.stack = shorter.amount = shorter.legal.maxRaiseTo = 2500;
  shorter.players[0].stack = 2500;
  const short = analyzeDecision(shorter, { trials: 120 }).coaching;
  assert.notEqual(short.explanation, original.explanation);
  assert.match(short.explanation, /50\s*BB/);
});

test('reported TT call distinguishes a normal open from a 100BB shove without numeric references', () => {
  const [opening, calling] = pocketTensRecords();
  const open = explainOpponent(opening);
  const call = explainOpponent(calling);
  const text = [call.detail, ...call.reasons].join('');
  assert.notEqual(open.detail, call.detail);
  assert.match([open.detail, ...open.reasons].join(''), /150/);
  assert.doesNotMatch(open.detail, /已有开池时|这次(?:是|作).{0,4}(?:再加注|3-bet)/);
  assert.match(text, /5,000/);
  assert.match(text, /4,650/);
  assert.match(text, /(?:大对|JJ|QQ|KK|AA)/);
  assert.match(text, /(?:两高张|AK|AQ)/);
  assert.doesNotMatch(text, oldGenericCopy);
  assert.doesNotMatch(text, /71\.7%|52\s*次|5\s*\/\s*2|5c|2c/);
  assert.deepEqual(call.metrics, []);
  assert.doesNotMatch(text, /EV|它|模型|模拟器|参考数字|赔率.*%/);

  const altered = structuredClone(calling);
  altered.trace.view.opponents[0].hole = cards('As Ah');
  altered.trace.view.futureDeck = cards('Js 6h');
  altered.trace.view.winner = 0;
  assert.deepEqual(explainOpponent(altered), call);
  altered.trace.equity = 0.999;
  altered.trace.trials = 9999;
  assert.deepEqual(explainOpponent(altered).metrics, call.metrics);
});

test('opponent reasoning responds to its actual call cost without odds or simulated equity references', () => {
  const calling = pocketTensRecords()[1];
  const baseline = explainOpponent(calling);
  const cheap = structuredClone(calling);
  Object.assign(cheap, { amount: 150 });
  Object.assign(cheap.trace.view, { pot: 525, currentBet: 300, contestable: 675 });
  Object.assign(cheap.trace.view.legal, { callAmount: 150, toCall: 150 });
  Object.assign(cheap.trace.view.opponents[0], { bet: 300, stack: 4700, allin: false });
  cheap.trace.view.history[2].amount = 300;
  cheap.trace.odds = 150 / 675;
  const changed = explainOpponent(cheap);
  assert.notEqual(
    changed.detail + changed.reasons.join(''),
    baseline.detail + baseline.reasons.join(''),
  );
  assert.match(changed.detail, /150/);
  assert.deepEqual(changed.metrics, []);
  assert.doesNotMatch(changed.detail, /48\.1%|22\.2%|EV|它|抽样/);
});

test('69o BTN three-bet and Mia AQo four-bet explain the actual limper, opener and chips paid', () => {
  const game = causalReraiseGame();
  const snapshot = game.decisions[0];
  const result = analyzeDecision(snapshot, { trials: 120, rolloutTrials: 12 });
  const hero = result.coaching.explanation + result.coaching.followUp;
  assert.match(hero, /6/);
  assert.match(hero, /9/);
  assert.match(hero, /BTN/);
  assert.match(hero, /350/);
  assert.match(hero, /Luna|CO/);
  assert.match(hero, /200/);
  assert.match(hero, /River|跛入|跟注 50/);
  assert.doesNotMatch(hero, /EV|模型|模拟器|随机范围|有效剩余|新增投入|尚(?:可)?行动 0|0 人尚/);
  assert.doesNotMatch(result.evidence.join(''), /权益.*%|跟注.*赔率|盈亏平衡/);
  assert.match(result.evidence.join(''), /5,000/);
  assert.match(result.evidence.join(''), /350/);
  const fold = analyzeDecision(game.decisions[1], { trials: 120, rolloutTrials: 12 });
  const callPrice = fold.evidence.find((line) => line.includes('底池赔率'));
  assert.match(callPrice, /650/);
  assert.match(callPrice, /4,050/);
  assert.match(callPrice, /5\.23\s*:\s*1/);
  assert.match(callPrice, /16\.0%/);
  assert.doesNotMatch(fold.coaching.explanation + fold.coaching.followUp, /EV|模型|模拟器|抽样/);

  const opponent = explainOpponent(game.botDecisions[0]);
  const text = [opponent.detail, ...opponent.reasons].join('');
  assert.match(text, /Mia/);
  assert.match(text, /A/);
  assert.match(text, /Q/);
  assert.match(text, /4-bet/);
  assert.match(text, /1,000/);
  assert.match(text, /350/);
  assert.match(text, /975/);
  assert.doesNotMatch(text, /它|EV|模拟器|抽样|尚(?:可)?行动 0|0 人尚/);
  assert.deepEqual(opponent.metrics, []);
  const hidden = structuredClone(game.botDecisions[0]);
  hidden.trace.view.opponents[0].hole = cards('As Ah');
  hidden.trace.view.futureDeck = cards('2s 3h 4d');
  hidden.trace.view.winner = 0;
  assert.deepEqual(explainOpponent(hidden), opponent);
});

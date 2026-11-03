import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDecision } from '../../src/review/analysis.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { cards } from '../fixtures/deceptive-decisions.js';
import { observerRecord } from '../fixtures/opponent-observer.js';

const options = { trials: 120, rollouts: false };
const summary = (review) =>
  review.paragraphs.slice(review.paragraphs.indexOf('复盘分析总结') + 1).join('');
function spot(hole, board, changes = {}) {
  const community = cards(board);
  const s = {
    id: 0,
    index: 0,
    hand: 1,
    position: 'BB',
    bigBlind: 50,
    smallBlind: 25,
    chipUnit: 25,
    hole: cards(hole),
    board: community,
    street: community.length ? community.length - 2 : 0,
    stack: 5000,
    total: 500,
    bet: 0,
    pot: 1000,
    currentBet: 0,
    minRaise: 50,
    action: 'check',
    amount: 0,
    pending: [0, 1],
    history: [],
    players: [
      {
        id: 0,
        name: '你',
        position: 'BB',
        stack: 5000,
        total: 500,
        bet: 0,
        folded: false,
        allin: false,
      },
      {
        id: 1,
        name: 'River',
        position: 'BTN',
        stack: 5000,
        total: 500,
        bet: 0,
        folded: false,
        allin: false,
      },
    ],
    ...changes,
  };
  Object.assign(s.players[0], { stack: s.stack, bet: s.bet, total: s.total, position: s.position });
  s.legal = {
    enabled: true,
    chipUnit: 25,
    canCheck: !s.currentBet,
    canRaise: true,
    toCall: Math.max(0, s.currentBet - s.bet),
    callAmount: Math.min(s.stack, Math.max(0, s.currentBet - s.bet)),
    minRaiseTo: s.currentBet ? s.currentBet * 2 : 50,
    maxRaiseTo: s.stack + s.bet,
  };
  return s;
}

test('hero draw checks state outs and the pending-action reminder only once', () => {
  const r = analyzeDecision(spot('Ah Jh', 'Kh 7h 2c 9s'), options);
  const text = summary(r.coaching);
  assert.equal(r.draw.outs, 9);
  assert.equal((text.match(/9 张牌可能补成同花/g) || []).length, 1);
  assert.equal((text.match(/再遇下注时/g) || []).length, 1);
  assert.doesNotMatch(text, /本轮还有 1 人能行动|后面仍有玩家可以下注|已经不能诱导/);
  assert.match(text, /这次过牌没有增加投入/);
  assert.doesNotMatch(text, /本轮不增加投入/);
});

test('a completed turn flush is one concrete warning rather than two equivalent warnings', () => {
  const text = summary(analyzeDecision(spot('Jc 3h', 'Kh Ks 8s 9s'), options).coaching);
  assert.equal((text.match(/补出了第三张黑桃/g) || []).length, 1);
  assert.doesNotMatch(text, /公共牌已有三张同花色/);
  assert.equal((text.match(/再遇下注时/g) || []).length, 1);
});

test('an opponent checking private two pairs explains retaining a strong hand without coaching that opponent', () => {
  const r = observerRecord({
    action: 'check',
    reason: 'free-check',
    hole: 'Tc 9s',
    board: '4d Td 9c',
    cost: 0,
  });
  const text = summary(explainOpponent(r));
  assert.match(text, /两对/);
  assert.match(text, /强成牌.*(?:保留|过牌)/);
  assert.doesNotMatch(text, /过牌可能少收|已经不能诱导|再遇下注时|应比较|需要比较/);
});

test('a lower full house on a double-paired board names the higher full house and avoids duplicate river value filler', () => {
  const r = observerRecord({
    action: 'raise',
    reason: 'value-raise',
    hole: 'Ts Jh',
    board: 'Tc 9h Th As Ad',
    cost: 0,
    stack: 3000,
  });
  r.amount = 1100;
  const text = summary(explainOpponent(r));
  assert.match(text, /A 对.*底牌中的 A.*三张 A.*更大葫芦.*三张 10/);
  assert.doesNotMatch(text, /河牌已经发完，价值来自较弱成牌愿意跟注/);
});

test('opponent value raises preserve the real offer and the unmatched refund', () => {
  const r = observerRecord({
    action: 'raise',
    reason: 'value-raise',
    hole: 'As Ah',
    board: 'Kd 8c 2h',
    cost: 0,
    stack: 3000,
  });
  r.amount = 2400;
  Object.assign(r.trace.view, { bet: 0, total: 500, pot: 1000, currentBet: 0 });
  Object.assign(r.trace.view.opponents[0], { stack: 1900, total: 500, bet: 0 });
  const text = summary(explainOpponent(r));
  assert.match(text, /2.4K/);
  assert.match(text, /至少 500 无法被匹配/);
  assert.match(text, /最多 1.9K/);
});

test('a small multiway gutshot bet is a conditional candidate, not automatically a good play', () => {
  const s = spot('8c 2h', '5h 9c 6d Js', { action: 'raise', amount: 200, pot: 3000 });
  for (let id = 2; id <= 4; id++)
    s.players.push({
      id,
      name: 'Peer' + id,
      position: id === 4 ? 'CO' : 'HJ',
      stack: 5000,
      total: 500,
      bet: 0,
      folded: false,
      allin: false,
    });
  s.pending = s.players.map((p) => p.id);
  const r = analyzeDecision(s, options);
  assert.equal(r.draw.outs, 4);
  assert.equal(r.coaching.assessmentLabel, '需要比较');
  assert.equal(r.coaching.label, '需要比较', 'The action taken is not repeated as advice');
  assert.match(r.coaching.suggestion, /^建议下注至 200$/);
  assert.match(r.coaching.recommendedAction.condition, /共同弃牌空间.*补牌/);
});

test('a competitive early-position unraised fold is compared instead of endorsed without its range condition', () => {
  const s = spot('As Jh', '', { action: 'fold', position: 'UTG', currentBet: 50, pot: 75 });
  const r = analyzeDecision(s, options);
  assert.equal(r.coaching.label, '需要比较', 'The fold taken is not repeated as advice');
  assert.equal(r.coaching.suggestion, '建议弃牌');
  assert.equal(r.coaching.assessmentLabel, '需要比较');
  assert.equal(r.coaching.recommendationConditional, true);
});

test('a positive tiny wager is shown as a nonzero fraction rather than 0.0 pots', () => {
  const r = analyzeDecision(
    spot('As Ah', 'Kh 7c 2d', { action: 'raise', amount: 200, pot: 7500 }),
    options,
  );
  assert.match(r.evidence.join(''), /2.67%/);
  assert.doesNotMatch(r.evidence.join(''), /0.0 倍/);
});

test('preflop reraise explanations state the hand risk once and separate it from the aggression purpose', () => {
  for (const [hole, anchor] of [
    ['As Kd', /AK 击中 A 或 K/g],
    ['Qs Qd', /这手对子仍有摊牌机会/g],
  ]) {
    const s = spot(hole, '', {
      position: 'BTN',
      action: 'raise',
      amount: 2000,
      currentBet: 400,
      pot: 650,
      history: [
        { id: 1, street: 0, action: 'raise', amount: 100 },
        { id: 0, street: 0, action: 'raise', amount: 200 },
        { id: 1, street: 0, action: 'raise', amount: 400 },
      ],
    });
    s.bet = s.players[0].bet = 200;
    s.players[1].bet = 400;
    Object.assign(s.legal, { callAmount: 200, toCall: 200, minRaiseTo: 600, maxRaiseTo: 5200 });
    const text = summary(analyzeDecision(s, options).coaching);
    assert.equal((text.match(anchor) || []).length, 1);
    assert.match(text, /明显落后。/);
    assert.match(text, /较弱牌.*(?:付费|跟注).*更(?:好|强).*弃牌/);
    s.amount = s.legal.maxRaiseTo;
    const allinText = summary(analyzeDecision(s, options).coaching);
    assert.match(allinText, /实际已经全下.*不能再靠后街/);
    assert.doesNotMatch(
      allinText,
      /根据实际公共牌和价格决定后续投入|若被跟注，按位置与实际公共牌判断后续投入/,
    );
  }
});

test('calling two small bets before a river lead remains visible even when the hero actually reraises', () => {
  const s = spot('Kd 4c', '4s 9h 9c Ad 6d', {
    action: 'raise',
    amount: 800,
    currentBet: 400,
    pot: 5000,
  });
  s.history = [
    { id: 1, street: 1, action: 'check', amount: 0 },
    { id: 0, street: 1, action: 'raise', amount: 50 },
    { id: 1, street: 1, action: 'call', amount: 50 },
    { id: 1, street: 2, action: 'check', amount: 0 },
    { id: 0, street: 2, action: 'raise', amount: 50 },
    { id: 1, street: 2, action: 'call', amount: 50 },
    { id: 1, street: 3, action: 'raise', amount: 400 },
  ];
  const r = analyzeDecision(s, options),
    text = summary(r.coaching);
  assert.match(text, /此前的公开行动/);
  assert.match(text, /翻牌 跟注 50.*转牌.*跟注 50.*河牌 下注至 400/);
  assert.match(r.coaching.label, /^建议(?:跟注 400|弃牌)$/);
  for (const p of s.players.slice(1))
    Object.defineProperty(p, 'hole', {
      get() {
        throw Error('hidden cards read');
      },
    });
  s.futureDeck = cards('5s 5d');
  s.winners = [1];
  assert.deepEqual(analyzeDecision(s, options).coaching, r.coaching);
});

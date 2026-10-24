import test from 'node:test';
import assert from 'node:assert/strict';
import { coachDecision } from '../../src/review/coaching.js';
import { handMatchups } from '../../src/review/matchups.js';
import { situationNotes } from '../../src/review/narrative.js';
import { decisionContext } from '../../src/review/context.js';
import { cards } from '../fixtures/deceptive-decisions.js';
import { turnBluffReview } from '../fixtures/review-summary.js';

function spot({
  hole = '5c 5d',
  board = '4d Qh Ah 5h',
  action = 'check',
  amount = 0,
  stack = 20000,
  cost = 0,
  pending = [0, 1],
  pot = 2000,
} = {}) {
  const s = turnBluffReview();
  return {
    ...s,
    hole: cards(hole),
    board: cards(board),
    street: board ? board.split(' ').length - 2 : 0,
    action,
    amount,
    stack,
    bet: 0,
    pot,
    pending,
    currentBet: cost,
    history: [],
    players: [
      { id: 0, name: '你', position: 'BB', stack, bet: 0, total: 400 },
      { id: 1, name: '对手', position: 'BTN', stack: 20000, bet: cost, total: 400 + cost },
    ],
    legal: { ...s.legal, canCheck: !cost, callAmount: cost, toCall: cost, maxRaiseTo: stack },
  };
}

function review(
  s,
  {
    code = 'free-check',
    action = { action: 'check', amount: 0 },
    reason = '',
    status = 'consider',
    closing = false,
  } = {},
) {
  const context = decisionContext(s);
  return {
    context,
    draw: context.draw,
    code,
    reason,
    status,
    metrics: {
      required: 0.25,
      equityLow: 0.4,
      uncertainty: 0.08,
      contestable: s.pot + s.legal.callAmount,
      randomEV: 0,
      weightedEV: 0,
      closing,
    },
    routes: { primary: action },
  };
}

const summary = (result) =>
  result.paragraphs.slice(result.paragraphs.indexOf('复盘分析总结') + 1).join('');

test('a value-bet recommendation explains checking as a tradeoff, rather than first advocating pot control', () => {
  const s = spot({ hole: '8h Tc', board: 'Kc 6h 3d 8s Th' });
  const r = review(s, { code: 'value-check', action: { action: 'raise', amount: 1300 } });
  const c = coachDecision(s, r),
    text = summary(c);
  assert.deepEqual(c.recommendedAction, { action: 'raise', amount: 1300 });
  assert.match(text, /过牌.*但也可能少收.*较弱成牌/);
  assert.match(text, /这些风险不等于必须放弃取值/);
  assert.match(text, /这手建议下注至 1.3K/);
  assert.doesNotMatch(text, /过牌先不主动做大底池|起手牌付费/);
});

test('a folded actor whose alternative call uses all remaining chips never receives later raise decisions', () => {
  const s = spot({ hole: 'Qd 8s', board: '', action: 'fold', stack: 500, cost: 500 });
  const r = review(s, { code: 'tight-fold', action: { action: 'fold', amount: 0 } });
  const c = coachDecision(s, r);
  assert.match(c.followUp, /若改为跟注.*全部剩余 500.*不再参与下注或弃牌决策/);
  assert.doesNotMatch(c.followUp, /后面的玩家再加注时.*重新决定|下一街还要面对新的/);
});

test('a called all-in keeps made-hand and draw reasons, without equating draw chance to winning chance', () => {
  const s = spot({
    hole: 'Qc 5d',
    board: '7c 5c 6d 2c',
    action: 'call',
    amount: 800,
    stack: 800,
    cost: 800,
  });
  const r = review(s, {
    code: 'price-call',
    action: { action: 'call', amount: 800 },
    status: 'sound',
  });
  const c = coachDecision(s, r),
    text = summary(c);
  assert.match(text, /你已有非顶对 5.*未补成听牌.*较弱成牌或未成牌的诈唬/);
  assert.match(text, /同花听牌.*9 张改善候选.*不等于全部获胜机会/);
  assert.match(text, /无需再支付筹码/);
  assert.match(text, /三张同花色.*两张该花色.*同花/);
  assert.doesNotMatch(c.followUp, /后面的玩家再加注时.*重新决定/);
});

test('a set on a four-flush turn retains its boat and quads redraw in the practice advice', () => {
  const s = spot({ hole: '4s 4c', board: '4h 9h 2h Qh', action: 'raise', amount: 200 });
  const r = review(s, { code: 'pressure-bet', action: { action: 'check', amount: 0 } });
  const c = coachDecision(s, r),
    text = summary(c);
  assert.match(text, /暗三条 4/);
  assert.match(text, /一张该花色.*同花/);
  assert.match(text, /改善为葫芦或四条/);
  assert.match(c.followUp, /改善为葫芦或四条/);
  assert.doesNotMatch(c.followUp, /当前没有听牌托底/);
});

test('a newly made full house is described with its actual three-and-two ranks', () => {
  const s = spot({ hole: '4h 4d', board: '8c 4c Qd 8h', action: 'raise', amount: 1000 });
  const r = review(s, {
    code: 'value-bet',
    action: { action: 'raise', amount: 1000 },
    status: 'sound',
  });
  const text = summary(coachDecision(s, r));
  assert.match(text, /葫芦（三张 4 加两张 8）/);
  assert.doesNotMatch(text, /目前已有成牌，下注的价值/);
});

test('an overpot underpair shove is not justified by charging weaker hands and denying high cards', () => {
  const s = spot({
    hole: '8s 8d',
    board: 'Ac 3h Jh',
    action: 'raise',
    amount: 6600,
    stack: 6600,
    pot: 4500,
  });
  const r = review(s, { code: 'pressure-bet', action: { action: 'check', amount: 0 } });
  const text = summary(coachDecision(s, r));
  assert.match(text, /达到或超过当前底池.*很难让更小对子或未成对高张付费/);
  assert.match(text, /不能只用保护对子说明/);
  assert.doesNotMatch(text, /下注可以让更小对子.*高张付费/);
});

test('a small middle-pair bet admits conditional thin value and protection without declaring a pure bluff', () => {
  const s = spot({ hole: 'Ks 9s', board: '9h Jd 8h', action: 'raise', amount: 200, pot: 1400 });
  const r = review(s, { code: 'pressure-bet', action: { action: 'check', amount: 0 } });
  const text = summary(coachDecision(s, r));
  assert.match(text, /小尺度可能让较弱的一对或听牌付费/);
  assert.match(text, /不能仅凭不是顶对.*诈唬/);
  assert.doesNotMatch(text, /这次下注主要需要更好的牌弃掉/);
});

test('a raise over limpers describes isolation rather than uncontested blind stealing', () => {
  const s = spot({ hole: 'Jc 4d', board: '', action: 'raise', amount: 400 });
  s.history = [{ id: 1, street: 0, action: 'call', amount: 200 }];
  const r = review(s, {
    code: 'weak-limper-isolation',
    action: { action: 'fold', amount: 0 },
    reason: '较弱散牌面对已入池玩家，需要更多继续依据。',
  });
  const text = summary(coachDecision(s, r));
  assert.match(text, /已有 1 位玩家跟注入池.*隔离这些玩家/);
  assert.doesNotMatch(text, /这次进攻可以直接争夺盲注/);
});

test('a minimal strong-hand value bet discusses missed value as well as excessive sizing', () => {
  const s = spot({ hole: '6h 6d', board: '5h Kd 6s', action: 'raise', amount: 200, pot: 3000 });
  const r = review(s, {
    code: 'undersized-value-bet',
    action: { action: 'raise', amount: 1600 },
    reason: '这次下注尺度很小，可以比较更充分的价值下注。',
  });
  const c = coachDecision(s, r),
    text = summary(c);
  assert.equal(c.supported, false);
  assert.match(text, /少收价值.*很低成本继续/);
  assert.match(c.followUp, /比较较大尺度.*弱牌愿意支付/);
});

test('a weak-hand checking practice concerns free cards and public pressure, not hypothetical weak calls', () => {
  const s = spot({ hole: '8h Tc', board: 'Kc 6h 3d', pending: [0, 1] });
  const r = review(s, { action: { action: 'check', amount: 0 }, status: 'sound' });
  const c = coachDecision(s, r);
  assert.match(c.followUp, /观察后面玩家是否下注.*金额.*过牌不保证本轮免费/);
  assert.doesNotMatch(c.followUp, /弱牌接下注/);
});

test('coaching remains invariant when rival hidden cards, future deck and winner are inaccessible', () => {
  const s = spot({ hole: '5c 5d', board: '4d Qh Ah 5h', action: 'call', amount: 500, cost: 500 });
  const r = review(s, { action: { action: 'call', amount: 500 }, status: 'sound' });
  const before = coachDecision(s, r);
  Object.defineProperty(s.players[1], 'hole', {
    get() {
      throw Error('hidden cards read');
    },
  });
  Object.defineProperty(s, 'futureDeck', {
    get() {
      throw Error('future cards read');
    },
  });
  Object.defineProperty(s, 'winners', {
    get() {
      throw Error('winners read');
    },
  });
  assert.deepEqual(coachDecision(s, r), before);
});

test('a planned postflop value shove retains its range-based value rationale after the made-hand prefix', () => {
  const s = spot({ hole: '4h 4d', board: '8c 4c Qd 8h', action: 'raise', amount: 20000 });
  const r = review(s, { code: 'deep-value-shove', action: { action: 'raise', amount: 20000 } });
  r.context.valuePlan = {
    kind: 'value-shove',
    primary: { action: 'raise', amount: 20000 },
    reason: '这手葫芦可以向愿意支付全下的三条争取价值，但仍需比较对手继续范围。',
  };
  const text = summary(coachDecision(s, r));
  assert.match(text, /葫芦（三张 4 加两张 8）/);
  assert.match(text, /愿意支付全下的三条.*继续范围/);
});

for (const [code, configuration, candidate] of [
  [
    'weak-sb-cold-call',
    { hole: '4c 8d', board: '', action: 'call', amount: 200, cost: 200, stack: 1950 },
    { action: 'fold', amount: 0 },
  ],
  [
    'weak-limper-isolation',
    { hole: 'Jc 4d', board: '', action: 'raise', amount: 400 },
    { action: 'fold', amount: 0 },
  ],
  [
    'dangerous-value-shove',
    {
      hole: 'Qs 5d',
      board: '5h Tc Jh 5c Kh',
      action: 'raise',
      amount: 13800,
      stack: 13800,
      pot: 5000,
    },
    { action: 'check', amount: 0 },
  ],
  [
    'undersized-value-bet',
    { hole: '6h 6d', board: '5h Kd 6s', action: 'raise', amount: 200, pot: 3000 },
    { action: 'raise', amount: 200 },
  ],
  [
    'dirty-draw-bet',
    { hole: 'Jc 4d', board: 'Ts 2s As Ks', action: 'raise', amount: 200 },
    { action: 'check', amount: 0 },
  ],
]) {
  test(`${code} uses public player-facing reasons without exposing the analysis reason or duplicating risk clauses`, () => {
    const s = spot(configuration);
    const r = review(s, { code, action: candidate });
    Object.defineProperty(r, 'reason', {
      get() {
        throw Error('raw analysis reason read');
      },
    });
    const result = coachDecision(s, r),
      text = summary(result);
    assert.doesNotMatch(text, /随机范围|加权范围|抽样|\bEV\b|模型|两种估计/);
    for (const risk of ['公共牌已有三张同花色', '公共牌已有至少四张同花色', '公共牌已配对'])
      assert.ok(text.split(risk).length <= 2, risk);
    if (code === 'weak-sb-cold-call') {
      assert.match(text, /要补 200.*行动前筹码的 10.3%.*至少 25.0% 的胜率/);
      assert.match(text, /小盲.*翻后通常先行动.*更好踢脚/);
    }
    if (code === 'dangerous-value-shove')
      assert.match(text, /一对或两对.*底池的 2.8 倍.*较小下注.*整笔全下/);
    if (code === 'undersized-value-bet') {
      assert.deepEqual(result.recommendedAction, candidate);
      assert.match(text, /保留原下注作为比较基准.*尚未确认它更好/);
    }
    if (code === 'dirty-draw-bet')
      assert.match(text, /补成顺子.*仍会输给同花.*不能把这些牌全当成获胜补牌/);
  });
}

test('a small actual value bet is not described as execution of a merely available shove plan', () => {
  const s = spot({ hole: '4h 4d', board: '8c 4c Qd 8h', action: 'raise', amount: 200 });
  const r = review(s, {
    code: 'value-bet',
    action: { action: 'raise', amount: 200 },
    status: 'sound',
  });
  r.context.valuePlan = {
    kind: 'value-shove',
    primary: { action: 'raise', amount: s.legal.maxRaiseTo },
    reason: '已经执行全下计划',
  };
  const text = summary(coachDecision(s, r));
  assert.match(text, /本次较小下注.*也可能少收价值/);
  assert.doesNotMatch(text, /已经执行全下计划/);
});

for (const action of ['call', 'fold', 'raise']) {
  test(`shared current nuts remain a split-pot hand in ${action} coaching and practice`, () => {
    const s = spot({
      hole: '4s Tc',
      board: 'As Kd Qh Jc Ts',
      action,
      amount: action === 'raise' ? 200 : 100,
      cost: 100,
    });
    const r = review(s, { code: 'board-call', action: { action: 'call', amount: 100 } });
    r.context.matchups = { nut: true };
    const result = coachDecision(s, r),
      text = summary(result);
    assert.match(text, /公共牌已是最大成牌.*对手至多组成相同/);
    assert.doesNotMatch(text, /对手仍可能用底牌组成更大/);
    assert.match(result.followUp, /平分机会不能算成独占底池.*对手不能组成更大的牌/);
    assert.doesNotMatch(result.followUp, /没有直接顺子或同花听牌/);
  });
}

test('a shared non-nut board keeps the genuine risk that a rival can improve it', () => {
  const s = spot({
    hole: '2h 3d',
    board: 'Qh Qd Jc Js 9s',
    action: 'call',
    amount: 100,
    cost: 100,
  });
  const r = review(s, { code: 'board-call', action: { action: 'call', amount: 100 } });
  r.context.matchups = { nut: false };
  const text = summary(coachDecision(s, r));
  assert.match(text, /对手仍可能用底牌组成更大的牌/);
  assert.doesNotMatch(text, /对手至多组成相同/);
});

test('an ordinary strong value bet explains weaker paying hands before higher-flush risk', () => {
  const s = spot({
    hole: '5c Td',
    board: 'Qc 2c Jc 7c 9s',
    action: 'raise',
    amount: 1800,
    pot: 3600,
  });
  const r = review(s, {
    code: 'value-bet',
    action: { action: 'raise', amount: 1800 },
    status: 'sound',
  });
  const text = summary(coachDecision(s, r));
  assert.match(text, /仍能领先更低同花或顺子.*较弱牌愿意跟注/);
  assert.ok(text.indexOf('下注的价值来自') < text.indexOf('更高的同花领先'));
});

test('folding a low flush draw explains why formal completion chance above the price is not enough', () => {
  const s = spot({ hole: '7h 3h', board: 'Ah Jc 8h 2s', action: 'fold', cost: 150, pot: 650 });
  s.players.push({ id: 2, name: '另一位对手', position: 'CO', stack: 20000, bet: 150, total: 800 });
  s.history = [
    { id: 1, street: 1, action: 'raise', amount: 50 },
    { id: 1, street: 2, action: 'raise', amount: 150 },
  ];
  const r = review(s, { code: 'draw-fold', action: { action: 'fold', amount: 0 } });
  r.metrics.required = 0.1875;
  const text = summary(coachDecision(s, r));
  assert.match(text, /18.8%.*不是最大同花听牌.*更高的同花/);
  assert.match(text, /多位对手.*连续多街下注/);
});

test('a pending response after a short all-in does not invent a reopened raise', () => {
  const s = spot({
    hole: 'As Ah',
    board: '',
    action: 'call',
    amount: 150,
    cost: 150,
    stack: 7050,
    pot: 1525,
  });
  Object.assign(s, {
    smallBlind: 25,
    bigBlind: 50,
    chipUnit: 25,
    position: 'BB',
    bet: 450,
    currentBet: 600,
    minRaise: 300,
    pending: [0, 1],
  });
  s.legal = {
    ...s.legal,
    chipUnit: 25,
    canRaise: false,
    raiseReopened: false,
    minRaiseTo: 900,
    fullRaiseTo: 900,
    maxRaiseTo: 7500,
  };
  s.players = [
    {
      id: 0,
      name: '你',
      position: 'BB',
      stack: 7050,
      bet: 450,
      total: 450,
      folded: false,
      allin: false,
      actedTo: 450,
    },
    {
      id: 1,
      name: '对手',
      position: 'UTG',
      stack: 7050,
      bet: 450,
      total: 450,
      folded: false,
      allin: false,
      actedTo: 450,
    },
    {
      id: 2,
      name: '短筹码',
      position: 'LJ',
      stack: 0,
      bet: 600,
      total: 600,
      folded: false,
      allin: true,
      actedTo: 600,
    },
    {
      id: 3,
      name: '已弃牌',
      position: 'SB',
      stack: 7475,
      bet: 25,
      total: 25,
      folded: true,
      allin: false,
      actedTo: null,
    },
  ];
  s.history = [
    { id: 1, street: 0, action: 'raise', amount: 150 },
    { id: 0, street: 0, action: 'raise', amount: 450 },
    { id: 1, street: 0, action: 'call', amount: 300 },
    { id: 2, street: 0, action: 'raise', amount: 600 },
  ];
  const r = review(s, {
    code: 'price-call',
    action: { action: 'call', amount: 150 },
    status: 'sound',
  });
  const result = coachDecision(s, r);
  assert.match(result.followUp, /补跟或弃牌.*没有重新加注权/);
  assert.doesNotMatch(result.followUp, /他们再加注时.*重新决定|后面的玩家再加注时/);
  assert.doesNotMatch(summary(result), /他们再加注时.*重新决定|后面的玩家再加注时/);
});

test('a non-all-in raise covering every opponent does not plan later reraises', () => {
  const s = spot({ hole: '9s 8s', board: 'Ts 7s 2d', action: 'raise', amount: 5000, stack: 20000 });
  s.players[1].stack = 2000;
  const r = review(s, {
    code: 'draw-raise',
    action: { action: 'raise', amount: 5000 },
    status: 'sound',
  });
  const result = coachDecision(s, r);
  assert.match(result.followUp, /已覆盖所有.*没有更多筹码继续加注或后街下注/);
  assert.doesNotMatch(result.followUp, /若对手再加注/);
});

for (const hole of ['Qs Qd', '5s 5d', 'As Kd']) {
  test(`${hole} multiple-bet purpose is consistent between summary and practice`, () => {
    const s = spot({ hole, board: '', action: 'raise', amount: 6250, stack: 6350 });
    s.bet = 1150;
    s.history = [
      { id: 0, street: 0, action: 'raise', amount: 150 },
      { id: 1, street: 0, action: 'raise', amount: 450 },
      { id: 0, street: 0, action: 'raise', amount: 1150 },
      { id: 1, street: 0, action: 'raise', amount: 2500 },
    ];
    const r = review(s, {
      code: 'pressure-raise',
      action: { action: 'raise', amount: 6250 },
      status: 'sound',
    });
    const result = coachDecision(s, r);
    const purpose =
      hole === 'As Kd'
        ? /分别判断较弱牌会不会付费，以及更好的牌会不会弃掉/
        : /分别判断较弱牌是否会跟注、更强牌是否可能弃牌/;
    assert.match(summary(result), purpose);
    assert.match(result.followUp, purpose);
    assert.doesNotMatch(result.followUp, /让这手强起手牌收取价值/);
  });
}

test('dry value-check advice has no dangling reference to unmentioned risks', () => {
  const s = spot({ hole: 'As Kd', board: 'Ah 8c 2d' });
  const r = review(s, { code: 'value-check', action: { action: 'raise', amount: 1200 } });
  assert.doesNotMatch(summary(coachDecision(s, r)), /这些风险/);
});

test('draw-call practice combines current showdown and improvement chances rather than using draw chance alone', () => {
  const s = spot({
    hole: 'As Js',
    board: 'Kh 7s 2s 9d',
    action: 'call',
    amount: 100,
    cost: 100,
    pot: 250,
  });
  const r = review(s, {
    code: 'price-call',
    action: { action: 'call', amount: 100 },
    status: 'sound',
  });
  const focus = coachDecision(s, r).followUp;
  assert.match(focus, /综合当前摊牌机会与下一张改善.*后续新增下注成本另算/);
  assert.doesNotMatch(focus, /只把下一张的机会算进/);
});

test('full-house value examples do not invent an impossible smaller full house', () => {
  const s = spot({ hole: '4h 4d', board: '8c 4c Qd 8h', action: 'raise', amount: 1600, pot: 2500 });
  const r = review(s, {
    code: 'pressure-bet',
    action: { action: 'raise', amount: 1600 },
    status: 'sound',
  });
  r.context.matchups = handMatchups(s, r.context);
  assert.ok(r.context.matchups.weakerMadeCategories.includes(3));
  assert.ok(!r.context.matchups.weakerMadeCategories.includes(6));
  const text = summary(coachDecision(s, r));
  assert.match(text, /仍能领先三条/);
  assert.doesNotMatch(text, /较小葫芦/);
});

test('a possible smaller full house remains a value target when the public examples contain one', () => {
  const s = spot({
    hole: 'Ks Kd',
    board: 'Kh Qc Qd 8s 5h',
    action: 'raise',
    amount: 1600,
    pot: 2500,
  });
  const r = review(s, {
    code: 'pressure-bet',
    action: { action: 'raise', amount: 1600 },
    status: 'sound',
  });
  r.context.matchups = handMatchups(s, r.context);
  assert.ok(r.context.matchups.weakerMadeCategories.includes(6));
  assert.match(summary(coachDecision(s, r)), /较小葫芦/);
});

test('a value raise facing a bet compares legal smaller raises or calls, never checking', () => {
  for (const amount of [225, 450]) {
    const s = spot({
      hole: '5c 5d',
      board: '5h Kh 2s 9d',
      action: 'raise',
      amount,
      cost: 75,
      pot: 1000,
    });
    s.legal.minRaiseTo = 225;
    const r = review(s, {
      code: 'pressure-bet',
      action: { action: 'raise', amount },
      status: 'sound',
    });
    const text = summary(coachDecision(s, r));
    assert.match(text, amount === 225 ? /应比较跟注/ : /较小的合法加注或跟注/);
    assert.doesNotMatch(text, /更小下注或过牌/);
  }
});

test('AK facing repeated raises cannot be dominated by a better high-card kicker', () => {
  const s = spot({
    hole: 'As Kd',
    board: '',
    action: 'raise',
    amount: 6250,
    cost: 2500,
    pot: 4000,
  });
  s.history = [
    { id: 0, street: 0, action: 'raise', amount: 150 },
    { id: 1, street: 0, action: 'raise', amount: 450 },
    { id: 0, street: 0, action: 'raise', amount: 1150 },
    { id: 1, street: 0, action: 'raise', amount: 2500 },
  ];
  const r = review(s, {
    code: 'pressure-raise',
    action: { action: 'raise', amount: 6250 },
    status: 'sound',
  });
  const c = coachDecision(s, r);
  assert.match(summary(c) + c.followUp, /顶对顶踢脚潜力.*AA、KK/);
  assert.doesNotMatch(summary(c) + c.followUp, /更好踢脚/);
});

test('an unopened preflop call identifies the forced big blind rather than inventing a bet', () => {
  const s = spot({ hole: 'Tc 9d', board: '', action: 'call', amount: 200, cost: 200 });
  const r = review(s, {
    code: 'priced-call',
    action: { action: 'call', amount: 200 },
    status: 'sound',
  });
  const focus = coachDecision(s, r).followUp;
  assert.match(focus, /当前大盲为 200/);
  assert.doesNotMatch(focus, /面对当前 200 的下注/);
});

test('recent consecutive barrels take priority over an old free preflop check', () => {
  const s = spot({
    hole: 'Qh 9c',
    board: 'Ac 3h Jd 6s 2c',
    action: 'call',
    amount: 1000,
    cost: 1000,
  });
  s.history = [
    { id: 1, street: 0, action: 'check', amount: 0 },
    { id: 1, street: 1, action: 'raise', amount: 200 },
    { id: 0, street: 1, action: 'call', amount: 200 },
    { id: 1, street: 2, action: 'raise', amount: 400 },
    { id: 0, street: 2, action: 'call', amount: 400 },
    { id: 1, street: 3, action: 'raise', amount: 1000 },
  ];
  const text = situationNotes(s, decisionContext(s)).join('');
  assert.match(text, /翻牌.*200.*转牌.*400.*河牌.*1K.*连续施压/);
  assert.doesNotMatch(text, /此前在翻牌前过牌/);
  const checked = structuredClone(s);
  checked.history[3] = { id: 1, street: 2, action: 'check', amount: 0 };
  checked.history.splice(4, 1);
  const paused = situationNotes(checked, decisionContext(checked)).join('');
  assert.match(paused, /此前在翻牌前、转牌过牌/);
  assert.doesNotMatch(paused, /连续施压/);
});

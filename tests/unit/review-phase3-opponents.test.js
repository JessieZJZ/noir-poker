import test from 'node:test';
import assert from 'node:assert/strict';
import { explainOpponent } from '../../src/review/opponents.js';
import { cards, deceptiveView } from '../fixtures/deceptive-decisions.js';

function record(hole, board, reason, options = {}) {
  const {
    action = 'call',
    cost = 300,
    stack = 300,
    pot = 1000,
    pending = [],
    opponents = [{ id: 0, name: '你', position: 'SB', stack: 0, bet: cost, allin: true }],
    ...overrides
  } = options;
  const view = deceptiveView(hole, board, {
    count: opponents.length + 1,
    position: 'BTN',
    stack,
    pot,
    contestable: pot + cost,
    currentBet: cost,
    opponents,
    actionContext: { pendingResponseIds: pending },
    history: cost
      ? [
          {
            id: 0,
            street: board ? (board.split(' ').length === 5 ? 3 : board.split(' ').length - 2) : 0,
            action: 'raise',
            amount: cost,
          },
        ]
      : [],
    legal: {
      chipUnit: 25,
      enabled: true,
      canCheck: !cost,
      callAmount: cost,
      toCall: cost,
      canRaise: stack > cost,
      minRaiseTo: cost ? cost * 2 : 50,
      maxRaiseTo: stack,
    },
    ...overrides,
  });
  return {
    id: 1,
    name: 'Kai',
    action,
    amount: action === 'call' ? cost : 0,
    trace: { view, reason, profile: 'balanced', mode: 'off' },
  };
}

const summary = (r) => explainOpponent(r).paragraphs.at(-1);

test('an opponent closing the turn call keeps its draw and price without coaching the river', () => {
  const r = record('8s 7c', 'Tc 6c Kd 4d', 'legacy-unknown', {
    cost: 400,
    stack: 1600,
    pot: 1200,
    opponents: [
      { id: 0, name: '你', position: 'SB', stack: 1600, bet: 400, total: 600, allin: false },
    ],
  });
  const text = summary(r);
  assert.match(text, /双卡顺听牌.*8 张牌.*继续要补 400.*25.0%/);
  assert.doesNotMatch(text, /不保证免费见完|不再有后续下注|仍需另作决定|需要按新的价格/);
});

test('a no-pair all-in call keeps its real open-ended improvement rather than relying on high card', () => {
  const r = record('8d Jh', 'Ac Tc 4s 9h', 'price-continue');
  const text = summary(r);
  assert.match(text, /主要依靠两头顺听牌改善/);
  assert.match(text, /8 张牌可能补成顺子/);
  assert.match(text, /7 \/ Q 落下时可以补成顺子/);
  assert.match(text, /补中也不保证获胜/);
  assert.match(text, /这次补 300，可争夺 1.3K/);
  assert.match(text, /之后不再参与下注决策/);
  assert.doesNotMatch(text, /用当前高牌争取摊牌获胜|还留.*下一街|河牌.*转诈唬/);
});

test('a pair plus flush draw all-in call keeps both sources of showdown support and the flush risk', () => {
  const r = record('Qc 5d', '7c 5c 6d 2c', 'price-continue', { cost: 800, stack: 800, pot: 2650 });
  const text = summary(r);
  assert.match(text, /当前已有非顶对 5.*较弱成牌或未成牌的诈唬/);
  assert.match(text, /另外还有同花听牌/);
  assert.match(text, /9 张牌可能补成同花/);
  assert.match(text, /补中也不保证获胜/);
  assert.match(text, /三张同花色.*两张该花色/);
});

test('the actor cannot make another decision after calling all-in even if another player still responds', () => {
  const r = record('8d Jh', 'Ac Tc 4s 9h', 'float-continue', {
    pending: [2],
    opponents: [
      { id: 0, name: '你', position: 'SB', stack: 0, bet: 300, allin: true },
      { id: 2, name: 'Luna', position: 'BTN', stack: 1500, bet: 0, allin: false },
    ],
  });
  const text = summary(r);
  assert.match(text, /之后不再参与下注决策/);
  assert.match(text, /可以看完剩余公共牌，无需再支付筹码/);
  assert.doesNotMatch(text, /这位全下者不再跟注、加注或弃牌/);
  assert.doesNotMatch(text, /等下一街观察对手是否停止下注|保留.*后街进攻/);
});

test('calling the sole all-in opponent closes betting even when the actor has chips left', () => {
  const r = record('6c 6d', '', 'affordable-entry', { cost: 500, stack: 1500, pot: 750 });
  const text = summary(r);
  assert.match(text, /口袋 6.*领先更小对子/);
  assert.match(text, /所有对手都已全下.*不再有后续下注/);
  assert.match(text, /看完剩余公共牌，无需再支付筹码/);
  assert.doesNotMatch(text, /可以等翻牌中暗三条|准备继续争取后街价值|下一街是否继续/);
});

test('weak preflop calls describe a wide choice and its price without treating cheapness as proof', () => {
  for (const reason of ['affordable-entry', 'affordable-open', 'price-continue']) {
    const r = record('9s 2d', '', reason, {
      cost: 125,
      stack: 2000,
      pot: 300,
      pending: [2],
      opponents: [
        { id: 0, name: '你', position: 'HJ', stack: 1875, bet: 125, allin: false },
        { id: 2, name: 'Luna', position: 'BB', stack: 1950, bet: 50, allin: false },
      ],
    });
    const review = explainOpponent(r);
    assert.equal(review.title, '用边缘牌宽跟');
    assert.match(summary(r), /较宽地/);
    assert.match(summary(r), /剩余筹码的 6.3%/);
    assert.match(summary(r), /踢脚/);
    assert.match(summary(r), /击中一对.*(?:踢脚|对子).*可能落后|击中一对.*可能被更好的踢脚/);
    assert.doesNotMatch(summary(r), /不能只因|通用建议|需要.*重新决定/);
    assert.doesNotMatch(summary(r), /因此选择跟注入池/);
  }
  const premium = record('As Ah', '', 'affordable-entry', {
    cost: 50,
    stack: 2000,
    opponents: [{ id: 0, name: '你', position: 'SB', stack: 1950, bet: 50, allin: false }],
  });
  assert.match(summary(premium), /顶级对子本身已有很强的摊牌价值/);
  assert.doesNotMatch(summary(premium), /较宽地|较弱踢脚/);
});

test('call and fold on a completed-flush board explain the visible risk and the set redraw', () => {
  for (const action of ['call', 'fold']) {
    const r = record(
      '5c 5d',
      '5h Qh Ah 2h',
      action === 'call' ? 'price-continue' : 'outside-range',
      {
        action,
        cost: 300,
        stack: action === 'call' ? 300 : 1500,
      },
    );
    const text = summary(r);
    assert.match(text, /四张同花色.*一张该花色.*组成同花/);
    assert.match(text, /三条.*改善为葫芦或四条/);
  }
});

test('a dry high-card check explains why it avoids a bluff investment', () => {
  const r = record('Ac Kd', 'Qd 8c 2h', 'free-check', {
    action: 'check',
    cost: 0,
    stack: 2000,
    opponents: [{ id: 0, name: '你', position: 'SB', stack: 2000, bet: 0, allin: false }],
  });
  assert.match(summary(r), /目前只有高牌.*较难让更弱成牌付费/);
  assert.doesNotMatch(summary(r), /他用高牌控池，保留摊牌机会/);
});

test('a small-pair value open uses a neutral title rather than contradicting its own rationale', () => {
  const r = record('6c 6s', '', 'value-raise', {
    action: 'raise',
    cost: 50,
    stack: 3750,
    pot: 125,
    opponents: [{ id: 0, name: '你', position: 'SB', stack: 3750, bet: 50, allin: false }],
    history: [{ id: 0, street: 0, action: 'call', amount: 50 }],
  });
  r.amount = 175;
  assert.equal(explainOpponent(r).title, '主动开池争夺底池');
  assert.match(summary(r), /希望较弱起手牌跟注/);
});

test('opponent explanations do not read other private cards or depend on the future runout', () => {
  const r = record('8d Jh', 'Ac Tc 4s 9h', 'price-continue');
  const expected = explainOpponent(r);
  const changed = structuredClone(r);
  Object.defineProperty(changed.trace.view.opponents[0], 'hole', {
    get() {
      throw new Error('private opponent cards must remain unread');
    },
  });
  changed.trace.view.futureDeck = cards('7d Qs');
  changed.trace.view.winners = [0];
  assert.deepEqual(explainOpponent(changed), expected);
});

function ordinaryRecord(hole, board, options = {}) {
  return record(hole, board, 'scripted-review-probe', {
    cost: 100,
    stack: 1500,
    opponents: [{ id: 0, name: '你', position: 'SB', stack: 1400, bet: 100, allin: false }],
    ...options,
  });
}

test('an absent legacy reason still explains a pure flush-draw call with a factual title', () => {
  const r = ordinaryRecord('As Js', 'Kh 7s 2s 9d');
  delete r.trace.reason;
  const review = explainOpponent(r);
  assert.equal(review.title, '跟注 100');
  assert.equal(review.basisSource, 'inferred');
  assert.match(summary(r), /主要依靠同花听牌改善/);
  assert.match(summary(r), /9 张牌可能补成同花/);
  assert.match(summary(r), /补成也不保证获胜/);
  assert.match(summary(r), /继续要补 100.*1.1K.*9.1%/);
  assert.doesNotMatch(summary(r), /保留这条行动路线|测试|scripted|legacy/);
});

test('an unknown combination-draw raise names both real improvements without inventing a policy motive', () => {
  const r = ordinaryRecord('Ts Qs', '9s Js 2d', { action: 'raise', cost: 0 });
  r.amount = 300;
  const review = explainOpponent(r);
  assert.equal(review.title, '下注至 300');
  assert.equal(review.basisSource, 'inferred');
  assert.match(summary(r), /同花听牌 \+ 两头顺听牌/);
  assert.match(summary(r), /8 \/ K 落下时可以补成顺子/);
  assert.match(summary(r), /被跟注后仍能补牌/);
  assert.doesNotMatch(summary(r), /不能只凭|重新比较|建议/);
  assert.doesNotMatch(summary(r), /只有高牌.*不足以支撑|因此.*半诈唬/);
});

test('an unknown strong-hand raise gives conditional value support rather than asserting its hidden intent', () => {
  const r = ordinaryRecord('5c 5d', '5s Kh 2d', { action: 'raise', cost: 0 });
  r.amount = 300;
  assert.equal(explainOpponent(r).title, '下注至 300');
  assert.match(summary(r), /当前已有暗三条 5.*只有较弱成牌或听牌愿意支付时.*收取价值/);
  assert.doesNotMatch(summary(r), /核对|需要比较|建议/);
  assert.doesNotMatch(summary(r), /当前底池.*保留这条行动路线|诱导.*继续投入/);
});

test('an unknown board-only closing check names shared value and immediate showdown', () => {
  const r = ordinaryRecord('2c 3d', 'Ts Js Qs Ks As', { action: 'check', cost: 0 });
  const review = explainOpponent(r);
  assert.equal(review.title, '过牌');
  assert.match(summary(r), /底牌没有提高公共牌.*平分底池/);
  assert.match(summary(r), /河牌最后行动.*直接摊牌/);
  assert.doesNotMatch(summary(r), /更强成牌|更高的同花|下一张|用高牌/);
});

test('an unknown board-only call compares only the possible share and has no invented winning hand', () => {
  const r = ordinaryRecord('2c 3d', 'Ts Js Qs Ks As');
  assert.equal(explainOpponent(r).title, '跟注 100');
  assert.match(summary(r), /主要争取平分底池/);
  assert.doesNotMatch(summary(r), /需要按|比较成本/);
  assert.doesNotMatch(summary(r), /高牌.*取胜|领先所有|更大的牌/);
});

test('an unknown board-only raise with an all-in opponent cannot claim to force that opponent out', () => {
  const r = ordinaryRecord('2c 3d', 'Ts Js Qs Ks As', {
    action: 'raise',
    cost: 0,
    opponents: [
      { id: 0, name: '你', position: 'SB', stack: 0, bet: 0, total: 500, allin: true },
      { id: 2, name: 'Luna', position: 'BB', stack: 1500, bet: 0, total: 500, allin: false },
    ],
  });
  r.amount = 300;
  assert.match(summary(r), /底牌没有提高公共牌.*不会增加相对牌力/);
  assert.match(summary(r), /已全下者参与的底池仍需摊牌/);
  assert.doesNotMatch(summary(r), /对手弃牌就.*整个底池|更高的同花/);
});

test('an unknown fold at a free-check option reports the action without recommending the alternative', () => {
  const r = ordinaryRecord('2c 3d', '', { action: 'fold', cost: 0 });
  assert.equal(explainOpponent(r).title, '弃牌');
  assert.match(summary(r), /选择弃牌/);
  assert.doesNotMatch(summary(r), /当时可以直接过牌|不节省额外筹码|保留这条行动路线/);
});

test('an unknown cheap draw fold compares surrendered improvement with the actual price', () => {
  const r = ordinaryRecord('8d Jh', 'Ac Tc 4s 9h', { action: 'fold' });
  assert.match(summary(r), /选择弃牌.*继续要补 100.*1.1K.*9.1%/);
  assert.match(summary(r), /8 张牌可能补成顺子/);
  assert.match(summary(r), /17.4%.*高于当前价格门槛.*弃牌放弃了这些改善机会/);
  assert.doesNotMatch(summary(r), /应比较跟注/);
  assert.doesNotMatch(summary(r), /因此.*弃牌|必须跟注/);
});

test('unknown reasons never turn mood or exception metadata into an executed motive', () => {
  const r = ordinaryRecord('As Js', 'Kh 7s 2s 9d');
  const expected = explainOpponent(r);
  r.trace.mode = 'lively';
  r.trace.mood = { kind: 'frustrated' };
  r.trace.exceptions = ['proposed-loose-continuation'];
  const before = structuredClone(r);
  const review = explainOpponent(r);
  assert.deepEqual(review, expected);
  assert.deepEqual(review.reasons, []);
  assert.deepEqual(r, before);
});

test('an unknown basis cannot certify itself as a recorded policy reason', () => {
  const r = ordinaryRecord('As Js', 'Kh 7s 2s 9d');
  r.trace.basis = { version: 1, action: 'call', reason: 'scripted-review-probe', squeeze: true };
  const before = structuredClone(r);
  const review = explainOpponent(r);
  assert.equal(review.basisSource, 'inferred');
  assert.doesNotMatch(summary(r), /这次再加注也在挤压/);
  assert.deepEqual(r, before);
});

test('a proposed raise basis is preserved but cannot explain a different executed call', () => {
  const r = ordinaryRecord('As Js', 'Kh 7s 2s 9d');
  r.trace.reason = 'value-raise';
  r.trace.basis = {
    version: 1,
    action: 'raise',
    amount: 500,
    reason: 'value-raise',
    squeeze: true,
  };
  r.trace.mode = 'lively';
  r.trace.mood = { kind: 'confident' };
  r.trace.exceptions = ['proposed-loose-raise'];
  const before = structuredClone(r);
  const review = explainOpponent(r);
  assert.equal(review.title, '跟注 100');
  assert.equal(review.basisSource, 'inferred');
  assert.match(summary(r), /主要依靠同花听牌改善/);
  assert.doesNotMatch(summary(r), /这是用.*取值|再加注也在挤压/);
  assert.deepEqual(review.reasons, []);
  assert.deepEqual(r, before);
});

test('unknown all-in records retain actual commitment and ignore stale proposed price metadata', () => {
  const call = record('8d Jh', 'Ac Tc 4s 9h', 'scripted-review-probe');
  call.trace.allIn = { contestable: 999999 };
  assert.match(summary(call), /可争夺 1.3K/);
  assert.doesNotMatch(summary(call), /999/);
  const staleLoose = record('As Ks', '', 'loose-exception');
  staleLoose.trace.basis = { version: 1, action: 'raise', amount: 500, reason: 'loose-exception' };
  assert.equal(explainOpponent(staleLoose).basisSource, 'inferred');
  assert.doesNotMatch(summary(staleLoose), /这次是较松的全下跟注/);
  const shove = ordinaryRecord('Ts Qs', '9s Js 2d', { action: 'raise', cost: 0 });
  shove.amount = shove.trace.view.stack;
  assert.equal(explainOpponent(shove).title, '全下至 1.5K');
  assert.match(summary(shove), /全部剩余筹码.*不再参与下注决策/);
  assert.doesNotMatch(summary(shove), /再遇下注时.*重新判断/);
});

test('a matching real policy basis keeps its recorded attribution', () => {
  const r = ordinaryRecord('5c 5d', '5s Kh 2d', { action: 'raise', cost: 0 });
  r.amount = 300;
  r.trace.reason = 'value-raise';
  r.trace.basis = { version: 1, action: 'raise', amount: 300, reason: 'value-raise' };
  const before = structuredClone(r);
  const review = explainOpponent(r);
  assert.equal(review.basisSource, 'recorded');
  assert.equal(review.title, '主动加注争取价值');
  assert.match(summary(r), /这是用暗三条 5取值/);
  assert.deepEqual(r, before);
});

test('objective fallback reads only the actor cards and public state', () => {
  const r = ordinaryRecord('Ts Qs', '9s Js 2d', { action: 'raise', cost: 0 });
  r.amount = 300;
  const expected = explainOpponent(r);
  Object.defineProperty(r.trace.view.opponents[0], 'hole', {
    get() {
      throw new Error('hidden cards must not be read by fallback');
    },
  });
  r.trace.view.futureDeck = cards('8s Ks');
  r.trace.view.winners = [0];
  assert.deepEqual(explainOpponent(r), expected);
});

test('unknown premium reraises retain their real strength and incremental investment', () => {
  for (const hole of ['As Ah', 'Kh Kd']) {
    const r = ordinaryRecord(hole, '', { action: 'raise', cost: 325, stack: 4975 });
    r.trace.view.bet = 25;
    r.trace.view.currentBet = 350;
    r.trace.view.history = [{ id: 0, street: 0, action: 'raise', amount: 350 }];
    r.amount = 1000;
    assert.match(summary(r), /最强起手牌|顶级起手牌/);
    assert.match(summary(r), /额外投入 975/);
    assert.equal(explainOpponent(r).basisSource, 'inferred');
  }
});

test('scripted checks with a known action reason do not inherit an unused proposal mood or exceptions', () => {
  for (const provenance of ['scripted-prefix', 'scripted-probe']) {
    const r = record('Ah Qd', 'Jc 7h 2s', 'free-check', {
      action: 'check',
      cost: 0,
      stack: 5000,
      opponents: [{ id: 0, stack: 5000, position: 'BTN', bet: 0 }],
    });
    Object.assign(r.trace, {
      reasonSource: 'scripted-action-only',
      provenance,
      mode: 'subtle',
      mood: { kind: 'cautious' },
      exceptions: ['wide-call'],
      basis: { version: 1, action: 'check', amount: 0, reason: 'free-check' },
    });
    const saved = structuredClone(r),
      out = explainOpponent(r);
    assert.equal(out.basisSource, 'inferred');
    assert.equal(out.title, '过牌');
    assert.doesNotMatch(out.reasons.join('') + out.detail, /收紧避险|选择较宽地继续|情绪.*因此/);
    assert.match(out.detail, /目前只有高牌/);
    assert.deepEqual(r, saved);
  }
});

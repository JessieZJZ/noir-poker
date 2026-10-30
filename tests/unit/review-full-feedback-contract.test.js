import test from 'node:test';
import assert from 'node:assert/strict';
import { coachDecision } from '../../src/review/coaching.js';
import { decisionContext } from '../../src/review/context.js';
import { analyzeDecision } from '../../src/review/analysis.js';
import { cards } from '../fixtures/deceptive-decisions.js';

// Public snapshots and retained model estimates: these tests check the
// certainty and lifecycle of coaching, without asserting solver-optimal play.
function preflop({ hole = 'Qh Ts', action = 'call', amount = 20000, call = 20000 } = {}) {
  const positions = ['CO', 'BTN', 'SB', 'BB', 'UTG'];
  return {
    bigBlind: 200,
    smallBlind: 100,
    chipUnit: 100,
    action,
    amount,
    hole: cards(hole),
    board: [],
    street: 0,
    position: 'CO',
    stack: 20000,
    bet: 0,
    total: 0,
    pot: 20500,
    currentBet: call,
    minRaise: 200,
    pending: [0],
    players: positions.map((position, id) => ({
      id,
      name: id ? '对手' + id : '你',
      position,
      stack: id === 4 && call >= 20000 ? 0 : 20000,
      bet: id === 4 ? call : 0,
      total: id === 4 ? call : 0,
      allin: id === 4 && call >= 20000,
      folded: id > 0 && id < 4,
      actedTo: id === 0 ? null : call,
    })),
    history: [{ id: 4, street: 0, action: 'raise', amount: call }],
    legal: {
      callAmount: call,
      toCall: call,
      canCheck: call === 0,
      canRaise: call < 20000,
      minRaiseTo: call + 200,
      maxRaiseTo: 20000,
    },
  };
}

function estimate(s, changes = {}) {
  const context = decisionContext(s);
  return {
    code: 'priced-call',
    status: 'sound',
    context,
    draw: context.draw,
    reason: '',
    routes: { primary: { action: s.action, amount: s.amount } },
    metrics: {
      closing: true,
      randomEV: 0,
      weightedEV: 0,
      uncertainty: 0.03,
      contestable: s.pot + s.legal.callAmount,
      required: 0.49,
      equityLow: 0.4,
      equityHigh: 0.5,
    },
    ...changes,
  };
}

function conditionalSurface(c) {
  assert.equal(c.kind, 'compare');
  assert.equal(c.assessmentLabel, '需要比较');
  assert.equal(c.recommendationConditional, true);
  assert.match(c.label, /^建议(?:弃牌|过牌|跟注|全下|短全下|加注|下注)/);
  assert.equal(c.recommendedAction.summary, c.label);
  assert.equal(c.suggestion, c.label);
  assert.equal(c.suggestedAction, c.label.slice(2));
  assert.doesNotMatch(c.label, /比较/);
  assert.doesNotMatch(c.suggestion + c.followUp, /保留这步|优先选择/);
}

test('unpaired preflop value comparisons name worse kickers rather than smaller pairs', () => {
  for (const hole of ['Ac Qh', 'Qd Jd']) {
    const s = preflop({ hole, action: 'raise', amount: 5000, call: 1400 });
    const c = coachDecision(s, estimate(s, { status: 'consider' }));
    conditionalSurface(c);
    assert.match(c.explanation, /只有更差踢脚的高牌.*仍愿意支付/);
    assert.match(c.followUp, /更差踢脚的高牌/);
    assert.doesNotMatch(c.explanation + c.followUp, /更小对子|较弱对子或高牌/);
  }
});

test('a small-pair all-in re-raise explains its closed betting only once', () => {
  const s = preflop({ hole: '7s 7d', action: 'raise', amount: 20000, call: 4000 });
  s.history.unshift({ id: 1, street: 0, action: 'raise', amount: 1000 });
  const r = analyzeDecision(s, { trials: 12, rolloutTrials: 2 });
  assert.equal(r.code, 'unbacked-small-pair-reraise');
  const text = r.coaching.paragraphs
    .slice(r.coaching.paragraphs.indexOf('复盘分析总结') + 1)
    .join('');
  assert.equal((text.match(/只能争取摊牌|不再参与下注决策/g) || []).length, 1);
  assert.match(text, /7♠ 7♦/);
  assert.match(text, /20K/);
});

test('a smaller first raise over a limper is labelled as isolation throughout coaching', () => {
  const s = preflop({ hole: '8s 6d', action: 'raise', amount: 20000, call: 200 });
  s.history = [{ id: 4, street: 0, action: 'call', amount: 200 }];
  const c = coachDecision(
    s,
    estimate(s, {
      status: 'consider',
      code: 'weak-limper-isolation',
      routes: { primary: { action: 'raise', amount: 400 } },
    }),
  );
  assert.equal(c.suggestedAction, '加注至 400');
  assert.match(c.recommendedAction.label, /隔离加注至 400/);
  assert.match(c.explanation, /隔离前面的跟入者/);
  assert.match(c.followUp, /隔离加注至 400/);
  assert.doesNotMatch(c.explanation + c.followUp, /开池至 400/);
});

test('uncertain all-in and non-all-in calls agree across the consumed coaching fields', () => {
  for (const call of [20000, 500]) {
    const s = preflop({ amount: call, call });
    const r = estimate(s, { status: call === 20000 ? 'sound' : 'consider' });
    const c = coachDecision(s, r);
    conditionalSurface(c);
    assert.match(c.followUp, /比较/);
  }
});

test('a cold re-raise cannot receive a keep label from broad hand tiers alone', () => {
  for (const hole of ['Jh Ts', 'Ah Jd', '8s 8h']) {
    const s = preflop({ hole, action: 'raise', call: 5400 });
    s.history.unshift({ id: 1, street: 0, action: 'raise', amount: 1400 });
    const c = coachDecision(s, estimate(s));
    conditionalSurface(c);
    assert.match(c.explanation, /不能只凭起手牌级别/);
    assert.match(c.explanation, /较弱[^。]*(?:付费|跟注)/);
    assert.match(c.explanation, /实际已经全下/);
    assert.doesNotMatch(c.explanation, /难承受持续下注|仍需控制投入/);
  }
});

test('positive retained comparison evidence is not downgraded merely because a raise is non-premium', () => {
  const s = preflop({ hole: 'Ah Jd', action: 'raise', call: 5400 });
  const r = estimate(s);
  r.simulation = {
    comparisonReady: true,
    rows: [
      {
        action: { action: 'raise', amount: s.amount },
        scenarios: [0, 1].map(() => ({ ev: 2500, vsActual: { informative: true, lower: 0 } })),
      },
      {
        action: { action: 'fold', amount: 0 },
        scenarios: [0, 1].map(() => ({
          ev: 0,
          vsActual: { informative: true, lower: -3000, upper: -1500 },
        })),
      },
    ],
  };
  const c = coachDecision(s, r);
  assert.equal(c.evKind, 'positive');
  assert.equal(c.kind, 'keep');
  assert.equal(c.assessmentLabel, '值得保留');
  assert.equal(c.label, '建议全下至 20K');
  assert.equal(c.confirmed, false);
});

test('a value-family code cannot bypass the unproven cold re-raise condition', () => {
  const s = preflop({ hole: 'Ah Qd', action: 'raise', call: 1400 });
  const r = estimate(s, {
    code: 'deep-value-shove',
    status: 'consider',
    routes: { primary: { action: 'raise', amount: 5000 } },
  });
  const c = coachDecision(s, r);
  conditionalSurface(c);
  assert.equal(c.evKind, 'uncertain');
  assert.equal(c.supported, false);
  assert.match(c.explanation, /更差踢脚的高牌[^。]*仍愿意支付|较弱牌[^。]*(?:付费|跟注)/);
});

test('actual full-stack weak isolation distinguishes showdown from a hypothetical smaller call', () => {
  const s = preflop({ hole: '9s 4h', action: 'raise', call: 200 });
  s.history = [{ id: 4, street: 0, action: 'call', amount: 200 }];
  const c = coachDecision(
    s,
    estimate(s, {
      code: 'weak-limper-isolation',
      status: 'consider',
      routes: { primary: { action: 'call', amount: 200 } },
    }),
  );
  conditionalSurface(c);
  assert.match(c.explanation, /全下后不能再控制投入/);
  assert.doesNotMatch(c.explanation, /较弱踢脚也难承受持续下注/);
  assert.match(c.explanation, /若改为再补.*跟注，会留下/);
  assert.match(c.followUp, /实际全下后|全下后已没有继续/);
});

test('already-entered responders are not described as previously unacted seats behind Hero', () => {
  const s = preflop({ hole: '9s 4h', action: 'raise', amount: 5000, call: 500 });
  s.pending = [0, 1, 2, 4];
  for (const id of [1, 2, 4]) s.players[id].folded = false;
  s.players[2].actedTo = null;
  s.history.unshift({ id: 1, street: 0, action: 'call', amount: 200 });
  const c = coachDecision(
    s,
    estimate(s, {
      status: 'consider',
      routes: { primary: { action: 'call', amount: 500 } },
    }),
  );
  assert.match(c.explanation, /本轮还有 3 位对手等待回应/);
  assert.doesNotMatch(c.explanation, /你身后还有 3|3 人等待行动/);
  assert.match(c.explanation, /若改为再补.*跟注，会留下/);
});

test('a better candidate than a bad shove still carries the bluff and payment premises in visible fields', () => {
  for (const hole of ['8h 6s', 'Ah Td']) {
    const s = preflop({ hole, action: 'raise', call: 1000 });
    const r = estimate(s);
    r.metrics.closing = false;
    const scenario = (ev, lower) => ({
      ev,
      vsActual: { informative: true, lower, upper: lower + 200 },
    });
    r.simulation = {
      comparisonReady: true,
      rows: [
        {
          action: { action: 'raise', amount: 20000 },
          scenarios: [scenario(-2000, 0), scenario(-2000, 0)],
        },
        {
          action: { action: 'fold', amount: 0 },
          scenarios: [scenario(0, 1800), scenario(0, 1800)],
        },
        {
          action: { action: 'raise', amount: 3500 },
          scenarios: [scenario(500, 2300), scenario(500, 2300)],
        },
      ],
    };
    const c = coachDecision(s, r);
    assert.equal(
      c.kind,
      'improve',
      'Keep evidence that the actual oversized shove can be improved',
    );
    assert.equal(c.confirmed, true);
    assert.equal(c.assessmentLabel, '需要比较');
    assert.equal(c.recommendationConditional, true);
    assert.equal(c.label, '建议加注至 3.5K');
    assert.equal(c.suggestion, c.label);
    assert.equal(c.suggestedAction, '加注至 3.5K');
    assert.equal(c.recommendedAction.summary, c.label);
    assert.match(c.recommendedAction.condition, /弃牌空间/);
    if (hole === 'Ah Td') assert.match(c.recommendedAction.condition, /较弱起手牌愿意/);
    assert.match(c.explanation, /这手建议.*只有|这手建议.*取值需要/);
    assert.doesNotMatch(c.explanation, /只有仍有筹码的开池者/);
  }
});

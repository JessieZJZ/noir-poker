import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coachDecision, buildOverview } from '../../src/review/coaching.js';
import { cards } from '../fixtures/deceptive-decisions.js';

// Numeric model fixtures exercise interpretation, not solver-quality claims.
function decision(action = 'call', street = 3) {
  return {
    bigBlind: 50,
    action,
    hole: cards('7s 7h'),
    board: cards('As Kd 9c 4h 2s').slice(0, street === 0 ? 0 : street + 2),
    amount: 200,
    street,
    position: 'BTN',
    stack: 500,
    bet: 0,
    pot: 200,
    currentBet: 200,
    history: [],
    legal: { callAmount: 200, canCheck: false, maxRaiseTo: 500 },
  };
}
function result(overrides = {}) {
  return {
    bigBlind: 50,
    code: 'priced-call',
    status: 'sound',
    title: '核对跟注价格',
    context: {
      handLabel: '一对 7',
      handClass: 'underpair',
      extra: 200,
      opponents: 1,
      tier: 1,
      draw: { outs: 0 },
    },
    metrics: {
      closing: true,
      randomEV: -120,
      weightedEV: -140,
      uncertainty: 0.03,
      contestable: 400,
      callCost: 200,
      required: 0.5,
      equityLow: 0.15,
      equityHigh: 0.2,
    },
    routes: { primary: { action: 'call', amount: 200 } },
    draw: { outs: 0 },
    ...overrides,
  };
}
function summary(profit, snapshots, results, extra = {}) {
  return buildOverview(
    { decisions: snapshots, outcome: { profit, showdown: true, ...extra } },
    results.map((r, i) => ({ ...r, coaching: coachDecision(snapshots[i], r) })),
  );
}
const scenario = (ev, delta, lower, informative = true, winRate = 0.5) => ({
  ev,
  margin: 100,
  winRate,
  vsActual: { delta, lower, upper: delta + 20, informative },
});
const row = (action, ev, delta, lower, informative = true) => ({
  action,
  scenarios: [scenario(ev, delta, lower, informative), scenario(ev, delta, lower, informative)],
});

test('winning a bad-price closing call does not turn it into a good repeatable decision', () => {
  const s = decision(),
    r = result(),
    c = coachDecision(s, r);
  assert.equal(c.evKind, 'negative');
  assert.equal(c.suggestedAction, '弃牌');
  assert.doesNotMatch(c.suggestion, /保留/);
  const won = summary(500, [s], [r], { wonPot: true });
  const lost = summary(-200, [s], [r]);
  assert.match(won.title, /赢了.*不值得长期重复/);
  assert.match(lost.title, /输了.*关键/);
  assert.equal(won.improvements[0].evKind, lost.improvements[0].evKind);
  assert.equal(won.priorityIndex, lost.priorityIndex);
});

test('two profitable closing calls can lose without being graded as mistakes', () => {
  const s = decision(),
    r = result();
  r.metrics = { ...r.metrics, randomEV: 100, weightedEV: 80 };
  const overview = summary(-200, [s, s], [r, r]);
  assert.match(overview.title, /输了.*合理依据/);
  assert.equal(overview.negative, 0);
  assert.equal(overview.improvements.length, 0);
  assert.equal(overview.good.length, 1);
});

test('a higher-value continuation is distinct from negative EV and highest pot-win frequency', () => {
  const s = decision('raise', 1);
  s.amount = 300;
  const r = result({ code: 'value-bet', metrics: { ...result().metrics, closing: false } });
  r.simulation = {
    comparisonReady: true,
    stable: false,
    rows: [
      row({ action: 'raise', amount: 300 }, 100, 0, 0),
      row({ action: 'fold', amount: 0 }, 0, -100, -120),
      row({ action: 'raise', amount: 400 }, 200, 100, 80),
    ],
  };
  r.simulation.rows[0].scenarios.forEach((v) => {
    v.winRate = 0.9;
  });
  r.simulation.rows[2].scenarios.forEach((v) => {
    v.winRate = 0.6;
  });
  const c = coachDecision(s, r),
    overview = summary(500, [s], [r], { wonPot: true });
  assert.equal(c.evKind, 'positive');
  assert.equal(c.kind, 'value');
  assert.match(c.suggestedAction, /400/);
  assert.equal(overview.negative, 0);
  assert.equal(overview.improvements.length, 0);
  assert.equal(overview.value.length, 1);
  assert.equal(overview.good.length, 0);
});

test('refund baseline, not absolute simulated profit, determines whether continuing is worse', () => {
  const s = decision('raise', 1),
    r = result({ metrics: { ...result().metrics, closing: false } });
  r.simulation = {
    comparisonReady: true,
    rows: [
      row({ action: 'raise', amount: 200 }, 100, 0, 0),
      row({ action: 'fold', amount: 0 }, 1000, 900, 880),
    ],
  };
  const c = coachDecision(s, r);
  assert.equal(c.actualEV[0], 100);
  assert.equal(c.evKind, 'negative');
  assert.equal(c.suggestedAction, '弃牌');
});

test('small or undiverse samples do not confirm a better action or long-run loss', () => {
  const s = decision('raise', 1),
    r = result({ status: 'consider', metrics: { ...result().metrics, closing: false } });
  r.simulation = {
    comparisonReady: true,
    rows: [
      row({ action: 'raise', amount: 200 }, -75, 0, 0, false),
      row({ action: 'fold', amount: 0 }, 0, 75, 75, false),
    ],
  };
  assert.equal(coachDecision(s, r).confirmed, false);
  assert.equal(coachDecision(s, r).evKind, 'uncertain');
  r.simulation.comparisonReady = false;
  r.simulation.rows.forEach((p) =>
    p.scenarios.forEach((v) => {
      v.vsActual.informative = true;
    }),
  );
  assert.equal(coachDecision(s, r).confirmed, false);
});

test('a later costly mistake outranks an earlier discussion and repeated same-street themes collapse', () => {
  const early = decision('raise', 0),
    late = decision();
  const a = result({
    code: 'weak-entry',
    status: 'attention',
    metrics: { ...result().metrics, closing: false },
  });
  const b = result();
  const o = summary(-500, [early, late, late], [a, b, b]);
  assert.equal(o.priorityIndex, 1);
  assert.equal(o.improvements.filter((p) => p.street === 3).length, 1);
});

test('a side-pot award with net loss stays a loss and practice cards do not explain a fold', () => {
  const s = decision(),
    r = result();
  const o = summary(-500, [s], [r], {
    wonPot: true,
    pots: [{ awards: [{ name: '你', amount: 100 }] }],
  });
  assert.match(o.title, /^输了/);
  assert.match(o.settlement, /总投入仍高/);
  const noAction = summary(-25, [], [], { folded: true, practiceRunout: true });
  assert.match(noAction.title, /没有可评价/);
  assert.equal(noAction.improvements.length, 0);
  assert.match(noAction.settlement, /补牌.*不.*判定弃牌/);
});

test('river checks and closing all-in calls have no invented future betting or draws', () => {
  const river = decision('check'),
    r = result({ code: 'value-check', status: 'consider' });
  r.routes.primary = { action: 'raise', amount: 300 };
  const c = coachDecision(river, r);
  assert.doesNotMatch(c.explanation, /听牌付费/);
  assert.match(c.explanation, /不能诱导后面的下注/);
  assert.doesNotMatch(c.followUp, /下一轮/);
  const pre = decision('call', 0),
    positive = result();
  positive.metrics = { ...positive.metrics, randomEV: 100, weightedEV: 100 };
  const closed = coachDecision(pre, positive);
  assert.doesNotMatch(closed.suggestion, /调整后续/);
  assert.doesNotMatch(closed.followUp, /下一轮/);
  assert.match(closed.explanation, /已没有后续下注/);
  assert.match(closed.followUp, /只能等摊牌|已没有后续下注/);
  r.context = { ...r.context, handClass: 'board' };
  r.code = 'board-check';
  assert.match(coachDecision(river, r).followUp, /平分/);
  assert.doesNotMatch(coachDecision(river, r).followUp, /更弱/);
});

test('short all-in coaching never suggests a larger ordinary raise', () => {
  const s = decision('raise', 0),
    r = result({ code: 'pressure-bet' });
  s.amount = 75;
  s.legal = { ...s.legal, maxRaiseTo: 75, isShortAllin: true };
  r.routes.primary = { action: 'raise', amount: 75 };
  r.metrics.closing = false;
  const c = coachDecision(s, r);
  assert.match(c.followUp, /不一定重开/);
  assert.doesNotMatch(c.followUp, /比较普通加注/);
});

test('a supported opening keeps the actual size instead of presenting an unproven tweak as the good move', () => {
  const s = decision('raise', 0);
  s.amount = 150;
  const r = result({ code: 'late-open', status: 'sound' });
  r.metrics.closing = false;
  r.routes.primary = { action: 'raise', amount: 125 };
  const c = coachDecision(s, r);
  assert.equal(c.kind, 'keep');
  assert.match(c.suggestedAction, /150/);
  assert.doesNotMatch(c.suggestedAction, /125/);
});

test('closing-call wording follows the protected EV verdict on both sides of the uncertainty boundary', () => {
  const s = decision(),
    r = result();
  r.metrics = { ...r.metrics, randomEV: -1, weightedEV: -2 };
  const withinError = coachDecision(s, r);
  assert.equal(withinError.evKind, 'uncertain');
  assert.equal(withinError.kind, 'keep');
  assert.doesNotMatch(withinError.explanation, /EV|建议保住剩余筹码/);
  r.metrics = { ...r.metrics, randomEV: -23, weightedEV: -23 };
  const outsideError = coachDecision(s, r);
  assert.equal(outsideError.evKind, 'negative');
  assert.equal(outsideError.label, '建议弃牌');
  assert.match(outsideError.explanation, /不适合接下这笔投入|建议保住剩余筹码/);
  assert.doesNotMatch(outsideError.explanation, /EV|模型|模拟器|抽样/);
});

test('an uncertain full-stack preflop call is compared rather than endorsed by a sound heuristic', () => {
  const s = decision('call', 0);
  s.hole = cards('Qd Th');
  s.stack = s.amount = s.currentBet = 20000;
  s.legal = { ...s.legal, callAmount: 20000, maxRaiseTo: 20000 };
  const r = result();
  r.context = { ...r.context, handClass: 'high', pendingOthers: 4 };
  r.routes.primary = { action: 'call', amount: 20000 };
  r.metrics = {
    ...r.metrics,
    closing: false,
    randomEV: 2615,
    weightedEV: -7836,
    required: 20000 / 40300,
    equityLow: 0.302,
    equityHigh: 0.561,
    uncertainty: 0.06,
    contestable: 40300,
    callCost: 20000,
  };
  const uncertain = coachDecision(s, r);
  assert.equal(uncertain.evKind, 'uncertain');
  assert.equal(uncertain.kind, 'compare');
  assert.equal(uncertain.assessmentLabel, '需要比较');
  assert.equal(uncertain.recommendedAction.summary, '建议全下跟注 20K');
  assert.equal(uncertain.recommendationConditional, true);
  assert.match(uncertain.explanation, /足够较弱牌.*更强起手牌.*比较弃牌/);
  assert.doesNotMatch(uncertain.explanation, /值得保留|有正收益/);
  assert.match(uncertain.explanation, /其余玩家尚可行动/);

  r.metrics = { ...r.metrics, equityLow: 0.54, uncertainty: 0.06 };
  assert.equal(coachDecision(s, r).kind, 'keep', 'A supported price must not be tightened blindly');
});

test('replacing a preflop shove with a call names the real payment and the players still able to raise', () => {
  for (const bigBlind of [50, 4000]) {
    const s = decision('raise', 0);
    s.bigBlind = bigBlind;
    s.amount = s.stack = 100 * bigBlind;
    s.currentBet = bigBlind;
    s.pot = 1.5 * bigBlind;
    s.legal = { ...s.legal, callAmount: bigBlind, maxRaiseTo: s.stack };
    const r = result({ code: 'large-unbacked-bet', status: 'consider' });
    r.context = {
      ...r.context,
      texture: {},
      made: { score: [1, 7] },
      preflopRaises: 0,
      pendingOthers: 2,
    };
    r.routes.primary = { action: 'call', amount: bigBlind };
    r.metrics = { ...r.metrics, closing: false };
    const review = coachDecision(s, r);
    assert.equal(review.kind, 'compare');
    assert.equal(review.assessmentLabel, '需要比较');
    assert.equal(review.recommendedAction.summary, bigBlind === 50 ? '建议跟注 50' : '建议跟注 4K');
    const text = review.paragraphs.join('');
    assert.match(text, /若改为再补 .* 跟注，会留下 .* 筹码/);
    assert.match(text, /常规开池与弃牌/);
    assert.equal((text.match(/本轮还有 2 位对手等待回应/g) || []).length, 1);
    assert.doesNotMatch(text, /你身后还有 2 人/);
    assert.match(text, /加注或者再加注.*重新决定是否继续/);
    assert.doesNotMatch(text, /这手建议跟注，保留当前牌力|跟注后可以免费看翻牌/);
    assert.match(
      text,
      bigBlind === 50 ? /再补 50 跟注，会留下 4.95K/ : /再补 4K 跟注，会留下 396K/,
    );
  }
});

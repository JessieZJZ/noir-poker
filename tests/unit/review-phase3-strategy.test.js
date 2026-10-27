import test from 'node:test';
import assert from 'node:assert/strict';
import { cards } from '../fixtures/deceptive-decisions.js';
import { analyzeDecision } from '../../src/review/analysis.js';
import { decisionContext } from '../../src/review/context.js';
import { comparisonRoutes } from '../../src/review/routes.js';
import { candidateActions } from '../../src/review/counterfactual.js';
import { handMatchups, preflopRangeNotes, valuePlan } from '../../src/review/matchups.js';

function spot(hole, board, changes = {}) {
  const community = cards(board);
  const s = {
    bigBlind: 100,
    smallBlind: 50,
    chipUnit: 50,
    hole: cards(hole),
    board: community,
    street: community.length ? community.length - 2 : 0,
    position: 'BTN',
    stack: 4500,
    bet: 0,
    total: 500,
    pot: 1100,
    currentBet: 100,
    minRaise: 100,
    action: 'call',
    amount: 100,
    pending: [0],
    history: [
      { id: 1, street: community.length ? community.length - 2 : 0, action: 'raise', amount: 100 },
    ],
    players: [
      {
        id: 0,
        name: '你',
        position: 'BTN',
        stack: 4500,
        total: 500,
        bet: 0,
        folded: false,
        allin: false,
      },
      {
        id: 1,
        name: '对手',
        position: 'BB',
        stack: 4400,
        total: 600,
        bet: 100,
        folded: false,
        allin: false,
      },
    ],
    ...changes,
  };
  s.legal = {
    enabled: true,
    chipUnit: 50,
    canCheck: false,
    canRaise: true,
    raiseReopened: true,
    toCall: 100,
    callAmount: 100,
    minRaiseTo: 200,
    fullRaiseTo: 200,
    maxRaiseTo: s.stack + s.bet,
    ...changes.legal,
  };
  if (!changes.players) {
    s.players[0].stack = s.stack;
    s.players[0].total = s.total;
    s.players[0].bet = s.bet;
    s.players[0].position = s.position;
  }
  return s;
}
const freeBet = (maxRaiseTo) => ({
  canCheck: true,
  callAmount: 0,
  toCall: 0,
  minRaiseTo: 100,
  fullRaiseTo: 100,
  maxRaiseTo,
});
const quick = { trials: 120, rolloutTrials: 2 };

function weakTurnShove() {
  return spot('5c 9s', 'Ts Qd 4c 6c', {
    stack: 7100,
    bet: 100,
    total: 400,
    pot: 2300,
    currentBet: 1200,
    action: 'raise',
    amount: 7200,
    legal: {
      callAmount: 1100,
      toCall: 1100,
      minRaiseTo: 2300,
      fullRaiseTo: 2300,
      maxRaiseTo: 7200,
    },
    players: [
      { id: 0, position: 'BTN', stack: 7100, bet: 100, total: 400, folded: false, allin: false },
      { id: 1, position: 'SB', stack: 6000, bet: 1200, total: 1500, folded: false, allin: false },
      { id: 2, position: 'BB', stack: 7300, bet: 0, total: 200, folded: true, allin: false },
      { id: 3, position: 'UTG', stack: 7500, bet: 0, total: 0, folded: true, allin: false },
      { id: 4, position: 'CO', stack: 7300, bet: 0, total: 200, folded: true, allin: false },
    ],
    history: [
      { id: 0, street: 0, action: 'raise', amount: 200 },
      { id: 1, street: 0, action: 'call', amount: 150 },
      { id: 1, street: 1, action: 'call', amount: 100 },
      { id: 1, street: 2, action: 'check', amount: 0 },
      { id: 0, street: 2, action: 'raise', amount: 100 },
      { id: 1, street: 2, action: 'raise', amount: 1200 },
    ],
  });
}

test('phase3: a weak turn shove never repairs itself into a call below both price estimates', () => {
  const s = weakTurnShove();
  const r = analyzeDecision(s, { trials: 600, rolloutTrials: 2 });
  assert.equal(r.code, 'large-unbacked-bet');
  assert.ok(r.metrics.equityHigh + r.metrics.uncertainty < r.metrics.required);
  assert.equal(r.alternative.action, 'fold');
  assert.equal(r.routes.primary.action, 'fold');
  assert.equal(r.coaching.recommendedAction.action, 'fold');
});

test('phase3: weak offsuit SB multiway cold calls require realization and price support', () => {
  const s = spot('4c 8d', '', {
    position: 'SB',
    stack: 1950,
    bet: 50,
    total: 50,
    pot: 650,
    currentBet: 250,
    action: 'call',
    amount: 200,
    pending: [0, 1],
    legal: { callAmount: 200, toCall: 200, minRaiseTo: 400, fullRaiseTo: 400, maxRaiseTo: 2000 },
    players: [
      { id: 0, position: 'SB', stack: 1950, bet: 50, total: 50 },
      { id: 1, position: 'BB', stack: 1900, bet: 100, total: 100 },
      { id: 2, position: 'UTG', stack: 1750, bet: 250, total: 250 },
      { id: 3, position: 'CO', stack: 1750, bet: 250, total: 250 },
    ],
    history: [
      { id: 2, street: 0, action: 'raise', amount: 250 },
      { id: 3, street: 0, action: 'call', amount: 250 },
    ],
  });
  const r = analyzeDecision(s, { trials: 600, rolloutTrials: 2 });
  assert.equal(r.code, 'weak-sb-cold-call');
  assert.equal(r.status, 'consider');
  assert.equal(r.alternative.action, 'fold');
  assert.match(r.reason, /翻后通常先行动/);
  const broadway = { ...s, hole: cards('Kc Js'), position: 'BTN' };
  assert.notEqual(analyzeDecision(broadway, quick).code, 'weak-sb-cold-call');
});

test('phase3: weak isolation of limpers differs from an unopened steal', () => {
  const s = spot('Jc 4d', '', {
    position: 'HJ',
    stack: 4000,
    total: 0,
    pot: 450,
    currentBet: 100,
    action: 'raise',
    amount: 200,
    legal: { callAmount: 100, minRaiseTo: 200, maxRaiseTo: 4000 },
    history: [1, 2, 3].map((id) => ({ id, street: 0, action: 'call', amount: 100 })),
  });
  const r = analyzeDecision(s, quick);
  assert.equal(r.code, 'weak-limper-isolation');
  assert.equal(r.alternative.action, 'fold');
  assert.match(r.reason, /3 位已经跟注入池/);
  assert.match(r.reason, /便宜跟注/);
  const unentered = { ...s, history: [], pot: 150 };
  assert.notEqual(analyzeDecision(unentered, quick).code, 'weak-limper-isolation');
  const weakAce = { ...s, hole: cards('Ac 7h'), position: 'BTN' };
  assert.equal(analyzeDecision(weakAce, quick).code, 'late-isolation');
});

test('phase3: a tiny in-position small-pair re-raise is discussed without banning normal sizes', () => {
  const s = spot('6h 6d', '', {
    stack: 15000,
    total: 0,
    pot: 600,
    currentBet: 350,
    action: 'raise',
    amount: 600,
    legal: { callAmount: 350, minRaiseTo: 600, fullRaiseTo: 600, maxRaiseTo: 15000 },
    history: [
      { id: 2, street: 0, action: 'call', amount: 100 },
      { id: 1, street: 0, action: 'raise', amount: 350 },
    ],
  });
  assert.equal(analyzeDecision(s, quick).code, 'unbacked-small-pair-reraise');
  assert.notEqual(
    analyzeDecision({ ...s, amount: 1050 }, quick).code,
    'unbacked-small-pair-reraise',
  );
  assert.notEqual(
    analyzeDecision({ ...s, hole: cards('8h 8d') }, quick).code,
    'unbacked-small-pair-reraise',
  );
  assert.notEqual(
    analyzeDecision({ ...s, history: s.history.slice(1) }, quick).code,
    'unbacked-small-pair-reraise',
  );
});

test('phase3: dangerous deep value shoves are conditional and strong tiny bets compare value sizes', () => {
  const risky = spot('Qs 5d', '5h Tc Jh 5c Kh', {
    stack: 13800,
    pot: 5000,
    currentBet: 0,
    action: 'raise',
    amount: 13800,
    legal: freeBet(13800),
  });
  const r = analyzeDecision(risky, quick);
  assert.equal(r.code, 'dangerous-value-shove');
  assert.equal(r.status, 'consider');
  assert.equal(r.routes.primary.action, 'check');
  assert.match(r.reason, /范围可能比当前未弃牌范围更强/);
  const small = spot('6h 6d', '5h Kd 6s', {
    stack: 14400,
    pot: 1450,
    currentBet: 0,
    action: 'raise',
    amount: 100,
    legal: freeBet(14400),
  });
  const value = analyzeDecision(small, quick);
  assert.equal(value.code, 'undersized-value-bet');
  assert.equal(value.alternative.amount, 100);
  assert.equal(value.routes.primary.amount, value.alternative.amount);
  assert.ok(value.routes.secondary.amount > 100);
  assert.match(value.routes.secondary.tradeoff, /没有证明比原小注更好/);
  assert.match(value.reason, /少收一轮价值/);
});

test('phase3: four-flush gutshot bets do not count a straight completion as winning the pot', () => {
  const s = spot('Jc 4d', 'Ts 2s As Ks', {
    pot: 750,
    currentBet: 0,
    action: 'raise',
    amount: 100,
    legal: freeBet(4500),
  });
  const r = analyzeDecision(s, quick);
  assert.equal(r.code, 'dirty-draw-bet');
  assert.equal(r.alternative.action, 'check');
  assert.match(r.reason, /补成顺子，也仍会输给同花/);
});

test('phase3: shared public pairs do not overwrite a priced call into a value re-raise', () => {
  for (const board of ['6c 2d 6d Qs', '6c 2d 6d Qs 2c']) {
    const s = spot('Qh Ad', board, { action: 'fold', amount: 0 });
    const c = decisionContext(s);
    c.matchups = handMatchups(s, c);
    assert.equal(valuePlan(s, c).primary, null);
    const r = analyzeDecision(s, quick);
    assert.notEqual(r.routes.primary.action, 'raise');
  }
  const overpair = spot('Js Jh', '5h 8h 8d');
  const c = decisionContext(overpair);
  assert.equal(valuePlan(overpair, c).primary, null);
});

test('phase3: routes preserve the analyzed main action and never require all-in actors to respond again', () => {
  const s = spot('As Ah', 'Kd 7h 2c', { stack: 500, action: 'call', amount: 100 });
  const c = decisionContext(s);
  c.valuePlan = {
    primary: { action: 'raise', amount: 300 },
    secondary: { action: 'call', amount: 100 },
    reason: 'value candidate',
  };
  const routes = comparisonRoutes(s, c, {
    code: 'priced-call',
    status: 'sound',
    alternative: { action: 'call', amount: 100 },
  });
  assert.equal(routes.primary.action, 'call');
  const jam = {
    ...s,
    action: 'raise',
    amount: 500,
    legal: { ...s.legal, maxRaiseTo: 500, isShortAllin: true },
  };
  const jc = decisionContext(jam);
  jc.valuePlan = { primary: null };
  const raised = comparisonRoutes(jam, jc, {
    code: 'value-bet',
    status: 'sound',
    alternative: { action: 'raise', amount: 500 },
  });
  assert.doesNotMatch(raised.primary.condition, /被加注后重新判断/);
  const allinCall = { ...s, stack: 100, pending: [0, 1], legal: { ...s.legal, callAmount: 100 } };
  const ac = decisionContext(allinCall);
  ac.valuePlan = { primary: null };
  const called = comparisonRoutes(allinCall, ac, {
    code: 'priced-call',
    status: 'sound',
    alternative: { action: 'call', amount: 100 },
  });
  assert.match(called.primary.condition, /本人不再参与下注/);
});

test('phase3: free closing checks and non-A weak-defense routes describe the actual boundary', () => {
  const s = spot('Kd 2s', '', {
    position: 'BB',
    currentBet: 100,
    action: 'check',
    amount: 0,
    pending: [0],
    legal: freeBet(4500),
  });
  const c = decisionContext(s);
  c.valuePlan = { primary: null };
  const check = comparisonRoutes(s, c, {
    code: 'pot-control',
    status: 'sound',
    alternative: { action: 'check', amount: 0 },
  });
  assert.match(check.primary.tradeoff, /免费进入下一街/);
  assert.doesNotMatch(check.primary.tradeoff, /不是保证免费看牌/);
  const weak = spot('Kd 8d', '', { action: 'fold', amount: 0 });
  const wc = decisionContext(weak);
  const route = comparisonRoutes(weak, wc, {
    code: 'weak-entry',
    status: 'consider',
    alternative: { action: 'fold', amount: 0 },
    pre: { raises: 1 },
  });
  assert.doesNotMatch(route.secondary.tradeoff, /Ax/);
});

test('phase3: preflop folds omit hypothetical re-raises and commitment notes do not promise set-mining', () => {
  const s = spot('Qd 8s', '', {
    stack: 100,
    action: 'fold',
    amount: 0,
    legal: { callAmount: 100 },
    history: [
      { id: 1, street: 0, action: 'raise', amount: 500 },
      { id: 2, street: 0, action: 'call', amount: 500 },
    ],
    players: [
      { id: 0, position: 'BTN', stack: 100, total: 0 },
      { id: 1, position: 'CO', stack: 0, total: 500, allin: true },
      { id: 2, position: 'SB', stack: 4000, total: 500 },
    ],
  });
  assert.doesNotMatch(preflopRangeNotes(s).join(''), /若再加注/);
  const text = preflopRangeNotes({ ...s, action: 'call' }).join('');
  assert.doesNotMatch(text, /追暗三条/);
  assert.match(text, /本人跟注后就已全下/);
});

test('phase3: pricing advice remains invariant to hidden cards and future outcomes', () => {
  const s = weakTurnShove();
  const before = analyzeDecision(s, quick);
  const poisoned = structuredClone(s);
  poisoned.players[1].hole = cards('Ac Ad');
  poisoned.deck = cards('5s 9d');
  poisoned.winners = [1];
  const after = analyzeDecision(poisoned, quick);
  assert.deepEqual(after, before);
});

test('phase3 round4: board nuts keep call/check primary and explain fixed split without impossible folds', () => {
  const base = spot('2c 3d', 'As Kd Qh Jc Ts', {
    stack: 1950,
    total: 50,
    pot: 250,
    pending: [0],
    players: [
      { id: 0, position: 'BTN', stack: 1950, bet: 0, total: 50 },
      { id: 1, position: 'SB', stack: 1850, bet: 100, total: 150 },
      { id: 2, position: 'BB', stack: 1950, bet: 0, total: 50, folded: true },
    ],
  });
  const c = decisionContext(base);
  c.matchups = handMatchups(base, c);
  assert.equal(c.handClass, 'board');
  assert.equal(c.matchups.nut, true);
  const main = { action: 'call', amount: 100 };
  const called = comparisonRoutes(base, c, {
    code: 'priced-call',
    status: 'sound',
    alternative: main,
  });
  assert.equal(called.primary.action, main.action);
  assert.equal(called.primary.amount, main.amount);
  assert.match(called.primary.condition, /无法被超过.*分池/);
  assert.doesNotMatch(called.primary.condition, /范围.*余量|更强|更窄/);
  assert.equal(called.secondary, null);
  assert.deepEqual(
    candidateActions(base, [called.primary, called.secondary]),
    candidateActions(base, [main, { action: 'fold', amount: 0 }]),
  );

  for (const pending of [[0], [0, 1]]) {
    const check = {
      ...base,
      action: 'check',
      amount: 0,
      currentBet: 0,
      pending,
      legal: { ...base.legal, ...freeBet(1950) },
    };
    const cc = decisionContext(check);
    cc.matchups = handMatchups(check, cc);
    const checked = comparisonRoutes(check, cc, {
      code: 'pot-control',
      status: 'sound',
      alternative: { action: 'check', amount: 0 },
    });
    assert.equal(checked.primary.action, 'check');
    assert.equal(checked.primary.amount, 0);
    assert.match(checked.primary.condition, /分池/);
    assert.equal(checked.secondary, null);
    if (pending.length === 1) assert.match(checked.primary.condition, /直接摊牌/);
    else assert.match(checked.primary.condition, /后面有人下注/);
  }

  const vulnerable = { ...base, board: cards('8s 9d Tc Jh Qs') };
  const vc = decisionContext(vulnerable);
  vc.matchups = handMatchups(vulnerable, vc);
  assert.equal(vc.handClass, 'board');
  assert.equal(vc.matchups.nut, false);
  const regular = comparisonRoutes(vulnerable, vc, {
    code: 'priced-call',
    status: 'sound',
    alternative: main,
  });
  assert.equal(regular.primary.action, 'call');
  assert.equal(regular.secondary.action, 'fold');
  assert.match(regular.secondary.condition, /价值范围/);
});

test('phase3 round4: a raise covering every opponent does not require an impossible re-raise response', () => {
  const base = spot('As Ks', '', {
    position: 'BB',
    stack: 7450,
    bet: 50,
    total: 50,
    pot: 2075,
    currentBet: 1000,
    action: 'raise',
    amount: 4000,
    pending: [0, 2],
    legal: { callAmount: 950, minRaiseTo: 1750, fullRaiseTo: 1750, maxRaiseTo: 7500 },
    players: [
      { id: 0, position: 'BB', stack: 7450, bet: 50, total: 50, actedTo: 50 },
      { id: 1, position: 'UTG', stack: 0, bet: 1000, total: 1000, actedTo: 1000, allin: true },
      { id: 2, position: 'UTG+1', stack: 3000, bet: 1000, total: 1000, actedTo: 1000 },
      { id: 3, position: 'SB', stack: 10000, bet: 0, total: 25, folded: true, actedTo: 0 },
    ],
  });
  const c = decisionContext(base);
  c.valuePlan = { primary: null };
  const args = {
    code: 'value-bet',
    status: 'sound',
    alternative: { action: 'raise', amount: 4000 },
  };
  const covered = comparisonRoutes(base, c, args);
  assert.equal(covered.primary.action, 'raise');
  assert.equal(covered.primary.amount, 4000);
  assert.match(covered.primary.condition, /所有对手的可投入上限/);
  assert.doesNotMatch(covered.primary.condition, /被加注后重新判断/);
  assert.equal(covered.secondary.action, 'call');
  assert.match(covered.secondary.tradeoff, /仍可能面对后续下注/);

  const deeper = structuredClone(base);
  deeper.players[2].stack = 4000;
  const dc = decisionContext(deeper);
  dc.valuePlan = { primary: null };
  const open = comparisonRoutes(deeper, dc, args);
  assert.match(open.primary.condition, /被加注后重新判断/);
});

test('phase3 round4: closing river secondary calls await showdown instead of future bets', () => {
  const base = spot('5c 5d', '5s Kh 2d 9c Ts', {
    chipUnit: 25,
    stack: 12450,
    total: 50,
    pot: 225,
    currentBet: 75,
    action: 'raise',
    amount: 250,
    pending: [0],
    legal: { chipUnit: 25, callAmount: 75, toCall: 75, minRaiseTo: 150, fullRaiseTo: 150 },
    players: [
      { id: 0, position: 'BTN', stack: 12450, bet: 0, total: 50, actedTo: 0 },
      { id: 1, position: 'SB', stack: 12375, bet: 75, total: 125, actedTo: 75 },
      { id: 2, position: 'BB', stack: 12450, bet: 0, total: 50, folded: true, actedTo: 0 },
    ],
  });
  const c = decisionContext(base);
  c.valuePlan = { primary: null };
  const args = {
    code: 'value-bet',
    status: 'sound',
    alternative: { action: 'raise', amount: 250 },
  };
  const river = comparisonRoutes(base, c, args);
  assert.equal(river.primary.action, 'raise');
  assert.equal(river.primary.amount, 250);
  assert.equal(river.secondary.action, 'call');
  assert.equal(river.secondary.amount, 75);
  assert.match(river.secondary.condition, /不再支付后续下注/);
  assert.doesNotMatch(
    river.secondary.condition + river.secondary.tradeoff,
    /下一次下注|仍可能面对后续下注/,
  );

  const turn = { ...base, street: 2, board: cards('5s Kh 2d 9c') };
  const tc = decisionContext(turn);
  tc.valuePlan = { primary: null };
  const notClosed = comparisonRoutes(turn, tc, args);
  assert.match(notClosed.secondary.condition, /下一次下注另行判断/);
});

test('phase3 round4: weak SB and unreopened short-all-in routes use available conditions only', () => {
  const sb = spot('4c 8d', '', { position: 'SB', action: 'fold', amount: 0 });
  const sc = decisionContext(sb);
  const weak = comparisonRoutes(sb, sc, {
    code: 'weak-sb-cold-call',
    status: 'consider',
    alternative: { action: 'fold', amount: 0 },
    pre: { raises: 1 },
  });
  assert.equal(weak.primary.action, 'fold');
  assert.equal(weak.secondary.action, 'call');
  assert.match(weak.secondary.condition, /翻后先行动与多人竞争/);
  assert.doesNotMatch(weak.secondary.condition, /有位置|大盲折扣/);

  const short = spot('As Ah', '', {
    position: 'BB',
    stack: 7050,
    bet: 450,
    total: 450,
    pot: 1525,
    currentBet: 600,
    minRaise: 300,
    pending: [0, 1],
    legal: { canRaise: false, raiseReopened: false, callAmount: 150, toCall: 150 },
    players: [
      { id: 0, position: 'BB', stack: 7050, bet: 450, total: 450, actedTo: 450 },
      { id: 1, position: 'UTG', stack: 7050, bet: 450, total: 450, actedTo: 450 },
      { id: 2, position: 'UTG+1', stack: 0, bet: 600, total: 600, actedTo: 600, allin: true },
    ],
  });
  const cc = decisionContext(short);
  cc.valuePlan = { primary: null };
  const args = {
    code: 'priced-call',
    status: 'sound',
    alternative: { action: 'call', amount: 150 },
  };
  const noReopen = comparisonRoutes(short, cc, args);
  assert.equal(noReopen.primary.action, 'call');
  assert.doesNotMatch(noReopen.secondary.condition, /后面可能再加注/);
  assert.match(noReopen.secondary.condition, /下一街/);

  const reopen = structuredClone(short);
  reopen.players[1].actedTo = 0;
  const rc = decisionContext(reopen);
  rc.valuePlan = { primary: null };
  assert.match(comparisonRoutes(reopen, rc, args).secondary.condition, /后面可能再加注/);
});

test('river check routes distinguish a pending bet from another community card', () => {
  const s = spot('5c 5d', '4d Qh Ah 5h 9c', {
    currentBet: 0,
    history: [],
    action: 'check',
    amount: 0,
    pending: [0, 1],
    legal: freeBet(4500),
  });
  const c = decisionContext(s);
  c.matchups = handMatchups(s, c);
  const r = comparisonRoutes(s, c, {
    code: 'free-check',
    status: 'sound',
    alternative: { action: 'check', amount: 0 },
  });
  assert.match(r.primary.condition, /河牌已发完.*后面玩家是否下注/);
  assert.match(r.primary.tradeoff, /仍可下注.*跟注或弃牌/);
  assert.doesNotMatch(
    r.primary.condition + r.primary.tradeoff,
    /牌面变化|免费看牌|下一街|免费听牌/,
  );
  assert.equal(r.primary.action, 'check');
});

test('heavy preflop reraise route conditions compare value and fold pressure together', () => {
  for (const hole of ['As Kd', 'Qh Qd']) {
    const s = spot(hole, '', { action: 'raise', amount: 6250, stack: 10000, currentBet: 2500 });
    s.history = [
      { id: 0, street: 0, action: 'raise', amount: 150 },
      { id: 1, street: 0, action: 'raise', amount: 450 },
      { id: 0, street: 0, action: 'raise', amount: 1150 },
      { id: 1, street: 0, action: 'raise', amount: 2500 },
    ];
    const c = decisionContext(s);
    c.matchups = handMatchups(s, c);
    const r = comparisonRoutes(s, c, {
      code: 'pressure-bet',
      status: 'sound',
      alternative: { action: 'raise', amount: 6250 },
    });
    assert.match(r.primary.condition, /较弱牌是否会跟注.*对手是否会放弃更好的牌/);
    assert.doesNotMatch(r.primary.condition, /被跟注后的弱权益/);
  }
});

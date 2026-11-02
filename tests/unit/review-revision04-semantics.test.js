import test from 'node:test';
import { SUPPORTED_LOCALES, loadLocale, localizeText } from '../../src/i18n/index.js';
import assert from 'node:assert/strict';
import { decisionContext, handContext } from '../../src/review/context.js';
import { handMatchups } from '../../src/review/matchups.js';
import { checkReasoning } from '../../src/review/check-reasoning.js';
import { coachDecision } from '../../src/review/coaching.js';
import { continuationNote, actionReason, investmentText } from '../../src/review/narrative.js';
import { strategyNotes } from '../../src/review/strategy-reasoning.js';
import { enrichStrategy } from '../../src/review/strategy-context.js';
import { explainOpponent } from '../../src/review/opponents.js';
import { cards } from '../fixtures/deceptive-decisions.js';
import { turnBluffReview } from '../fixtures/review-summary.js';
import { observerRecord } from '../fixtures/opponent-observer.js';

function spot({
  hole = '7d 7c',
  board = 'Qs 5d As Qh',
  action = 'check',
  amount = 0,
  cost = 0,
  stack = 20000,
  pending = [0, 1],
  rivals = 1,
} = {}) {
  const s = turnBluffReview();
  Object.assign(s, {
    hole: cards(hole),
    board: cards(board),
    street: board ? board.split(' ').length - 2 : 0,
    position: 'CO',
    action,
    amount,
    stack,
    bet: 0,
    total: 0,
    pot: 2000,
    currentBet: cost,
    pending,
    history: [],
    players: [
      { id: 0, name: '你', position: 'CO', stack, bet: 0, total: 0 },
      ...Array.from({ length: rivals }, (_, i) => ({
        id: i + 1,
        name: '对手' + (i + 1),
        position: ['SB', 'BB', 'BTN'][i],
        stack: 20000,
        bet: cost,
        total: cost,
        folded: false,
      })),
    ],
    legal: { ...s.legal, canCheck: !cost, callAmount: cost, toCall: cost, maxRaiseTo: stack },
  });
  return s;
}
function context(s) {
  const c = decisionContext(s);
  c.matchups = handMatchups(s, c);
  return c;
}
function estimate(
  s,
  { primary = { action: s.action, amount: s.amount }, code = 'free-check', closing = false } = {},
) {
  const c = context(s);
  return {
    context: c,
    draw: c.draw,
    code,
    status: 'consider',
    reason: '',
    routes: { primary },
    metrics: {
      required: 0.25,
      equityLow: 0.4,
      equityHigh: 0.5,
      uncertainty: 0.03,
      randomEV: 0,
      weightedEV: 0,
      contestable: s.pot + s.legal.callAmount,
      closing,
    },
  };
}

test('unpaired hero and observer checks discuss high-card showdown rather than weaker made-hand value', () => {
  const s = spot({ hole: '6c Qs', board: '8h 5d 3s' });
  for (const audience of ['hero', 'observer']) {
    const text = checkReasoning({ ...s, reviewAudience: audience }, context(s)).join('');
    assert.match(text, /只有高牌.*尚未成对/);
    assert.match(text, /摊牌时击败较弱高牌/);
    assert.doesNotMatch(text, /更弱成牌付费/);
  }
  const strong = spot({ hole: '8c 8d', board: '8h Ks 3s' });
  assert.match(checkReasoning(strong, context(strong)).join(''), /强成牌|较弱成牌/);
});

test('pending draw checks promise zero for this action, and closing multiway checks do not say both players', () => {
  const pending = spot({ hole: 'Ah Jh', board: 'Kh 7h 2c', pending: [0, 1, 2], rivals: 2 });
  const text = checkReasoning({ ...pending, reviewAudience: 'observer' }, context(pending)).join(
    '',
  );
  assert.match(text, /这次过牌无需投入/);
  assert.doesNotMatch(text, /本轮不增加投入|最后行动|免费见下一张/);
  const closing = spot({ hole: 'Ac 2d', board: 'Jh 8c As', pending: [0], rivals: 2 });
  const closed = checkReasoning(closing, context(closing)).join('');
  assert.match(closed, /最后行动.*仍在局中的玩家免费见下一张/);
  assert.doesNotMatch(closed, /双方/);
});

test('QQ77A and TT66K never invent an attainable higher single kicker', () => {
  for (const [hole, board] of [
    ['7d 7c', 'Qs 5d As Qh'],
    ['6s 6c', 'Tc Ks 7c Th'],
  ]) {
    const s = spot({ hole, board });
    const c = context(s);
    assert.equal(c.made.score[0], 2);
    const text = checkReasoning(s, c).join('');
    assert.match(text, /更强的两对.*三条/);
    assert.doesNotMatch(text, /更好.*踢脚|更大.*对子/);
    assert.match(text, /仍可能赢过/);
  }
});

test('top pair aces and a pocket AA pair have no larger pair threat', () => {
  for (const [hole, board] of [
    ['Ac 2d', 'Jh 8c As'],
    ['Ac Ad', 'Js 8c 2h'],
  ]) {
    const s = spot({ hole, board });
    const text = checkReasoning(s, context(s)).join('');
    assert.doesNotMatch(text, /更大.*对子/);
    if (hole === 'Ac 2d') {
      assert.match(text, /三条|更强牌型/);
      assert.match(text, /踢脚更好的 Ax/);
    } else assert.match(text, /较弱成牌|强成牌/);
  }
});

test('shared pair, trips, quads and two-pair labels remain noun phrases with explicit public/private facts', () => {
  for (const [hole, board, category] of [
    ['Kh 2d', 'Jc Qc Qd 5s 3d', 1],
    ['Js 6d', 'Qs 4s 4c Qd 5d', 2],
    ['Ac Kd', '7s 7c 7h 9d 2c', 3],
    ['Ac Kd', '7s 7c 7h 7d 2c', 7],
  ]) {
    const s = spot({ hole, board });
    const c = handContext(s);
    assert.equal(c.made.score[0], category);
    assert.match(c.handLabel, /（公共牌(?:组成|成对)，.*踢脚）/);
    assert.doesNotMatch(c.handLabel, /来自公共牌/);
    if (category === 1) assert.match(c.handLabel, /底牌提供踢脚/);
    const text = coachDecision(s, estimate(s)).explanation;
    assert.doesNotMatch(text, /上是[^。]*来自公共牌|这个公共对子/);
  }
});

test('one limper and multiple limpers have explicit matching pronouns', () => {
  for (const limpers of [1, 2]) {
    const s = spot({
      hole: 'Kh 7h',
      board: '',
      action: 'raise',
      amount: 300,
      cost: 200,
      rivals: limpers,
    });
    s.history = Array.from({ length: limpers }, (_, i) => ({
      id: i + 1,
      street: 0,
      action: 'call',
      amount: 200,
    }));
    const text = coachDecision(
      s,
      estimate(s, { primary: { action: 'fold', amount: 0 } }),
    ).explanation;
    assert.match(text, new RegExp(`已有 ${limpers} 位玩家`));
    assert.match(text, limpers === 1 ? /提高该玩家继续跟注的成本/ : /提高这些玩家继续跟注的成本/);
    assert.doesNotMatch(text, /提高他们继续跟注的成本/);
  }
});

test('one pending player is not referred to by a plural pronoun', () => {
  for (const rivals of [1, 2]) {
    const s = spot({
      hole: '6c Qs',
      board: '8h 5d 3s',
      rivals,
      pending: [0, ...Array.from({ length: rivals }, (_, i) => i + 1)],
    });
    const text = actionReason(s, estimate(s));
    assert.match(text, rivals === 1 ? /面对该玩家下注再决定/ : /面对这些玩家下注再决定/);
  }
});

test('showdown language compares hands and separates the decision to wait for payment', () => {
  const s = spot({ hole: 'Ac 8s', board: 'Jd 6d 8h' });
  const text = checkReasoning({ ...s, reviewAudience: 'observer' }, context(s)).join('');
  assert.match(text, /仍可能赢过较弱成牌或未成牌。过牌保留摊牌机会/);
  assert.match(text, /暂不主动下注要求对手付费/);
  assert.doesNotMatch(text, /未成牌的诈唬的摊牌机会|而不现在要求/);
});

test('raise practice compares two actions and keeps price and range as their basis', () => {
  const s = spot({ hole: 'Kh 3s', board: '', action: 'raise', amount: 500, cost: 200 });
  const c = coachDecision(s, estimate(s, { primary: { action: 'fold', amount: 0 } }));
  assert.match(c.followUp, /你实际[^。]*。若改为弃牌.*重点比较这两条路线/);
  assert.doesNotMatch(c.followUp, /比较弃牌，核对|或让较弱牌付费|面对大对子或强高张继续容易落后/);
  assert.match(c.recommendedAction.summary, /^建议(?:弃牌|跟注|加注|全下)/);
});

test('actual all-in practice compares actions and never gives the actor a later decision', () => {
  const s = spot({ hole: '8s 5h', board: 'Kc Td 2s', action: 'raise', amount: 20000 });
  const c = coachDecision(
    s,
    estimate(s, { primary: { action: 'check', amount: 0 }, code: 'large-unbacked-bet' }),
  );
  assert.match(c.followUp, /先比较本次[^。]*全下[^。]*与过牌/);
  assert.match(c.followUp, /实际全下后已没有继续下注或弃牌的选择/);
  assert.doesNotMatch(c.followUp, /价格、对手范围与|若被跟注.*重新决定|下一街.*再决定/);
});

test('an actual fold gives a hypothetical call plan, including all-in closure', () => {
  const s = spot({ hole: 'Qd 8s', board: '', action: 'fold', stack: 500, cost: 500 });
  const c = coachDecision(
    s,
    estimate(s, { primary: { action: 'fold', amount: 0 }, code: 'tight-fold' }),
  );
  assert.match(c.followUp, /若改为跟注.*全部剩余 500.*不再参与下注或弃牌决策/);
  assert.doesNotMatch(c.followUp, /重新决定是否|下一街还要面对/);
});

test('turn continuation records a zero-cost actual check and retains conditional river branches', () => {
  const s = spot({ hole: 'Kh Ah', board: '7h Jc 3d Td', pending: [0] });
  const c = context(s);
  const text = continuationNote(s, c, false);
  assert.match(text, /这次过牌没有增加投入，仍留 20K/);
  assert.match(text, /若河牌未补成顺子.*对手过牌.*牌面支持/);
  assert.match(text, /若对手继续下注.*新的金额/);
  assert.doesNotMatch(text, /本次投入后/);
});

test('AA strength and already explained set mining do not acquire a second implied-income pitch', () => {
  const s = spot({ hole: 'Ac Ad', board: '', action: 'fold', cost: 200 });
  const c = coachDecision(
    s,
    estimate(s, { primary: { action: 'call', amount: 200 }, code: 'value-call' }),
  );
  assert.equal((c.explanation.match(/已有很强的摊牌竞争力/g) || []).length, 1);
  assert.doesNotMatch(c.explanation, /这手起手牌已有较强的摊牌竞争力/);
  const assessment = {
    call: {
      eligible: true,
      pairMining: true,
      futurePayBound: 1000,
      impliedValue: 100,
      equity: 0.6,
      price: 0.2,
      amount: 200,
      cost: 200,
    },
  };
  const e = enrichStrategy(c, s, assessment);
  assert.doesNotMatch(e.explanation, /补中后的额外收入|中暗三条后向较弱牌取值/);
  const pair = spot({ hole: '3c 3d', board: '', action: 'call', amount: 200, cost: 200 });
  const base = {
    paragraphs: ['这手对子可以等翻牌中暗三条。'],
    paragraphParts: [['这手对子可以等翻牌中暗三条。']],
  };
  const deduped = enrichStrategy(base, pair, assessment, { audience: 'observer', subject: 'Alex' });
  assert.equal((deduped.paragraphs.join('').match(/暗三条/g) || []).length, 1);
});

test('observer affordable entry has no fictitious prior raise and draw checks do not repeat pot-control filler', () => {
  const limp = observerRecord({
    action: 'call',
    reason: 'affordable-entry',
    hole: '8s 7s',
    board: '',
    cost: 50,
  });
  const text = explainOpponent(limp).paragraphs.join('');
  assert.doesNotMatch(text, /没有再加注做大底池/);
  assert.match(text, /没有主动加注做大底池/);
  const s = spot({ hole: 'Ah Jh', board: 'Kh 7h 2c', pending: [0, 1] });
  const draw = checkReasoning({ ...s, reviewAudience: 'observer' }, context(s)).join('');
  assert.doesNotMatch(draw, /本轮不增加投入|过牌避免主动扩大/);
});

test('investment paragraphs keep total, added amount, matchable amount and refund without a semicolon', () => {
  const s = spot({
    hole: 'As Ah',
    board: '',
    action: 'raise',
    amount: 20000,
    stack: 19900,
    cost: 0,
  });
  s.bet = 100;
  s.players[0].bet = 100;
  s.players[1].stack = 900;
  s.players[1].bet = 0;
  s.legal.maxRaiseTo = 20000;
  const c = context(s);
  const text = investmentText(s, c, { cost: 0, contestable: 2000 });
  assert.doesNotMatch(text, /；/);
  assert.match(text, /全下至 20K.*本次追加 19.9K/);
  assert.match(text, /。其中至少 19K 无法被匹配，会退回。可被匹配的新增投入最多 900/);
});

test('a first turn bet is a bet in the range route and the heading covers both bet and raise', () => {
  const s = spot({ hole: 'As Qh', board: 'Kc 7h 2d 9s' });
  s.history = [
    { id: 1, street: 0, action: 'raise', amount: 600 },
    { id: 0, street: 0, action: 'call', amount: 600 },
    { id: 1, street: 2, action: 'raise', amount: 800 },
  ];
  const range = strategyNotes(s, { range: { advantage: -0.3, uncertainty: 0.1 } }).find(
    (n) => n.topic === 'range',
  );
  assert.match(range.text, /后续公开下注与加注包括转牌对手下注至 800/);
  assert.doesNotMatch(range.text, /转牌对手(?:2-bet )?加注至 800|后续公开加注包括/);
});

test('unraised isolation recommendations keep smaller and larger candidate costs separate from actual totals', () => {
  for (const row of [
    {
      actual: 1000,
      candidate: 700,
      pot: 500,
      actualText: '1K',
      candidateText: '700',
      left: '19.3K',
    },
    {
      actual: 400,
      candidate: 900,
      pot: 700,
      actualText: '400',
      candidateText: '900',
      left: '19.1K',
    },
  ]) {
    const s = spot({ hole: 'Ks 9c', board: '', action: 'raise', amount: row.actual, cost: 200 });
    s.position = s.players[0].position = 'CO';
    s.pot = row.pot;
    s.history = [{ id: 1, street: 0, action: 'call', amount: 200 }];
    assert.equal(s.bet, 0);
    assert.equal(context(s).preflopRaises, 0);
    const c = coachDecision(
      s,
      estimate(s, {
        primary: { action: 'raise', amount: row.candidate },
        code: 'weak-limper-isolation',
      }),
    );
    assert.equal(c.recommendedAction.amount, row.candidate);
    assert.ok(
      c.followUp.includes(
        `你实际2-bet 隔离加注至 ${row.actualText}。若按建议2-bet 隔离加注至 ${row.candidateText}，将留下 ${row.left} 筹码`,
      ),
    );
    assert.ok(c.followUp.includes(`底池为 ${row.pot}`));
    assert.match(c.followUp, /比较这两条路线/);
    assert.doesNotMatch(c.followUp, /需追加|新增投入最多/);
  }
});

test('a blind already posted is separated from the actual and suggested raise-to totals', () => {
  const s = spot({ hole: 'Ks 9c', board: '', action: 'raise', amount: 1000, cost: 100 });
  s.bet = 100;
  s.players[0].bet = 100;
  s.history = [{ id: 1, street: 0, action: 'call', amount: 200 }];
  const c = coachDecision(
    s,
    estimate(s, { primary: { action: 'raise', amount: 700 }, code: 'weak-limper-isolation' }),
  );
  assert.match(c.followUp, /你实际[^。]*至 1K，本次追加 900/);
  assert.match(c.followUp, /若按建议[^。]*至 700，需追加 600，将留下 19.4K 筹码/);
});

test('a river two-pair small bet with possible weaker payers is not categorically called a bluff', () => {
  const s = spot({ hole: '7c 4d', board: 'Qs 7h 5d Ah Qc', action: 'raise', amount: 200 });
  const r = estimate(s, { primary: { action: 'check', amount: 0 }, code: 'pressure-bet' });
  assert.equal(r.context.made.score[0], 2);
  assert.ok(r.context.matchups.weakerMadeCategories.some((category) => category >= 1));
  const c = coachDecision(s, r);
  assert.match(c.followUp, /若较弱成牌愿意支付这个尺度.*可能取值/);
  assert.match(c.followUp, /不能仅凭当前牌型肯定收益/);
  assert.doesNotMatch(c.followUp, /这条进攻需要对手放弃更好的牌/);
  const high = spot({ hole: 'Ac 3d', board: 'Ks Jh 8d 6c 4s', action: 'raise', amount: 200 });
  const other = coachDecision(
    high,
    estimate(high, { primary: { action: 'check', amount: 0 }, code: 'pressure-bet' }),
  );
  assert.match(other.followUp, /未识别出较弱成牌.*若主要争取/);
});

test('an observer semi-bluff retains its two actual winning routes without a second summary', () => {
  const record = observerRecord({
    action: 'raise',
    reason: 'semi-bluff',
    hole: '8h 5h',
    board: '2h 7d Qh Ts',
  });
  record.trace.view.publicStrategy = { draw: { flushDraw: true, outs: 9, nextChance: 9 / 46 } };
  const text = explainOpponent(record).paragraphs.join('');
  assert.match(text, /对手弃牌就拿走.*被跟注后仍有 9 张改善候选/);
  assert.doesNotMatch(text, /这次进攻同时争取对手弃牌和补牌改善/);
});

test('one-pair kicker facts compare the third kicker even when the first two tie', () => {
  const s = spot({ hole: '9d 7c', board: '9s Ah Kc 5d 2h' });
  const c = context(s);
  assert.deepEqual(c.made.score, [1, 9, 14, 13, 7]);
  assert.equal(c.matchups.strongerKickerPossible, true);
  assert.equal(c.made.score.slice(2, 4).join(','), '14,13');
  const aces = spot({ hole: 'Ac Ad', board: 'Kh Qs Jc' });
  const top = context(aces);
  assert.equal(top.matchups.higherPairPossible, false);
  assert.equal(top.matchups.strongerKickerPossible, false);
});

test('a private pair combined with a public pair is explained before the separate actual action', () => {
  const s = spot({ hole: '7c 4d', board: 'Qs 7h 5d Ah Qc', action: 'raise', amount: 200 });
  const c = coachDecision(
    s,
    estimate(s, { primary: { action: 'check', amount: 0 }, code: 'pressure-bet' }),
  );
  assert.match(c.explanation, /公共牌是 Q♠ 7♥ 5♦ A♥ Q♣。当前成牌：底牌击中一对 7/);
  assert.match(c.explanation, /A 作为踢脚。这次选择下注至 200/);
  assert.doesNotMatch(c.explanation, /上是底牌击中/);
});

test('postflop actual and recommended bet sizes keep the actual matched cost explicitly owned', () => {
  const s = spot({ hole: 'Tc 9s', board: '4d Th 9c Kh', action: 'raise', amount: 1000 });
  const c = coachDecision(
    s,
    estimate(s, { primary: { action: 'raise', amount: 700 }, code: 'pressure-bet' }),
  );
  assert.equal(c.recommendedAction.amount, 700);
  assert.match(c.followUp, /先对照下注至 1K与下注至 700/);
  assert.match(c.followUp, /实际这次可被匹配的新增投入最多 1K/);
  assert.doesNotMatch(c.followUp, /建议[^。]*新增投入最多 1K/);
});

test('the actual-action prefix localizes without swallowing a three-bet all-in label', async () => {
  try {
    for (const locale of SUPPORTED_LOCALES) {
      await loadLocale(locale);
      const text = localizeText('本次3-bet 全下至 5K');
      assert.match(text, /5K/);
      assert.doesNotMatch(text, /\{\d+\}/);
      if (!['zh-CN', 'zh-TW', 'ja'].includes(locale)) assert.doesNotMatch(text, /\p{Script=Han}/u);
    }
  } finally {
    await loadLocale('zh-CN');
  }
});

test('board-only free checks do not borrow paid-call comparisons, with and without the nuts', () => {
  for (const [hole, board] of [
    ['4s 3c', '6d 9h 6c Th 6s'],
    ['4s 3c', 'Ad Kd Qd Jd Td'],
  ]) {
    const s = spot({ hole, board, action: 'check', pending: [0] });
    const r = estimate(s, { closing: true });
    assert.equal(r.context.handClass, 'board');
    const c = coachDecision(s, r);
    assert.doesNotMatch(c.explanation, /跟注成本|继续是否划算/);
    assert.doesNotMatch(c.followUp, /跟注成本/);
    assert.match(c.explanation, /平分底池|平分的机会/);
  }
});

test('board-only paid calls still compare the possible split with the real call cost', () => {
  const s = spot({
    hole: '4s 3c',
    board: '6d 9h 6c Th 6s',
    action: 'call',
    amount: 200,
    cost: 200,
    pending: [0],
  });
  const r = estimate(s, { closing: true });
  assert.equal(r.context.handClass, 'board');
  assert.match(coachDecision(s, r).explanation, /可能分得的底池份额与跟注成本/);
});

test('an all-in compared with a call does not treat that call as a smaller value bet', () => {
  const s = spot({
    hole: 'Th 6d',
    board: '8c 4c 9d 7s Tc',
    action: 'raise',
    amount: 4900,
    stack: 4900,
    cost: 400,
    rivals: 3,
    pending: [0, 1, 2, 3],
  });
  const call = coachDecision(
    s,
    estimate(s, { primary: { action: 'call', amount: 400 }, code: 'dangerous-value-shove' }),
  );
  assert.match(call.followUp, /全下.*跟注 400/);
  assert.doesNotMatch(call.followUp, /较小下注能否收到更多弱牌跟注/);
  assert.match(call.followUp, /实际全下后已没有继续下注或弃牌/);
  assert.match(call.explanation, /比较跟注以保留当前成牌的摊牌机会.*不主动抬高/);
  const raise = coachDecision(
    s,
    estimate(s, { primary: { action: 'raise', amount: 1200 }, code: 'dangerous-value-shove' }),
  );
  assert.match(raise.followUp, /较小下注能否收到更多弱牌跟注/);
  const retained = coachDecision(
    s,
    estimate(s, { primary: { action: 'raise', amount: 4900 }, code: 'dangerous-value-shove' }),
  );
  assert.match(retained.followUp, /本次.*全下.*与跟注 400/);
  assert.doesNotMatch(retained.followUp, /较小下注能否收到更多弱牌跟注/);
});

test('an initial strong-hand isolation raise is not described as a re-raise in replay coaching', () => {
  const s = spot({ hole: 'Ah Kd', board: '', action: 'raise', amount: 900, cost: 200 });
  s.history = [{ id: 1, street: 0, action: 'call', amount: 200 }];
  const r = estimate(s);
  assert.equal(r.context.preflopRaises, 0);
  const c = coachDecision(s, r);
  assert.doesNotMatch(c.followUp, /把再加注当作取值/);
  assert.match(c.followUp, /是否愿意支付这个尺度/);
});

test('initial-raise and all-in-versus-call practice text localizes with actions and amounts intact', async () => {
  const opening = spot({ hole: 'Ah Kd', board: '', action: 'raise', amount: 900, cost: 200 });
  opening.history = [{ id: 1, street: 0, action: 'call', amount: 200 }];
  const shove = spot({
    hole: 'Th 6d',
    board: '8c 4c 9d 7s Tc',
    action: 'raise',
    amount: 4900,
    stack: 4900,
    cost: 400,
    rivals: 3,
    pending: [0, 1, 2, 3],
  });
  const texts = [
    coachDecision(opening, estimate(opening)).followUp,
    coachDecision(
      shove,
      estimate(shove, { primary: { action: 'call', amount: 400 }, code: 'dangerous-value-shove' }),
    ).followUp,
    coachDecision(
      shove,
      estimate(shove, { primary: { action: 'call', amount: 400 }, code: 'dangerous-value-shove' }),
    ).paragraphs.at(-1),
  ];
  try {
    for (const locale of SUPPORTED_LOCALES) {
      await loadLocale(locale);
      for (const [i, source] of texts.entries()) {
        const value = localizeText(source);
        assert.match(value, i === 0 ? /900/ : /400/);
        assert.doesNotMatch(value, /\{\d+\}/);
        if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
          assert.doesNotMatch(value, /\p{Script=Han}/u, `${locale}: ${value}`);
        if (!['zh-CN', 'zh-TW', 'ja'].includes(locale))
          assert.doesNotMatch(value, /[.!?][A-Za-zÀ-ÖØ-öø-ÿА-Яа-яЁё가-힣]/u, `${locale}: ${value}`);
      }
    }
  } finally {
    await loadLocale('zh-CN');
  }
});

test('a minimum value bet compares checking rather than an illegal smaller bet', () => {
  for (const amount of [200, 400]) {
    const s = spot({ hole: '6c Jd', board: '4h 4s 6s 8s 4c', action: 'raise', amount });
    s.legal.minRaiseTo = 200;
    const r = estimate(s, {
      primary: { action: 'check', amount: 0 },
      code: 'conditional-value-bet',
    });
    assert.equal(r.context.made.score[0], 6);
    const c = coachDecision(s, r);
    if (amount === 200) {
      assert.doesNotMatch(c.explanation, /更小下注或过牌/);
      assert.match(c.explanation, /比较过牌.*最小下注/);
    } else assert.match(c.explanation, /更小下注或过牌/);
  }
});

test('public-pair two-pair descriptions distinguish a pocket pair from one hole card pairing', () => {
  const paired = spot({ hole: 'Ac 2d', board: 'Ad Ts 8h 7s 8d' });
  assert.match(context(paired).handLabel, /一张底牌与公共牌组成一对 A.*公共牌一对 8.*10 踢脚/);
  const pocket = spot({ hole: '7d 7c', board: 'Qs 5d As Qh' });
  assert.match(context(pocket).handLabel, /底牌已有一对 7.*公共牌一对 Q.*A 踢脚/);
  const shared = spot({ hole: 'Ac Kd', board: 'Qs Qh 8c 8h 2d' });
  assert.match(context(shared).handLabel, /两对（公共牌组成，A 踢脚）/);
});

test('observer check language keeps the actor in third person and bets chips rather than cards', () => {
  const blocked = spot({ hole: '5c Qd', board: '5h 5s 2d 9h', pending: [0, 1] });
  const risk = checkReasoning({ ...blocked, reviewAudience: 'observer' }, context(blocked)).join(
    '',
  );
  assert.doesNotMatch(risk, /本人底牌/);
  assert.match(risk, /这手底牌已排除/);
  const strong = spot({ hole: '8c 8d', board: '8h Ks 3s', pending: [0, 1] });
  const text = checkReasoning({ ...strong, reviewAudience: 'observer' }, context(strong)).join('');
  assert.doesNotMatch(text, /投入较弱牌/);
  assert.match(text, /较弱成牌下注.*未成牌诈唬/);
});

test('a covering raise kept as the candidate compares with a different legal action', () => {
  const s = spot({ hole: 'Jc 7d', board: '', action: 'raise', amount: 800, cost: 200 });
  s.players[1].stack = 400;
  const c = coachDecision(s, estimate(s));
  assert.match(c.followUp, /实际下注已覆盖/);
  assert.match(c.followUp, /与跟注 200/);
  assert.doesNotMatch(c.followUp, /至 800与本次[^。]*至 800/);
});

test('preflop comparisons scope fold equity and being called to the raising route', () => {
  for (const primary of [
    { action: 'fold', amount: 0 },
    { action: 'call', amount: 200 },
  ]) {
    const s = spot({ hole: 'Qh 7d', board: '', action: 'raise', amount: 800, cost: 200 });
    const c = coachDecision(s, estimate(s, { primary, code: 'pressure-bet' }));
    assert.doesNotMatch(c.followUp, /各自的投入能否争取足够弃牌/);
    assert.match(c.followUp, /加注路线.*弃牌空间.*被跟注后的摊牌机会/);
    assert.match(c.followUp, /800/);
    assert.match(c.followUp, primary.action === 'fold' ? /弃牌.*20K/ : /跟注 200/);
  }
});

test('a river range explanation waits for pending opponents before claiming showdown', () => {
  for (const pending of [[0, 1], [0]]) {
    const s = spot({ hole: 'Ac 6d', board: 'Ah Js 9s Ks 8d', pending });
    s.history = [
      { id: 1, street: 0, action: 'raise', amount: 600 },
      { id: 0, street: 0, action: 'call', amount: 600 },
    ];
    const n = strategyNotes(s, { range: { advantage: -0.2, uncertainty: 0.01 } });
    const text = n.find((part) => part.topic === 'range').text;
    if (pending.includes(1)) {
      assert.match(text, /仍需等待后面玩家行动/);
      assert.doesNotMatch(text, /之后按最终摊牌结果分配/);
    } else assert.match(text, /最终摊牌结果分配/);
  }
});

test('high-card checks explain beating weaker high cards at showdown', () => {
  const s = spot({ hole: 'Kh 2d', board: 'Jh 9s 5c', pending: [0, 1] });
  for (const audience of ['decision', 'observer']) {
    const text = checkReasoning({ ...s, reviewAudience: audience }, context(s)).join('');
    assert.match(text, /摊牌时击败较弱高牌的机会/);
    assert.doesNotMatch(text, /与较弱高牌争取摊牌/);
    assert.doesNotMatch(text, /较弱成牌.*取值/);
  }
});

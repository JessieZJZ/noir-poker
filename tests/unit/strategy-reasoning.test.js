import test from 'node:test';
import assert from 'node:assert/strict';
import { strategyNotes } from '../../src/review/strategy-reasoning.js';
import { deckOfCards, evaluate, compare } from '../../src/engine/poker.js';
import { assessPublicStrategy } from '../../src/engine/public-strategy.js';

const cards = (text) =>
  text.split(' ').map((key) => ({
    key,
    rank: '23456789TJQKA'.indexOf(key[0]) + 2,
    suit: 'shcd'.indexOf(key[1]),
  }));
const snapshot = (changes = {}) => ({
  id: 0,
  hole: cards('Ad 5d'),
  board: cards('Kd 8d 2c'),
  street: 1,
  bigBlind: 100,
  chipUnit: 50,
  position: 'BTN',
  pot: 1000,
  stack: 5000,
  bet: 0,
  currentBet: 200,
  action: 'call',
  amount: 200,
  opponents: [{ id: 1, stack: 5000, allin: false }],
  history: [
    { id: 0, street: 0, action: 'raise', amount: 300 },
    { id: 1, street: 0, action: 'call', amount: 300 },
    { id: 1, street: 1, action: 'raise', amount: 200 },
  ],
  legal: {
    canCheck: false,
    canRaise: true,
    callAmount: 200,
    minRaiseTo: 400,
    maxRaiseTo: 5000,
    chipUnit: 50,
  },
  ...changes,
});
const assessment = (changes = {}) => ({
  range: { advantage: 0.08, uncertainty: 0.15 },
  options: [
    { amount: 400, worseMadeCallMass: 0.3, drawCallMass: 0.15 },
    { amount: 800, worseMadeCallMass: 0.12, drawCallMass: 0.11 },
  ],
  call: {
    amount: 200,
    cost: 200,
    price: 0.25,
    equity: 0.2,
    eligible: true,
    impliedValue: 50,
    futurePayBound: 750,
  },
  draw: {
    flushDraw: true,
    nutFlushDraw: true,
    comboDraw: false,
    straightDraw: false,
    pairedBoard: false,
    madeCategory: 0,
  },
  ...changes,
});
const prose = (notes) => notes.map((n) => n.text).join('');
const noDraw = { flushDraw: false, straightDraw: false, comboDraw: false, madeCategory: 1 };
const forbidden = /EV|抽样|samples|estimatedValue|\d+(?:\.\d+)?%|必定|证明最优|保证获胜/;

test('strategy notes ignore hidden cards, future results, private traces, and internal EV values', () => {
  const s = snapshot();
  const a = assessment();
  const expected = strategyNotes(s, a);
  const secret = () => {
    throw Error('Private or internal data read');
  };
  for (const key of ['deck', 'outcome', 'winners', 'trace', 'botDecisions', 'features'])
    Object.defineProperty(s, key, { get: secret });
  Object.defineProperty(s.opponents[0], 'hole', { get: secret });
  Object.defineProperty(a.call, 'estimatedValue', { get: secret });
  for (const option of a.options) Object.defineProperty(option, 'estimatedValue', { get: secret });
  const plan = { action: 'call', kind: 'implied-continue', motive: 'draw-price' };
  Object.defineProperty(plan, 'reason', { get: secret });
  assert.deepEqual(strategyNotes(s, a, { plan }), expected);
  assert.doesNotMatch(prose(expected), forbidden);
});

test('a call needing future income names the current price and additional street cost', () => {
  const notes = strategyNotes(snapshot(), assessment());
  assert.equal(notes.length, 2);
  const implied = notes.find((n) => n.topic === 'implied-odds');
  assert.match(implied.text, /跟注 200.*还需要补中后从较弱牌收取筹码/);
  assert.match(implied.text, /只补齐本轮.*下一街.*另算成本/);
  assert.doesNotMatch(prose(notes), forbidden);
});

test('actor all-in, all opponents all-in, and no eligible future stack cannot promise implied income', () => {
  const cases = [
    { s: snapshot({ stack: 200 }) },
    { s: snapshot({ opponents: [{ id: 1, stack: 0, allin: true }] }) },
    { s: snapshot(), reason: 'no-eligible-future-stack' },
  ];
  for (const { s, reason } of cases) {
    const a = assessment();
    if (reason) a.call.reason = reason;
    const text = prose(strategyNotes(s, a));
    assert.match(text, /没有后续下注/);
    assert.doesNotMatch(text, /还需要补中后从较弱牌收取筹码|下一街再被下注|可重新比较弃牌/);
  }
});

test('recommended fold does not inherit the actual call or its optimistic implied plan', () => {
  const notes = strategyNotes(snapshot(), assessment(), {
    action: 'fold',
    plan: { action: 'call', kind: 'implied-continue', motive: 'draw-price' },
  });
  const text = prose(notes);
  assert.match(text, /弃牌/);
  assert.doesNotMatch(text, /跟注保留改善机会|先过牌|这次下注|跟注 200 还需要/);
  assert.ok(notes.length <= 2);
});

test('size-specific paying ranges only compare assessed sizes and the customer category that declines', () => {
  const s = snapshot({ action: 'raise', amount: 400 });
  const a = assessment({ draw: noDraw });
  const text = prose(strategyNotes(s, a));
  assert.match(text, /加注至 400.*较弱成牌和听牌可能付费/);
  assert.match(text, /再加大到 800.*赶走较弱成牌/);
  assert.doesNotMatch(text, forbidden);
  assert.equal(
    strategyNotes(s, a, { amount: 600 }).some((n) => n.topic === 'paying-range'),
    false,
    'A missing size must not inherit a nearby assessed size',
  );
  const sameMass = assessment({
    draw: noDraw,
    options: [
      { amount: 400, worseMadeCallMass: 0.3, drawCallMass: 0.15 },
      { amount: 800, worseMadeCallMass: 0.3, drawCallMass: 0.15 },
    ],
  });
  assert.doesNotMatch(prose(strategyNotes(s, sameMass)), /再加大到|赶走/);
});

test('a confident public range comparison names both public lines and board, not the actual hand equity', () => {
  const s = snapshot({ action: 'check' });
  const a = assessment({
    range: { advantage: 0.28, uncertainty: 0.14 },
    draw: noDraw,
  });
  const range = strategyNotes(s, a).find((n) => n.topic === 'range');
  assert.match(range.text, /你翻前加注、对手跟注.*K♦ 8♦ 2♣.*整组牌整体更强/);
  assert.match(range.text, /过牌保留后手/);
  assert.doesNotMatch(range.text, /下注有.*优势支持/);
  for (const changes of [
    { range: { advantage: 0.15, uncertainty: 0.15 } },
    { range: { advantage: 0.4 } },
  ])
    assert.equal(
      strategyNotes(s, { ...a, ...changes }).some((n) => n.topic === 'range'),
      false,
    );
  assert.equal(
    strategyNotes(
      { ...s, opponents: [...s.opponents, { id: 2, stack: 5000, allin: false }] },
      a,
    ).some((n) => n.topic === 'range'),
    false,
    'A pairwise multiway average cannot establish a joint range advantage',
  );
});

test('a nut combo draw on a paired board means highest flush potential rather than unbeatable nuts', () => {
  const s = snapshot({
    hole: cards('Ad Jd'),
    board: cards('Qd Td Qc'),
    action: 'raise',
    amount: 400,
    history: [
      ...snapshot().history.slice(0, 2),
      { id: 0, street: 1, action: 'check', amount: 0 },
      { id: 1, street: 1, action: 'raise', amount: 200 },
    ],
  });
  const a = assessment({
    draw: { ...assessment().draw, comboDraw: true, straightDraw: true, pairedBoard: true },
  });
  const text = prose(strategyNotes(s, a, { plan: { action: 'raise', kind: 'check-raise-draw' } }));
  assert.match(text, /最大同花听牌兼顺子听牌/);
  assert.match(text, /过牌加注至 400/);
  assert.match(text, /被跟注后.*没改善.*重新比较价格/);
  assert.match(text, /已配对.*仍可能输给葫芦、四条/);
  assert.doesNotMatch(text, /必胜|无敌|已经是最大牌|继续每街下注/);
});

test('check-for-raise remains conditional and cannot describe a raise when the passed action is check', () => {
  const s = snapshot({ action: 'raise', amount: 400 });
  const notes = strategyNotes(s, assessment(), {
    action: 'check',
    plan: { action: 'check', kind: 'check-for-raise', motive: 'trap' },
  });
  const text = prose(notes);
  assert.match(text, /先过牌.*若对手下注.*再按价格.*比较过牌加注/);
  assert.match(text, /对手过牌.*下一张后重估/);
  assert.doesNotMatch(text, /加注至 400|被跟注后/);
});

test('all-in raises and checks facing only all-in opponents cannot promise later raises', () => {
  const s = snapshot({ action: 'raise', amount: 5000 });
  const text = prose(strategyNotes(s, assessment()));
  assert.match(text, /被跟注后就按最终摊牌结果分池/);
  assert.doesNotMatch(text, /再遭加注|下一张没改善|后续若再加压/);
  const checked = prose(
    strategyNotes(snapshot({ opponents: [{ id: 1, stack: 0, allin: true }] }), assessment(), {
      action: 'check',
      plan: { action: 'check', kind: 'check-for-raise' },
    }),
  );
  assert.match(checked, /等待后续公共牌与摊牌/);
  assert.doesNotMatch(checked, /若对手下注|对手随后下注|过牌加注/);
});

test('the same public range note supports an explicit opponent subject without rewriting translated text', () => {
  const s = snapshot({ action: 'check' });
  const a = assessment({
    range: { advantage: 0.28, uncertainty: 0.14 },
    draw: noDraw,
  });
  const text = prose(strategyNotes(s, a, { subject: '她' }));
  assert.match(text, /此前她翻前加注/);
  assert.match(text, /她可能持有的整组牌/);
  assert.doesNotMatch(text, /你/);
});

test('a first raise is not labelled check-raise and a value check-raise revisits changed boards', () => {
  const s = snapshot({ action: 'raise', amount: 400 });
  assert.doesNotMatch(prose(strategyNotes(s, assessment())), /过牌加注至/);
  s.history.splice(2, 0, { id: 0, street: 1, action: 'check', amount: 0 });
  const a = assessment({ draw: noDraw });
  const text = prose(strategyNotes(s, a, { plan: { action: 'raise', kind: 'check-raise-value' } }));
  assert.match(text, /过牌加注至 400/);
  assert.match(text, /新牌补出明显听牌.*再遇大额加注.*重新判断/);
});

test('a completed river cannot inherit stale current draw or implied-odds claims', () => {
  const s = snapshot({
    street: 3,
    board: cards('Kd 8d 2c 4h Jd'),
    action: 'raise',
    amount: 400,
  });
  const notes = strategyNotes(s, assessment());
  const text = prose(notes);
  assert.doesNotMatch(text, /带.*听牌|仍有.*听牌可能付费|下一张|补中后|额外收入|隐含/);
  assert.ok(notes.every((n) => !['draw-plan', 'implied-odds'].includes(n.topic)));
});

const river = (riverCard = '3c') =>
  snapshot({
    hole: cards('As Tc'),
    board: cards(`Ah 8h 2c 4d ${riverCard}`),
    street: 3,
    history: [
      ...snapshot().history.slice(0, 2),
      { id: 1, street: 1, action: 'raise', amount: 200 },
      { id: 0, street: 1, action: 'call', amount: 200 },
      { id: 1, street: 2, action: 'check', amount: 0 },
      { id: 0, street: 2, action: 'raise', amount: 300 },
      { id: 1, street: 2, action: 'raise', amount: 800 },
      { id: 0, street: 2, action: 'call', amount: 500 },
      { id: 1, street: 3, action: 'raise', amount: 200 },
    ],
  });

test('river bluff catching connects the real missed draw, current price, and opposite value line', () => {
  const text = prose(strategyNotes(river(), assessment({ draw: noDraw })));
  assert.match(text, /没有补出第三张红桃.*落空同花听牌.*诈唬/);
  assert.match(text, /过牌加注也可能来自强成牌/);
  assert.match(text, /跟注 200 是抓这些诈唬.*输给.*强成牌/);
  assert.doesNotMatch(text, /对手在诈唬|一定没有|当前有.*听牌|下一张/);
});

test('a completed river draw moves to possible value while a recommended fold retains its own meaning', () => {
  const a = assessment({ draw: noDraw });
  const notes = strategyNotes(river('3h'), a, { action: 'fold' });
  const text = prose(notes);
  assert.match(text, /补出第三张红桃.*同花听牌可成为价值牌/);
  assert.match(text, /弃牌.*保留还需支付的 200/);
  assert.doesNotMatch(text, /是抓这些诈唬|跟注保留|下一街再/);
  assert.ok(notes.length <= 2);
});

test('a continuation plan never commits a previous bluff to automatic barrels', () => {
  const s = snapshot({ action: 'raise', amount: 400, street: 2, board: cards('Kd 8d 2c Qh') });
  const a = assessment({ draw: noDraw, options: [] });
  const text = prose(
    strategyNotes(s, a, {
      plan: { action: 'raise', kind: 'checkraise-followthrough', motive: 'bluff' },
    }),
  );
  assert.match(text, /让更好的牌弃掉.*若被跟注.*重新判断.*不自动继续下注/);
  assert.doesNotMatch(text, /一定继续|必须打三枪|跟注保留/);
});

test('real public assessments produce at most two notes without exposing model probabilities or EV', () => {
  const s = snapshot();
  const real = assessPublicStrategy(s, { deck: deckOfCards(), evaluate, compare, samples: 8 });
  const notes = strategyNotes(s, real);
  assert.ok(notes.length <= 2);
  assert.ok(notes.every((n) => typeof n.topic === 'string' && typeof n.text === 'string'));
  assert.doesNotMatch(prose(notes), forbidden);
});

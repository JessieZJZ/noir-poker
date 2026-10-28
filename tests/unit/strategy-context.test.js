import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDecision } from '../../src/review/analysis.js';
import { topPairFlushTurn } from '../fixtures/review-value-targets.js';
import { valueDrawNote } from '../../src/review/value-targets.js';
import { pairedTurn } from '../fixtures/limped-defense.js';
import { botDecision } from '../../src/engine/poker.js';
import { clarityRandom } from '../fixtures/review-clarity-followup.js';
import { enrichStrategy } from '../../src/review/strategy-context.js';
import { cards } from '../fixtures/deceptive-decisions.js';

const analyze = (s) => analyzeDecision(s, { trials: 12, rolloutTrials: 2 });
test('nut-draw teaching keeps the current action once and a conditional next-street plan', () => {
  const { flop } = topPairFlushTurn({ hole: 'Ad Jd', turnCard: '2s' });
  const r = analyze(flop),
    text = r.coaching.paragraphs.at(-1);
  assert.match(text, /最大同花听牌/);
  assert.match(text, /没改善或再遭加注.*重新比较价格/);
  assert.equal(text.match(/810K/g)?.length, 1);
  assert.doesNotMatch(text, /这次拿出|必然弃牌|保证/);
});
test('a draw shove cannot promise another betting decision to the all-in actor', () => {
  const { turn } = topPairFlushTurn({ hole: 'Ad Jd', turnCard: '2s' });
  const text = analyze(turn).coaching.paragraphs.at(-1);
  assert.match(text, /最终摊牌结果分池/);
  assert.doesNotMatch(text, /下一张没改善或再遭加注/);
  assert.equal(text.match(/1\.21M/g)?.length, 1);
});
test('shared board pairs cannot turn a bluff into draw-payment value', () => {
  const v = botDecision(pairedTurn(), clarityRandom(71)).trace.view;
  assert.equal(
    valueDrawNote(
      { ...v, action: 'raise' },
      {
        made: { score: [1] },
        features: { ownMade: false },
        matchups: { weakerDrawTypes: ['flush', 'straight'] },
      },
    ),
    '',
  );
});
test('an opponent public style changes the prior, never supplies private mood or hole-card knowledge', () => {
  const g = pairedTurn(),
    d = botDecision(g, clarityRandom(71));
  assert.ok(d.trace.view.publicStrategy);
  assert.equal(d.trace.view.opponents.find((p) => p.id === 0).botProfile, null);
  for (const p of d.trace.view.opponents) assert.equal(p.hole, undefined);
});

test('opponent draw payment never substitutes for naming the acting hand own draw', () => {
  const { flop: s } = topPairFlushTurn({ hole: 'Kd Jd', turnCard: '2s' });
  const text = '取值也可能来自同花听牌的跟注，前提是对手愿意支付这个尺度。';
  const r = enrichStrategy(
    { paragraphs: [text], paragraphParts: [[text]] },
    s,
    { draw: { flushDraw: true, nutFlushDraw: false }, options: [] },
    { action: s.action, amount: s.amount },
  );
  assert.match(r.explanation, /K♦ J♦ 带同花听牌/);
});

test('observer draw enrichment keeps paired-board risk without repeating the purpose of checking', () => {
  const { flop } = topPairFlushTurn({ hole: 'Kd Jd', turnCard: '2s' });
  const s = { ...flop, board: cards('5d 5h 6d'), action: 'check', amount: 0 };
  const text = 'Alex带同花听牌，选择过牌。过牌避免主动扩大当前底池。';
  const result = enrichStrategy(
    { paragraphs: [text], paragraphParts: [[text]] },
    s,
    { draw: { flushDraw: true, pairedBoard: true, nutFlushDraw: false }, options: [] },
    { action: 'check', subject: 'Alex', audience: 'observer' },
  );
  assert.match(result.explanation, /过牌避免主动扩大当前底池/);
  assert.match(result.explanation, /补成同花仍可能输给葫芦、四条/);
  assert.doesNotMatch(result.explanation, /过牌保留改善机会，也没有主动扩大底池/);
  assert.equal(result.explanation.match(/扩大.*?底池/g)?.length, 1);
});

test('observer draw calls retain their outs and paired-board risk without repeating an explained improvement', () => {
  const { flop } = topPairFlushTurn({ hole: 'Kd Jd', turnCard: '2s' });
  const s = { ...flop, board: cards('5d 5h 6d'), action: 'call' };
  const text = 'Alex带同花听牌，选择跟注。当前主要依靠听牌改善争取获胜，共有 9 张牌可能补成同花。';
  const a = { draw: { flushDraw: true, pairedBoard: true, nutFlushDraw: false }, options: [] };
  const result = enrichStrategy({ paragraphs: [text], paragraphParts: [[text]] }, s, a, {
    action: 'call',
    subject: 'Alex',
    audience: 'observer',
  });
  assert.match(result.explanation, /选择跟注.*共有 9 张牌可能补成同花/);
  assert.match(result.explanation, /补成同花仍可能输给葫芦、四条/);
  assert.doesNotMatch(result.explanation, /这次跟注保留了听牌的改善机会/);
});

test('an observer call with no existing draw explanation still gets its own draw and improvement purpose', () => {
  const { flop } = topPairFlushTurn({ hole: 'Kd Jd', turnCard: '2s' });
  const s = { ...flop, action: 'call' };
  const text = 'Alex选择跟注。';
  const result = enrichStrategy(
    { paragraphs: [text], paragraphParts: [[text]] },
    s,
    { draw: { flushDraw: true, nutFlushDraw: false }, options: [] },
    { action: 'call', subject: 'Alex', audience: 'observer' },
  );
  assert.match(result.explanation, /K♦ J♦ 带同花听牌/);
  assert.match(result.explanation, /这次跟注保留了听牌的改善机会/);
});

test('specific observer payment evidence replaces generic value filler while keeping the hand, action and risk', () => {
  const { flop: s } = topPairFlushTurn();
  const text =
    'Alex拿 K♠ 10♣，当前是顶对 10，选择下注至 810K。' +
    '这是用顶对 10取值：这次拿出 810K，希望更弱成牌或听牌付费。' +
    '牌面有同花或顺子连接，下注也让追牌的人付出成本。' +
    '补出同花时可能落后。';
  const a = {
    draw: {},
    options: [
      { amount: s.amount, worseMadeCallMass: 0.4, drawCallMass: 0.2 },
      { amount: s.amount + 200000, worseMadeCallMass: 0.1, drawCallMass: 0.1 },
    ],
  };
  const base = { paragraphs: [text], paragraphParts: [[text]] };
  const result = enrichStrategy(base, s, a, {
    action: 'raise',
    amount: s.amount,
    subject: 'Alex',
    audience: 'observer',
  });
  assert.match(result.explanation, /K♠ 10♣.*顶对 10.*选择下注至 810K/);
  assert.match(result.explanation, /按这个尺度.*较弱成牌和听牌可能付费/);
  assert.match(result.explanation, /补出同花时可能落后/);
  assert.doesNotMatch(result.explanation, /这次拿出|追牌的人付出成本/);
  assert.equal(result.explanation.match(/810K/g)?.length, 1);
  const hero = enrichStrategy(base, s, a, { action: 'raise', amount: s.amount });
  assert.match(hero.explanation, /这是用顶对 10取值/);
});

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

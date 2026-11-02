import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichStrategy } from '../../src/review/strategy-context.js';
import { REVIEW_TOPICS as TOPIC } from '../../src/review/prose-topics.js';
import { observerRecord } from '../fixtures/opponent-observer.js';

test('a second enrichment preserves the first result instead of appending the same strategy topic again', () => {
  const r = observerRecord({ action: 'call', hole: 'As Js', board: 'Qs 7s Jd 4c' });
  const s = { ...r.trace.view, action: 'call' };
  const assessment = { draw: { flushDraw: true, nutFlushDraw: true }, call: {}, options: [] };
  const original = { paragraphs: ['Alex选择跟注。'], paragraphParts: [['Alex选择跟注。']] };
  const options = { action: 'call', audience: 'observer', subject: 'Alex' };
  const once = enrichStrategy(original, s, assessment, options);
  const twice = enrichStrategy(once, s, assessment, options);
  assert.match(once.explanation, /最大同花听牌/);
  assert.deepEqual(twice.paragraphParts, once.paragraphParts);
  assert.deepEqual(twice.strategyTopics, once.strategyTopics);
  assert.deepEqual(original.paragraphs, ['Alex选择跟注。']);
});

for (const nutFlushDraw of [true, false])
  test(`already explained closure and draw chances retain the paired-board risk with nut-draw=${nutFlushDraw}`, () => {
    const r = observerRecord({ action: 'call', hole: 'As Js', board: 'Qs 7s 7d 4c' });
    const s = { ...r.trace.view, action: 'call' };
    const source = 'Alex跟注后已没有后续下注，当前有 9 张成花候选。';
    const base = {
      paragraphs: [source],
      paragraphParts: [[source]],
      coveredTopics: [TOPIC.CLOSURE, TOPIC.FOLD_AVAILABILITY, TOPIC.DRAW, TOPIC.DRAW_CEILING],
    };
    const result = enrichStrategy(
      base,
      s,
      {
        draw: { flushDraw: true, nutFlushDraw, pairedBoard: true },
        call: { eligible: false, reason: 'no-eligible-future-stack' },
        options: [],
      },
      { action: 'call' },
    );
    assert.equal(result.explanation.match(/没有后续下注/g)?.length, 1);
    if (nutFlushDraw) assert.match(result.explanation, /最大同花听牌/);
    assert.match(result.explanation, /公共牌已配对.*葫芦、四条/);
    assert.doesNotMatch(result.explanation, /后街.*诈唬|补中后再收筹码|下一张没改善/);
  });

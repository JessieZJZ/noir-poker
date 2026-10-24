import test from 'node:test';
import assert from 'node:assert/strict';
import { phase3CheckSpot } from '../fixtures/review-phase3.js';
import { decisionContext } from '../../src/review/context.js';
import { checkRisks, madeRedrawReasoning } from '../../src/review/check-reasoning.js';

const facts = (hole, board) => {
  const { snapshot } = phase3CheckSpot(hole, board);
  const context = decisionContext(snapshot);
  return {
    context,
    risk: checkRisks(snapshot, context).join(''),
    redraw: madeRedrawReasoning(snapshot, context).join(''),
  };
};
test('the actor third card of a paired rank excludes rival quads without excluding a full house', () => {
  for (const [hole, board] of [
    ['5h 2d', 'Qd 2c 2h'],
    ['8c Kh', '5h 8h 8d 6s Qd'],
    ['Kc Ts', '4h Ad 6d Kd Kh'],
  ]) {
    const f = facts(hole, board);
    assert.match(f.risk, /仍可能组成葫芦/);
    assert.doesNotMatch(f.risk, /可能组成葫芦或四条/);
  }
  assert.match(facts('Ah Kh', 'Qh Qd 8h 2h').risk, /可能组成葫芦或四条/);
  assert.equal(facts('8c Kh', '8h 8d Qc Qd').risk, '');
  assert.match(facts('As Kd', '8h 8d 8c').risk, /可能组成葫芦或四条/);
});
test('set and trips redraw descriptions stop on the river and do not label a lone pair a redraw', () => {
  assert.match(facts('4c 4d', '4h 9h 2h Qh').redraw, /葫芦或四条/);
  assert.match(facts('8c Kh', '5h 8h 8d').redraw, /葫芦或四条/);
  assert.equal(facts('4c 4d', '4h 9h 2h Qh Tc').redraw, '');
  assert.equal(facts('Ac Kd', 'Ah 9h 2h Qh').redraw, '');
});
test('public pair composition stays distinct from two independent private pairs', () => {
  const turn = facts('Qh Ad', '6c 2d 6d Qs').context;
  const river = facts('Qh Ad', '6c 2d 6d Qs 2c').context;
  for (const c of [turn, river]) {
    assert.equal(c.handClass, 'top-pair');
    assert.match(c.handLabel, /底牌组成 Q 对，加公共牌 6 对/);
  }
  assert.equal(facts('Qh Ad', 'Qc 2d 6d As 3c').context.handClass, 'two-pair');
  assert.match(facts('4h 4s', '8c 4c Qd 8h').context.handLabel, /葫芦：三张 4 加两张 8/);
});

test('a single straight-completing rank is described as one card rather than a list', () => {
  const text = facts('9c 9d', '2h 3s 4d 6c').risk;
  assert.match(text, /底牌中有一张 5/);
  assert.doesNotMatch(text, /5 中任意一张/);
});

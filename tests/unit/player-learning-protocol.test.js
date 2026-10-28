import test from 'node:test';
import assert from 'node:assert/strict';
import {
  learningDesign,
  learningSeeds,
  learningLineup,
  eligibleHeroShove,
  actualAllFold,
  pairedLearningDifference,
} from '../../scripts/player-learning-protocol.mjs';
import { postflopEvaluationDesign } from '../../scripts/postflop-evaluation-protocol.mjs';

test('learning evaluation fixes its budget, disjoins train seeds and balances two lineup strata', () => {
  const plan = learningDesign();
  assert.equal(plan.plannedHands, 64 * (16 + 3 * 10));
  const counts = { balanced: 0, mixed: 0 };
  const train = new Set(),
    evaluation = new Set();
  for (let block = 0; block < plan.blocks; block++) {
    const lineup = learningLineup(block);
    counts[lineup.stratum]++;
    assert.equal(lineup.assignments.length, 8);
    if (lineup.stratum === 'balanced')
      assert.ok(lineup.assignments.every((id) => id === 'balanced'));
    else assert.equal(new Set(lineup.assignments).size, 8);
    for (let hand = 0; hand < plan.trainHands; hand++)
      train.add(learningSeeds(plan, block, hand, 'train').deck);
    for (let hand = 0; hand < plan.evaluationHands; hand++)
      evaluation.add(learningSeeds(plan, block, hand, 'evaluation').deck);
  }
  assert.deepEqual(counts, { balanced: 32, mixed: 32 });
  assert.equal(train.size, 1024);
  assert.equal(evaluation.size, 640);
  assert.ok([...evaluation].every((seed) => !train.has(seed)));
});

test('the all-fold endpoint excludes walks, eliminated seats and losing all-in opponents', () => {
  const legal = { canRaise: true, maxRaiseTo: 20000 };
  assert.equal(
    eligibleHeroShove({
      id: 0,
      street: 0,
      firstHeroAction: true,
      action: 'raise',
      amount: 20000,
      legal,
    }),
    true,
  );
  assert.equal(
    eligibleHeroShove({
      id: 0,
      street: 1,
      firstHeroAction: true,
      action: 'raise',
      amount: 20000,
      legal,
    }),
    false,
  );
  assert.equal(
    eligibleHeroShove({
      id: 0,
      street: 0,
      firstHeroAction: true,
      action: 'call',
      amount: 20000,
      legal,
    }),
    false,
  );
  const players = [
    { id: 0 },
    { id: 1, folded: true },
    { id: 2, folded: false, allin: true, out: true },
  ];
  assert.equal(actualAllFold(players, [1], true), true);
  assert.equal(actualAllFold(players, [1], false), false);
  assert.equal(actualAllFold(players, [1, 2], true), false);
  assert.equal(actualAllFold(players, [], true), false);
});

test('paired inference preserves matching blocks and does not call a small precise change meaningful', () => {
  const blocks = Array.from({ length: 8 }, (_, block) => ({
    block,
    arms: {
      old: { heroShoves: 20, allFoldAfterShove: 16 },
      small: { heroShoves: 20, allFoldAfterShove: 15 },
      clear: { heroShoves: 20, allFoldAfterShove: 10 },
    },
  }));
  assert.equal(
    pairedLearningDifference(blocks, 'old', 'small', { resamples: 100 }).meaningfulImprovement,
    false,
  );
  const effect = pairedLearningDifference(blocks, 'old', 'clear', { resamples: 100 });
  assert.ok(Math.abs(effect.estimate + 0.3) < 1e-12);
  assert.equal(effect.meaningfulImprovement, true);
  assert.equal(
    pairedLearningDifference(blocks, 'clear', 'old', { direction: 'increase', resamples: 100 })
      .meaningfulImprovement,
    true,
  );
  assert.throws(
    () => pairedLearningDifference([...blocks, blocks[0]], 'old', 'clear'),
    /Duplicate/,
  );
  assert.throws(
    () =>
      pairedLearningDifference(
        blocks.map((row) => ({ ...row, arms: { old: row.arms.old } })),
        'old',
        'clear',
      ),
    /both arms/,
  );
});

test('postflop protocol keeps constructed decisions and dangerous controls separate', () => {
  const plan = postflopEvaluationDesign();
  assert.equal(plan.decisions, 6656);
  assert.equal(plan.hiddenInformationChecks, 26);
  assert.equal(plan.profiles.length, 8);
  assert.equal(Object.values(plan.casesByRole).filter((entry) => entry.primary).length, 5);
  assert.equal(
    Object.values(plan.casesByRole).filter((entry) => entry.category.includes('danger-control'))
      .length,
    7,
  );
  const smoke = postflopEvaluationDesign(true);
  assert.equal(smoke.decisions, 26);
  assert.notEqual(smoke.seed, plan.seed);
});

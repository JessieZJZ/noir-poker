import assert from 'node:assert/strict';
import { deriveSeed, seededRandom } from './bot-exploit-policy.mjs';

export const LEARNING_ARMS = Object.freeze(['old-cold', 'new-cold', 'new-warm']);
export const LEARNING_PROFILES = Object.freeze([
  'balanced',
  'rook',
  'jett',
  'owen',
  'vale',
  'nico',
  'mira',
  'iris',
]);

export function learningDesign(seed = 28101601) {
  assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
  return {
    version: 1,
    seed,
    blocks: 64,
    trainHands: 16,
    evaluationHands: 10,
    players: 9,
    difficulty: 'normal',
    emotions: 'subtle',
    policy: 'all-in',
    arms: [...LEARNING_ARMS],
    strata: { balanced: 32, mixed: 32 },
    plannedTrainingHands: 1024,
    plannedEvaluationHands: 1920,
    plannedHands: 2944,
    minimumMeaningfulDifference: 0.1,
    primaryOutcome:
      'All still-live opponents actually fold after the first legal Hero shove, divided by first legal Hero shoves; no BB walks, eliminated seats or all-in losers count as folds.',
    pairing:
      'Same evaluation shuffle/policy/timing seed per block and hand across the three arms; each hand starts with nine seats at 100BB. Public observations and mood continue within the arm only.',
    training:
      'Train only the new engine on sixteen separate-seed hands; JSON round-trip the exported public-only player profile. Evaluation starts new games and imports this profile only for new-warm.',
    interpretation:
      'Pointwise paired independent-block bootstrap intervals. A comparison is a meaningful improvement only if its estimated fold-rate reduction is at least ten percentage points and its 95 percent upper difference bound is below zero. No optional continuation until significant and no global exploitability proof.',
  };
}

export function learningSeeds(design, block, hand, stage) {
  assert.ok(Number.isInteger(block) && block >= 0 && block < design.blocks);
  assert.ok(['train', 'evaluation'].includes(stage));
  const count = stage === 'train' ? design.trainHands : design.evaluationHands;
  assert.ok(Number.isInteger(hand) && hand >= 0 && hand < count);
  return Object.fromEntries(
    ['deck', 'policy', 'timing'].map((kind) => [
      kind,
      deriveSeed('player-learning-v1', design.seed, block, stage, hand, kind),
    ]),
  );
}

export function learningLineup(block, players = 9) {
  assert.ok(Number.isInteger(block) && block >= 0);
  assert.equal(players, 9);
  const stratum = block % 2 ? 'mixed' : 'balanced';
  const offset = Math.floor(block / 2) % LEARNING_PROFILES.length;
  const assignments = Array.from({ length: players - 1 }, (_, index) =>
    stratum === 'balanced'
      ? 'balanced'
      : LEARNING_PROFILES[(index + offset) % LEARNING_PROFILES.length],
  );
  return { stratum, assignments };
}

export function eligibleHeroShove({ id, street, firstHeroAction, action, amount, legal }) {
  return !!(
    id === 0 &&
    street === 0 &&
    firstHeroAction &&
    action === 'raise' &&
    legal.canRaise &&
    amount === legal.maxRaiseTo
  );
}

export function actualAllFold(players, liveOpponentIds, hadHeroShove) {
  return !!(
    hadHeroShove &&
    liveOpponentIds.length &&
    liveOpponentIds.every((id) => players.find((player) => player.id === id)?.folded === true)
  );
}

function ratio(rows, numerator, denominator) {
  const d = rows.reduce((sum, row) => sum + row[denominator], 0);
  assert.ok(d > 0, 'An outcome with no eligible denominator has no estimate');
  return rows.reduce((sum, row) => sum + row[numerator], 0) / d;
}

export function pairedLearningDifference(
  rows,
  before,
  after,
  {
    numerator = 'allFoldAfterShove',
    denominator = 'heroShoves',
    resamples = 10000,
    seed = 28101602,
    direction = 'decrease',
  } = {},
) {
  assert.ok(rows.length >= 2);
  assert.ok(['increase', 'decrease'].includes(direction));
  assert.equal(
    new Set(rows.map((row) => row.block)).size,
    rows.length,
    'Duplicate independent block',
  );
  for (const row of rows) {
    for (const arm of [before, after]) {
      const data = row.arms?.[arm];
      assert.ok(data, 'Every paired block must contain both arms');
      assert.ok(Number.isSafeInteger(data[numerator]) && Number.isSafeInteger(data[denominator]));
      assert.ok(data[numerator] >= 0 && data[denominator] >= data[numerator]);
    }
  }
  const point = (items) =>
    ratio(
      items.map((row) => row.arms[after]),
      numerator,
      denominator,
    ) -
    ratio(
      items.map((row) => row.arms[before]),
      numerator,
      denominator,
    );
  const estimate = point(rows),
    random = seededRandom(seed),
    values = [];
  for (let i = 0; i < resamples; i++)
    values.push(
      point(Array.from({ length: rows.length }, () => rows[Math.floor(random() * rows.length)])),
    );
  values.sort((a, b) => a - b);
  const interval95 = [
    values[Math.floor(resamples * 0.025)],
    values[Math.ceil(resamples * 0.975) - 1],
  ];
  return {
    before,
    after,
    numerator,
    denominator,
    independentBlocks: rows.length,
    direction,
    beforeRate: ratio(
      rows.map((row) => row.arms[before]),
      numerator,
      denominator,
    ),
    afterRate: ratio(
      rows.map((row) => row.arms[after]),
      numerator,
      denominator,
    ),
    estimate,
    interval95,
    meaningfulImprovement:
      direction === 'decrease'
        ? estimate <= -0.1 && interval95[1] < 0
        : estimate >= 0.1 && interval95[0] > 0,
    method: 'paired independent-block ratio bootstrap; pointwise 95 percent; no optional stopping',
  };
}

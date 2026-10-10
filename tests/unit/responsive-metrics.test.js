import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portraitMetrics } from '../../src/ui/play-viewport.js';

// These are table budgets after page chrome and the action dock have been
// reserved, rather than whole-screen dimensions. DOM tests check that reserve.
const phoneBudgets = [
  { name: 'SE', width: 343, height: 402 },
  { name: 'Pro', width: 406, height: 710 },
  { name: 'Pixel', width: 395, height: 685 },
  { name: 'SE with native insets', width: 343, height: 382 },
  { name: 'Pro with native insets', width: 406, height: 617 },
];

function assertCardCorridor(width, metrics, label) {
  // The CSS board reserves three cards across with two 6px gaps. Keep a
  // 16px clearance beside each seat rail, without shrinking the whole table.
  const boardWidth = metrics.cardWidth * 3 + 12;
  assert.ok(
    boardWidth + metrics.seatWidth * 2 + 32 <= width,
    `${label}: public cards must fit between both seat rails`,
  );
}

test('SE, Pro and Pixel table budgets retain readable physical card widths in every player mode', () => {
  for (const budget of phoneBudgets) {
    for (let count = 5; count <= 9; count++) {
      const metrics = portraitMetrics(budget.width, budget.height, count);
      assert.ok(Number.isInteger(metrics.cardWidth), `${budget.name}: integral public width`);
      assert.ok(metrics.cardWidth >= 48 && metrics.cardWidth <= 58, budget.name);
      assert.ok(metrics.heroWidth >= 52 && metrics.heroWidth <= 76, budget.name);
      assertCardCorridor(budget.width, metrics, `${budget.name}/${count}`);
    }
  }
});

test('native safe-area reductions preserve the two-row public board and hero vertical budget', () => {
  for (const { width, height, name } of phoneBudgets.filter((budget) =>
    budget.name.includes('native'),
  )) {
    for (const count of [5, 9]) {
      const metrics = portraitMetrics(width, height, count);
      // Independent physical layout contract: two 1.44-ratio card rows, a
      // 6px board gap, 28px pot text and its 9px gap, then the hero face,
      // 36px identity, 8px identity gap and 18px action slot. Leave 34px
      // between the public group and hero rank, plus 11px at arena edges.
      const occupiedHeight =
        metrics.cardWidth * 1.44 * 2 +
        6 +
        28 +
        9 +
        metrics.heroWidth * 1.44 +
        36 +
        8 +
        18 +
        34 +
        11;
      assert.ok(
        occupiedHeight <= height,
        `${name}/${count}: cards and hero must fit without scale`,
      );
    }
  }
});

test('nine-seat density activates when six seats still fit, and releases on a taller screen', () => {
  const six = portraitMetrics(343, 420, 6);
  const nine = portraitMetrics(343, 420, 9);
  assert.equal(six.dense, false);
  assert.equal(nine.dense, true);
  assert.equal(nine.rails, true);
  assert.ok(nine.heroWidth <= six.heroWidth);
  const tallNine = portraitMetrics(343, 650, 9);
  assert.equal(tallNine.dense, false);
  assert.equal(tallNine.rails, false);
  assert.ok(tallNine.heroWidth > nine.heroWidth);
});

test('public-card clearance survives both sides of the narrow-seat width breakpoint', () => {
  for (const width of [302, 329, 330, 331, 343, 395, 427]) {
    const metrics = portraitMetrics(width, 450, 9);
    assertCardCorridor(width, metrics, `${width}px`);
    assert.ok(metrics.cardWidth >= 38, `${width}px: minimum readable face`);
  }
});

test('short native table budgets fit both card rows and the complete dense hero without clipping', () => {
  for (const height of [310, 314, 329, 330, 350]) {
    for (const width of [302, 320, 343]) {
      const metrics = portraitMetrics(width, height, 9);
      assert.equal(metrics.dense, true);
      assert.equal(metrics.rails, true);
      assert.ok(metrics.cardWidth >= 38 && metrics.cardWidth <= 48);
      assert.ok(metrics.heroWidth >= 48 && metrics.heroWidth <= 52);
      assertCardCorridor(width, metrics, `${width}×${height}`);
      // Dense CSS uses a 32px identity, 6px identity gap and 16px action
      // reserve. Include the pot, both public rows, rank clearance and
      // the arena's edge space; card widths must not overrun that budget.
      const occupiedHeight =
        metrics.cardWidth * 1.44 * 2 +
        6 +
        28 +
        9 +
        metrics.heroWidth * 1.44 +
        32 +
        6 +
        16 +
        20 +
        11;
      assert.ok(
        occupiedHeight <= height,
        `${width}×${height}: ${occupiedHeight}px content must fit the arena`,
      );
    }
  }
});

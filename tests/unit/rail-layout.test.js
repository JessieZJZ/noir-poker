import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactTableLayout } from '../../src/ui/compact-table-layout.js';

for (const width of [320, 390, 440, 768, 820, 1032]) {
  for (const count of [5, 6, 7, 8, 9]) {
    test(`${count} players at ${width}px keep the public cards centered and each whole player on the rail`, () => {
      const fit = compactTableLayout({
        width,
        height: width > 600 ? 887 : 480,
        displayHeight: width > 600 ? 1180 : 759,
        seats: Array.from({ length: count - 1 }, (_, i) => ({ id: i + 1 })),
      });
      assert.ok(fit.clear);
      assert.ok(
        Math.abs(Math.min(...fit.positioned.map((player) => player.top)) - 8) < 1e-9,
        'The highest complete player uses the arena instead of leaving an empty strip',
      );
      const cx = fit.table.left + fit.table.width / 2,
        cy = fit.table.top + fit.table.height / 2;
      assert.equal(fit.public.left + fit.public.width / 2, cx);
      assert.ok(Math.abs(fit.public.top + fit.public.centerY - cy) < 1e-9);
      for (const player of [...fit.positioned, fit.hero]) {
        const x = (player.left + player.width / 2 - cx) / (fit.table.width / 2);
        const y = (player.top + player.height / 2 - cy) / (fit.table.height / 2);
        assert.ok(Math.abs(x * x + y * y - 1) < 1e-9);
        assert.ok(
          player.left >= 0 &&
            player.top >= 0 &&
            player.left + player.width <= fit.arenaWidth &&
            player.top + player.height <= fit.arenaHeight,
        );
      }
      assert.ok(fit.hero.top - fit.public.top - fit.public.height >= 24);
    });
  }
}

test('larger captions and hero identity reserve their full text footprints before settlement', () => {
  for (const [width, displayHeight] of [
    [320, 568],
    [390, 844],
    [768, 1024],
    [1032, 1376],
  ]) {
    const fit = compactTableLayout({
      width,
      displayHeight,
      height: displayHeight - 260,
      seats: Array.from({ length: 8 }, (_, i) => ({ id: i + 1 })),
    });
    const text = fit.textMetrics;
    assert.ok(text['action-height'] >= text['player-action'] * 1.2 * 2 + 2);
    assert.ok(text['caption-width'] >= fit.profileWidth || width > 600);
    assert.ok(
      fit.heroFoot >=
        fit.heroHeight +
          text['rank-height'] +
          text['hero-identity'] * 1.2 +
          text['hero-action'] * 1.2 +
          4,
    );
    assert.ok(fit.potHeight >= text['pot-number'] * 1.1);
  }
});

test('narrow phone card backs fit the reserved pair slot while leaving a visible strip', () => {
  const fit = compactTableLayout({
    width: 320,
    displayHeight: 900,
    height: 634,
    seats: Array.from({ length: 8 }, (_, i) => ({ id: i + 1 })),
  });
  const text = fit.textMetrics;
  // Both backs fit the 68px deal/reveal slot, without moving the profile.
  assert.ok(text['player-back-width'] * 2 + 3 <= 68);
  const top = 39 - text['player-back-height'] + text['player-back-shift'];
  assert.ok(top >= 0);
  assert.ok(43 - top >= 20);
  // Keep the smallest tall-phone face/back readable after the solver's fit.
  assert.ok(fit.cardWidth * fit.arenaScale >= 31);
  assert.ok(text['player-back-width'] * fit.arenaScale >= 15);
});

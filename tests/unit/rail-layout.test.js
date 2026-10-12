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
      const cx = fit.table.left + fit.table.width / 2,
        cy = fit.table.top + fit.table.height / 2;
      assert.equal(fit.public.left + fit.public.width / 2, cx);
      assert.equal(fit.public.top + fit.public.centerY, cy);
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

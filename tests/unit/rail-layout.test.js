import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactTableLayout } from '../../src/ui/compact-table-layout.js';

test('compact opponent tags are smaller than identity text and eyes reserve a larger shared footprint', () => {
  for (const [width, displayHeight, tag, eye] of [
    [390, 844, 14, 20],
    [390, 720, 15, 20],
    [768, 1180, 14, 24],
    [1032, 1376, 17, 26],
  ]) {
    const fit = compactTableLayout({
      width,
      height: 650,
      displayHeight,
      seats: Array.from({ length: 8 }, (_, index) => ({ id: index + 1 })),
    });
    assert.equal(fit.textMetrics['player-position'], tag);
    assert.equal(fit.textMetrics['player-eye-size'], eye);
    assert.ok(tag < fit.textMetrics['player-name']);
    assert.ok(eye <= fit.textMetrics['player-name']);
  }
});

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
      const absoluteParts = (box) =>
        (box.parts ?? [{ left: 0, top: 0, width: box.width, height: box.height }]).map((part) => ({
          ...part,
          left: box.left + part.left,
          top: box.top + part.top,
        }));
      for (const cardPart of absoluteParts(fit.public))
        for (const playerPart of [...fit.positioned, fit.hero].flatMap(absoluteParts))
          assert.ok(
            cardPart.left + cardPart.width + 12.5 <= playerPart.left + 1e-9 ||
              playerPart.left + playerPart.width + 12.5 <= cardPart.left + 1e-9 ||
              cardPart.top + cardPart.height + 12.5 <= playerPart.top + 1e-9 ||
              playerPart.top + playerPart.height + 12.5 <= cardPart.top + 1e-9,
            'Enlarged community artwork retains the full gap from every reserved player part',
          );
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
    assert.ok(text['caption-width'] >= 112 || width > 600);
    assert.ok(
      fit.heroFoot >=
        fit.heroSlotHeight +
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

test('tablet-sized PC windows cap hero artwork independently of pointer type', () => {
  for (const width of [601, 768, 821, 1032]) {
    for (const count of [5, 9]) {
      const fit = compactTableLayout({
        width,
        displayHeight: width === 1032 ? 1376 : 813,
        height: 550,
        seats: Array.from({ length: count - 1 }, (_, i) => ({ id: i + 1 })),
      });
      assert.equal(fit.heroWidth, 94);
      assert.equal(fit.heroHeight, 136);
      assert.equal(fit.heroSlotHeight, 136);
    }
  }
});

test('crowded narrow phones use two rows for readable community cards and balanced hero faces', () => {
  for (const width of [320, 390]) {
    const fit = compactTableLayout({
      width,
      height: 634,
      displayHeight: 900,
      seats: Array.from({ length: 8 }, (_, i) => ({ id: i + 1 })),
    });
    assert.equal(fit.twoRows, true);
    assert.ok(fit.cardWidth * fit.arenaScale >= 40);
    assert.ok(fit.heroWidth <= fit.cardWidth * 1.25);
    for (const face of fit.heroCardGeometry.faces)
      for (const seat of fit.positioned)
        for (const part of seat.parts) {
          const left = seat.left + part.left,
            top = seat.top + part.top;
          assert.ok(
            face.left + face.width + 18 <= left ||
              left + part.width + 18 <= face.left ||
              face.top + face.height + 18 <= top ||
              top + part.height + 18 <= face.top,
          );
        }
  }
});

test('a roomy table keeps five readable community cards in one row', () => {
  const fit = compactTableLayout({
    width: 1032,
    height: 1000,
    displayHeight: 1376,
    seats: Array.from({ length: 8 }, (_, i) => ({ id: i + 1 })),
  });
  assert.equal(fit.twoRows, false);
  assert.ok(fit.cardWidth * fit.arenaScale >= 70);
});

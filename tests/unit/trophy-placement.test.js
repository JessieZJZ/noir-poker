import test from 'node:test';
import assert from 'node:assert/strict';
import { compactTableLayout } from '../../src/ui/compact-table-layout.js';
import {
  HERO_TROPHY_MIN_SHARE,
  HERO_TROPHY_SHARE,
  TROPHY_ASPECT,
  heroTrophy,
  seatTrophy,
} from '../../src/ui/trophy-placement.js';

const box = (left, top, width, height) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

test("a bot's trophy takes the roomier side and is as tall as the profile", () => {
  const profile = box(100, 100, 120, 80);
  const place = seatTrophy(profile, {
    bounds: { left: 0, right: 500 },
    // A neighbour 40 to the right; the left runs to the table edge (100).
    obstacles: [box(260, 90, 120, 80), box(0, 400, 500, 50)],
  });
  assert.deepEqual(place, {
    side: 'left',
    width: 80 * TROPHY_ASPECT,
    height: 80,
    gap: 6,
    fits: true,
  });
  // Cards in the way still count, but when neither side has room the roomier
  // side wins and the trophy may overlap them.
  const tight = seatTrophy(profile, {
    bounds: { left: 90, right: 500 },
    obstacles: [box(250, 120, 60, 80)],
  });
  assert.equal(tight.side, 'right');
  assert.equal(tight.fits, false);
});

test("nine-seat phone trophies stand on the open side of every bot's seat", () => {
  const layout = compactTableLayout({
    width: 390,
    availableWidth: 372,
    height: 630,
    displayHeight: 844,
    seats: Array.from({ length: 8 }, (_, i) => ({ id: i + 1 })),
  });
  const seats = layout.positioned.map((p) =>
    p.parts.map((part) => box(p.left + part.left, p.top + part.top, part.width, part.height)),
  );
  const board = box(
      layout.public.left,
      layout.public.top,
      layout.public.width,
      layout.public.height,
    ),
    hero = box(layout.hero.left, layout.hero.top, layout.hero.width, layout.hero.height);
  const sides = seats.map(
    (parts, i) =>
      seatTrophy(parts[1], {
        bounds: { left: 0, right: layout.arenaWidth },
        obstacles: [...seats.filter((_, j) => j !== i).flat(), board, hero],
      }).side,
  );
  // Seats run clockwise from the hero's left: lower and middle seats face the
  // felt or the edge with more room, top seats the outer corners.
  assert.deepEqual(sides, ['left', 'right', 'right', 'left', 'right', 'left', 'left', 'right']);
});

test("the hero's trophy shrinks to the room above the hole cards before it sinks onto them", () => {
  const cards = box(150, 500, 100, 100),
    full = 100 * HERO_TROPHY_SHARE;
  assert.deepEqual(heroTrophy(cards, { above: 300 }), {
    width: full * TROPHY_ASPECT,
    height: full,
    gap: 6,
    drop: 0,
  });
  // 64 of room: a 52-tall trophy fits with both gaps.
  assert.deepEqual(heroTrophy(cards, { above: 436 }), {
    width: 52 * TROPHY_ASPECT,
    height: 52,
    gap: 6,
    drop: 0,
  });
  // 40 of room: the smallest (half the cards) sinks the rest onto the cards.
  const tight = heroTrophy(cards, { above: 460 });
  assert.equal(tight.height, 100 * HERO_TROPHY_MIN_SHARE);
  assert.equal(tight.drop, 50 + 12 - 40);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTRY_WELCOME_MARGIN,
  ENTRY_WELCOME_MINIMUM,
  entryWelcomeCorridor,
  entryWelcomeScale,
} from '../../src/ui/entry-welcome-scale.js';

test('the waiting message keeps its size until the players beside it would crowd it', () => {
  // Plenty of room: natural on-screen size (1 / arena scale in arena units).
  assert.equal(entryWelcomeScale({ arenaScale: 0.5, contentWidth: 150, corridorWidth: 400 }), 2);
  // Exactly the margin on each side: still natural size.
  const exact = 150 + ENTRY_WELCOME_MARGIN * 2;
  assert.equal(entryWelcomeScale({ arenaScale: 0.5, contentWidth: 150, corridorWidth: exact }), 2);
  // Tighter: shrinks to keep the margin.
  const tight = entryWelcomeScale({
    arenaScale: 0.5,
    contentWidth: 150,
    corridorWidth: exact - 30,
  });
  assert.equal(tight * 0.5 * 150, exact - 30 - ENTRY_WELCOME_MARGIN * 2);
  // Never below the readable minimum.
  assert.equal(
    entryWelcomeScale({ arenaScale: 0.5, contentWidth: 150, corridorWidth: 0 }),
    ENTRY_WELCOME_MINIMUM / 0.5,
  );
});

test('only players beside the message bound its room', () => {
  const boxes = [
    { left: 0, top: 0, width: 100, height: 50 }, // above, left
    { left: 300, top: 0, width: 100, height: 50 }, // above, right
    { left: 0, top: 200, width: 80, height: 50 }, // beside, left
    { left: 420, top: 200, width: 80, height: 50 }, // beside, right
  ];
  assert.equal(entryWelcomeCorridor(boxes, { centerX: 250, top: 180, bottom: 260 }), 340);
  assert.equal(entryWelcomeCorridor(boxes, { centerX: 250, top: 400, bottom: 500 }), Infinity);
});

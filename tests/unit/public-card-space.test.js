import { test } from 'node:test';
import assert from 'node:assert/strict';
import { growPublicCards } from '../../src/ui/public-card-space.js';

const row = (width, twoRows = false) => {
  const boardHeight = width * 1.44;
  const boardWidth = width * 5 + 16;
  return {
    twoRows,
    width: boardWidth,
    height: boardHeight + 46,
    centerY: boardHeight / 2 + 46,
    parts: [
      { left: (boardWidth - 100) / 2, top: 0, width: 100, height: 40 },
      { left: 0, top: 46, width: boardWidth, height: boardHeight },
    ],
  };
};
const layout = (positioned = []) => {
  const initial = row(40);
  return {
    arenaWidth: 600,
    arenaHeight: 600,
    table: { left: 0, top: 0, width: 600, height: 600 },
    positioned,
    hero: { left: 260, top: 480, width: 80, height: 120 },
    twoRows: false,
    public: { ...initial, left: 300 - initial.width / 2, top: 300 - initial.centerY },
  };
};

test('unused public space grows cards while arena, player footprints and row count stay fixed', () => {
  const original = layout([
    { left: 0, top: 250, width: 80, height: 100 },
    { left: 520, top: 250, width: 80, height: 100 },
  ]);
  const grown = growPublicCards(original, { cardWidth: 40, createRow: row });
  assert.equal(grown.cardWidth, 79);
  assert.equal(grown.layout.arenaWidth, original.arenaWidth);
  assert.equal(grown.layout.arenaHeight, original.arenaHeight);
  assert.strictEqual(grown.layout.table, original.table);
  assert.strictEqual(grown.layout.positioned, original.positioned);
  assert.strictEqual(grown.layout.hero, original.hero);
  assert.equal(grown.layout.twoRows, original.twoRows);
  assert.equal(grown.layout.public.left + grown.layout.public.width / 2, 300);
  assert.equal(grown.layout.public.top + grown.layout.public.centerY, 300);
  assert.equal(original.public.width, 216, 'Growth does not mutate its input');
});

test('a tight player corridor retains the readable minimum instead of shrinking text to grow cards', () => {
  const original = layout([
    { left: 0, top: 250, width: 179, height: 100 },
    { left: 421, top: 250, width: 179, height: 100 },
  ]);
  const grown = growPublicCards(original, { cardWidth: 40, createRow: row });
  assert.equal(grown.cardWidth, 40);
  assert.equal(grown.layout.arenaHeight, 600);
  assert.deepEqual(grown.layout.public, original.public);
});

test('growing cards cannot move the pot through a player caption into a later false gap', () => {
  const original = layout([{ left: 260, top: 170, width: 80, height: 20 }]);
  const grown = growPublicCards(original, { cardWidth: 40, createRow: row });
  assert.equal(grown.cardWidth, 71);
  const potTop = grown.layout.public.top;
  assert.ok(potTop >= 190 + 12.5);
});

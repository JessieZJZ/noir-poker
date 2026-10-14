import { test } from 'node:test';
import assert from 'node:assert/strict';
import { growHeroCards } from '../../src/ui/hero-card-space.js';

const layout = (positioned = []) => ({
  arenaWidth: 600,
  arenaHeight: 700,
  hero: { left: 224.5, top: 490, width: 151, height: 190 },
  public: { left: 150, top: 240, width: 300, height: 140 },
  positioned,
});

test('hero faces grow upward while the baseline card bottom and identity slots stay fixed', () => {
  const original = layout();
  const grown = growHeroCards(original, { width: 72, height: 104 });
  assert.equal(grown.width, 100);
  assert.equal(grown.height, 144);
  assert.ok(grown.shift > 40);
  for (const face of grown.faces) {
    assert.ok(Math.abs(face.top + face.height - (490 + 104 - 1)) < 1e-9);
    assert.ok(face.top >= 380 + 32);
  }
  assert.ok(grown.faces[0].left + grown.faces[0].width < grown.faces[1].left);
  assert.deepEqual(original.hero, { left: 224.5, top: 490, width: 151, height: 190 });
});

test('neighbor captions constrain the actual rotated face rather than only its nominal card size', () => {
  const original = layout([{ left: 90, top: 470, width: 116, height: 140 }]);
  const grown = growHeroCards(original, { width: 72, height: 104 });
  assert.equal(grown.width, 77);
  assert.ok(grown.faces[0].left >= 206 + 8);
});

test('larger public cards preserve the 32px gap before the raised hero artwork', () => {
  const original = layout();
  original.public.height = 190;
  const grown = growHeroCards(original, { width: 72, height: 104 });
  assert.ok(grown.width > 72 && grown.width < 100);
  assert.ok(grown.faces.every((face) => face.top >= 430 + 32));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deckOfCards, evaluate } from '../../src/engine/poker.js';
import { guideTemplate } from '../../scripts/wechat-presentation.mjs';
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
test('all nine beginner examples are valid distinct five-card hands in decreasing strength', () => {
  const deck = deckOfCards();
  const examples = [...html.matchAll(/data-guide-hand="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(examples.length, 9);
  for (const [index, keys] of examples.entries()) {
    const cards = keys
      .split(' ')
      .map((k) =>
        deck.find(
          (c) => c.rank === '23456789TJQKA'.indexOf(k[0]) + 2 && c.suit === 'shcd'.indexOf(k[1]),
        ),
      );
    assert.equal(new Set(cards.map((c) => c.key)).size, 5);
    assert.equal(evaluate(cards).score[0], 8 - index);
  }
  const mini = guideTemplate(html);
  assert.equal([...mini.matchAll(/class="guide-span guide-card/g)].length, 45);
  for (const name of ['HJ · Hijack', 'CO · Cutoff', 'LJ · Lojack', 'MP · Middle Position'])
    assert.ok(mini.includes(name));
});

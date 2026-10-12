import { renderCardArtwork } from '../../src/ui/cards.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { evaluate, rankText, newGame, deckOfCards } from '../../src/engine/poker.js';
import { showdownScenes } from '../../src/ui/showdown.js';
import { renderCard } from '../../src/ui/cards.js';

const module = { exports: {} };
vm.runInNewContext(
  readFileSync(new URL('../../miniprogram/pages/table/presentation.js', import.meta.url), 'utf8'),
  {
    module,
    require: (name) =>
      name.endsWith('/cards.js') ? { renderCardArtwork } : { evaluate, rankText },
  },
);
const { presentCard, showdownPresentation } = module.exports;
const deck = deckOfCards();
const cards = (text) =>
  text
    .split(' ')
    .map((value) =>
      deck.find(
        (card) =>
          card.rank === '23456789TJQKA'.indexOf(value[0]) + 2 &&
          card.suit === 'shcd'.indexOf(value[1]),
      ),
    );

test('WeChat uses the Web suit vectors instead of platform-dependent suit glyphs', () => {
  for (const card of deck.filter((card) => card.rank === 14)) {
    const shown = presentCard(card);
    const vector = decodeURIComponent(shown.suitStyle);
    const shape = [...renderCard(card).matchAll(/<path d="([^"]+)"/g)][1][1];
    assert.ok(vector.includes(shape));
    assert.equal(shown.rank, 'A');
    assert.equal(shown.suit, card.symbol);
    assert.equal(shown.red, card.suit === 1 || card.suit === 3);
  }
});

test('WeChat showdown presentation matches Web best-five ordering, highlights and awards without changing the game', () => {
  const cases = [
    ['As 4h', '2c 7d 9h Js Qc'],
    ['As Ah', '2c 7d 9h Js Qc'],
    ['As Ah', '2c 2d 9h Js Qc'],
    ['As Ah', 'Ac 7d 9h Js Qc'],
    ['As 5h', '2c 3d 4h Js Qc'],
    ['As 5s', '2s 7s 9s Jh Qc'],
    ['As Ah', 'Ac 7d 7h Js Qc'],
    ['As Ah', 'Ac Ad 9h Js Qc'],
    ['5s 6s', '2s 3s 4s Jh Qc'],
    ['As Ks', 'Ts Js Qs 2h 3c'],
  ];
  for (const [hole, board] of cases) {
    const game = newGame(5);
    Object.assign(game, {
      phase: 'done',
      showdown: true,
      board: cards(board),
      pots: [{ label: '主池', awards: [{ id: 0, amount: 100 }] }],
    });
    game.players.forEach((player) => {
      player.folded = player.id !== 0;
    });
    game.players[0].hole = cards(hole);
    const before = JSON.stringify(game);
    const [web] = showdownScenes(game),
      [mini] = showdownPresentation(game, []);
    assert.equal(mini.label, web.label);
    assert.equal(mini.explanation, web.explanation);
    assert.deepEqual(
      Array.from(mini.cards, (card) => card.key),
      web.cards.map((card) => card.key),
    );
    assert.deepEqual(
      Array.from(mini.cards, (card) => card.highlight),
      web.highlights,
    );
    assert.equal(mini.result, '获胜 +100');
    assert.equal(mini.awards, '主池 +100');
    assert.equal(JSON.stringify(game), before);
    game.showdown = false;
    assert.equal(showdownPresentation(game, []).length, 0);
  }
});

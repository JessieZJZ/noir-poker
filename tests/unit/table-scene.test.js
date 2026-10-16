import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, startHand } from '../../src/engine/poker.js';
import { renderOpponentSeats } from '../../src/ui/table-scene.js';

test('archive animation policy reveals only the requested hand and leaves all other faces static', () => {
  const game = newGame(5);
  startHand(game);
  const original = structuredClone(game);
  for (const selected of [undefined, 1, 3]) {
    const calls = [];
    renderOpponentSeats(game, {
      isSeatHandVisible: () => true,
      isSeatHandAnimated: (player) => player.id === selected,
      card: (card, options) => {
        calls.push({ card: card.key, ...options });
        return '';
      },
    });
    const animated = calls.filter((card) => card.animate);
    assert.deepEqual(
      animated.map((card) => card.card),
      selected ? game.players[selected].hole.map((card) => card.key) : [],
    );
    assert.deepEqual(
      animated.map((card) => card.delay),
      selected ? [0, 140] : [],
    );
  }
  assert.deepEqual(game, original, 'Viewing a historical hand must not change its snapshot');
});

test('live face arrivals retain their existing one-time flip animation', () => {
  const game = newGame(5);
  startHand(game);
  const signatures = new Map();
  for (const expected of [8, 0]) {
    const html = renderOpponentSeats(game, {
      isSeatHandVisible: () => true,
      seatFaceSignatures: signatures,
    });
    assert.equal((html.match(/card-deal/g) || []).length, expected);
  }
});

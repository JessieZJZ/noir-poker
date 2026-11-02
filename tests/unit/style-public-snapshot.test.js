import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendPublicSnapshot,
  completedCardInspection,
} from '../../scripts/style-public-snapshot.mjs';

test('archived public decisions retain only the events and stacks visible at that time', () => {
  const events = [{ street: 0, actor: 'A', action: 'raise', betTo: 500 }];
  const state = {
    hand: 1,
    street: 0,
    players: [{ actor: 'Hero', stack: 20000 }],
    events,
  };
  const transcript = [];
  appendPublicSnapshot(transcript, state);
  events.push({ street: 1, actor: 'A', action: 'raise', betTo: 1000 });
  state.street = 1;
  state.players[0].stack = 19500;
  appendPublicSnapshot(transcript, state);
  events.push({ street: 2, actor: 'Hero', action: 'fold' });
  assert.equal(transcript[0].street, 0);
  assert.equal(transcript[0].players[0].stack, 20000);
  assert.deepEqual(transcript[0].events, [{ street: 0, actor: 'A', action: 'raise', betTo: 500 }]);
  assert.equal(transcript[1].street, 1);
  assert.equal(transcript[1].players[0].stack, 19500);
  assert.equal(transcript[1].events.length, 2);
  assert.notEqual(transcript[0].events, transcript[1].events);
});

test('optional card inspection is unavailable during play and exposes only dealt cards after completion', () => {
  const game = {
    phase: 'playing',
    players: [
      { id: 0, hole: ['As', 'Kh'] },
      { id: 1, hole: ['7h', '6h'] },
    ],
  };
  const who = (id) => (id === 0 ? 'Hero' : 'A');
  const cards = (hole) => hole.join(' ');
  for (const phase of ['idle', 'playing', 'between']) {
    game.phase = phase;
    assert.equal(completedCardInspection(game, true, who, cards), null);
  }
  game.phase = 'done';
  assert.equal(completedCardInspection(game, false, who, cards), null);
  assert.deepEqual(completedCardInspection(game, true, who, cards), [
    { actor: 'Hero', hole: 'As Kh' },
    { actor: 'A', hole: '7h 6h' },
  ]);
});

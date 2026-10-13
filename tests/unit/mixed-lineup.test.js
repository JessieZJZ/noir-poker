import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignBotSeat,
  toggleMixedLineup,
  sanitizeBotSettings,
  defaultBotSettings,
} from '../../src/engine/bot-profiles.js';

test('mix toggle fills only unassigned active seats and cancellation preserves manual choices', () => {
  let settings = assignBotSeat(defaultBotSettings(), 1, 'dwan');
  settings = assignBotSeat(settings, 8, 'tan');
  const original = structuredClone(settings);
  settings = toggleMixedLineup(settings, 6, () => 0.7);
  assert.equal(settings.mixed, true);
  assert.deepEqual(settings.mixedSeats, [2, 3, 4, 5]);
  assert.equal(settings.assignments[1], 'dwan');
  assert.equal(settings.assignments[8], 'tan');
  assert.equal(settings.assignments[6], 'balanced');
  assert.equal(new Set(settings.mixedSeats.map((id) => settings.assignments[id])).size, 4);
  assert.notDeepEqual(toggleMixedLineup(original, 6, () => 0).assignments, settings.assignments);
  // Taking ownership of an automatic selection must survive cancellation/reload.
  settings = assignBotSeat(settings, 3, settings.assignments[3]);
  settings = assignBotSeat(settings, 4, 'ivey');
  const persisted = sanitizeBotSettings(JSON.parse(JSON.stringify(settings)));
  const canceled = toggleMixedLineup(persisted, 6);
  assert.equal(canceled.mixed, false);
  assert.deepEqual(canceled.mixedSeats, []);
  assert.equal(canceled.assignments[1], 'dwan');
  assert.equal(canceled.assignments[3], settings.assignments[3]);
  assert.equal(canceled.assignments[4], 'ivey');
  assert.equal(canceled.assignments[8], 'tan');
  for (const id of [2, 5, 6, 7]) assert.equal(canceled.assignments[id], 'balanced');
});

test('malformed mix ownership cannot reset arbitrary seats', () => {
  const settings = sanitizeBotSettings({
    mixed: true,
    mixedSeats: [0, 1, 1, 9, '2'],
    assignments: { 1: 'tan', 2: 'st' },
  });
  assert.deepEqual(settings.mixedSeats, [1]);
  assert.doesNotThrow(() => sanitizeBotSettings({ mixed: true, mixedSeats: 1 }));
  assert.equal(toggleMixedLineup(settings).assignments[2], 'st');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOT_PROFILES,
  assignBotSeat,
  toggleMixedLineup,
  sanitizeBotSettings,
  defaultBotSettings,
} from '../../src/engine/bot-profiles.js';

const STYLED = BOT_PROFILES.map((p) => p.id).filter((id) => id !== 'balanced');

test('mixing gives every seated opponent a different non-balanced style', () => {
  let settings = assignBotSeat(defaultBotSettings(), 1, 'rook');
  settings = assignBotSeat(settings, 8, 'owen');
  settings = toggleMixedLineup(settings, 6, () => 0.7);
  assert.equal(settings.mixed, true);
  // Every seat at a six-seat table is reassigned, including a manual choice.
  assert.deepEqual(settings.mixedSeats, [1, 2, 3, 4, 5]);
  const seated = settings.mixedSeats.map((id) => settings.assignments[id]);
  assert.equal(new Set(seated).size, 5);
  assert.ok(seated.every((id) => STYLED.includes(id)));
  // Seats off this table keep their saved style.
  assert.equal(settings.assignments[6], 'balanced');
  assert.equal(settings.assignments[8], 'owen');
});

test('cancelling the mix returns every seat, including manual choices, to balanced', () => {
  let settings = assignBotSeat(defaultBotSettings(), 8, 'owen');
  settings = toggleMixedLineup(settings, 6);
  settings = assignBotSeat(settings, 3, 'iris');
  const persisted = sanitizeBotSettings(JSON.parse(JSON.stringify(settings)));
  assert.equal(persisted.mixed, true);
  const canceled = toggleMixedLineup(persisted, 6);
  assert.equal(canceled.mixed, false);
  assert.deepEqual(canceled.mixedSeats, []);
  for (let id = 1; id <= 8; id++) assert.equal(canceled.assignments[id], 'balanced');
});

test('table sizes at the boundaries mix only seated opponents and repeat only after all styles', () => {
  for (const random of [() => 0, () => 0.999999, Math.random]) {
    const five = toggleMixedLineup(defaultBotSettings(), 5, random);
    assert.deepEqual(five.mixedSeats, [1, 2, 3, 4]);
    assert.equal(new Set(five.mixedSeats.map((id) => five.assignments[id])).size, 4);
    for (const id of [5, 6, 7, 8]) assert.equal(five.assignments[id], 'balanced');
    // Nine seats have eight opponents and seven non-balanced styles: all seven
    // appear and only one repeats; none is balanced.
    const nine = toggleMixedLineup(defaultBotSettings(), 9, random);
    assert.deepEqual(nine.mixedSeats, [1, 2, 3, 4, 5, 6, 7, 8]);
    const styles = Object.values(nine.assignments);
    assert.ok(styles.every((id) => STYLED.includes(id)));
    assert.equal(new Set(styles).size, STYLED.length);
  }
});

test('malformed saved mix state still cancels to an all-balanced lineup', () => {
  const settings = sanitizeBotSettings({
    mixed: true,
    mixedSeats: [0, 1, 1, 9, '2'],
    assignments: { 1: 'rook', 2: 'owen' },
  });
  assert.deepEqual(settings.mixedSeats, [1]);
  assert.doesNotThrow(() => sanitizeBotSettings({ mixed: true, mixedSeats: 1 }));
  const canceled = toggleMixedLineup(settings);
  assert.equal(canceled.mixed, false);
  assert.ok(Object.values(canceled.assignments).every((id) => id === 'balanced'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { BOT_PROFILES, getBotProfile, sanitizeBotSettings } from '../../src/engine/bot-profiles.js';
import { migrateCharacterState } from '../../src/engine/character-state.js';
import baseline from '../fixtures/character-strategies.json' with { type: 'json' };
import calibrated from '../fixtures/style-strategies-v8.json' with { type: 'json' };
test('calibrated styles retain an explicit versioned strategy snapshot and the historical baseline', () => {
  assert.deepEqual(
    BOT_PROFILES.map(({ id, axes, sizing, policy }) => ({ id, axes, sizing, policy })),
    calibrated.map(({ id, axes, sizing, policy }) => ({ id, axes, sizing, policy })),
  );
  const current = BOT_PROFILES[0],
    previous = baseline[0];
  assert.deepEqual(current.axes, previous.axes);
  assert.deepEqual(current.sizing, previous.sizing);
  assert.equal(current.policy.potControl, 0.15);
  assert.equal(baseline.length, 17);
  assert.equal(BOT_PROFILES.length, 8);
});
test('old settings and snapshots migrate identities without changing cards, chips or statistics', () => {
  const legacy = {
    assignments: { 1: 'st', 2: 'ivey' },
    players: [{ id: 1, botProfile: 'st', stack: 12500, hole: ['As', 'Kh'] }],
    trace: { profile: 'ivey', profileName: 'Phil Ivey' },
    stats: { hands: 12, wins: 3 },
  };
  const migrated = migrateCharacterState(structuredClone(legacy));
  assert.equal(migrated.assignments[1], 'vale');
  assert.equal(migrated.players[0].botProfile, 'vale');
  assert.equal(migrated.trace.profileName, '跟注诱导');
  assert.deepEqual(migrated.players[0].hole, legacy.players[0].hole);
  assert.equal(migrated.players[0].stack, legacy.players[0].stack);
  assert.deepEqual(migrated.stats, legacy.stats);
  assert.equal(sanitizeBotSettings(legacy).assignments[2], 'vale');
  assert.equal(getBotProfile('ivey').id, 'vale');
  assert.deepEqual(migrateCharacterState(structuredClone(migrated)), migrated);
});
test('distributed source assets contain only original portraits and no retired biographies', () => {
  const files = readdirSync(new URL('../../public/portraits/', import.meta.url));
  assert.equal(files.filter((p) => p.endsWith('.jpg')).length, 16);
  assert.ok(!files.some((p) => /ivey|dwan|tan\.|peter|abao/.test(p)));
  const source = readFileSync(new URL('../../src/data/characters.json', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /https:|Triton|KPC|Phil Ivey|ST Wang|谭老板|阿宝|履历/);
});

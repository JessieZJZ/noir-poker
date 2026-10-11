import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTablePreferences, saveTablePreferences } from '../../src/ui/preferences.js';

const defaults = { playerCount: 5, difficulty: 'normal' };

test('missing, corrupted and out-of-range preferences recover valid fields independently', () => {
  for (const raw of [null, '{', 'null', '[]', 'true', '"9"']) {
    assert.deepEqual(loadTablePreferences({ getItem: () => raw }), defaults);
  }
  for (const count of [4, 10, 6.5, '9', null]) {
    assert.deepEqual(
      loadTablePreferences({
        getItem: () => JSON.stringify({ playerCount: count, difficulty: 'hard' }),
      }),
      { playerCount: 5, difficulty: 'hard' },
    );
  }
  assert.deepEqual(
    loadTablePreferences({
      getItem: () => JSON.stringify({ playerCount: 9, difficulty: 'unknown' }),
    }),
    { playerCount: 9, difficulty: 'normal' },
  );
});

test('save round trip retains only supported configuration and leaves legacy options intact', () => {
  const values = new Map([['noir-opponents-v1', 'existing settings']]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  for (const playerCount of [5, 6, 7, 8, 9]) {
    for (const difficulty of ['easy', 'normal', 'hard']) {
      saveTablePreferences({ playerCount, difficulty, hole: ['AS', 'KS'], stack: 300 }, storage);
      assert.deepEqual(loadTablePreferences(storage), { playerCount, difficulty });
      assert.deepEqual(JSON.parse(values.get('noir-table-v1')), { playerCount, difficulty });
    }
  }
  assert.equal(values.get('noir-opponents-v1'), 'existing settings');
});

test('unavailable storage and quota errors do not prevent defaults or current play', () => {
  const unavailable = {
    getItem() {
      throw new Error('Storage access denied');
    },
    setItem() {
      throw new Error('Quota exceeded');
    },
  };
  assert.deepEqual(loadTablePreferences(unavailable), defaults);
  assert.doesNotThrow(() =>
    saveTablePreferences({ playerCount: 9, difficulty: 'hard' }, unavailable),
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { recordOutcome, recordsRoute } from '../../src/ui/game-records.js';

test('a pot award can display a win and a net loss together', () => {
  assert.equal(
    recordOutcome({ status: 'completed', wonPot: true, profit: -600 }),
    '获得部分底池 · 净亏损',
  );
  assert.equal(recordOutcome({ status: 'completed', wonPot: true, profit: 200 }), '赢');
  assert.equal(recordOutcome({ status: 'completed', wonPot: false, profit: 0 }), '持平');
  assert.equal(recordOutcome({ status: 'completed', wonPot: false, profit: -100 }), '输');
});

test('unfinished and active attempts do not present an outcome from a prior attempt', () => {
  assert.equal(recordOutcome({ status: 'unfinished', wonPot: true, profit: 900 }), '未完成');
  assert.equal(recordOutcome({ status: 'playing', wonPot: true, profit: 900 }), '进行中');
});

test('historical routes decode record IDs and malformed URLs return the list', () => {
  assert.deepEqual(recordsRoute('#records'), { page: 'list' });
  assert.deepEqual(recordsRoute('#records/hand%2Fretry'), { page: 'hand', id: 'hand/retry' });
  assert.deepEqual(recordsRoute('#records/%E0%A4'), { page: 'list' });
  assert.deepEqual(recordsRoute('#other'), { page: 'game' });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordOutcome,
  recordsRoute,
  recordRetryLabel,
  formatRecordChange,
} from '../../src/ui/game-records.js';

test('a pot award can display a win and a net loss together', () => {
  assert.equal(
    recordOutcome({ status: 'completed', wonPot: true, profit: -600 }),
    '获得部分底池 · 净亏损',
  );
  assert.equal(recordOutcome({ status: 'completed', wonPot: true, profit: 200 }), '赢');
  assert.equal(recordOutcome({ status: 'completed', wonPot: false, profit: 0 }), '');
  assert.equal(recordOutcome({ status: 'completed', wonPot: true, profit: 0 }), '');
  assert.equal(recordOutcome({ status: 'completed', wonPot: false, profit: -100 }), '输');
});

test('first attempts have no label and retries use a compact label', () => {
  assert.equal(recordRetryLabel(0), '');
  assert.equal(recordRetryLabel(1), '重打1');
  assert.equal(recordRetryLabel(2), '重打2');
});

test('record changes always retain a sign and all whole-chip digits', () => {
  assert.deepEqual([-1025, -25, -0, 0, 25, 1025].map(formatRecordChange), [
    '-1.025K',
    '-25',
    '+0',
    '+0',
    '+25',
    '+1.025K',
  ]);
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

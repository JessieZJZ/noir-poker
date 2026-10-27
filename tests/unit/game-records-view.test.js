import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordOutcome,
  recordsRoute,
  recordRetryLabel,
  formatRecordChange,
  formatRecordStart,
} from '../../src/ui/game-records.js';

test('record start times include the calendar year, date and 24-hour time across year boundaries', () => {
  const before = new Date(2025, 11, 31, 23, 59).getTime();
  const after = new Date(2026, 0, 1, 0, 1).getTime();
  assert.equal(formatRecordStart(before, 'zh-CN'), '2025/12/31 23:59');
  assert.equal(formatRecordStart(after, 'zh-CN'), '2026/01/01 00:01');
  for (const locale of ['en', 'zh-TW', 'ja', 'ko', 'es', 'it', 'pt', 'de', 'fr', 'ru']) {
    const output = formatRecordStart(before, locale);
    assert.match(output, /2025/);
    assert.match(output, /23:59/);
  }
});

test('a pot award can display a win and a net loss together', () => {
  assert.equal(
    recordOutcome({ status: 'completed', wonPot: true, profit: -600 }),
    '获得部分底池 · 净亏损',
  );
  assert.equal(recordOutcome({ status: 'completed', wonPot: true, profit: 200 }), '赢');
  assert.equal(recordOutcome({ status: 'completed', wonPot: false, profit: 0 }), '输');
  assert.equal(recordOutcome({ status: 'completed', wonPot: true, profit: 0 }), '赢');
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
  // A lost hand with no net change keeps the loss sign.
  assert.equal(formatRecordChange(0, { loss: true }), '-0');
  assert.equal(formatRecordChange(-25, { loss: true }), '-25');
  assert.equal(formatRecordChange(0, { loss: false }), '+0');
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

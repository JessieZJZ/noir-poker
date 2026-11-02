import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewPool } from '../../src/review/worker-pool.js';

const result = (title) => ({
  title,
  code: 'test',
  coaching: { kind: 'keep', score: 0, supported: false },
});
function setup({ completed = [], concurrency = 2, failCreate = false } = {}) {
  const workers = [],
    messages = [],
    errors = [];
  const input = {
    hand: 1,
    decisions: [0, 1, 2].map((street) => ({ street })),
    outcome: { profit: 0 },
  };
  const pool = createReviewPool({
    id: 4,
    input,
    completed,
    concurrency,
    createWorker() {
      if (failCreate && workers.length) throw Error('worker limit');
      const worker = {
        sent: [],
        stopped: false,
        postMessage(v) {
          this.sent.push(v);
        },
        terminate() {
          this.stopped = true;
        },
      };
      workers.push(worker);
      return worker;
    },
    onMessage: (m) => messages.push(m),
    onError: () => errors.push('error'),
  });
  const deliver = (worker, index, value = result(String(index))) =>
    worker.onmessage({ data: { id: 4, index, type: 'progress', result: value } });
  return { pool, workers, messages, errors, deliver };
}
test('bounded pool accepts out-of-order results, schedules missing decisions and assembles original order', () => {
  const s = setup({ concurrency: 32 });
  assert.equal(s.workers.length, 2);
  s.deliver(s.workers[1], 1);
  assert.equal(s.workers[1].sent[1].index, 2);
  s.deliver(s.workers[0], 0);
  s.deliver(s.workers[1], 2);
  assert.deepEqual(
    s.messages.filter((m) => m.type === 'progress').map((m) => m.index),
    [1, 0, 2],
  );
  assert.deepEqual(
    s.messages.at(-1).analysis.steps.map((r) => r.title),
    ['0', '1', '2'],
  );
  assert.ok(s.workers.every((w) => w.stopped));
  assert.equal(s.errors.length, 0);
});
test('partial cache skips completed jobs and low concurrency uses only one worker', () => {
  const cached = result('cached');
  const s = setup({ completed: [cached], concurrency: 1 });
  assert.equal(s.workers.length, 1);
  assert.equal(s.workers[0].sent[0].index, 1);
  s.deliver(s.workers[0], 1);
  s.deliver(s.workers[0], 2);
  assert.equal(s.messages.at(-1).analysis.steps[0], cached);
});
test('termination discards late and wrong-job results; a failed worker stops its peers exactly once', () => {
  const s = setup();
  s.workers[0].onmessage({ data: { id: 99, index: 0, type: 'progress', result: result('old') } });
  assert.equal(s.messages.length, 0);
  s.pool.terminate();
  s.deliver(s.workers[0], 0);
  assert.equal(s.messages.length, 0);
  const failed = setup();
  failed.deliver(failed.workers[0], 0);
  failed.workers[1].onerror({ preventDefault() {} });
  failed.workers[0].onerror({ preventDefault() {} });
  failed.deliver(failed.workers[1], 1);
  assert.equal(failed.messages.length, 1);
  assert.equal(failed.errors.length, 1);
  assert.ok(failed.workers.every((w) => w.stopped));
});
test('constructor failure cleans up previously created workers', () => {
  assert.throws(() => setup({ failCreate: true }), /worker limit/);
});

test('a dispatch failure after partial progress stops the pool for missing-only fallback', () => {
  const s = setup({ concurrency: 1 });
  s.workers[0].postMessage = () => {
    throw Error('channel closed');
  };
  s.deliver(s.workers[0], 0);
  assert.equal(s.messages.length, 1);
  assert.equal(s.errors.length, 1);
  assert.ok(s.workers[0].stopped);
});

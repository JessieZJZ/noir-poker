import test from 'node:test';
import assert from 'node:assert/strict';
import { publicWeightMemo } from '../../src/engine/public-weight-cache.js';
import { SnapshotBoardCache } from '../../src/review/card-cache.js';
import { cards } from '../fixtures/deceptive-decisions.js';

const callbacks = { evaluate() {}, features() {}, compare() {} };
test('range memo shares pure preflop classes and reversed pairs, with suit-specific postflop weights', () => {
  const cache = new Map(),
    memo = publicWeightMemo(cache, { role: 'caller' }, [], callbacks);
  let calls = 0;
  const compute = () => ++calls;
  assert.equal(memo(cards('As Ks'), compute), 1);
  assert.equal(memo(cards('Kh Ah'), compute), 1);
  assert.equal(memo(cards('As Kh'), compute), 2);
  const post = publicWeightMemo(cache, { role: 'caller' }, cards('2s 3s 4d'), callbacks);
  assert.equal(post(cards('As Ks'), compute), 3);
  assert.equal(post(cards('Ks As'), compute), 3);
  assert.equal(post(cards('Ah Kh'), compute), 4);
});
test('range memo includes public line, board and evaluator identity across rollout deals', () => {
  const shared = new Map(),
    board = cards('2s 3s 4d');
  const first = new SnapshotBoardCache(shared, board),
    next = new SnapshotBoardCache(shared, board);
  const descriptor = { role: 'caller', depthBB: 100, postflopLine: [{ action: 'check' }] };
  let calls = 0;
  const compute = () => ++calls,
    hole = cards('As Ks');
  assert.equal(publicWeightMemo(first, descriptor, board, callbacks)(hole, compute), 1);
  assert.equal(
    publicWeightMemo(next, structuredClone(descriptor), board, callbacks)(hole, compute),
    1,
  );
  descriptor.postflopLine[0].action = 'raise';
  assert.equal(publicWeightMemo(next, descriptor, board, callbacks)(hole, compute), 2);
  assert.equal(publicWeightMemo(next, descriptor, cards('2s 3s 5d'), callbacks)(hole, compute), 3);
  assert.equal(
    publicWeightMemo(next, descriptor, board, { ...callbacks, evaluate() {} })(hole, compute),
    4,
  );
});
test('invalid numbers and malformed pairs bypass optional weight memoization', () => {
  const cache = new Map(),
    hole = cards('As Ks');
  let calls = 0;
  const compute = () => ++calls;
  assert.equal(publicWeightMemo(cache, { depthBB: null }, [], callbacks)(hole, compute), 1);
  assert.equal(publicWeightMemo(cache, { depthBB: Infinity }, [], callbacks)(hole, compute), 2);
  assert.equal(publicWeightMemo(cache, { depthBB: NaN }, [], callbacks)(hole, compute), 3);
  assert.equal(
    publicWeightMemo(cache, {}, [], callbacks)([{ rank: 99, suit: 0 }, hole[0]], compute),
    4,
  );
});

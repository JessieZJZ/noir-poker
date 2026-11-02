import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReviewCache, REVIEW_CACHE_KEY } from '../../src/review/result-cache.js';
import { reviewRevision, reviewRevisionPlugin } from '../../scripts/review-revision.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const result = (name) => ({ coaching: { paragraphs: [name] }, context: {}, evidence: [] });
function store() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
}
test('review cache survives recreation, detaches values, and keys the full public snapshot', () => {
  const storage = store(),
    cache = createReviewCache({ storage });
  const snapshot = { hand: 1, hole: ['A', 'K'], history: [], stack: 2000, legal: { toCall: 100 } };
  const original = result('same');
  cache.set('decision', snapshot, original);
  original.coaching.paragraphs[0] = 'mutated';
  const restored = createReviewCache({ storage }).get('decision', snapshot);
  assert.deepEqual(restored, result('same'));
  restored.context.changed = true;
  assert.equal(cache.get('decision', snapshot).context.changed, undefined);
  for (const changed of [
    { ...snapshot, hand: 2 },
    { ...snapshot, stack: 3000 },
    { ...snapshot, history: [{ action: 'raise' }] },
    { ...snapshot, legal: { toCall: 200 } },
    { ...snapshot, hole: ['A', 'Q'] },
  ])
    assert.equal(cache.get('decision', changed), null);
  assert.equal(
    createReviewCache({ storage, revision: 'new-strategy' }).get('decision', snapshot),
    null,
  );
});
test('review cache bounds disk and memory, refreshes LRU, and never touches raw records', () => {
  const storage = store();
  storage.values.set('noir-game-records-v1', 'hands');
  const cache = createReviewCache({ storage, maxEntries: 2, maxBytes: 1500 });
  cache.set('decision', 1, result('one'));
  cache.set('decision', 2, result('two'));
  cache.get('decision', 1);
  cache.set('decision', 3, result('three'));
  assert.equal(cache.get('decision', 2), null);
  assert.ok(cache.get('decision', 1));
  cache.set('decision', 4, result('四'.repeat(1000)));
  assert.equal(cache.get('decision', 4), null);
  assert.ok(cache.get('decision', 1), 'An oversized step cannot evict usable results');
  assert.ok(storage.getItem(REVIEW_CACHE_KEY).length * 3 <= 1500);
  assert.equal(storage.getItem('noir-game-records-v1'), 'hands');
});
test('corrupt, incomplete, unavailable and quota-limited caches safely recompute', () => {
  for (const text of [
    'bad JSON',
    JSON.stringify({ revision: 'unbundled-v1', entries: [[null, '{}']] }),
  ]) {
    const storage = store();
    storage.setItem(REVIEW_CACHE_KEY, text);
    assert.equal(createReviewCache({ storage }).get('decision', 1), null);
  }
  const storage = {
    getItem() {
      throw Error('denied');
    },
    setItem() {
      throw Error('quota');
    },
  };
  const cache = createReviewCache({ storage });
  cache.set('decision', 1, {});
  assert.equal(cache.get('decision', 1), null);
  cache.set('decision', 1, result('valid'));
  assert.deepEqual(cache.get('decision', 1), result('valid'));
});
test('live and historical controllers share new persisted results without overwriting one another', () => {
  const storage = store(),
    live = createReviewCache({ storage }),
    history = createReviewCache({ storage });
  assert.equal(live.get('decision', 1), null);
  history.set('decision', 1, result('historical'));
  assert.deepEqual(live.get('decision', 1), result('historical'));
  live.set('decision', 2, result('live'));
  const reopened = createReviewCache({ storage });
  assert.deepEqual(reopened.get('decision', 1), result('historical'));
  assert.deepEqual(reopened.get('decision', 2), result('live'));
});
test('cache revision automatically changes with engine or review implementation', (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'noir-review-revision-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const name of ['engine', 'review'])
    mkdirSync(path.join(directory, 'src', name), { recursive: true });
  const engine = path.join(directory, 'src/engine/poker.js'),
    review = path.join(directory, 'src/review/coaching.js');
  writeFileSync(engine, 'rules');
  writeFileSync(review, 'copy');
  const first = reviewRevision(directory);
  writeFileSync(engine, 'new-rules');
  assert.notEqual(reviewRevision(directory), first);
  writeFileSync(engine, 'rules');
  writeFileSync(review, 'new-copy');
  assert.notEqual(reviewRevision(directory), first);
  const plugin = reviewRevisionPlugin(directory);
  const cacheFile = path.join(directory, 'src/review/result-cache.js');
  const transformed = plugin.transform('__NOIR_REVIEW_REVISION__', cacheFile);
  let changed;
  const module = {};
  let invalidated = 0;
  plugin.configureServer({
    watcher: { on: (_, callback) => (changed = callback) },
    moduleGraph: {
      getModuleById: (id) => (id === cacheFile ? module : undefined),
      invalidateModule: (value) => {
        assert.equal(value, module);
        invalidated++;
      },
    },
  });
  changed(path.join(directory, 'docs/review.md'));
  assert.equal(invalidated, 0);
  writeFileSync(review, 'another-copy');
  changed(review);
  assert.equal(invalidated, 1);
  assert.notEqual(plugin.transform('__NOIR_REVIEW_REVISION__', cacheFile), transformed);
});

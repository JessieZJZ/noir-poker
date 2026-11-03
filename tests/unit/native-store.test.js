import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storeProfileSource, storeIndexSource } from '../../scripts/native-store.mjs';
test('native presentation is identical to the shared original cast', () => {
  const source = readFileSync(new URL('../../src/engine/bot-profiles.js', import.meta.url), 'utf8');
  assert.equal(storeProfileSource(source), source);
  assert.doesNotMatch(source, /https:\/\/|research\.players/);
});
test('shared guide contains character guidance and retains game controls', () => {
  const source = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.equal(storeIndexSource(source), source);
  assert.doesNotMatch(source, /kpclive\.com|tritonpokerseries\.com|具名/);
  assert.match(source, /认识训练风格/);
  for (const id of ['language-select', 'restart-hand-button', 'review-hand-button', 'player-count'])
    assert.ok(source.includes('id="' + id + '"'));
});

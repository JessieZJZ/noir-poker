import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStartupState } from '../../src/platform/startup-state.js';

test('startup diagnostics retain a stalled stage and the original rejection without marking the app ready', async () => {
  let time = 100;
  const document = { documentElement: { dataset: {} } };
  const startup = createStartupState({ document, now: () => time });
  startup.stage('platform-prepare');
  let reject;
  const pending = new Promise((_, fail) => {
    reject = fail;
  });
  const completion = pending.catch((error) => startup.fail(error));
  time += 1500;
  assert.equal(startup.state.stage, 'platform-prepare');
  assert.equal(document.documentElement.dataset.appReady, undefined);
  const error = Error('Native preferences did not initialize');
  reject(error);
  await completion;
  assert.equal(startup.state.error.stage, 'platform-prepare');
  assert.equal(startup.state.error.message, error.message);
  assert.equal(startup.state.error.stack, error.stack);
  assert.equal(startup.state.history.at(-1).elapsedMs, 1500);
  assert.equal(document.documentElement.dataset.appReady, undefined);
});

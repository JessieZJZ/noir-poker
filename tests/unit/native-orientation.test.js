import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestNativeOrientation } from '../../scripts/native-orientation.mjs';

test('native rotation records only the expected Android phone portrait lock', async () => {
  const error = Error(
    'Screen rotation cannot be changed to ROTATION_270 after 2000ms. Is it locked programmatically?',
  );
  const command = async (_method, endpoint) => {
    if (endpoint === '/orientation') throw error;
  };
  assert.deepEqual(await requestNativeOrientation(command, 'android', 'LANDSCAPE', true), {
    accepted: false,
    locked: true,
    message: error.message,
  });
  for (const [platform, orientation, allow] of [
    ['android', 'LANDSCAPE', false],
    ['android', 'PORTRAIT', true],
    ['ios', 'LANDSCAPE', true],
  ])
    await assert.rejects(requestNativeOrientation(command, platform, orientation, allow), error);
  await assert.rejects(
    requestNativeOrientation(
      async () => {
        throw Error('Device disconnected');
      },
      'android',
      'LANDSCAPE',
      true,
    ),
    /Device disconnected/,
  );
});

test('native rotation sends the physical request in native context and records success', async () => {
  const calls = [];
  const result = await requestNativeOrientation(
    async (...args) => calls.push(args),
    'android',
    'LANDSCAPE',
    false,
  );
  assert.deepEqual(calls, [
    ['POST', '/context', { name: 'NATIVE_APP' }],
    ['POST', '/orientation', { orientation: 'LANDSCAPE' }],
  ]);
  assert.deepEqual(result, { accepted: true });
});

test('iOS phone lock rejection is recorded while tablet and portrait failures still fail', async () => {
  const error = Error('Unable To Rotate Device');
  const command = async (_method, endpoint) => {
    if (endpoint === '/orientation') throw error;
  };
  assert.deepEqual(await requestNativeOrientation(command, 'ios', 'LANDSCAPE', true), {
    accepted: false,
    locked: true,
    message: error.message,
  });
  for (const [platform, orientation, allow] of [
    ['ios', 'LANDSCAPE', false],
    ['ios', 'PORTRAIT', true],
    ['android', 'LANDSCAPE', true],
  ])
    await assert.rejects(requestNativeOrientation(command, platform, orientation, allow), error);
});

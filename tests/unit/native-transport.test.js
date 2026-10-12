import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeCommand } from '../../scripts/native-transport.mjs';

test('only an Android context switch with an offline ADB transport retries once after readiness', async () => {
  const calls = [];
  let attempts = 0;
  const command = createNativeCommand({
    platform: 'android',
    request: async () => {
      calls.push('request');
      if (++attempts === 1) throw Error('adb: device offline');
      return 'WEBVIEW';
    },
    reconnect: async () => calls.push('reconnect'),
    waitReady: async () => calls.push('ready'),
    onRecovery: () => calls.push('record'),
  });
  assert.equal(await command('POST', '/context', {}), 'WEBVIEW');
  assert.deepEqual(calls, ['request', 'reconnect', 'ready', 'record', 'request']);
});

test('persistent offline transports and app failures remain failures', async () => {
  for (const [platform, endpoint, message, expected] of [
    ['android', '/context', 'adb: device offline', 2],
    ['android', '/source', 'adb: device offline', 1],
    ['android', '/context', 'App crash', 1],
    ['ios', '/context', 'adb: device offline', 1],
  ]) {
    let attempts = 0;
    const command = createNativeCommand({
      platform,
      request: async () => {
        attempts++;
        throw Error(message);
      },
      reconnect: async () => {},
      waitReady: async () => {},
      onRecovery: () => {},
    });
    await assert.rejects(command('POST', endpoint, {}), new RegExp(message));
    assert.equal(attempts, expected);
  }
});

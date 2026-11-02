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

test('read-only Android requests retry a dropped driver proxy twice; writes do not', async () => {
  const run = async (method, failures, platform = 'android') => {
    let attempts = 0;
    const command = createNativeCommand({
      platform,
      request: async () => {
        if (++attempts <= failures)
          throw Error(
            'Could not proxy command to the remote server. Original error: socket hang up',
          );
        return 'ok';
      },
      reconnect: async () => {},
      waitReady: async () => {},
      onRecovery: () => {},
      pause: async () => {},
    });
    try {
      return { value: await command(method, '/screenshot'), attempts };
    } catch {
      return { value: 'failed', attempts };
    }
  };
  assert.deepEqual(await run('GET', 2), { value: 'ok', attempts: 3 });
  assert.deepEqual(await run('GET', 3), { value: 'failed', attempts: 3 });
  assert.deepEqual(await run('POST', 1), { value: 'failed', attempts: 1 });
  assert.deepEqual(await run('GET', 1, 'ios'), { value: 'failed', attempts: 1 });
});

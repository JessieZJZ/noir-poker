import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareNativeTouch } from '../../scripts/native-touch.mjs';

test('iOS waits for real tap settings before reading back both required flags', async () => {
  const calls = [];
  let finishSet;
  const setting = new Promise((resolve) => (finishSet = resolve));
  const preparing = prepareNativeTouch(async (...args) => {
    calls.push(args);
    if (args[0] === 'POST') return setting;
    return { nativeWebTap: true, nativeWebTapStrict: true, unrelatedSetting: 'not reported' };
  }, 'ios');
  assert.deepEqual(calls, [
    ['POST', '/appium/settings', { settings: { nativeWebTap: true, nativeWebTapStrict: true } }],
  ]);
  await Promise.resolve();
  assert.equal(calls.length, 1, 'Readback must wait for the POST to finish');
  finishSet();
  assert.deepEqual(await preparing, { nativeWebTap: true, nativeWebTapStrict: true });
  assert.deepEqual(calls[1], ['GET', '/appium/settings']);
  assert.equal(calls.length, 2);
});

test('Android makes no driver setting requests and unknown platforms fail before any request', async () => {
  let requests = 0;
  const command = async () => requests++;
  assert.equal(await prepareNativeTouch(command, 'android'), undefined);
  assert.equal(requests, 0);
  for (const platform of ['web', '', undefined, null])
    await assert.rejects(prepareNativeTouch(command, platform), /platform must be ios or android/);
  assert.equal(requests, 0);
});

test('false, missing or non-boolean readback flags fail instead of allowing synthetic clicks', async () => {
  for (const actual of [
    undefined,
    null,
    {},
    { nativeWebTap: false, nativeWebTapStrict: true },
    { nativeWebTap: true, nativeWebTapStrict: false },
    { nativeWebTap: true },
    { nativeWebTapStrict: true },
    { nativeWebTap: 'true', nativeWebTapStrict: true },
    { nativeWebTap: true, nativeWebTapStrict: 1 },
  ]) {
    const calls = [];
    await assert.rejects(
      prepareNativeTouch(async (method, endpoint) => {
        calls.push([method, endpoint]);
        return method === 'GET' ? actual : null;
      }, 'ios'),
      /iOS nativeWebTap(?:Strict)? must read back as true/,
    );
    assert.deepEqual(calls, [
      ['POST', '/appium/settings'],
      ['GET', '/appium/settings'],
    ]);
  }
});

test('settings and readback failures propagate their original errors without a fallback or retry', async () => {
  for (const failMethod of ['POST', 'GET']) {
    const error = new Error(`${failMethod} driver failure`),
      calls = [];
    await assert.rejects(
      prepareNativeTouch(async (method, endpoint) => {
        calls.push([method, endpoint]);
        if (method === failMethod) throw error;
      }, 'ios'),
      (received) => received === error,
    );
    assert.deepEqual(
      calls,
      failMethod === 'POST'
        ? [['POST', '/appium/settings']]
        : [
            ['POST', '/appium/settings'],
            ['GET', '/appium/settings'],
          ],
    );
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pressSelectedAndroidHome } from '../native/immediate-background.mjs';

test('immediate Android background targets only the explicit serial and isolated ADB server', () => {
  const calls = [];
  assert.equal(
    pressSelectedAndroidHome({
      platform: 'android',
      argv: [
        'android',
        '--udid',
        'overridden-device',
        '--adb-port',
        '6060',
        '--udid',
        'emulator-5590',
        '--adb-port',
        '5047',
      ],
      sdk: '/sdk',
      run: (...args) => calls.push(args),
    }),
    true,
  );
  assert.deepEqual(calls, [
    [
      '/sdk/platform-tools/adb',
      ['-P', '5047', '-s', 'emulator-5590', 'shell', 'input', 'keyevent', 'KEYCODE_HOME'],
      { timeout: 10000, stdio: 'pipe' },
    ],
  ]);
});

test('other platforms and automatic device selection never send HOME to a guessed device', () => {
  for (const options of [
    { platform: 'ios', argv: ['--udid', 'ios-device'] },
    { platform: 'android', argv: [] },
    { platform: 'android', argv: ['--udid', '--adb-port', '5047'] },
    { platform: 'android', argv: ['--udid', 'remote-device', '--server', 'http://device-farm'] },
  ])
    assert.equal(
      pressSelectedAndroidHome({
        ...options,
        run: () => {
          throw Error('Must not run');
        },
      }),
      false,
    );
});

test('without an explicit ADB port the standard ADB environment remains in charge', () => {
  let received;
  pressSelectedAndroidHome({
    platform: 'android',
    argv: ['--udid', 'selected'],
    run: (_binary, args) => {
      received = args;
    },
  });
  assert.deepEqual(received, ['-s', 'selected', 'shell', 'input', 'keyevent', 'KEYCODE_HOME']);
});

test('invalid ports and native HOME errors fail instead of manufacturing a background event', () => {
  assert.throws(
    () =>
      pressSelectedAndroidHome({
        platform: 'android',
        argv: ['--udid', 'serial', '--adb-port', 'bad'],
      }),
    /Invalid selected/,
  );
  const error = Error('Selected device offline');
  assert.throws(
    () =>
      pressSelectedAndroidHome({
        platform: 'android',
        argv: ['--udid', 'serial'],
        run: () => {
          throw error;
        },
      }),
    (received) => received === error,
  );
});

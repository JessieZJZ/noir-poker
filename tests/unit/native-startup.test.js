import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iosLaunchProcessId, iosInitialScreenReady } from '../../scripts/native-startup.mjs';

test('independent iOS readiness belongs to the launched process, not a stale or JS-only marker', () => {
  const pid = iosLaunchProcessId('io.github.jessiezjz.noirpoker: 37927\n');
  const old = 'App[12:300] [NOIR startup] launch cover removed\n';
  const pending = 'App[37927:400] [NOIR startup] {"ready":true,"stage":"ready"}\n';
  assert.equal(iosInitialScreenReady(old + pending, pid), false);
  assert.equal(
    iosInitialScreenReady(
      old + pending + 'App[37927:400] [NOIR startup] launch cover removed\n',
      pid,
    ),
    true,
  );
  assert.equal(iosInitialScreenReady(old, 0), false);
  assert.throws(() => iosLaunchProcessId('Launch failed'), /PID/);
});

test('R12 readiness can require the actual same-process native backport installation marker', () => {
  const ready = 'App[123:4] [NOIR startup] launch cover removed\n';
  const marker =
    'App[123:4] [NOIR startup] capacitor backport installed capacitor-8688-ios-8.5.3-v1\n';
  const stale =
    'App[122:4] [NOIR startup] capacitor backport installed capacitor-8688-ios-8.5.3-v1\n';
  assert.equal(iosInitialScreenReady(ready, 123), true);
  assert.equal(iosInitialScreenReady(ready, 123, { requireBackportMarker: true }), false);
  assert.equal(iosInitialScreenReady(stale + ready, 123, { requireBackportMarker: true }), false);
  assert.equal(iosInitialScreenReady(marker, 123, { requireBackportMarker: true }), false);
  assert.equal(iosInitialScreenReady(marker + ready, 123, { requireBackportMarker: true }), true);
});

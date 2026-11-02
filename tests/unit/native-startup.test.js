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

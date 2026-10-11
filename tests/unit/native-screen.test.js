import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoSystemError, captureNativeScreen } from '../../scripts/native-screen.mjs';

test('native ANR and crash controls fail regardless of system language while normal UI remains valid', () => {
  for (const source of [
    '<node package="android" text="System UI isn\'t responding" resource-id="android:id/aerr_wait"/>',
    '<node package="android" text="关闭应用" resource-id="android:id/aerr_close"/>',
  ])
    assert.throws(() => assertNoSystemError(source), /Native system error dialog blocks/);
  assert.doesNotThrow(() =>
    assertNoSystemError('<node package="io.github.jessiezjz.noirpoker" text="下一手"/>'),
  );
});

test('native capture retains ANR evidence and restores the WebView instead of allowing a pass', async () => {
  const calls = [];
  const evidence = {};
  const source = '<node resource-id="android:id/aerr_wait" text="Wait"/>';
  await assert.rejects(
    captureNativeScreen({
      webContext: 'WEBVIEW_noir',
      checkSystemErrors: true,
      command: async (method, endpoint, body) => {
        calls.push([method, endpoint, body]);
        return endpoint === '/screenshot' ? 'device-png' : source;
      },
      saveImage: (value) => (evidence.image = value),
      saveSource: (value) => (evidence.source = value),
    }),
    /Native system error dialog blocks/,
  );
  assert.deepEqual(evidence, { image: 'device-png', source });
  assert.deepEqual(calls.at(-1), ['POST', '/context', { name: 'WEBVIEW_noir' }]);
});

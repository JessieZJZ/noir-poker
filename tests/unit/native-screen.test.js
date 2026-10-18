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

test('a failure before WebView attachment retains its screenshot without switching to an undefined context', async () => {
  const contexts = [];
  let image;
  await captureNativeScreen({
    checkSystemErrors: false,
    command: async (_method, endpoint, body) => {
      if (endpoint === '/context') contexts.push(body.name);
      return 'failed-launch-png';
    },
    saveImage: (value) => (image = value),
  });
  assert.equal(image, 'failed-launch-png');
  assert.deepEqual(contexts, ['NATIVE_APP']);
});

test('pre-attachment failure capture keeps native evidence without selecting an unknown WebView', async () => {
  const calls = [];
  const evidence = {};
  await captureNativeScreen({
    checkSystemErrors: true,
    command: async (method, endpoint, body) => {
      calls.push([method, endpoint, body]);
      return endpoint === '/screenshot' ? 'device-png' : '<node text="启动中"/>';
    },
    saveImage: (value) => (evidence.image = value),
    saveSource: (value) => (evidence.source = value),
  });
  assert.deepEqual(evidence, { image: 'device-png', source: '<node text="启动中"/>' });
  assert.deepEqual(calls, [
    ['POST', '/context', { name: 'NATIVE_APP' }],
    ['GET', '/screenshot', undefined],
    ['GET', '/source', undefined],
  ]);
});

test('iOS capture saves native coordinates for pixel analysis without Android error checks', async () => {
  const evidence = {};
  const contexts = [];
  const source = '<XCUIElementTypeWebView x="0" y="59" width="393" height="759"/>';
  await captureNativeScreen({
    checkSystemErrors: false,
    webContext: 'WEBVIEW_noir',
    command: async (_method, endpoint, body) => {
      if (endpoint === '/context') contexts.push(body.name);
      return endpoint === '/screenshot' ? 'device-png' : source;
    },
    saveImage: (value) => (evidence.image = value),
    saveSource: (value) => (evidence.source = value),
  });
  assert.deepEqual(evidence, { image: 'device-png', source });
  assert.deepEqual(contexts, ['NATIVE_APP', 'WEBVIEW_noir']);
});

function recoverableCapture({
  lost = 1,
  replaced = false,
  otherError = false,
  native = false,
} = {}) {
  let marker,
    attempts = 0;
  const evidence = {};
  const calls = [];
  const missing = new Error(otherError ? 'Transport denied' : 'No such context found');
  return {
    evidence,
    calls,
    missing,
    attempts: () => attempts,
    options: {
      webContext: 'WEBVIEW_noir',
      checkSystemErrors: true,
      saveImage: (value) => {
        evidence.image = value;
      },
      saveSource: (value) => {
        evidence.source = value;
      },
      command: async (method, endpoint, body) => {
        calls.push([method, endpoint, body]);
        if (method === 'GET' && endpoint === '/context')
          return native ? 'NATIVE_APP' : 'WEBVIEW_noir';
        if (endpoint === '/execute/sync') {
          if (body.args.length) {
            marker = body.args[0];
            return null;
          }
          return replaced ? undefined : marker;
        }
        if (method === 'POST' && endpoint === '/context' && body.name === 'WEBVIEW_noir') {
          attempts++;
          if (attempts <= lost) throw missing;
        }
        if (endpoint === '/contexts') return ['NATIVE_APP', 'WEBVIEW_noir'];
        if (endpoint === '/screenshot') return 'device-png';
        if (endpoint === '/source') return '<node package="io.github.jessiezjz.noirpoker"/>';
      },
    },
  };
}

test('Android capture refreshes transient discovery but verifies the same page and original context', async () => {
  const fixture = recoverableCapture();
  await captureNativeScreen(fixture.options);
  assert.equal(fixture.attempts(), 2);
  assert.equal(fixture.evidence.image, 'device-png');
  assert.equal(fixture.calls.filter(([, path]) => path === '/screenshot').length, 1);
  assert.equal(fixture.calls.filter(([, path]) => path === '/contexts').length, 1);
  assert.ok(
    fixture.calls
      .filter(([method, path]) => method === 'POST' && path === '/context')
      .every(([, , body]) => ['NATIVE_APP', 'WEBVIEW_noir'].includes(body.name)),
  );
});

test('Android capture rejects a replacement page even when transport reconnects successfully', async () => {
  const fixture = recoverableCapture({ replaced: true });
  await assert.rejects(captureNativeScreen(fixture.options), /retain the same live page/);
});

test('Android capture bounds discovery retries and does not retry unrelated errors or an unmarked page', async () => {
  for (const options of [{ lost: 10 }, { otherError: true }, { native: true }]) {
    const fixture = recoverableCapture(options);
    await assert.rejects(
      captureNativeScreen(fixture.options),
      (error) => error === fixture.missing,
    );
    assert.equal(fixture.attempts(), options.lost ? 3 : 1);
  }
});

test('native system errors retain priority when restoring the WebView also fails', async () => {
  const fixture = recoverableCapture({ lost: 10 });
  const command = fixture.options.command;
  fixture.options.command = (method, path, body) =>
    path === '/source'
      ? '<node resource-id="android:id/aerr_close"/>'
      : command(method, path, body);
  await assert.rejects(
    captureNativeScreen(fixture.options),
    (error) =>
      /Native system error dialog/.test(error.message) &&
      /No such context/.test(error.restoreError),
  );
  assert.equal(fixture.evidence.source, '<node resource-id="android:id/aerr_close"/>');
});

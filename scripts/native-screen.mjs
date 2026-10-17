import assert from 'node:assert/strict';

export function assertNoSystemError(source) {
  // Android's ANR/crash controls remain identifiable across system languages.
  assert.ok(
    !/resource-id=["'](?:android|com\.android\.systemui):id\/aerr_(?:close|wait|report|restart)["']/.test(
      source,
    ),
    'Native system error dialog blocks the app; inspect the device screenshot and native source',
  );
}

let captureSequence = 0;
export async function captureNativeScreen({
  command,
  webContext,
  checkSystemErrors,
  saveImage,
  saveSource,
}) {
  let token;
  // Android can briefly omit a live WebView from discovery after an AX dump.
  // A page-local token lets us recover that transport without accepting an
  // app restart, navigation or replacement renderer as a successful capture.
  if (checkSystemErrors && webContext) {
    try {
      if ((await command('GET', '/context')) === webContext) {
        const pending = `native-capture-${Date.now()}-${++captureSequence}`;
        await command('POST', '/execute/sync', {
          script: 'window.__noirNativeCaptureToken = arguments[0];',
          args: [pending],
        });
        token = pending;
      }
    } catch {
      // Retain native failure evidence even before a functioning JS context.
    }
  }
  let captureError;
  await command('POST', '/context', { name: 'NATIVE_APP' });
  try {
    saveImage(await command('GET', '/screenshot'));
    if (checkSystemErrors || saveSource) {
      const source = await command('GET', '/source');
      saveSource(source);
      if (checkSystemErrors) assertNoSystemError(source);
    }
  } catch (error) {
    captureError = error;
  }
  try {
    if (webContext) {
      for (let attempt = 0; ; attempt++) {
        try {
          await command('POST', '/context', { name: webContext });
          break;
        } catch (error) {
          if (!token || attempt >= 2 || !/No such context found/i.test(error.message)) throw error;
          // Refresh discovery, then retry only the original app's context.
          await command('GET', '/contexts');
        }
      }
      if (token && !captureError) {
        const restored = await command('POST', '/execute/sync', {
          script:
            'const token = window.__noirNativeCaptureToken; delete window.__noirNativeCaptureToken; return token;',
          args: [],
        });
        assert.equal(restored, token, 'Native screen capture must retain the same live page');
      }
    }
  } catch (error) {
    if (!captureError) throw error;
    captureError.restoreError = error.stack || String(error);
  }
  if (captureError) throw captureError;
}

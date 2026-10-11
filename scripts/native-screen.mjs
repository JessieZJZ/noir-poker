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

export async function captureNativeScreen({
  command,
  webContext,
  checkSystemErrors,
  saveImage,
  saveSource,
}) {
  await command('POST', '/context', { name: 'NATIVE_APP' });
  try {
    saveImage(await command('GET', '/screenshot'));
    if (checkSystemErrors) {
      const source = await command('GET', '/source');
      saveSource(source);
      assertNoSystemError(source);
    }
  } finally {
    if (webContext) await command('POST', '/context', { name: webContext });
  }
}

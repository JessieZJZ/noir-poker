import assert from 'node:assert/strict';

// WebDriver's default WebView click is a synthetic JS atom on iOS. Require
// actual WDA taps before creating navigation entries that native Back uses.
export async function prepareNativeTouch(command, platform) {
  if (platform === 'android') return;
  if (platform !== 'ios') throw new Error('Native touch platform must be ios or android');
  await command('POST', '/appium/settings', {
    settings: { nativeWebTap: true, nativeWebTapStrict: true },
  });
  const actual = await command('GET', '/appium/settings');
  assert.equal(actual?.nativeWebTap, true, 'iOS nativeWebTap must read back as true');
  assert.equal(actual?.nativeWebTapStrict, true, 'iOS nativeWebTapStrict must read back as true');
  return { nativeWebTap: actual.nativeWebTap, nativeWebTapStrict: actual.nativeWebTapStrict };
}

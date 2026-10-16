import assert from 'node:assert/strict';

// nativeWebTap routes iOS WebView clicks through WDA. Keep Strict false so
// the driver tries the actual native accessibility element before coordinate
// calibration. Both paths use native touch; neither falls back to a JS click.
export async function prepareNativeTouch(command, platform) {
  if (platform === 'android') {
    // The table intentionally keeps animating. UIAutomator's default 10s idle
    // wait adds that delay to every native tap; our target sampler already
    // verifies visible, stable geometry before delegating the real touch.
    await command('POST', '/appium/settings', { settings: { waitForIdleTimeout: 500 } });
    const actual = await command('GET', '/appium/settings');
    assert.equal(actual?.waitForIdleTimeout, 500, 'Android idle timeout must read back as 500');
    return { waitForIdleTimeout: actual.waitForIdleTimeout };
  }
  if (platform !== 'ios') throw new Error('Native touch platform must be ios or android');
  await command('POST', '/appium/settings', {
    settings: { nativeWebTap: true, nativeWebTapStrict: false },
  });
  const actual = await command('GET', '/appium/settings');
  assert.equal(actual?.nativeWebTap, true, 'iOS nativeWebTap must read back as true');
  assert.equal(actual?.nativeWebTapStrict, false, 'iOS nativeWebTapStrict must read back as false');
  return { nativeWebTap: actual.nativeWebTap, nativeWebTapStrict: actual.nativeWebTapStrict };
}

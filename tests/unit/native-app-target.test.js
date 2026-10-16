import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeAppTarget, assertAndroidTestPackage } from '../../scripts/native-app-target.mjs';

const appId = 'io.github.jessiezjz.noirpoker';
const badging = (id) => `package: name='${id}' versionCode='1' versionName='1.0.0'`;

test('isolated Android target keeps the existing app identity separate', () => {
  assert.deepEqual(nativeAppTarget({ platform: 'android', appId, variant: 'qa' }), {
    appId: `${appId}.qa`,
    appPath: '.artifacts/mobile/noir-poker-qa.apk',
  });
  assert.equal(nativeAppTarget({ platform: 'android', appId }).appId, appId);
  assert.throws(() => nativeAppTarget({ platform: 'ios', appId, variant: 'qa' }), /Android/);
  assert.throws(
    () => nativeAppTarget({ platform: 'android', appId, variant: 'release' }),
    /variant/,
  );
});

test('physical-device reset refuses the original package and mismatched APKs', () => {
  const verify = (actual, expected, isEmulator = false) =>
    assertAndroidTestPackage({
      badging: badging(actual),
      expectedAppId: expected,
      baseAppId: appId,
      isEmulator,
    });
  assert.equal(verify(`${appId}.qa`, `${appId}.qa`), `${appId}.qa`);
  assert.equal(verify(appId, appId, true), appId);
  assert.throws(() => verify(appId, appId), /Physical Android tests require/);
  assert.throws(() => verify(appId, `${appId}.qa`), /does not match/);
  assert.throws(() => verify('unrelated.app', `${appId}.qa`), /does not match/);
  assert.throws(
    () =>
      assertAndroidTestPackage({
        badging: '',
        expectedAppId: appId,
        baseAppId: appId,
        isEmulator: true,
      }),
    /missing/,
  );
});

export function nativeAppTarget({ platform, appId, variant = 'debug' }) {
  if (!['debug', 'qa'].includes(variant) || (platform !== 'android' && variant === 'qa'))
    throw Error('Use --variant debug, or --variant qa for the isolated Android test app');
  return {
    appId: variant === 'qa' ? `${appId}.qa` : appId,
    appPath:
      platform === 'ios'
        ? '.artifacts/mobile/ios/Build/Products/Debug-iphonesimulator/App.app'
        : `.artifacts/mobile/noir-poker-${variant}.apk`,
  };
}

/** Check the actual APK identity before any installation or full-reset operation. */
export function assertAndroidTestPackage({ badging, expectedAppId, baseAppId, isEmulator }) {
  const actualAppId = /^package: name='([^']+)'/m.exec(badging)?.[1];
  if (!actualAppId || actualAppId !== expectedAppId)
    throw Error(`APK package ${actualAppId ?? '(missing)'} does not match ${expectedAppId}`);
  if (!isEmulator && actualAppId !== `${baseAppId}.qa`)
    throw Error('Physical Android tests require --variant qa to preserve the existing app data');
  return actualAppId;
}

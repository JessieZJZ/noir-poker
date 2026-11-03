export async function restartNativeApplication(command, appId, { resetDriver } = {}) {
  // Let the same driver own termination and activation so its application
  // handle follows the new process instead of retaining a stale XCTest state.
  await command('POST', '/context', { name: 'NATIVE_APP' });
  await command('POST', '/appium/device/terminate_app', { appId });
  // XCUITest keeps Web Inspector connected when switching to NATIVE_APP.
  // Reconnect while the app is stopped so it cannot hold the new page at launch.
  await resetDriver?.();
  await command('POST', '/appium/device/activate_app', { appId });
}

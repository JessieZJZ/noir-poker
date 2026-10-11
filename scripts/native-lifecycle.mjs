export async function restartNativeApplication(command, appId) {
  // Let the same driver own termination and activation so its application
  // handle follows the new process instead of retaining a stale XCTest state.
  await command('POST', '/context', { name: 'NATIVE_APP' });
  await command('POST', '/appium/device/terminate_app', { appId });
  await command('POST', '/appium/device/activate_app', { appId });
}

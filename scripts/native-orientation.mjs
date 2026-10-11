export async function requestNativeOrientation(command, platform, orientation, allowPortraitLock) {
  await command('POST', '/context', { name: 'NATIVE_APP' });
  try {
    await command('POST', '/orientation', { orientation });
    return { accepted: true };
  } catch (error) {
    // Native drivers report an enforced portrait lock as a rotation failure.
    // The caller must still verify the real portrait viewport and usable UI.
    const portraitLock =
      (platform === 'android' &&
        /Screen rotation cannot be changed to ROTATION_\d+ after \d+ms\. Is it locked programmatically\?/.test(
          error.message,
        )) ||
      (platform === 'ios' && error.message.endsWith('Unable To Rotate Device'));
    if (orientation === 'LANDSCAPE' && allowPortraitLock && portraitLock)
      return { accepted: false, locked: true, message: error.message };
    throw error;
  }
}

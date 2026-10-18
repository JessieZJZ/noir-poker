import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Only the explicitly selected device may receive HOME. Other callers retain
// their existing Appium path; never discover or guess another device here.
export function pressSelectedAndroidHome({
  platform,
  argv = process.argv.slice(2),
  sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT,
  run = execFileSync,
}) {
  if (platform !== 'android') return false;
  const option = (name) => {
    const index = argv.lastIndexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  // An external Appium server may control a device on another machine.
  if (option('--server')) return false;
  const udid = option('--udid');
  if (!udid || udid.startsWith('--')) return false;
  const port = option('--adb-port');
  if (port !== undefined && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535))
    throw Error('Invalid selected Android ADB port');
  run(
    sdk ? path.join(sdk, 'platform-tools/adb') : 'adb',
    [
      ...(port === undefined ? [] : ['-P', port]),
      '-s',
      udid,
      'shell',
      'input',
      'keyevent',
      'KEYCODE_HOME',
    ],
    { timeout: 10000, stdio: 'pipe' },
  );
  return true;
}

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeScenarios } from '../tests/native/scenarios.mjs';
import { sourceDigest } from './mobile-lib.mjs';
import { verifyBundledArtifact } from './bundled-assets.mjs';
import { selectIOSSimulator } from './native-device.mjs';
import { stopOwnedServer } from './native-process.mjs';
import { captureNativeScreen } from './native-screen.mjs';
import { restartNativeApplication } from './native-lifecycle.mjs';
import { requestNativeOrientation } from './native-orientation.mjs';
import { compareNativePage } from '../tests/native/page-parity.mjs';
import { createNativeCommand } from './native-transport.mjs';
import { nativeBackPage, nativePageReady } from './native-back.mjs';
import { prepareNativeTouch } from './native-touch.mjs';
import { nativeAppTarget, assertAndroidTestPackage } from './native-app-target.mjs';
import { nativeServerArguments } from './native-server.mjs';
import { iosLaunchProcessId, iosInitialScreenReady } from './native-startup.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const platform = args.shift();
if (!['ios', 'android'].includes(platform))
  throw Error(
    'Usage: node scripts/native-e2e.mjs ios|android [--variant debug|qa] [--app PATH] [--udid ID] [--output PATH] [--server URL] [--port PORT] [--driver-port PORT] [--adb-port PORT]',
  );
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (
    ![
      '--variant',
      '--app',
      '--udid',
      '--output',
      '--server',
      '--port',
      '--driver-port',
      '--adb-port',
    ].includes(args[i]) ||
    !args[i + 1]
  )
    throw Error(`Unknown or incomplete option: ${args[i]}`);
  options[args[i].slice(2)] = args[i + 1];
}
for (const key of ['port', 'driver-port', 'adb-port']) {
  if (
    options[key] &&
    (!/^\d+$/.test(options[key]) || Number(options[key]) < 1024 || Number(options[key]) > 65535)
  )
    throw Error(`Invalid ${key}: use a port between 1024 and 65535`);
}
if (options.server && options.port) throw Error('Use --server or --port, not both');
const baseAppId = JSON.parse(readFileSync(path.join(root, 'capacitor.config.json'), 'utf8')).appId;
const target = nativeAppTarget({ platform, appId: baseAppId, variant: options.variant });
const appId = target.appId;
const appPath = path.resolve(root, options.app ?? target.appPath);
const output = path.resolve(root, options.output ?? `.artifacts/native-e2e/${platform}`);
mkdirSync(output, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const adbArgs = (args) => (options['adb-port'] ? ['-P', options['adb-port'], ...args] : args);
const run = (binary, argv, { timeout = 120000 } = {}) => {
  const value = spawnSync(binary, binary === adb ? adbArgs(argv) : argv, {
    encoding: 'utf8',
    cwd: root,
    timeout,
  });
  if (value.status !== 0)
    throw Error(
      `${binary} ${argv.join(' ')} failed: ${value.stderr || value.error || value.stdout}`,
    );
  return value.stdout.trim();
};
let ownedSimulator = false;
let udid = options.udid ?? process.env[`NOIR_${platform.toUpperCase()}_UDID`];
// A clean install removes app preferences on the selected test device. By
// default iOS uses a dedicated simulator rather than the user's open simulator.
const report = {
  platform,
  app: appPath,
  appId,
  udid,
  startedAt: new Date().toISOString(),
  scenarios: [],
  status: 'running',
  phase: 'preflight',
  automation: 'Appium installed native app with WebView and native lifecycle contexts',
};
const log = (message) => console.log(`[native-e2e:${platform}] ${message}`);
let server;
let serverStream;
let session;
let sessionCapabilities;
let airplaneMode;
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const adb = sdk ? path.join(sdk, 'platform-tools/adb') : 'adb';
// Keep the CDP discovery range and Chromedriver listener separate from other
// emulator sessions as well as the UiAutomator system port. The driver still
// verifies real WebView pages; no discovery or functional checks are disabled.
const androidDevtoolsPort = Math.min(64000, Number(options['driver-port'] ?? 9200) + 10000);
const serverUrl =
  options.server ?? `http://127.0.0.1:${options.port ?? (platform === 'ios' ? 4725 : 4727)}`;
async function request(method, endpoint, body, timeout = 120000) {
  const response = await fetch(`${serverUrl}${endpoint}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeout),
  });
  const payload = await response.json();
  if (!response.ok || payload.value?.error)
    throw Error(`${method} ${endpoint}: ${payload.value?.message || response.statusText}`);
  return payload.value;
}
async function waitFor(test, timeout = 30000, message = 'Condition did not become true') {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await test();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(300);
  }
  throw Error(`${message}${lastError ? `: ${lastError.message}` : ''}`);
}
const command = createNativeCommand({
  request: (method, endpoint, body) => request(method, `/session/${session}${endpoint}`, body),
  platform,
  reconnect: () => run(adb, ['-s', udid, 'reconnect']),
  waitReady: () =>
    waitFor(
      () => {
        const result = spawnSync(
          adb,
          adbArgs(['-s', udid, 'shell', 'getprop', 'sys.boot_completed']),
          {
            encoding: 'utf8',
            timeout: 3000,
          },
        );
        return result.status === 0 && result.stdout.trim() === '1';
      },
      10000,
      'Selected Android ADB transport must reconnect',
    ),
  onRecovery: () => {
    report.transportRecoveries = (report.transportRecoveries || 0) + 1;
    log('Reconnected the selected Android ADB transport before retrying WebView attachment');
  },
});
let webContext;
async function attachWebview({ expectedPage = 'game' } = {}) {
  nativeBackPage(expectedPage);
  // Wait for the real document before attaching WebKit. Attaching during the
  // initial blank-page navigation can pause WebKit before the game loads.
  await waitFor(
    async () => {
      const source = await command('GET', '/source');
      return expectedPage === 'privacy'
        ? /XCUIElementTypeButton|XCUIElementTypeLink|android\.widget\.Button/.test(source)
        : /XCUIElementTypeButton|android\.widget\.Button/.test(source);
    },
    45000,
    'Native app must render an actionable screen before WebView attachment',
  );
  const contexts = await waitFor(
    async () => {
      const available = await command('GET', '/contexts');
      return available.find((name) => name.startsWith('WEBVIEW')) ? available : null;
    },
    90000,
    'Installed app WebView must be inspectable in its Debug native shell',
  );
  webContext = contexts.find((name) => name.startsWith('WEBVIEW'));
  await command('POST', '/context', { name: webContext });
  await waitFor(
    () => evaluate(nativePageReady, expectedPage),
    30000,
    expectedPage === 'privacy'
      ? 'Native Back did not reach a ready local privacy page with its title and return link'
      : 'Bundled game did not initialize',
  );
}
async function evaluate(fn, ...argv) {
  return command('POST', '/execute/sync', {
    script: `return (${fn.toString()})(...arguments)`,
    args: argv,
  });
}
const state = () => evaluate(() => window.noir.getState());
const visible = (selector) =>
  evaluate((value) => {
    const element = document.querySelector(value);
    return Boolean(
      element &&
      !element.hidden &&
      element.getClientRects().length &&
      getComputedStyle(element).visibility !== 'hidden',
    );
  }, selector);
async function click(selector) {
  await waitFor(
    async () =>
      evaluate((value) => {
        const element = document.querySelector(value);
        return Boolean(
          element && !element.disabled && !element.hidden && element.getClientRects().length,
        );
      }, selector),
    30000,
    `Control unavailable: ${selector}`,
  );
  await evaluate((value) => {
    const element = document.querySelector(value);
    const menu = element.closest('.dropdown-menu');
    if (menu) {
      const row = element.getBoundingClientRect(),
        box = menu.getBoundingClientRect();
      if (row.top < box.top) menu.scrollTop -= box.top - row.top;
      if (row.bottom > box.bottom) menu.scrollTop += row.bottom - box.bottom;
    } else element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  }, selector);
  const element = await command('POST', '/element', { using: 'css selector', value: selector });
  const id = element['element-6066-11e4-a52e-4f735466cecf'] ?? element.ELEMENT;
  await command('POST', `/element/${id}/click`, {});
}
async function select(selector, value) {
  // Exercise the visible anchored list, not an OS picker or injected value.
  if (
    await evaluate(
      (selector, value) => document.querySelector(selector).value === value,
      selector,
      value,
    )
  )
    return;
  // Use the scenario adapter's native geometry/AX preparation for selects too.
  // Calling the raw closure skipped that preparation after locale relayouts.
  await this.click(`${selector} + .dropdown-trigger`);
  try {
    await this.click(`.dropdown-option[data-value="${value}"]`);
  } catch (error) {
    // Selecting an option removes the popup. WebKit can return a stale element
    // after dispatching that successful click; accept only the applied value.
    if (
      !/no longer attached|stale element|could not be located/i.test(error.message) ||
      !(await evaluate(
        (selector, value) => document.querySelector(selector).value === value,
        selector,
        value,
      ))
    )
      throw error;
  }
  await waitFor(
    () =>
      evaluate(
        (selector, value) => document.querySelector(selector).value === value,
        selector,
        value,
      ),
    10000,
    `Selection did not apply: ${selector}`,
  );
}
async function nativeTouch(selector, duration) {
  const target = await evaluate((selector) => {
    const element = document.querySelector(selector),
      r = element.getBoundingClientRect(),
      x = r.x + r.width / 2,
      y = r.y + r.height / 2,
      hit = document.elementFromPoint(x, y);
    if (!hit || !element.contains(hit)) throw Error('Native touch target is covered');
    return { x, y, width: innerWidth, height: innerHeight };
  }, selector);
  const { nativePoint } = await import('./native-pointer.mjs');
  await command('POST', '/context', { name: 'NATIVE_APP' });
  try {
    const elements = await command('POST', '/elements', {
      using: 'class name',
      value: platform === 'ios' ? 'XCUIElementTypeWebView' : 'android.webkit.WebView',
    });
    const frames = [];
    for (const element of elements) {
      const id = element['element-6066-11e4-a52e-4f735466cecf'] ?? element.ELEMENT;
      frames.push(await command('GET', `/element/${id}/rect`));
    }
    const frame = frames.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    assert.ok(frame, 'The installed app must expose its actual WebView frame');
    const point = nativePoint(target, target, frame);
    await command('POST', '/actions', {
      actions: [
        {
          type: 'pointer',
          id: 'native-summary-touch',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, origin: 'viewport', ...point },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    });
  } finally {
    await command('POST', '/context', { name: webContext });
  }
}
async function nativeTap(selector) {
  assert.equal(platform, 'ios');
  return nativeTouch(selector, 80);
}
async function nativeHold(selector) {
  return nativeTouch(selector, 650);
}
async function screenshot(name) {
  const imagePath = path.join(output, `${name}.png`);
  const sourcePath = path.join(output, `${name}.native.xml`);
  // Ask the native driver rather than Chromium for the entire device screen.
  await captureNativeScreen({
    command,
    webContext,
    checkSystemErrors: platform === 'android',
    saveImage: (png) => writeFileSync(imagePath, Buffer.from(png, 'base64')),
    saveSource: (source) => writeFileSync(sourcePath, source),
  });
  return { imagePath, sourcePath };
}
async function back({ expectedPage = 'game' } = {}) {
  nativeBackPage(expectedPage);
  if (platform === 'android') {
    // Dispatch the real Activity back event while keeping the active CDP
    // connection; the Capacitor backButton listener owns the page stack.
    run(adb, ['-s', udid, 'shell', 'input', 'keyevent', 'KEYCODE_BACK']);
    return;
  }
  await command('POST', '/context', { name: 'NATIVE_APP' });
  const rect = await command('GET', '/window/rect');
  const y = Math.round(rect.height * 0.45);
  await command('POST', '/actions', {
    actions: [
      {
        type: 'pointer',
        id: 'records-edge-back',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, origin: 'viewport', x: 2, y },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 100 },
          {
            type: 'pointerMove',
            duration: 450,
            origin: 'viewport',
            x: Math.round(rect.width * 0.85),
            y,
          },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ],
  });
  await attachWebview({ expectedPage });
}
async function activate() {
  await command('POST', '/context', { name: 'NATIVE_APP' });
  await command('POST', '/appium/device/activate_app', { appId });
  await attachWebview();
}
async function relaunch() {
  await restartNativeApplication(command, appId, {
    resetDriver: platform === 'ios' ? resetIOSDriver : undefined,
  });
  await attachWebview();
}
async function resetIOSDriver() {
  await request('DELETE', `/session/${session}`);
  session = null;
  webContext = undefined;
  const caps = {
    ...sessionCapabilities,
    'appium:bundleId': appId,
    'appium:noReset': true,
    'appium:fullReset': false,
    'appium:autoLaunch': false,
  };
  // The verified app remains installed. A fresh automation session must not
  // reinstall it or clear the preferences that this restart is checking.
  delete caps['appium:app'];
  const created = await request(
    'POST',
    '/session',
    { capabilities: { alwaysMatch: caps, firstMatch: [{}] } },
    360000,
  );
  session = created.sessionId;
  report.driverSessionResets = (report.driverSessionResets || 0) + 1;
}
async function background() {
  await command('POST', '/context', { name: 'NATIVE_APP' });
  await command('POST', '/appium/app/background', { seconds: -1 });
  const nativeState = await waitFor(
    async () => {
      const value = await queryAppState();
      return [2, 3].includes(value) ? value : null;
    },
    10000,
    'Native driver must confirm the app is backgrounded',
  );
  return { startedAt: performance.now(), nativeState };
}
const queryAppState = () => command('POST', '/appium/device/app_state', { appId });
async function rotate(orientation, { allowPortraitLock = false } = {}) {
  const result = await requestNativeOrientation(command, platform, orientation, allowPortraitLock);
  await attachWebview();
  return result;
}
try {
  if (!existsSync(appPath))
    throw Error(`Build the actual ${platform} app first; missing ${appPath}`);
  report.bundledAssets = verifyBundledArtifact(appPath);
  const embeddedBuild = JSON.parse(
    platform === 'ios'
      ? readFileSync(path.join(appPath, 'public/build-info.json'), 'utf8')
      : run('unzip', ['-p', appPath, 'assets/public/build-info.json']),
  );
  assert.equal(
    embeddedBuild.sourceDigest,
    sourceDigest(),
    'Build the latest source before native E2E; the selected app has stale bundled code',
  );
  report.phase = 'device';
  if (platform === 'ios' && !udid) {
    const { runtime, phone, existing } = selectIOSSimulator(
      {
        devices: JSON.parse(run('xcrun', ['simctl', 'list', 'devices', 'available', '-j'])).devices,
        runtimes: JSON.parse(run('xcrun', ['simctl', 'list', 'runtimes', '-j'])).runtimes,
        devicetypes: JSON.parse(run('xcrun', ['simctl', 'list', 'devicetypes', '-j'])).devicetypes,
      },
      {
        runtimeIdentifier: process.env.NOIR_IOS_RUNTIME,
        deviceTypeIdentifier: process.env.NOIR_IOS_DEVICE_TYPE,
      },
    );
    report.simulator = { runtime: runtime.identifier, deviceType: phone.identifier };
    udid =
      existing?.udid ??
      run('xcrun', ['simctl', 'create', 'Noir Poker E2E', phone.identifier, runtime.identifier]);
    report.udid = udid;
  }
  if (platform === 'ios') {
    const state = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', '-j']));
    if (
      !Object.values(state.devices)
        .flat()
        .find((device) => device.udid === udid && device.state === 'Booted')
    ) {
      run('xcrun', ['simctl', 'boot', udid]);
      ownedSimulator = true;
      // A freshly created simulator's first boot on a CI runner can take minutes.
      run('xcrun', ['simctl', 'bootstatus', udid, '-b'], { timeout: 600000 });
    }
  }
  if (platform === 'android' && !udid) {
    const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
    const adb = sdk ? path.join(sdk, 'platform-tools/adb') : 'adb';
    const devices = run(adb, ['devices'])
      .split('\n')
      .slice(1)
      .filter((line) => /\tdevice$/.test(line))
      .map((line) => line.split('\t')[0]);
    if (devices.length !== 1)
      throw Error(
        'Start a dedicated Android emulator and provide --udid when more than one device is connected',
      );
    udid = devices[0];
  }
  report.udid = udid;
  if (platform === 'android') {
    report.deviceKind =
      run(adb, ['-s', udid, 'shell', 'getprop', 'ro.kernel.qemu']) === '1'
        ? 'emulator'
        : 'physical';
    if (!sdk) throw Error('Set ANDROID_HOME to verify the actual APK package before installation');
    const buildTools = path.join(sdk, 'build-tools');
    const aapt = readdirSync(buildTools)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((version) =>
        path.join(buildTools, version, process.platform === 'win32' ? 'aapt.exe' : 'aapt'),
      )
      .find(existsSync);
    if (!aapt) throw Error('Install Android SDK build-tools to verify the actual APK package');
    report.androidPackage = assertAndroidTestPackage({
      badging: run(aapt, ['dump', 'badging', appPath]),
      expectedAppId: appId,
      baseAppId,
      isEmulator: report.deviceKind === 'emulator',
    });
  }
  report.phase = 'install-launch';
  if (platform === 'android') {
    // adb can list a device before Android has finished booting and before
    // PackageManager can install the application or UiAutomator2 server.
    await waitFor(
      () =>
        run(adb, ['-s', udid, 'shell', 'getprop', 'sys.boot_completed']) === '1' &&
        run(adb, ['-s', udid, 'shell', 'pm', 'path', 'android']).startsWith('package:'),
      120000,
      'Android must finish booting with PackageManager ready before installation',
    );
    if (report.deviceKind === 'emulator') {
      airplaneMode = run(adb, [
        '-s',
        udid,
        'shell',
        'settings',
        'get',
        'global',
        'airplane_mode_on',
      ]);
      run(adb, ['-s', udid, 'shell', 'cmd', 'connectivity', 'airplane-mode', 'enable']);
      report.offline = {
        airplaneMode: true,
        note: 'Installed application launches and plays with Android airplane mode enabled',
      };
    } else {
      report.offline = {
        localBundleOriginVerified: true,
        airplaneMode: false,
        note: 'Physical device connectivity is preserved, including wireless ADB; no offline runtime claim',
      };
    }
  } else {
    report.offline = {
      localBundleOriginVerified: true,
      airplaneMode: false,
      note: 'iOS Simulator has no airplane-mode radio; verify bundled local code and local image requests',
    };
  }
  if (platform === 'ios') {
    // Remove only this app's data, not the entire simulator and WDA install.
    spawnSync('xcrun', ['simctl', 'uninstall', udid, appId], { encoding: 'utf8' });
  }
  log(`Installing and launching ${appPath} on ${udid}`);
  if (platform === 'ios') {
    // Launch the clean installed app independently before XCUITest attaches.
    // Later application restarts stay within WDA so it tracks the current PID.
    run('xcrun', ['simctl', 'install', udid, appPath]);
    const launchStarted = performance.now();
    const stderrPath = path.join(output, 'ios.stderr.log');
    const launched = run('xcrun', [
      'simctl',
      'launch',
      `--stdout=${path.join(output, 'ios.stdout.log')}`,
      `--stderr=${stderrPath}`,
      udid,
      appId,
    ]);
    const processId = iosLaunchProcessId(launched);
    report.phase = 'independent-startup';
    report.initialLaunch = { processId, stderrPath, ready: false };
    await waitFor(
      () =>
        existsSync(stderrPath) &&
        iosInitialScreenReady(readFileSync(stderrPath, 'utf8'), processId),
      45000,
      'iOS must finish its independent first screen before XCUITest attaches',
    );
    Object.assign(report.initialLaunch, {
      ready: true,
      readyAt: new Date().toISOString(),
      waitMs: Math.round(performance.now() - launchStarted),
    });
    log(`Independent iOS first screen ready for PID ${processId}`);
    report.phase = 'install-launch';
  }
  report.phase = 'appium-start';
  if (!options.server) {
    const binary = path.join(root, '.artifacts/native-tools/node_modules/appium/build/lib/main.js');
    if (!existsSync(binary))
      throw Error('Install native E2E tools first: node scripts/native-e2e-setup.mjs');
    const { createWriteStream } = await import('node:fs');
    serverStream = createWriteStream(path.join(output, 'appium.log'));
    server = spawn(
      process.execPath,
      [binary, ...nativeServerArguments(platform, new URL(serverUrl).port)],
      {
        cwd: root,
        env: {
          ...process.env,
          APPIUM_HOME: path.join(root, '.artifacts/native-tools/appium-home'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    server.stdout.pipe(serverStream);
    server.stderr.pipe(serverStream);
    await waitFor(
      () => request('GET', '/status', undefined, 1000),
      30000,
      'Appium server did not start',
    );
    report.testServiceReadyAt = new Date().toISOString();
  }
  report.phase = 'install-launch';
  const caps = {
    platformName: platform === 'ios' ? 'iOS' : 'Android',
    'appium:automationName': platform === 'ios' ? 'XCUITest' : 'UiAutomator2',
    'appium:udid': udid,
    'appium:app': appPath,
    'appium:newCommandTimeout': 180,
    'appium:fullReset': platform === 'android',
    ...(platform === 'ios'
      ? {
          // The clean install above already removed preferences. Preserve this
          // independently launched process while WDA establishes its session.
          'appium:autoLaunch': false,
          'appium:noReset': true,
          ...(options['driver-port']
            ? {
                'appium:wdaLocalPort': Number(options['driver-port']),
                'appium:wdaRemotePort': Number(options['driver-port']),
              }
            : {}),
          'appium:wdaLaunchTimeout': 240000,
          'appium:waitForQuiescence': false,
          'appium:waitForIdleTimeout': 0,
          'appium:webviewConnectTimeout': 30000,
          'appium:includeSafariInWebviews': false,
          'appium:additionalWebviewBundleIds': ['process-App'],
        }
      : {
          // Fresh emulator services can still initialize after boot_completed.
          // Keep driver setup deadlines separate from all gameplay assertions.
          'appium:adbExecTimeout': 60000,
          ...(options['adb-port'] ? { 'appium:adbPort': Number(options['adb-port']) } : {}),
          'appium:uiautomator2ServerLaunchTimeout': 120000,
          ...(options['driver-port']
            ? { 'appium:systemPort': Number(options['driver-port']) }
            : {}),
          'appium:appPackage': appId,
          'appium:ensureWebviewsHavePages': true,
          'appium:enableWebviewDetailsCollection': true,
          'appium:webviewDevtoolsPort': androidDevtoolsPort,
          'appium:chromedriverPort': androidDevtoolsPort + 101,
          'appium:chromedriverAutodownload': true,
        }),
  };
  sessionCapabilities = caps;
  const created = await request(
    'POST',
    '/session',
    { capabilities: { alwaysMatch: caps, firstMatch: [{}] } },
    360000,
  );
  session = created.sessionId;
  report.capabilities = created.capabilities;
  if (platform === 'ios') {
    report.phase = 'native-touch';
    report.nativeTouch = await prepareNativeTouch(command, platform);
  }
  report.phase = 'webview-attach';
  // WDA startup can foreground its runner after the initial simctl launch.
  // Restore the tested app before looking for an actionable native screen.
  if (platform === 'ios') await command('POST', '/appium/device/activate_app', { appId });
  await attachWebview();
  // Keep Android's default startup settling until Accessibility and the
  // actionable WebView exist; only then shorten the animated-screen idle wait.
  if (platform === 'android') report.nativeTouch = await prepareNativeTouch(command, platform);
  await command('POST', '/timeouts', { script: 30000 });
  // XCUITest does not resolve Promise results from execute/sync. The standard
  // async callback reads the metadata from the installed app on both drivers.
  report.build = await command('POST', '/execute/async', {
    script: `const done = arguments[arguments.length - 1];
      fetch('./build-info.json').then(response => {
        if (!response.ok) throw Error('build-info HTTP ' + response.status);
        return response.json();
      }).then(done, error => done({ error: error.message }));`,
    args: [],
  });
  assert.ok(
    report.build.sourceDigest && !report.build.error,
    'Installed build metadata is required',
  );
  assert.equal(report.build.sourceDigest, embeddedBuild.sourceDigest);
  report.phase = 'scenarios';
  report.scenarios = await nativeScenarios({
    platform,
    record: (entry) => report.scenarios.push(entry),
    evaluate,
    state,
    click,
    nativeTap,
    nativeHold,
    select,
    visible,
    waitFor,
    screenshot,
    back,
    comparePage: (name, selectors) =>
      compareNativePage({ root, output, evaluate, screenshot }, name, selectors),
    relaunch,
    activate,
    background,
    nativeState: queryAppState,
    rotate,
    sleep,
    log,
    waitHero: () =>
      waitFor(
        async () => {
          const game = await state();
          return game.phase !== 'done' && game.legal.enabled;
        },
        90000,
        'Hero did not receive a legal turn',
      ),
  });
  report.status = 'passed';
  report.phase = 'complete';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || String(error);
  if (error.reviewDiagnostics) report.reviewDiagnostics = error.reviewDiagnostics;
  console.error(report.error);
  if (session) {
    try {
      await screenshot('failure');
    } catch {}
  }
  process.exitCode = 1;
} finally {
  if (session) {
    try {
      await request('DELETE', `/session/${session}`, undefined, 20000);
    } catch {}
  }
  if (server) {
    report.serverCleanup = stopOwnedServer(server);
    await sleep(300);
  }
  serverStream?.end();
  if (platform === 'android' && airplaneMode !== undefined) {
    try {
      run(adb, [
        '-s',
        udid,
        'shell',
        'cmd',
        'connectivity',
        'airplane-mode',
        airplaneMode === '1' ? 'enable' : 'disable',
      ]);
    } catch {}
  }
  if (ownedSimulator) {
    try {
      run('xcrun', ['simctl', 'shutdown', udid]);
    } catch {}
  }
  report.completedAt = new Date().toISOString();
  writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  log(`${report.status}: ${path.join(output, 'report.json')}`);
}

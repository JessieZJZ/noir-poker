import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeScenarios } from '../tests/native/scenarios.mjs';
import { sourceDigest } from './mobile-lib.mjs';
import { verifyBundledArtifact } from './bundled-assets.mjs';
import { restoreWebviewContext } from './native-context.mjs';
import { captureNativeScreenshot } from './native-screenshot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const platform = args.shift();
if (!['ios', 'android'].includes(platform))
  throw Error(
    'Usage: node scripts/native-e2e.mjs ios|android [--app PATH] [--udid ID] [--output PATH] [--server URL]',
  );
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--app', '--udid', '--output', '--server'].includes(args[i]) || !args[i + 1])
    throw Error(`Unknown or incomplete option: ${args[i]}`);
  options[args[i].slice(2)] = args[i + 1];
}
const appId = JSON.parse(readFileSync(path.join(root, 'capacitor.config.json'), 'utf8')).appId;
const appPath = path.resolve(
  root,
  options.app ??
    (platform === 'ios'
      ? '.artifacts/mobile/ios/Build/Products/Debug-iphonesimulator/App.app'
      : '.artifacts/mobile/noir-poker-debug.apk'),
);
if (!existsSync(appPath)) throw Error(`Build the actual ${platform} app first; missing ${appPath}`);
const output = path.resolve(root, options.output ?? `.artifacts/native-e2e/${platform}`);
mkdirSync(output, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = (binary, argv) => {
  const value = spawnSync(binary, argv, { encoding: 'utf8', cwd: root, timeout: 120000 });
  if (value.status !== 0)
    throw Error(
      `${binary} ${argv.join(' ')} failed: ${value.stderr || value.error || value.stdout}`,
    );
  return value.stdout.trim();
};
let ownedSimulator = false;
let udid = options.udid ?? process.env[`NOIR_${platform.toUpperCase()}_UDID`];
if (platform === 'ios' && !udid) {
  const inventory = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', 'available', '-j']));
  const existing = Object.entries(inventory.devices)
    .flatMap(([runtime, devices]) => devices.map((device) => ({ ...device, runtime })))
    .find((device) => device.name === 'Noir Poker E2E');
  if (existing) udid = existing.udid;
  else {
    const runtimes = JSON.parse(run('xcrun', ['simctl', 'list', 'runtimes', '-j']))
      .runtimes.filter((runtime) => runtime.isAvailable && runtime.identifier.includes('iOS'))
      .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
    const phones = JSON.parse(
      run('xcrun', ['simctl', 'list', 'devicetypes', '-j']),
    ).devicetypes.filter((device) => device.name.startsWith('iPhone'));
    assert.ok(runtimes.length && phones.length, 'Install an iOS Simulator runtime in Xcode');
    udid = run('xcrun', [
      'simctl',
      'create',
      'Noir Poker E2E',
      phones[0].identifier,
      runtimes[0].identifier,
    ]);
  }
  const state = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', '-j']));
  if (
    !Object.values(state.devices)
      .flat()
      .find((device) => device.udid === udid && device.state === 'Booted')
  ) {
    run('xcrun', ['simctl', 'boot', udid]);
    run('xcrun', ['simctl', 'bootstatus', udid, '-b']);
    ownedSimulator = true;
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
  automation: 'Appium installed native app with WebView and native lifecycle contexts',
};
const log = (message) => console.log(`[native-e2e:${platform}] ${message}`);
let server;
let serverStream;
let session;
let airplaneMode;
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const adb = sdk ? path.join(sdk, 'platform-tools/adb') : 'adb';
const serverUrl = options.server ?? `http://127.0.0.1:${platform === 'ios' ? 4725 : 4727}`;
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
      if (error.nativeLayoutFailure) throw error;
      lastError = error;
    }
    await sleep(300);
  }
  throw Error(`${message}${lastError ? `: ${lastError.message}` : ''}`);
}
const command = (method, endpoint, body) => request(method, `/session/${session}${endpoint}`, body);
let webContext;
async function restoreWebview(reason) {
  webContext = await restoreWebviewContext(command, {
    appId,
    platform,
    preferred: webContext,
    onAttempt: (attempt) => (report.contextRestores ??= []).push({ reason, ...attempt }),
  });
}
async function attachWebview() {
  // Wait for the real document before attaching WebKit. Attaching during the
  // initial blank-page navigation can pause WebKit before the game loads.
  await waitFor(
    async () => {
      const source = await command('GET', '/source');
      return /XCUIElementTypeButton|android\.widget\.Button/.test(source);
    },
    45000,
    'Native app must render an actionable screen before WebView attachment',
  );
  await restoreWebview('attach');
  await waitFor(
    () => evaluate(() => Boolean(window.noir?.getState())),
    30000,
    'Bundled game did not initialize',
  );
}
async function evaluate(fn, ...argv) {
  return command('POST', '/execute/sync', {
    script: `return (${fn.toString()})(...arguments)`,
    args: argv,
  });
}
let foldedLayout;
const state = async () => {
  const game = await evaluate(() => window.noir.getState());
  if (
    foldedLayout &&
    (game.hand !== foldedLayout.hand || game.replayAttempt !== foldedLayout.replayAttempt)
  )
    foldedLayout = undefined;
  if (foldedLayout && game.phase === 'done' && !foldedLayout.settlementChecked) {
    await assertActionLayout('settled', foldedLayout.geometry);
    foldedLayout.settlementChecked = true;
  }
  return game;
};

async function assertActionLayout(stage, reference) {
  let geometry;
  try {
    geometry = await waitFor(
      async () => {
        const value = await evaluate(() => {
          const rect = (element) => {
            const box = element.getBoundingClientRect();
            return {
              left: box.left,
              right: box.right,
              top: box.top,
              bottom: box.bottom,
              width: box.width,
              height: box.height,
            };
          };
          const isVisible = (element) =>
            !element.hidden &&
            getComputedStyle(element).visibility !== 'hidden' &&
            element.getClientRects().length &&
            element.getBoundingClientRect().height > 0;
          const surface = document.querySelector('.game-surface');
          const live = ['ready', 'waiting'].includes(surface.dataset.actionState);
          const panel = surface.querySelector(live ? '.action-buttons' : '#action-panel');
          const panelStyle = getComputedStyle(panel);
          const panelBox = rect(panel);
          const buttons = [...panel.querySelectorAll(live ? 'button' : ':scope > button')]
            .filter(isVisible)
            .map((button) => {
              const lineCenters = [];
              const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
              while (walker.nextNode()) {
                if (!walker.currentNode.textContent.trim()) continue;
                const range = document.createRange();
                range.selectNodeContents(walker.currentNode);
                for (const line of range.getClientRects())
                  if (line.width > 1 && line.height > 1)
                    lineCenters.push((line.top + line.bottom) / 2);
              }
              return {
                id: button.id,
                ...rect(button),
                text: button.textContent.trim(),
                wrapped:
                  lineCenters.length > 0 && Math.max(...lineCenters) - Math.min(...lineCenters) > 8,
                clipped: button.scrollWidth > button.clientWidth + 1,
              };
            });
          const table = rect(surface.querySelector('.table-viewport'));
          const game = window.noir.getState();
          return {
            hand: game.hand,
            replayAttempt: game.replayAttempt,
            phase: game.phase,
            actionState: surface.dataset.actionState,
            screen: { width: innerWidth, height: innerHeight },
            safeBottom:
              parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue(
                  '--safe-area-inset-bottom',
                ),
              ) || 0,
            table: { ...table, left: table.left + scrollX, top: table.top + scrollY },
            row: {
              ...panelBox,
              left: panelBox.left + parseFloat(panelStyle.paddingLeft),
              right: panelBox.right - parseFloat(panelStyle.paddingRight),
            },
            buttons,
          };
        });
        assert.ok(value.buttons.length > 0, `${stage}: the action row must contain buttons`);
        const first = value.buttons[0];
        for (const [index, button] of value.buttons.entries()) {
          assert.ok(
            Math.abs(button.top - first.top) <= 1 && Math.abs(button.bottom - first.bottom) <= 1,
            `${stage}: ${button.id} must stay on the same action row`,
          );
          assert.ok(
            Math.abs(button.width - first.width) <= 1,
            `${stage}: ${button.id} must have equal row width`,
          );
          assert.ok(
            button.height >= 44 && !button.wrapped && !button.clipped,
            `${stage}: ${button.id} must retain an unclipped single-line label and 44px target`,
          );
          assert.ok(
            button.left >= value.row.left - 1 &&
              button.right <= value.row.right + 1 &&
              button.top >= 0 &&
              button.bottom <= value.screen.height - value.safeBottom + 1,
            `${stage}: ${button.id} must fit its panel and the visible native screen`,
          );
          if (index)
            assert.ok(
              button.left >= value.buttons[index - 1].right,
              `${stage}: action buttons must not overlap`,
            );
        }
        assert.ok(
          Math.abs(first.left - value.row.left) <= 1 &&
            Math.abs(value.buttons.at(-1).right - value.row.right) <= 1,
          `${stage}: all visible buttons must fill the available action row`,
        );
        if (reference)
          for (const dimension of ['left', 'top', 'width', 'height'])
            assert.ok(
              Math.abs(value.table[dimension] - reference.table[dimension]) <= 1,
              `${stage}: table ${dimension} must remain stable across fold and settlement`,
            );
        return value;
      },
      5000,
      `Installed native action layout failed at ${stage}`,
    );
  } catch (error) {
    error.nativeLayoutFailure = true;
    throw error;
  }
  (report.actionLayouts ??= []).push({ stage, ...geometry });
  return geometry;
}
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
  await evaluate(
    (value) =>
      document
        .querySelector(value)
        .scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }),
    selector,
  );
  const element = await command('POST', '/element', { using: 'css selector', value: selector });
  const id = element['element-6066-11e4-a52e-4f735466cecf'] ?? element.ELEMENT;
  if (selector === '#fold-button') {
    const geometry = await assertActionLayout('before-fold');
    foldedLayout = {
      hand: geometry.hand,
      replayAttempt: geometry.replayAttempt,
      geometry,
      settlementChecked: false,
    };
  }
  await command('POST', `/element/${id}/click`, {});
  if (foldedLayout && ['#fold-button', '#continue-deal-button'].includes(selector))
    await assertActionLayout(
      selector === '#fold-button' ? 'after-fold' : 'after-continue-deal',
      foldedLayout.geometry,
    );
}
async function select(selector, value) {
  // HTML select options are operated via the standard WebDriver option click;
  // the test does not mutate game state or use the test development server.
  if (
    await evaluate(
      (selector, value) => document.querySelector(selector).value === value,
      selector,
      value,
    )
  )
    return;
  await evaluate(
    (selector) =>
      document
        .querySelector(selector)
        .scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }),
    selector,
  );
  const element = await command('POST', '/element', {
    using: 'css selector',
    value: `${selector} option[value="${value}"]`,
  });
  const id = element['element-6066-11e4-a52e-4f735466cecf'] ?? element.ELEMENT;
  await command('POST', `/element/${id}/click`, {});
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
async function screenshot(name) {
  // Diagnostic failure screenshots retain the raw native screen even when
  // the WebView itself cannot paint. Successful scenario evidence must paint.
  await captureNativeScreenshot(command, {
    waitForPaint: Boolean(webContext) && name !== 'failure',
    expected:
      name === 'raise-call-fold-and-settlement'
        ? { phase: 'done', actionState: 'settled' }
        : name === 'retry-original-deal-and-next-hand'
          ? { heroCards: 2 }
          : name.startsWith('settlement-decision-review')
            ? { reviewOpen: name.endsWith('-open') }
            : {},
    onPaint: (paint) => (report.screenshotPaints ??= []).push({ name, ...paint }),
    save: (png) => writeFileSync(path.join(output, `${name}.png`), Buffer.from(png, 'base64')),
    restore: webContext ? () => restoreWebview(`screenshot:${name}`) : undefined,
  });
}
async function activate() {
  await command('POST', '/context', { name: 'NATIVE_APP' });
  await command('POST', '/appium/device/activate_app', { appId });
  await attachWebview();
}
async function relaunch() {
  await command('POST', '/context', { name: 'NATIVE_APP' });
  await command('POST', '/appium/device/terminate_app', { appId });
  await command('POST', '/appium/device/activate_app', { appId });
  await attachWebview();
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
try {
  if (!options.server) {
    const binary = path.join(root, '.artifacts/native-tools/node_modules/appium/build/lib/main.js');
    if (!existsSync(binary))
      throw Error('Install native E2E tools first: node scripts/native-e2e-setup.mjs');
    const { createWriteStream } = await import('node:fs');
    serverStream = createWriteStream(path.join(output, 'appium.log'));
    server = spawn(
      process.execPath,
      [
        binary,
        '--address',
        '127.0.0.1',
        '--port',
        new URL(serverUrl).port,
        '--allow-insecure',
        'uiautomator2:chromedriver_autodownload',
      ],
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
  }
  if (platform === 'android') {
    airplaneMode = run(adb, ['-s', udid, 'shell', 'settings', 'get', 'global', 'airplane_mode_on']);
    run(adb, ['-s', udid, 'shell', 'cmd', 'connectivity', 'airplane-mode', 'enable']);
    report.offline = {
      airplaneMode: true,
      note: 'Installed application launches and plays with Android airplane mode enabled',
    };
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
  const caps = {
    platformName: platform === 'ios' ? 'iOS' : 'Android',
    'appium:automationName': platform === 'ios' ? 'XCUITest' : 'UiAutomator2',
    'appium:udid': udid,
    'appium:app': appPath,
    'appium:newCommandTimeout': 180,
    'appium:fullReset': platform === 'android',
    ...(platform === 'ios'
      ? {
          'appium:wdaLaunchTimeout': 240000,
          'appium:waitForQuiescence': false,
          'appium:waitForIdleTimeout': 0,
          'appium:webviewConnectTimeout': 30000,
          'appium:includeSafariInWebviews': false,
          'appium:additionalWebviewBundleIds': ['process-App'],
        }
      : {
          'appium:appPackage': appId,
          // Cold CI emulators can take longer than the driver's 20s defaults
          // to install its automation server or execute an ADB command.
          'appium:uiautomator2ServerInstallTimeout': 120000,
          'appium:adbExecTimeout': 120000,
          'appium:ensureWebviewsHavePages': true,
          'appium:chromedriverAutodownload': true,
        }),
  };
  const created = await request(
    'POST',
    '/session',
    { capabilities: { alwaysMatch: caps, firstMatch: [{}] } },
    360000,
  );
  session = created.sessionId;
  report.capabilities = created.capabilities;
  if (platform === 'ios') {
    // Launch through Simulator's application service after WDA session setup.
    // This avoids Xcode test-launch suspension of the initial WebKit navigation.
    spawnSync('xcrun', ['simctl', 'terminate', udid, appId], { encoding: 'utf8' });
    run('xcrun', ['simctl', 'launch', udid, appId]);
  }
  await attachWebview();
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
  report.scenarios = await nativeScenarios({
    record: (entry) => report.scenarios.push(entry),
    evaluate,
    state,
    click,
    select,
    visible,
    waitFor,
    screenshot,
    relaunch,
    activate,
    background,
    nativeState: queryAppState,
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
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || String(error);
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
    server.kill('SIGTERM');
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

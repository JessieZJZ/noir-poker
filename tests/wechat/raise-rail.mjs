import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sliderRaiseTo, RAISE_SLIDER_MAX } from '../../src/ui/bet-sizing.js';
const require = createRequire(path.join(process.cwd(), '.artifacts/wechat-tools/package.json'));
const mini = await require('miniprogram-automator').connect({ wsEndpoint: process.argv[2] });
const output = path.resolve(process.argv[3] || '.artifacts/wechat-raise-rail');
await mkdir(output, { recursive: true });
// Automator Page.callMethod uses a different receiver in current DevTools.
// Invoke the real page handler with its own Page instance, as user events do.
const invoke = (method, argument) =>
  mini.evaluate(
    ({ method, argument }) => {
      const page = getCurrentPages().at(-1);
      page[method](argument);
      return true;
    },
    { method, argument },
  );

const report = { status: 'running', platform: 'WeChat DevTools', checks: [] };
async function waitForRaise(page, amount) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const state = await page.data();
    if (state.raiseTo === amount) return state;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal((await page.data()).raiseTo, amount);
}
try {
  report.build = JSON.parse(await readFile('.artifacts/wechat/build-info.json', 'utf8'));
  report.device = await mini.evaluate(() => {
    const { model, platform } = wx.getDeviceInfo();
    const { windowWidth, windowHeight, pixelRatio } = wx.getWindowInfo();
    return { model, platform, windowWidth, windowHeight, pixelRatio };
  });
  let page = await mini.currentPage();
  await invoke('closeSettings');
  for (let i = 0; i < 150; i++) {
    const state = await page.data();
    if (state.canRaise) break;
    if (state.waitingForSeat) await (await page.$('#join-table-button')).tap();
    else if (state.done) await invoke('nextHand');
    else if (!state.canAct) await invoke('finishHand');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const before = await page.data();
  assert.equal(before.canRaise, true);
  report.viewport = { width: before.windowWidth, height: before.windowHeight };
  const view = {
    currentBet: before.currentBet,
    pot: before.potAmount,
    legal: {
      enabled: true,
      canRaise: true,
      minRaiseTo: before.minRaise,
      maxRaiseTo: before.maxRaise,
      callAmount: before.callAmount,
      chipUnit: before.chipUnit,
    },
  };
  await invoke('preset', { currentTarget: { dataset: { preset: 'min' } } });
  const track = await page.$('#raise-track');
  assert.ok(track);
  const offset = await track.offset(),
    size = await track.size();
  // Native-component event contract; real-device gestures are a separate
  // acceptance layer (DevTools touch injection cannot prove phone input).
  await track.trigger('changing', { value: 318725 });
  const preview = await page.data();
  assert.equal(preview.raiseTo, before.minRaise);
  assert.equal(preview.raisePreviewPosition, 318725);
  await track.trigger('change', { value: 318725 });
  const selected = await waitForRaise(page, sliderRaiseTo(view, 318725));
  assert.equal(selected.sliderValue, 318725);
  await invoke('cancelRaise');
  assert.equal((await page.data()).sliderValue, 318725);
  await track.trigger('change', { value: RAISE_SLIDER_MAX / 2 });
  const middle = await waitForRaise(page, sliderRaiseTo(view, RAISE_SLIDER_MAX / 2));
  await track.trigger('change', { value: RAISE_SLIDER_MAX });
  await waitForRaise(page, before.maxRaise);
  report.checks.push({
    name: 'native-component-preview-commit-and-stable-release',
    scope: 'DevTools component events; physical phone drag is not verified here',
    evidence: {
      offset,
      size,
      min: before.minRaise,
      mid: middle.raiseTo,
      max: before.maxRaise,
      selectedPosition: selected.sliderValue,
    },
  });
  await mini.screenshot({ path: path.join(output, 'rail-all-in.png') });
  await mini.evaluate(() => {
    const page = getCurrentPages().at(-1);
    const original = wx.vibrateShort;
    getApp().__railProbe = { original, wasEnabled: page.data.settings.vibration, pulses: [] };
    page._controller.setPreference('vibration', false);
    wx.vibrateShort = (options) => {
      getApp().__railProbe.pulses.push(options.type);
      return original.call(wx, options);
    };
    page._controller.setPreference('vibration', true);
    page._controller.setPreference('vibration', true);
  });
  const pulses = await mini.evaluate(() => getApp().__railProbe.pulses);
  assert.deepEqual(pulses, ['light']);
  report.checks.push({
    name: 'one-enable-preview-api-dispatch',
    pulses,
    scope: 'Device motor feel requires a physical device',
  });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || String(error);
  process.exitCode = 1;
  try {
    await mini.screenshot({ path: path.join(output, 'failure.png') });
  } catch {}
} finally {
  try {
    await mini.evaluate(() => {
      const app = getApp(),
        probe = app.__railProbe,
        page = getCurrentPages().at(-1);
      if (probe) {
        wx.vibrateShort = probe.original;
        page._controller.setPreference('vibration', probe.wasEnabled);
        delete app.__railProbe;
      }
      page?._controller?.preset('min');
    });
  } catch {}
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await mini.disconnect();
}
console.log(JSON.stringify({ status: report.status, checks: report.checks, error: report.error }));

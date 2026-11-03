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
  // Another route probe may leave records/history on top. Start from the
  // real live Page before invoking its handlers or dispatching rail touches.
  await mini.reLaunch('/pages/table/table');
  let page = await mini.currentPage();
  assert.equal(page.path, 'pages/table/table');
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
  assert.ok(before.raiseControl, 'DevTools must run the render-layer rail build');
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
  await waitForRaise(page, before.minRaise);
  await mini.pageScrollTo(0);
  const track = await page.$('#raise-track'),
    hit = await page.$('#raise-hit'),
    thumb = await page.$('#raise-thumb');
  assert.ok(track && hit && thumb);
  assert.equal(await page.$('slider'), null, 'there must be only one custom rail');
  const offset = await track.offset(),
    size = await track.size();
  const touch = (ratio) => ({
    identifier: 7,
    clientX: offset.left + size.width * ratio,
    clientY: offset.top + size.height / 2,
    pageX: offset.left + size.width * ratio,
    pageY: offset.top + size.height / 2,
  });
  async function assertThumb(ratio) {
    const deadline = Date.now() + 5000;
    let center;
    do {
      const a = await thumb.offset(),
        b = await thumb.size();
      center = a.left + b.width / 2;
      if (Math.abs(center - (offset.left + size.width * ratio)) <= 1.2) return center;
      await new Promise((r) => setTimeout(r, 30));
    } while (Date.now() < deadline);
    assert.ok(false, `Thumb ${center} must follow touch ${offset.left + size.width * ratio}`);
  }
  const committed = await page.data();
  await hit.touchstart({ touches: [touch(0.2)] });
  await assertThumb(0.2);
  await hit.touchmove({ touches: [touch(0.731234)] });
  await assertThumb(0.731234);
  await mini.evaluate(() => getCurrentPages().at(-1)._controller.show());
  await assertThumb(0.731234);
  assert.equal(
    (await page.data()).sliderValue,
    committed.sliderValue,
    'movement does not echo the committed position',
  );
  await hit.touchend({ touches: [], changeTouches: [touch(0.731234)] });
  const selected = await waitForRaise(page, sliderRaiseTo(view, 731234));
  assert.equal(selected.sliderValue, 731234);
  await assertThumb(0.731234);
  await hit.tap();
  const middle = await waitForRaise(page, sliderRaiseTo(view, RAISE_SLIDER_MAX / 2));
  await assertThumb(0.5);
  await hit.touchstart({ touches: [touch(0.9)] });
  await hit.touchmove({ touches: [touch(1)] });
  await assertThumb(1);
  await hit.touchend({ touches: [], changeTouches: [touch(1)] });
  await waitForRaise(page, before.maxRaise);
  report.checks.push({
    name: 'render-layer-tap-drag-redraw-and-stable-release',
    scope: 'DevTools dispatch through WXS/render layer; physical phone acceptance is separate',
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

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sliderRaiseTo, RAISE_SLIDER_MAX } from '../../src/ui/bet-sizing.js';
const require = createRequire(path.join(process.cwd(), '.artifacts/wechat-tools/package.json'));
const mini = await require('miniprogram-automator').connect({ wsEndpoint: process.argv[2] });
const output = path.resolve(process.argv[3] || '.artifacts/wechat-raise-rail');
await mkdir(output, { recursive: true });
const report = { status: 'running', platform: 'WeChat DevTools', checks: [] };
try {
  report.build = JSON.parse(await readFile('.artifacts/wechat/build-info.json', 'utf8'));
  let page = await mini.currentPage();
  for (let i = 0; i < 150; i++) {
    const state = await page.data();
    if (state.canRaise) break;
    if (state.waitingForSeat) await page.callMethod('joinTable');
    else if (state.done) await page.callMethod('nextHand');
    else if (!state.canAct) await page.callMethod('finishHand');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const before = await page.data();
  assert.equal(before.canRaise, true);
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
  await page.callMethod('preset', { currentTarget: { dataset: { preset: 'min' } } });
  const track = await page.$('#raise-track');
  assert.ok(track);
  const offset = await track.offset(),
    size = await track.size();
  const touch = (fraction) => ({
    identifier: 1,
    clientX: offset.left + size.width * fraction,
    clientY: offset.top + size.height / 2,
    pageX: offset.left + size.width * fraction,
    pageY: offset.top + size.height / 2,
  });
  await track.touchstart({ touches: [touch(0.25)] });
  await track.touchmove({ touches: [touch(0.5)] });
  const preview = await page.data();
  assert.equal(preview.raiseTo, before.minRaise);
  await track.touchend({ touches: [], changeTouches: [touch(0.5)] });
  const middle = await page.data();
  assert.equal(middle.raiseTo, sliderRaiseTo(view, RAISE_SLIDER_MAX / 2));
  await track.touchstart({ touches: [touch(0.75)] });
  await track.touchmove({ touches: [touch(1)] });
  await track.touchend({ touches: [], changeTouches: [touch(1)] });
  assert.equal((await page.data()).raiseTo, before.maxRaise);
  report.checks.push({
    name: 'whole-track-touch-drag-midpoint-and-all-in',
    evidence: { offset, size, min: before.minRaise, mid: middle.raiseTo, max: before.maxRaise },
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

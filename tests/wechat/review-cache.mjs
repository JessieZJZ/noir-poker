// Real-hand cache/worker lifecycle and a separately labelled settlement layout.
// Dedicated disposable DevTools project only: starts a six-seat practice session.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seatAtTable } from './seat.mjs';
import { heroValueGame } from '../fixtures/review-spots.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const output = path.resolve(process.argv[3] || '.artifacts/wechat-review-cache');
await mkdir(output, { recursive: true });
const mini = await require('miniprogram-automator').connect({ wsEndpoint: process.argv[2] });
const report = { status: 'running', platform: 'WeChat DevTools', exceptions: [] };
mini.on('exception', (error) => report.exceptions.push(error));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const wait = async (fn, label) => {
  const start = Date.now();
  while (!(await fn())) {
    assert.ok(Date.now() - start < 90000, label);
    await pause(100);
  }
};
let originalPresentation;
try {
  console.log('stage: build');
  report.build = JSON.parse(await readFile(path.join(root, '.artifacts/wechat/build-info.json')));
  console.log('stage: clear derived cache');
  await mini.evaluate(() => {
    wx.removeStorageSync('noir-review-cache-v1');
    return true;
  });
  console.log('stage: relaunch');
  await mini.reLaunch('/pages/table/table');
  await wait(
    () => mini.evaluate(() => !!getCurrentPages().at(-1)?._controller),
    'Table controller readiness',
  );
  await mini.evaluate(() => {
    const controller = getCurrentPages().at(-1)._controller;
    controller.setPreference('playerCount', 6);
    controller.reset();
    return true;
  });
  console.log('stage: finish real hand');
  let page = await seatAtTable(mini, { finished: true });
  for (let tries = 0; tries < 5; tries++) {
    const count = await mini.evaluate(
      () => getCurrentPages().at(-1)._controller.getGame().decisions.length,
    );
    if (count) break;
    await mini.evaluate(() => {
      getCurrentPages().at(-1).nextHand();
      return true;
    });
    page = await seatAtTable(mini, { finished: true });
  }
  report.decisions = await mini.evaluate(
    () => getCurrentPages().at(-1)._controller.getGame().decisions.length,
  );
  assert.ok(report.decisions > 0, 'Cold benchmark requires an actual hero decision, not a walk');
  console.log('stage: cold review');
  await mini.evaluate(() => {
    const page = getCurrentPages().at(-1);
    page.closeReview();
    wx.removeStorageSync('noir-review-cache-v1');
    const probe = (getApp().__cacheProbe = {
      original: wx.createWorker,
      created: 0,
      terminated: 0,
      stages: [],
    });
    wx.createWorker = function (...args) {
      const worker = probe.original.apply(this, args);
      probe.created++;
      const terminate = worker.terminate.bind(worker);
      worker.terminate = () => {
        probe.terminated++;
        return terminate();
      };
      return worker;
    };
    const update = page.updateReview.bind(page);
    page.updateReview = (value) => {
      probe.stages.push({ at: Date.now(), loading: value.loading, done: value.done });
      update(value);
    };
    probe.started = Date.now();
    page.openReview();
  });
  await wait(
    async () => !(await page.data()).reviewData.loading,
    'Cold real-hand analysis must finish',
  );
  report.cold = await mini.evaluate(() => {
    const p = getApp().__cacheProbe;
    return {
      elapsedMs: p.stages.at(-1).at - p.started,
      created: p.created,
      terminated: p.terminated,
      stages: p.stages,
    };
  });
  console.log('stage: warm review');
  assert.equal(report.cold.created, 1);
  assert.equal(report.cold.terminated, 1);
  const expected = (await page.data()).reviewData;
  await mini.evaluate(() => {
    const p = getCurrentPages().at(-1),
      probe = getApp().__cacheProbe;
    p.closeReview();
    probe.stages = [];
    probe.started = Date.now();
    p.openReview();
  });
  await wait(
    async () => !(await page.data()).reviewData.loading,
    'Warm real-hand review must finish',
  );
  assert.deepEqual((await page.data()).reviewData, expected);
  report.warm = await mini.evaluate(() => {
    const p = getApp().__cacheProbe;
    return { elapsedMs: p.stages.at(-1).at - p.started, created: p.created, stages: p.stages };
  });
  assert.equal(report.warm.created, 1);
  assert.equal(report.warm.stages.length, 1);
  assert.equal(report.warm.stages[0].loading, false);
  console.log('stage: audio recovery and records');
  report.audioRecovery = await mini.evaluate(() => {
    const page = getCurrentPages().at(-1);
    page.closeReview();
    page.stopSounds();
    delete page._audio;
    delete page._soundPool;
    page.onShow();
    const count = page._audio.length;
    page.preloadSounds();
    const unchanged = page._audio.length === count;
    page.openRecords();
    return { count, unchanged };
  });
  assert.ok(report.audioRecovery.count > 0 && report.audioRecovery.unchanged);
  await wait(
    async () => (await mini.currentPage())?.path === 'pages/records/records',
    'Record list opens after sound recovery',
  );
  await mini.navigateBack();
  await wait(
    async () => (await mini.currentPage())?.path === 'pages/table/table',
    'Table returns from record list',
  );
  page = await mini.currentPage();
  const id = await mini.evaluate(() => {
    const p = getCurrentPages().at(-1);
    p.closeReview();
    const controller = p._controller,
      game = controller.getGame();
    const attempt = controller
      .getRecordSummaries()
      .flatMap((s) => s.attempts)
      .filter((a) => a.status === 'completed')
      .map((a) => controller.getRecord(a.id))
      .find(
        (a) =>
          a?.snapshot &&
          a.snapshot.hand === game.hand &&
          JSON.stringify(a.snapshot.decisions) === JSON.stringify(game.decisions) &&
          JSON.stringify(a.snapshot.players[0].hole) === JSON.stringify(game.players[0].hole),
      );
    if (!attempt) throw Error('Current real hand must have a matching restorable archive');
    return attempt.id;
  });
  console.log('stage: history');
  await mini.navigateTo(`/pages/history/history?id=${encodeURIComponent(id)}`);
  console.log('stage: history opened');
  await wait(
    async () => mini.evaluate(() => !!getCurrentPages().at(-1)?._controller),
    'Historical controller readiness',
  );
  page = await mini.currentPage();
  await mini.evaluate(() => getCurrentPages().at(-1).openReview());
  await wait(async () => !(await page.data()).reviewData.loading, 'Historical cached review');
  assert.deepEqual((await page.data()).reviewData, expected);
  assert.equal(await mini.evaluate(() => getApp().__cacheProbe.created), 1);
  report.history = { matched: true, workersCreated: 1 };
  await mini.screenshot({ path: path.join(output, 'history-cached-review.png') });
  await mini.evaluate(() => getCurrentPages().at(-1).closeReview());
  await mini.navigateBack();
  page = await mini.currentPage();
  console.log('stage: joined settlement');
  const current = await page.data();
  originalPresentation = {
    showdown: current.showdown,
    hasShowdown: current.hasShowdown,
    showdownContext: current.showdownContext,
  };
  const { showdownPresentation } = require(
    path.join(root, '.artifacts/wechat/pages/table/presentation.js'),
  );
  const rows = showdownPresentation(heroValueGame('overpair'), []);
  await page.setData({ showdown: [], hasShowdown: false });
  await page.setData({
    showdown: rows,
    hasShowdown: true,
    showdownContext: `${rows.length} 人参与摊牌`,
  });
  await wait(
    async () => (await page.$$('.showdown-player')).length > 0,
    'Constructed showdown must render',
  );
  const geometry = {};
  for (const selector of ['.table-panel', '.game-shell', '.showdown-stage']) {
    const el = await page.$(selector);
    geometry[selector] = {
      ...(await el.offset()),
      ...(await el.size()),
      radius: await el.style('border-bottom-left-radius'),
    };
  }
  const table = geometry['.game-shell'],
    showdown = geometry['.showdown-stage'],
    panel = geometry['.table-panel'];
  assert.ok(Math.abs(table.top + table.height - showdown.top) <= 1, JSON.stringify(geometry));
  assert.equal(table.radius, '0px');
  assert.equal(showdown.radius, '0px');
  assert.ok(Math.abs(table.left - showdown.left) <= 1);
  assert.ok(Math.abs(panel.width - showdown.width - 2) <= 1);
  report.layout = {
    scope:
      'Controlled display from the built showdown presenter; live game unchanged, not a gameplay-frequency test',
    geometry,
  };
  await mini.pageScrollTo(Math.max(0, showdown.top - 220));
  await pause(200);
  await mini.screenshot({ path: path.join(output, 'joined-showdown.png') });
  assert.deepEqual(report.exceptions, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  throw error;
} finally {
  if (originalPresentation) {
    try {
      await mini.evaluate((original) => {
        getCurrentPages().at(-1).setData(original);
        return true;
      }, originalPresentation);
    } catch (error) {
      report.restoreError = error.message;
    }
  }
  try {
    await mini.evaluate(() => {
      const probe = getApp().__cacheProbe;
      if (probe) wx.createWorker = probe.original;
      delete getApp().__cacheProbe;
      return true;
    });
  } catch (error) {
    report.cleanupError = error.message;
  }
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await mini.disconnect();
}
console.log(JSON.stringify(report));

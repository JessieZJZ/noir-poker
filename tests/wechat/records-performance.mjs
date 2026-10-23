// Runs against existing local practice records. It neither clears storage nor
// replaces gameplay with fixtures; only view updates are instrumented.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const automator = require('miniprogram-automator');
const output = path.resolve(process.argv[3] || '.artifacts/records-performance/wechat');
await mkdir(output, { recursive: true });
const report = {
  status: 'running',
  platform: 'WeChat DevTools simulator',
  checks: [],
  exceptions: [],
};
let mini, page;
async function route(expected) {
  for (let i = 0; i < 600; i++) {
    page = await mini.currentPage();
    if (page?.path === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error(`Expected ${expected}, got ${page?.path}`);
}
async function armReturnMeasurement() {
  await mini.evaluate(() => {
    const live = getCurrentPages()[0];
    live._recordsPerfReturnPatches = [];
    live._recordsPerfReturnOriginal = live.setData;
    live.setData = function (patch, callback) {
      live._recordsPerfReturnPatches.push(Object.keys(patch));
      return live._recordsPerfReturnOriginal.call(this, patch, callback);
    };
    return true;
  });
}
async function readReturnMeasurement() {
  await page.waitFor(200);
  const metrics = await mini.evaluate(() => {
    const live = getCurrentPages()[0];
    const patches = live._recordsPerfReturnPatches;
    live.setData = live._recordsPerfReturnOriginal;
    delete live._recordsPerfReturnOriginal;
    delete live._recordsPerfReturnPatches;
    return {
      patches,
      geometryWrites: patches
        .flat()
        .filter((key) =>
          /^(?:tableHeight|arenaHeight|arenaScale|arenaWidth|windowHeight|windowWidth|textStyle)$/.test(
            key,
          ),
        ),
    };
  });
  assert.deepEqual(metrics.geometryWrites, []);
  return metrics;
}
async function rect(selector) {
  const element = await page.$(selector);
  assert.ok(element, selector);
  return { ...(await element.offset()), ...(await element.size()) };
}
async function revealHand({ sessionId, id }) {
  const session = await page.$(`.records-session[data-id="${sessionId}"]`);
  assert.ok(session, sessionId);
  await mini.pageScrollTo(Math.max(0, (await session.offset()).top - 120));
  await page.waitFor(`.hand-item[data-id="${id}"]`);
  // Let the observer's refill settle so the tap reaches the final row.
  await page.waitFor(1500);
}
async function tap(selector) {
  await page.waitFor(selector);
  await (await page.$(selector)).tap();
}
try {
  report.stage = 'connect';
  mini = await automator.connect({ wsEndpoint: process.argv[2] || 'ws://127.0.0.1:9497' });
  mini.on('exception', (value) => report.exceptions.push(value));
  page = await mini.currentPage();
  report.stage = 'return-existing-visit';
  if (page.path === 'pages/records/records') await tap('#records-back');
  else if (page.path === 'pages/history/history') await tap('#history-return-game');
  await route('pages/table/table');
  const liveHeight = await page.data('tableHeight');
  const selected = await mini.evaluate(() => {
    // Only a hand whose snapshot file is still present opens its history.
    const controller = getApp().noirController;
    for (const session of controller.getRecordSummaries().slice(0, 20)) {
      const attempt = session.attempts.find(
        (row) => row.status === 'completed' && controller.getRecord(row.id)?.snapshot,
      );
      if (attempt) return { id: attempt.id, sessionId: session.id };
    }
    return null;
  });
  assert.ok(selected, 'Finish one real hand before running the records performance check');
  report.stage = 'open-records';
  await tap('#resource-menu-button');
  await tap('#resource-records');
  await route('pages/records/records');
  report.stage = 'measure-bridge';
  report.bridge = await mini.evaluate(() => {
    const page = getCurrentPages().at(-1);
    const original = page.setData;
    const metrics = { patches: [], initialMs: 0, idleUpdates: 0 };
    page._recordsPerfOriginal = original;
    page.setData = function (patch, callback) {
      const text = JSON.stringify(patch);
      const bytes = encodeURIComponent(text).replace(/%[A-F\d]{2}/g, 'x').length;
      metrics.patches.push({ bytes, keys: Object.keys(patch) });
      return original.call(this, patch, callback);
    };
    original.call(page, { sessions: [] });
    page._rendered = false;
    const started = Date.now();
    page.refreshRecords();
    metrics.initialMs = Date.now() - started;
    const updates = metrics.patches.length;
    for (let i = 0; i < 20; i++) page.refreshRecords();
    metrics.idleUpdates = metrics.patches.length - updates;
    metrics.totalBytes = metrics.patches.reduce((sum, patch) => sum + patch.bytes, 0);
    metrics.largestPatchBytes = Math.max(0, ...metrics.patches.map((patch) => patch.bytes));
    metrics.hasSnapshots = JSON.stringify(page.data).includes('"snapshot"');
    return metrics;
  });
  assert.equal(report.bridge.idleUpdates, 0);
  assert.equal(report.bridge.hasSnapshots, false);
  assert.ok(report.bridge.largestPatchBytes < 256 * 1024);
  report.checks.push(
    'no snapshots or unchanged polling transfers; individual patches below 256 KiB',
  );
  const title = await rect('.records-nav');
  const firstSession = await rect('.records-session');
  // The browsing note is gone; the first game follows the title directly.
  const titleGap = firstSession.top - title.top - title.height;
  assert.ok(titleGap >= 8 && titleGap <= 24, `Title to first game: ${titleGap}px`);
  const back = await rect('#records-back');
  assert.ok(title.left < back.left);
  assert.ok(back.width < 130);
  report.recordsHeader = { title, back };
  await mini.screenshot({ path: path.join(output, 'records-header.png') });
  // Games start expanded; rows exist only near the viewport, so scroll there.
  const collapsed = await page.data('collapsed');
  if (collapsed[selected.sessionId]) await tap(`.session-item[data-id="${selected.sessionId}"]`);
  report.stage = 'open-history';
  await revealHand(selected);
  // A tap that lands while the list refills its rows is retried. If the
  // automator's taps still miss the re-rendered row, invoke that row's own
  // bound handler and record that the fallback was used.
  for (let attempt = 0; attempt < 3; attempt++) {
    await tap(`.hand-item[data-id="${selected.id}"]`);
    await page.waitFor(3000);
    if ((await mini.currentPage())?.path === 'pages/history/history') break;
  }
  if ((await mini.currentPage())?.path !== 'pages/history/history') {
    report.openHandFallback = 'automator taps missed the row; invoked its bindtap handler';
    await mini.evaluate(
      (id) =>
        getCurrentPages()
          .at(-1)
          .openHand({ currentTarget: { dataset: { id } } }),
      selected.id,
    );
  }
  await route('pages/history/history');
  await page.waitFor(1500);
  assert.equal(await page.data('tableHeight'), liveHeight);
  const time = await rect('.history-start-time');
  const shell = await rect('.game-shell');
  const dock = await rect('.action-dock');
  const review = await rect('.review-button');
  report.spacing = {
    headingGap: shell.top - time.top - time.height,
    dockHeight: dock.height,
    belowReview: dock.top + dock.height - review.top - review.height,
  };
  assert.ok(report.spacing.headingGap >= 4 && report.spacing.headingGap <= 12);
  // The read-only history dock is the single 64px settled row on every branch.
  assert.ok(Math.abs(report.spacing.dockHeight - 64) < 2);
  assert.ok(report.spacing.belowReview >= 6 && report.spacing.belowReview <= 14);
  report.checks.push(
    'compact heading and review spacing, unchanged table geometry, narrow return button',
  );
  await mini.screenshot({ path: path.join(output, 'history-top.png') });
  await mini.pageScrollTo(Math.max(0, dock.top - 350));
  await page.waitFor(200);
  await mini.screenshot({ path: path.join(output, 'history-review.png') });
  report.stage = 'full-name-tooltip';
  const candidates = await page.$$('.persona');
  for (const [i, label] of candidates.entries()) {
    const seat = (await page.data('phoneSeats'))[i];
    const natural = await rect(`#seat-persona-measure-${seat.id}`);
    const bounds = await rect(`#seat-persona-${seat.id}`);
    if (natural.width <= bounds.width + 1) continue;
    await label.longpress();
    await page.waitFor('.seat-name-tooltip.is-visible');
    report.fullName = {
      text: await (await page.$('.seat-name-tooltip')).text(),
      bounds: await rect('.seat-name-tooltip'),
    };
    assert.equal(report.fullName.text, seat.profileName);
    assert.ok(report.fullName.bounds.left >= 12);
    assert.ok(
      report.fullName.bounds.left + report.fullName.bounds.width <=
        (await page.data('windowWidth')) - 12,
    );
    await mini.screenshot({ path: path.join(output, 'full-name.png') });
    await tap('.name-tooltip-dismiss');
    break;
  }
  assert.ok(report.fullName, 'A saved real named opponent must exercise truncation');
  report.stage = 'return-game';
  await armReturnMeasurement();
  await tap('#history-return-game');
  await route('pages/table/table');
  assert.equal((await mini.pageStack()).length, 1);
  report.returnButton = await readReturnMeasurement();
  await tap('#resource-menu-button');
  await tap('#resource-records');
  await route('pages/records/records');
  await armReturnMeasurement();
  await mini.navigateBack();
  await route('pages/table/table');
  report.nativeBackLifecycle = await readReturnMeasurement();
  assert.equal((await mini.pageStack()).length, 1);
  report.checks.push(
    'return button and native Back lifecycle keep the live geometry without rewrites',
  );
  assert.equal(report.exceptions.length, 0);
  report.status = 'passed';
  report.stage = 'complete';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  process.exitCode = 1;
} finally {
  if (mini) {
    try {
      await mini.evaluate(() => {
        const live = getCurrentPages()[0];
        if (live?._recordsPerfReturnOriginal) {
          live.setData = live._recordsPerfReturnOriginal;
          delete live._recordsPerfReturnOriginal;
        }
        const page = getCurrentPages().find((page) => page.route === 'pages/records/records');
        if (page?._recordsPerfOriginal) {
          page.setData = page._recordsPerfOriginal;
          delete page._recordsPerfOriginal;
        }
        return true;
      });
    } catch {}
    mini.disconnect();
  }
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

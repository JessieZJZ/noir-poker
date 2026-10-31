// Real page navigation and audio APIs; preserve records and saved preferences.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(path.resolve('.artifacts/wechat-tools/package.json'));
const output = path.resolve(process.argv[3] || '.artifacts/wechat-records-music');
await mkdir(output, { recursive: true });
const mini = await require('miniprogram-automator').connect({ wsEndpoint: process.argv[2] });
const report = {
  status: 'running',
  checks: [],
  exceptions: [],
  scope: 'DevTools audio transport and real routes; physical listening is separate',
};
mini.on('exception', (error) => report.exceptions.push(error));
let saved;
async function wait(read, message) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const result = await read();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error(message);
}
const route = (name) =>
  wait(async () => {
    const page = await mini.currentPage();
    return page.path === name ? page : null;
  }, `Route ${name} must become visible`);
async function openRecords(page) {
  if (!(await page.$('#resource-records'))) await (await page.$('#resource-menu-button')).tap();
  const item = await wait(() => page.$('#resource-records'), 'Records menu must open');
  await item.tap();
  return route('pages/records/records');
}
const inspect = () =>
  mini.evaluate(() => {
    const p = getApp().__recordsMusicProbe;
    return {
      ...getApp().noirMusic.getState(),
      starts: p.starts,
      suspends: p.suspends,
      contexts: p.contexts.length,
      time: p.contexts[0]?.currentTime,
      contextState: p.contexts[0]?.state,
    };
  });
async function assertContinuous(name) {
  const before = await inspect();
  // Force a genuine public update from the hidden live table, after the new
  // page is visible. Its delayed setData callback caused the original pause.
  await mini.evaluate(() => {
    const live = getCurrentPages().find((p) => p.route === 'pages/table/table');
    live._controller.setPreference('hints', !live.data.settings.hints);
  });
  const after = await wait(async () => {
    const state = await inspect();
    return state.time > before.time + 0.2 ? state : null;
  }, 'The real audio clock must keep advancing');
  assert.equal(after.active, true);
  assert.equal(after.playing, true);
  assert.equal(after.starts, 1, 'Page navigation must not restart the audio source');
  assert.equal(after.suspends, 0, 'Hidden table paints must not suspend foreground music');
  assert.equal(after.contexts, 1);
  report.checks.push({ name, evidence: after });
}
try {
  report.build = JSON.parse(await readFile('.artifacts/wechat/build-info.json', 'utf8'));
  const stack = await mini.pageStack();
  assert.equal(stack[0].path, 'pages/table/table');
  if (stack.length > 1) await mini.navigateBack({ delta: stack.length - 1 });
  let page = await route('pages/table/table');
  await wait(
    () =>
      mini.evaluate(
        () => !!getCurrentPages()[0]?._controller && getCurrentPages()[0]?.data.tableReady,
      ),
    'Live page controller and initial view must be ready',
  );
  saved = await mini.evaluate(() => getCurrentPages()[0].data.settings);
  const ids = await mini.evaluate(() => {
    const controller = getApp().noirController,
      ids = [];
    for (const session of controller.getRecordSummaries()) {
      for (const attempt of session.attempts) {
        if (attempt.status === 'completed' && controller.getRecord(attempt.id)?.snapshot)
          ids.push(attempt.id);
        if (ids.length === 2) return ids;
      }
    }
    return ids;
  });
  assert.ok(
    ids.length,
    'At least one existing completed hand is required; records are never fabricated',
  );
  await mini.evaluate(() => {
    const app = getApp();
    app.noirController.setPreference('music', true);
    app.noirMusic.dispose();
    const original = wx.createWebAudioContext;
    const probe = (app.__recordsMusicProbe = { original, contexts: [], starts: 0, suspends: 0 });
    wx.createWebAudioContext = function (...args) {
      const context = original.apply(this, args);
      probe.contexts.push(context);
      const create = context.createBufferSource.bind(context),
        suspend = context.suspend.bind(context);
      context.createBufferSource = () => {
        const node = create(),
          start = node.start.bind(node);
        node.start = (...values) => {
          probe.starts++;
          return start(...values);
        };
        return node;
      };
      context.suspend = (...values) => {
        probe.suspends++;
        return suspend(...values);
      };
      return context;
    };
    app.onLaunch();
    app.onShow();
  });
  await wait(async () => (await inspect()).playing, 'Decoded music must play before navigation');
  for (let cycle = 0; cycle < 3; cycle++) {
    report.phase = `records-${cycle + 1}`;
    await openRecords(page);
    await assertContinuous(`records-${cycle + 1}`);
    report.phase = `history-${cycle + 1}`;
    await mini.navigateTo(
      `/pages/history/history?id=${encodeURIComponent(ids[cycle % ids.length])}`,
    );
    const history = await route('pages/history/history');
    assert.equal(
      await history.$('.launch-screen'),
      null,
      'Saved hands never mount the launch cover',
    );
    await assertContinuous(`history-${cycle + 1}`);
    await mini.navigateBack();
    await route('pages/records/records');
    await assertContinuous(`history-back-${cycle + 1}`);
    await mini.navigateBack();
    page = await route('pages/table/table');
    await assertContinuous(`table-back-${cycle + 1}`);
  }
  await openRecords(page);
  await mini.evaluate(() => getApp().onHide());
  assert.equal((await inspect()).playing, false);
  await mini.evaluate(() => getApp().onShow());
  const resumed = await wait(async () => {
    const state = await inspect();
    return state.playing && state.starts === 2 ? state : null;
  }, 'Foreground must resume the same decoded context');
  assert.equal(resumed.contexts, 1);
  report.checks.push({ name: 'background-and-foreground-from-records', evidence: resumed });
  await mini.evaluate(() => getApp().noirController.setPreference('music', false));
  await mini.navigateTo(`/pages/history/history?id=${encodeURIComponent(ids[0])}`);
  await route('pages/history/history');
  assert.equal((await inspect()).playing, false);
  assert.equal((await inspect()).enabled, false);
  report.checks.push({ name: 'muted-history-stays-muted' });
  assert.deepEqual(report.exceptions, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || String(error);
  try {
    report.lastState = await inspect();
  } catch {}
  process.exitCode = 1;
} finally {
  try {
    const stack = await mini.pageStack();
    if (stack.length > 1) await mini.navigateBack({ delta: stack.length - 1 });
    await mini.evaluate((saved) => {
      const app = getApp(),
        probe = app.__recordsMusicProbe;
      if (!probe) return;
      app.noirMusic.dispose();
      wx.createWebAudioContext = probe.original;
      delete app.__recordsMusicProbe;
      if (saved) {
        app.noirController.setPreference('hints', saved.hints);
        app.noirController.setPreference('music', saved.music);
      }
      app.onLaunch();
      app.onShow();
    }, saved);
  } catch (error) {
    report.cleanupError = String(error);
    process.exitCode = 1;
  }
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await mini.disconnect();
}
console.log(
  JSON.stringify({
    status: report.status,
    checks: report.checks.length,
    error: report.error,
    cleanupError: report.cleanupError,
  }),
);

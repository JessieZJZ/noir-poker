import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(path.resolve('.artifacts/wechat-tools/package.json'));
const output = path.resolve(process.argv[3] || '.artifacts/wechat-resource-menu');
await mkdir(output, { recursive: true });
const report = { status: 'running', checks: [] };
let mini;
try {
  mini = await require('miniprogram-automator').connect({ wsEndpoint: process.argv[2] });
  const wait = async (name, read) => {
    const end = Date.now() + 20000;
    while (Date.now() < end) {
      const value = await read();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error(`Timed out waiting for ${name}`);
  };
  const route = (name) =>
    wait(name, async () => {
      const page = await mini.currentPage();
      return page?.path === name &&
        !(await mini.evaluate(() => getApp().__resourceNavigation?.pending || 0))
        ? page
        : null;
    });
  const control = (page, selector) => wait(selector, () => page.$(selector));
  const tap = async (page, selector) => (await control(page, selector)).tap();
  const showMenu = async (table) => {
    await tap(table, '#resource-menu-button');
    await control(table, '.resource-popover > .resource-menu');
    assert.equal(await table.$('.screen .resource-menu'), null);
  };
  const main = 'pages/table/table';
  let table = await route(main);
  await wait('table ready', () => table.data('tableReady'));
  await mini.evaluate(() => {
    const probe = (getApp().__resourceNavigation = {
      table: getCurrentPages()[0],
      pending: 0,
      methods: {},
    });
    for (const method of ['navigateTo', 'navigateBack']) {
      probe.methods[method] = wx[method];
      wx[method] = function (options) {
        probe.pending++;
        return probe.methods[method].call(wx, {
          ...options,
          complete(result) {
            probe.pending--;
            options.complete?.(result);
          },
        });
      };
    }
    return true;
  });
  report.initial = {
    width: await table.data('windowWidth'),
    height: await table.data('windowHeight'),
  };
  for (const stage of ['waiting', 'seated']) {
    assert.equal(await table.data('waitingForSeat'), stage === 'waiting');
    for (const [item, destination, ready, back] of [
      ['records', 'pages/records/records', '.records-nav', '.records-nav .tool-brand'],
      ['tutorial', main, '.tutorial-sheet', '.tutorial-sheet .tool-brand'],
      ['guide', main, '.guide-sheet', '.guide-sheet .tool-brand'],
      ['win-rate', 'calculator/win-rate', '.win-rate-heading', '.win-rate-heading .tool-brand'],
    ]) {
      await showMenu(table);
      if (item === 'records')
        await mini.screenshot({ path: path.join(output, `menu-${stage}.png`) });
      await tap(table, `#resource-${item}`);
      const opened = await route(destination);
      await control(opened, ready);
      assert.deepEqual(
        (await mini.pageStack()).map((page) => page.path),
        main === destination ? [main] : [main, destination],
      );
      await tap(opened, back);
      table = await route(main);
      await wait(`${item} closed`, async () => !(await table.$(ready)));
      assert.deepEqual(
        (await mini.pageStack()).map((page) => page.path),
        [main],
      );
      assert.ok(
        await mini.evaluate(() => getCurrentPages()[0] === getApp().__resourceNavigation.table),
      );
      report.checks.push({ stage, item });
    }
    await showMenu(table);
    await tap(table, '.resource-dismiss');
    await wait(
      'outside tap dismisses the popover',
      async () => !(await table.data('resourceMenuOpen')),
    );
    if (stage === 'waiting') {
      await tap(table, '#join-table-button');
      await wait('seated', async () => !(await table.data('waitingForSeat')));
    }
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error.stack ?? error);
  throw error;
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await mini
    ?.evaluate(() => {
      const probe = getApp().__resourceNavigation;
      if (probe) {
        for (const [name, original] of Object.entries(probe.methods)) wx[name] = original;
        delete getApp().__resourceNavigation;
      }
      return true;
    })
    .catch(() => {});
  mini?.disconnect();
}

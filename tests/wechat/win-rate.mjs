// Real DevTools navigation and shared calculator session; no fixture enters the bundle.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const automator = require('miniprogram-automator');
const output = path.resolve(process.argv[3] || path.join(root, '.artifacts/wechat-win-rate'));
await mkdir(output, { recursive: true });
const report = {
  status: 'running',
  platform: 'WeChat DevTools simulator',
  startedAt: new Date().toISOString(),
  checks: [],
  exceptions: [],
  screenshots: [],
};
let mini;
let page;
const wait = async (name, read, predicate, timeout = 20000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error(`${name} did not reach its expected state`);
};
const tap = async (selector) => {
  const element = await wait(
    `Element ${selector}`,
    () => page.$(selector),
    (found) => !!found,
  );
  await element.tap();
};
const waitData = (name, predicate) =>
  wait(
    name,
    () => page.data(),
    (data) => predicate(data),
  );
const pick = async (...keys) => {
  for (const key of keys) await tap(`#win-rate-pick-${key}`);
};
const capture = async (name) => {
  await page.waitFor(400);
  const file = path.join(output, `${name}.png`);
  await mini.screenshot({ path: file });
  report.screenshots.push(file);
};
const check = async (name, run) => {
  report.checks.push({ name, ...(await run()) });
};
try {
  mini = await automator.connect({ wsEndpoint: process.argv[2] || 'ws://127.0.0.1:9432' });
  mini.on('exception', (exception) => report.exceptions.push(exception));
  page = await mini.reLaunch('/pages/table/table');
  await page.waitFor(800);
  const before = await mini.evaluate(() => getApp().noirController.getGame().hand);
  await check('resource-menu-opens-calculator-subpackage', async () => {
    await tap('#resource-menu-button');
    await tap('#resource-win-rate');
    page = await wait(
      'Calculator route',
      () => mini.currentPage(),
      (current) => current.path === 'calculator/win-rate',
    );
    await page.waitFor(300);
    const data = await page.data();
    assert.equal(data.players.length, 2);
    assert.equal(data.statusText, '');
    await capture('win-rate-empty');
    return { route: page.path };
  });
  await check('reference-preflop-is-exact-or-labelled', async () => {
    await tap('#win-rate-player-0-0');
    await waitData('Picker open', (data) => data.pickerOpen);
    assert.equal(await page.$('#win-rate-delete'), null);
    await pick('0-14', '0-13');
    await tap('#win-rate-player-1-0');
    await pick('0-8');
    await waitData('Picker title', (data) => data.pickerTitle === '对手 1 的第 2 张底牌');
    await capture('win-rate-picker');
    await pick('0-7');
    const data = await waitData('Preflop result', (value) => value.status === 'ready');
    assert.match(data.statusText, /1,712,304|已模拟/);
    return { odds: data.players.map((player) => player.odds.win), status: data.statusText };
  });
  await check('reference-flop-matches-web', async () => {
    await tap('#win-rate-add');
    await waitData('Third row', (data) => data.players.length === 3);
    const third = (await page.data()).players[2].id;
    await tap(`#win-rate-player-${third}-0`);
    await waitData('Picker open', (data) => data.pickerOpen);
    await capture('win-rate-picker-half');
    const [slot, sheet] = await mini.evaluate(
      () =>
        new Promise((resolve) =>
          wx
            .createSelectorQuery()
            .select('.win-rate-slot.is-active')
            .boundingClientRect()
            .select('#win-rate-picker')
            .boundingClientRect()
            .exec(resolve),
        ),
    );
    const { windowHeight } = await mini.evaluate(() => wx.getWindowInfo());
    assert.ok(sheet.height <= windowHeight / 2 + 1, 'The sheet must stay within half the screen');
    assert.ok(slot.bottom <= sheet.top, 'The slot being filled must stay above the sheet');
    const grid = await page.$('.win-rate-picker-grid');
    const { height: gridHeight } = await grid.size();
    assert.ok((await grid.scrollHeight()) > gridHeight, 'The deck must scroll');
    assert.ok(gridHeight <= sheet.height - 100, 'The deck must stay clear of the sheet actions');
    await pick('2-10', '1-10');
    await tap('#win-rate-board-0');
    await pick('0-6', '0-11', '2-11');
    const data = await waitData(
      'Flop result',
      (value) => value.status === 'ready' && value.players[2]?.odds.win === '51.83%',
    );
    assert.deepEqual(
      data.players.map((player) => player.odds.win),
      ['44.85%', '2.99%', '51.83%'],
    );
    assert.equal(data.players[0].outs.count, 12);
    assert.equal(data.players[1].outs.count, 0);
    assert.equal(data.players[2].outs, null);
    assert.equal(data.players[0].outs.cards.length, 12);
    await capture('win-rate-flop');
    await tap('#win-rate-board-1');
    await waitData('Flop edit', (value) => value.selected === '0-11');
    assert.ok(await page.$('#win-rate-delete'));
    await capture('win-rate-picker-edit');
    await pick('0-11');
    await waitData('Edit closes the picker', (value) => !value.pickerOpen);
    return { statusText: data.statusText };
  });
  await check('remove-and-clear', async () => {
    const third = (await page.data()).players[2].id;
    await tap(`#win-rate-remove-${third}`);
    await waitData('Removed row', (data) => data.players.length === 2);
    await tap('#win-rate-clear');
    const data = await waitData(
      'Cleared page',
      (value) => value.status === 'idle' && Object.keys(value.used).length === 0,
    );
    assert.equal(data.players.length, 2);
    return {};
  });
  await check('return-keeps-live-game', async () => {
    await tap('#win-rate-close');
    page = await wait(
      'Table route',
      () => mini.currentPage(),
      (current) => current.path === 'pages/table/table',
    );
    const hand = await mini.evaluate(() => getApp().noirController.getGame().hand);
    assert.ok(hand >= before);
    return { before, hand };
  });
  assert.equal(report.exceptions.length, 0);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  throw error;
} finally {
  report.completedAt = new Date().toISOString();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  mini?.disconnect();
}
console.log(`WeChat win rate passed: ${report.checks.length} checks`);

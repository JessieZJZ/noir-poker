// Official DevTools presentation fixtures stay outside the mini-program.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { tableHintGame } from '../fixtures/table-hints.js';
import { tableHint } from '../../src/review/table-hint.js';

const root = new URL('../../', import.meta.url).pathname;
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const mini = await require('miniprogram-automator').connect({
  wsEndpoint: process.argv[2] || 'ws://127.0.0.1:9461',
});
const output = path.resolve(process.argv[3] || path.join(root, '.artifacts/wechat-hints'));
fs.mkdirSync(output, { recursive: true });
const report = {
  status: 'running',
  build: JSON.parse(fs.readFileSync(path.join(root, '.artifacts/wechat/build-info.json'))),
  checks: [],
  exceptions: [],
};
mini.on('exception', (error) => report.exceptions.push(String(error)));
try {
  const readyDeadline = Date.now() + 45000;
  // CLI auto can expose its socket before the initial page exists. reLaunch
  // itself first reads that page's metadata, so wait for a real controller.
  while (!(await mini.evaluate(() => Boolean(getCurrentPages().slice(-1)[0]?._controller)))) {
    if (Date.now() >= readyDeadline) throw Error('Initial table controller did not become ready');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await mini.reLaunch('/pages/table/table');
  const page = await mini.currentPage();
  const cases = [
    ['aces', tableHintGame()],
    ['kings', tableHintGame('Ks Kh')],
    ['connectors', tableHintGame('4d 5d')],
    ['nut-draw', tableHintGame('As 2s', '8s Kh 4s')],
    ['combo-draw', tableHintGame('Qs Js', 'Ts 9h 2s')],
    ['shared-pair', tableHintGame('Ks Ad', '6d 5h 3s 5d Kh')],
    ['river', tableHintGame('As 2s', '8s Kh 4s 9d Jc', 0)],
    ['all-in-call', tableHintGame('5h 5c', '', 200, 100)],
  ];
  for (const [name, game] of cases) {
    await mini.evaluate((snapshot) => {
      const controller = getCurrentPages().at(-1)._controller;
      controller.hide();
      Object.assign(controller.getGame(), snapshot);
      controller.setPreference('hints', false);
      controller.show();
      controller.setPreference('hints', true);
    }, game);
    const data = await page.data();
    assert.equal(data.hintText, tableHint(game), name);
    assert.doesNotMatch(data.hintText, /；|权益|跟注占可争夺底池/);
    const text = await (await page.$('.hint-mask text')).text();
    assert.ok(text.includes(data.hintText), name);
    report.checks.push({ name, text: data.hintText });
    if (['nut-draw', 'all-in-call'].includes(name)) {
      await page.waitFor(1450);
      await mini.screenshot({ path: path.join(output, `${name}.png`) });
    }
  }
  assert.equal(report.exceptions.length, 0);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || String(error);
  throw error;
} finally {
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await mini.disconnect();
}

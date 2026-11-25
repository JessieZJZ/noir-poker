// WeChat DevTools: the blind structure in Settings, the final-table and
// new-level notices before the deal, and the closed refill at the final table.
// node tests/wechat/blind-levels.mjs ws://127.0.0.1:9532 .artifacts/wechat-blind-levels
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { blindLevels } from '../../src/engine/blind-levels.js';
import { compactChips } from '../../src/engine/chip-format.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const automator = require('miniprogram-automator');
const output = path.resolve(root, process.argv[3] || '.artifacts/wechat-blind-levels');
await mkdir(output, { recursive: true });
const report = { platform: 'WeChat DevTools simulator', checks: [], exceptions: [] };
let mini;
try {
  mini = await automator.connect({ wsEndpoint: process.argv[2] || 'ws://127.0.0.1:9432' });
  mini.on('exception', (exception) => report.exceptions.push(exception));
  await mini.reLaunch('/pages/table/table');
  const page = await mini.currentPage();
  const wait = async (predicate, timeout = 30000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const data = await page.data();
      if (predicate(data)) return data;
      await page.waitFor(50);
    }
    throw Error('Mini-program page did not reach the expected state');
  };
  const pass = (name, detail = {}) => {
    report.checks.push({ name, ...detail });
    console.log('PASS', name);
  };
  const ready = await wait((data) => data.tableReady && data.waitingForSeat);
  const caps = { 5: 42, 6: 50, 7: 58, 8: 67, 9: 75 };
  const count = ready.seats.length + 1; // The hero is rendered separately.
  const stakes = ready.requestedStakes;
  const cap = [stakes.smallBlind, stakes.bigBlind]
    .map((blind) => compactChips(blind * caps[count]))
    .join(' / ');
  assert.equal(ready.entryStructure.levels, `每 8 手涨盲，最高 ${cap}`);
  assert.match(ready.entryStructure.final, /^剩 [23] 人进入决赛圈$/);
  assert.equal(ready.stakesStructure, ready.entryStructure.settings);
  await (await page.$('.settings-button')).tap();
  await wait((data) => data.settingsOpen);
  const structure = await page.$('.stakes-setting-row .setting-description');
  assert.ok((await structure.text()).includes(ready.entryStructure.settings));
  await mini.screenshot({ path: path.join(output, 'settings-structure.png') });
  await (await page.$('.settings-modal .close')).tap();
  await wait((data) => !data.settingsOpen);
  pass('settings show the blind structure', ready.entryStructure);

  await (await page.$('#join-table-button')).tap();
  await wait((data) => !data.dealing && !data.waitingForSeat);
  // Fold this hand out through the real controller, then leave only the
  // final table and make the next hand start the highest level.
  for (let data = await page.data(); !data.done; data = await page.data()) {
    if (data.canAct) await mini.evaluate(() => getCurrentPages().at(-1)._controller.action('fold'));
    await page.waitFor(200);
  }
  const levels = blindLevels(stakes, count);
  const setup = await mini.evaluate(
    (previous, levelIndex) => {
      const game = getCurrentPages().at(-1)._controller.getGame(),
        seats = game.players.length <= 6 ? 2 : 3;
      // Move the out seats' chips to seat 1, keeping the table's chip total.
      for (const p of game.players.slice(seats)) {
        game.players[1].stack += p.stack;
        Object.assign(p, { out: true, stack: 0, place: game.players.length });
      }
      Object.assign(game, previous, { levelHands: game.levelLength, levelIndex });
      return { seats };
    },
    levels.at(-2),
    levels.length - 2,
  );
  await mini.evaluate(() => getCurrentPages().at(-1)._controller.nextHand());
  const first = await wait((data) => data.tableNotices.length > 0);
  assert.equal(first.noticeHold, true);
  assert.equal(first.tableNotices[0].title, '进入决赛圈');
  assert.equal(first.tableNotices[0].caption, `剩余 ${setup.seats} 人争夺冠军 · 不能再补码`);
  const band = await page.$('.table-notice-band');
  assert.ok(band, 'The notice band is rendered');
  const size = await band.size();
  assert.ok(size.width >= first.windowWidth - 2, `band spans the screen: ${size.width}`);
  await mini.screenshot({ path: path.join(output, 'final-table-notice.png') });
  pass('final-table notice spans the screen before the deal', { width: size.width });
  const level = await wait((data) => data.tableNotices[0]?.title?.startsWith('盲注升至'));
  assert.equal(level.noticeHold, true);
  assert.equal(level.tableNotices[0].title, `盲注升至 ${cap}`);
  assert.equal(level.tableNotices[0].caption, '已到最高级别，不再上涨');
  assert.equal(level.blindProgress, '盲注已封顶');
  await mini.screenshot({ path: path.join(output, 'level-notice.png') });
  pass('the new level follows', { title: level.tableNotices[0].title });
  const dealt = await wait((data) => !data.noticeHold && !data.tableNotices.length, 8000);
  assert.equal(dealt.heroCards.length, 2);
  assert.equal(dealt.rebuysLeft, 0);
  assert.equal(dealt.blindText, cap);
  await mini.screenshot({ path: path.join(output, 'dealt-after-notice.png') });
  pass('cards are dealt after the notices; refills are closed', {
    blinds: dealt.blindText,
  });
  report.status = report.exceptions.length ? 'failed' : 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error?.stack || error);
  console.error(error);
  process.exitCode = 1;
} finally {
  // Leave a fresh game at the starting blinds for the next DevTools suite.
  await mini?.evaluate(() => getCurrentPages().at(-1)._controller.reset()).catch(() => {});
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  mini?.disconnect();
}

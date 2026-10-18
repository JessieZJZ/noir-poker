// External DevTools fixture: never included in the production mini-program.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { act, advanceStreet } from '../../src/engine/poker.js';
import { checkedSeatGame } from '../fixtures/checked-actions.js';

const root = new URL('../../', import.meta.url).pathname;
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const automator = require('miniprogram-automator');
const output = path.resolve(process.argv[3] || '.artifacts/check-caption/wechat');
await mkdir(output, { recursive: true });
const report = { status: 'running', checks: [], exceptions: [] };
const mini = await automator.connect({ wsEndpoint: process.argv[2] });
mini.on('exception', (error) => report.exceptions.push(String(error)));
try {
  report.build = JSON.parse(await readFile(path.join(root, '.artifacts/wechat/build-info.json')));
  await mini.reLaunch('/pages/table/table');
  const page = await mini.currentPage();
  const game = checkedSeatGame();
  game.players[1].action = '';
  game.players[1].lastAction = null;
  const check = async (name, expected) => {
    await mini.evaluate(
      (snapshot) => {
        const controller = getCurrentPages().at(-1)._controller;
        controller.hide();
        Object.assign(controller.getGame(), snapshot);
        controller.show();
        controller.hide();
      },
      JSON.parse(JSON.stringify(game)),
    );
    await page.waitFor(250);
    const data = await page.data();
    const mia = data.seats.find((seat) => seat.id === 1);
    assert.equal(mia.actionLabel, expected);
    const element = await page.$('.seat-action-word[data-id="1"]');
    assert.equal(await element.text(), expected);
    report.checks.push({ name, street: game.street, actor: game.actor, label: mia.actionLabel });
  };
  await check('completed-check-without-cached-text', '过牌');
  await page.waitFor(1450);
  await mini.screenshot({ path: path.join(output, 'mia-checked.png') });
  act(game, 2, 'raise', game.bigBlind);
  while (game.actor !== 1) {
    await check('check-retained-during-opponent-turn-' + game.actor, '过牌');
    act(game, game.actor, 'call');
  }
  await check('own-next-turn', '思考中');
  act(game, 1, 'call');
  await check('new-call-replaces-check', '跟注');
  advanceStreet(game);
  await check('new-street-before-own-action', '等待行动');
  await page.waitFor(1450);
  await mini.screenshot({ path: path.join(output, 'mia-new-street.png') });
  assert.deepEqual(report.exceptions, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || String(error);
  throw error;
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await mini.disconnect();
}

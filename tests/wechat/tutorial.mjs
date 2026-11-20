// Real DevTools taps through the first tutorial hand; nothing here enters the app bundle.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const automator = require('miniprogram-automator');
const output = path.resolve(process.argv[3] || path.join(root, '.artifacts/wechat-tutorial'));
await mkdir(output, { recursive: true });
const report = {
  status: 'running',
  platform: 'WeChat DevTools simulator',
  startedAt: new Date().toISOString(),
  screenshots: [],
  layout: {},
};
const mini = await automator.connect({ wsEndpoint: process.argv[2] || 'ws://127.0.0.1:9512' });
const page = await mini.reLaunch('/pages/table/table');
const data = () => page.data();
const capture = async (name) => {
  await page.waitFor(900);
  const file = path.join(output, `${name}.png`);
  await mini.screenshot({ path: file });
  report.screenshots.push(file);
};
const wait = async (name, predicate, timeout = 30000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await predicate(await data());
    if (value) return value;
    await page.waitFor(100);
  }
  throw Error(`${name} did not happen`);
};
const tap = async (selector) => {
  const element = await page.$(selector);
  assert.ok(element, `Missing ${selector}`);
  await element.tap();
};
const box = async (selector) => {
  const element = await page.$(selector);
  const [size, offset] = await Promise.all([element.size(), element.offset()]);
  return { ...size, ...offset };
};

try {
  await wait('Table ready', (view) => view.tableReady);
  const live = await mini.evaluate(() => {
    const game = getApp().noirController.getGame();
    return JSON.stringify({ hand: game.hand, stacks: game.players.map((p) => p.stack) });
  });
  const records = await mini.evaluate(() => getApp().noirController.getRecords().length);
  await tap('#resource-menu-button');
  await wait('Resource menu', async (view) => view.resourceMenuOpen);
  await tap('#resource-tutorial');
  await wait('Intro', (view) => view.tutorial?.stage === 'intro');
  assert.equal((await page.$$('.tutorial-step')).length, 5);
  await capture('intro');
  await tap('.tutorial-sheet-actions .primary');
  await wait('Coach', (view) => view.tutorialPlaying && view.heroCards[0]?.rank === '10');
  await capture('lesson-read-step');
  const [coach, dock, shell] = await Promise.all([
    box('.tutorial-coach'),
    box('.action-dock'),
    box('.game-shell'),
  ]);
  report.layout = { coach, dock, shell };
  assert.ok(dock.top >= coach.top + coach.height - 1, 'The dock stays below the coach');
  assert.ok(dock.top + dock.height <= shell.top + shell.height + 1, 'The dock stays in the shell');

  let shotTurn = false;
  let shotQuiz = false;
  // Bots wait for each fresh coach message to be read, so waiting steps repeat.
  for (let step = 0; step < 800; step++) {
    const view = await data();
    const coachView = view.tutorial;
    if (coachView.stage === 'summary') break;
    if (coachView.options.length) {
      if (!shotQuiz) {
        shotQuiz = true;
        await capture('lesson-quiz');
      }
      await (await page.$$('.tutorial-options button'))[1].tap();
      await wait('Quiz solved', (next) => next.tutorial.canContinue);
      await tap('.tutorial-next');
    } else if (coachView.canContinue)
      // A settled hand moves Continue into the action dock.
      await tap(coachView.settled ? '.tutorial-dock-next' : '.tutorial-next');
    else if (coachView.allowed?.action === 'call' || coachView.allowed?.action === 'check') {
      if (!shotTurn) {
        shotTurn = true;
        assert.equal(view.lockFold, true);
        await capture('lesson-guided-turn');
      }
      await tap('.action-buttons .call-button');
    } else if (coachView.allowed?.action === 'raise') {
      await tap('[data-preset="half"]');
      await wait('Half pot chosen', (next) => next.lockRaise === false);
      await tap('.action-buttons .primary');
    } else {
      await page.waitFor(150);
      continue;
    }
    await page.waitFor(250);
  }
  const done = await data();
  assert.equal(done.tutorial.stage, 'summary');
  assert.equal(done.done, true);
  assert.equal(done.heroWinner, true);
  await capture('lesson-summary');
  await tap('.tutorial-sheet .close');
  await wait('Live table', (view) => view.tutorial === null && !view.tutorialPlaying);
  assert.equal(
    await mini.evaluate(() => {
      const game = getApp().noirController.getGame();
      return JSON.stringify({ hand: game.hand, stacks: game.players.map((p) => p.stack) });
    }),
    live,
  );
  assert.equal(await mini.evaluate(() => getApp().noirController.getRecords().length), records);
  await capture('restored');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error.stack || error);
  throw error;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  mini.disconnect();
}

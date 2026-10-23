// Observe real DevTools audio contexts and the actual shared controller.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const output = path.resolve(process.argv[3] || '.artifacts/entry-experience/wechat-runtime');
await mkdir(output, { recursive: true });
const report = {
  platform: 'WeChat DevTools simulator',
  status: 'running',
  checks: [],
  exceptions: [],
  startedAt: new Date().toISOString(),
};
let mini, saved;
async function wait(read, message, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error(message);
}
try {
  report.build = JSON.parse(await readFile('.artifacts/wechat/build-info.json', 'utf8'));
  mini = await require('miniprogram-automator').connect({
    wsEndpoint: process.argv[2] || 'ws://127.0.0.1:9466',
  });
  mini.on('exception', (error) => report.exceptions.push(error));
  saved = await mini.evaluate(() => ({
    settings: wx.getStorageSync('noir-wechat-settings-v1') || '',
    records: wx.getStorageSync('noir-game-records-v1') || '',
  }));
  await mini.evaluate(() => {
    const app = getApp();
    app.noirMusic?.dispose();
    app.noirController?.destroy();
    app.noirTableReady = false;
    wx.setStorageSync(
      'noir-wechat-settings-v1',
      JSON.stringify({
        playerCount: 5,
        stakes: { smallBlind: 10000, bigBlind: 20000 },
        hints: false,
        sound: true,
        vibration: false,
      }),
    );
    wx.removeStorageSync('noir-game-records-v1');
    app.__entryProbe = { original: wx.createInnerAudioContext, audios: [], samples: [] };
    wx.createInnerAudioContext = function (...args) {
      const audio = app.__entryProbe.original.apply(this, args);
      app.__entryProbe.audios.push(audio);
      return audio;
    };
    app.__entryProbe.timer = setInterval(() => {
      const audio = app.__entryProbe.audios.find((item) => item.src.includes('/music/'));
      if (audio && app.__entryProbe.samples.length < 250)
        app.__entryProbe.samples.push({
          at: Date.now(),
          volume: audio.volume,
          time: audio.currentTime,
          paused: audio.paused,
        });
    }, 40);
    app.onLaunch();
  });
  await mini.reLaunch('/pages/table/table');
  let page = await mini.currentPage();
  await wait(async () => (await page.data()).waitingForSeat, 'Waiting table must be rendered');
  const inspect = () =>
    mini.evaluate(() => {
      const app = getApp(),
        page = getCurrentPages().at(-1),
        game = page._controller.getGame();
      const audio = app.__entryProbe.audios.find((item) => item.src.includes('/music/'));
      return {
        entry: page.data.entryState,
        street: page.data.street,
        hand: game.hand,
        history: game.history.length,
        stack: game.players.map((player) => player.stack),
        bet: game.players.map((player) => player.bet),
        holeCount: game.players.map((player) => player.hole.length),
        records: page._controller.getRecords().length,
        music: audio && {
          time: audio.currentTime,
          volume: audio.volume,
          paused: audio.paused,
          duration: audio.duration,
        },
        players: app.__entryProbe.audios.filter((item) => item.src.includes('/music/')).length,
        samples: app.__entryProbe.samples,
      };
    });
  const first = await wait(async () => {
    const state = await inspect();
    return state.music?.time > 0.1 && !state.music.paused && state.music.volume === 1
      ? state
      : null;
  }, 'Music must play before tapping any control');
  assert.equal(first.entry, 'waiting');
  assert.equal(first.hand, 0);
  assert.equal(first.records, 0);
  assert.ok(first.bet.every((amount) => amount === 0));
  assert.ok(first.holeCount.every((count) => count === 0));
  assert.ok(
    first.samples.some((sample) => sample.volume < 0.2),
    'Actual audio must begin quietly',
  );
  assert.ok(
    first.samples.some((sample) => sample.volume > 0.2 && sample.volume < 0.9),
    'Actual audio must ramp',
  );
  assert.equal(first.street, '等待入座，即将开始第 1 局第 1 手');
  await mini.screenshot({ path: path.join(output, 'waiting-before-first-touch.png') });
  report.checks.push({ name: 'music-before-first-touch-and-entry-fade', evidence: first });
  const settings = await page.$('.settings-button'),
    menu = await page.$('.guide-button');
  const font = await settings.style('font-size'),
    menuFont = await menu.style('font-size');
  assert.equal(font, menuFont);
  const settingsOffset = await settings.offset(),
    menuOffset = await menu.offset(),
    menuSize = await menu.size();
  assert.ok(
    menuOffset.left + menuSize.width <= settingsOffset.left,
    'Settings is the rightmost control',
  );
  assert.equal((await page.$$('.bottom-links, .practice-info')).length, 0);
  assert.equal((await settings.text()).trim(), '设置');
  assert.equal(await settings.style('border-top-width'), '0px');
  assert.equal((await (await page.$('#join-table-button')).text()).trim(), '入座开练');
  assert.equal((await page.$$('.activity-panel')).length, 0);
  const header = await page.$('.game-header');
  const headerOffset = await header.offset(),
    headerSize = await header.size();
  for (const selector of ['.hand-label', '.blind-info']) {
    const label = await page.$(selector);
    assert.ok(label, `${selector} must exist`);
    const offset = await label.offset(),
      size = await label.size();
    assert.ok(size.height > 0);
    assert.ok(offset.top >= headerOffset.top, `${selector} must not clip above the header`);
    assert.ok(
      offset.top + size.height <= headerOffset.top + headerSize.height,
      `${selector} must stay inside the header`,
    );
  }
  const handOffset = await (await page.$('.hand-label')).offset();
  const blindOffset = await (await page.$('.blind-info')).offset();
  assert.ok(
    Math.abs(handOffset.top - blindOffset.top) <= 1,
    'Waiting blinds share the first header row',
  );
  // The name sits in a wrapper that also anchors the champion's crown.
  const heroName = await page.$('.hero-identity > .hero-name-text'),
    heroStack = await page.$('.hero-identity .stack');
  const heroGap =
    (await heroStack.offset()).left -
    (await heroName.offset()).left -
    (await heroName.size()).width;
  assert.ok(heroGap >= 0 && heroGap <= 7, `Waiting hero gap must be compact, got ${heroGap}`);
  assert.equal((await page.$$('.hero-identity .position')).length, 0);
  await menu.tap();
  await wait(async () => (await page.data()).resourceMenuOpen, 'Left menu must open');
  const dropdown = await page.$('.resource-menu'),
    dropdownOffset = await dropdown.offset(),
    dropdownSize = await dropdown.size();
  assert.ok(
    Math.abs(dropdownOffset.left - menuOffset.left) < 1,
    'Dropdown follows the left menu control',
  );
  assert.ok(dropdownOffset.left + dropdownSize.width <= (await page.data()).windowWidth);
  await mini.screenshot({ path: path.join(output, 'left-menu-right-settings.png') });
  await menu.tap();
  await wait(async () => !(await page.data()).resourceMenuOpen, 'Menu closes normally');
  report.checks.push({ name: 'compact-labelled-settings-and-no-empty-activity', font, menuFont });
  await (await page.$('#join-table-button')).tap();
  const during = await wait(async () => {
    const state = await inspect();
    return state.hand === 1 ? state : null;
  }, 'The real join tap must reach the shared controller');
  assert.equal(during.hand, 1);
  assert.equal(during.entry, 'dealing');
  assert.equal((await page.data()).canAct, false);
  await page.waitFor(500);
  assert.equal((await inspect()).history, during.history);
  await wait(async () => (await page.data()).entryState === 'playing', 'Deal must finish');
  const after = await inspect();
  assert.equal(after.players, 1);
  assert.ok(after.music.time > first.music.time);
  report.checks.push({ name: 'join-once-and-complete-deal-before-actions', during, after });
  await mini.evaluate(() => getApp().onHide());
  const paused = await inspect();
  assert.equal(paused.music.paused, true);
  assert.equal(paused.music.volume, 0);
  await mini.evaluate(() => getApp().onShow());
  const resumed = await wait(async () => {
    const state = await inspect();
    return state.music?.volume === 1 && !state.music.paused ? state : null;
  }, 'Music must fade back in');
  assert.ok(resumed.music.time >= paused.music.time);
  assert.equal(resumed.players, 1);
  report.checks.push({ name: 'app-handler-background-and-resume-in-place', paused, resumed });
  await mini.reLaunch('/pages/table/table');
  page = await mini.currentPage();
  await wait(async () => (await page.data()).waitingForSeat, 'Reopening must wait again');
  const reentry = await inspect();
  assert.equal(reentry.street, '等待入座，即将开始第 1 局第 2 手');
  for (const count of [5, 6, 7, 8, 9]) {
    await mini.evaluate(
      (count) => getCurrentPages().at(-1)._controller.setPreference('playerCount', count),
      count,
    );
    await wait(
      async () => (await page.data()).seats.length === count - 1,
      'Waiting seats must match settings',
    );
    const data = await page.data();
    assert.equal(data.heroCards.length, 0);
    assert.ok(data.seats.every((seat) => seat.bet === undefined));
    await mini.screenshot({ path: path.join(output, `waiting-${count}-seats.png`) });
  }
  report.checks.push({ name: 'next-session-hand-and-all-waiting-table-sizes', reentry });
  const reset = await page.$('.practice-panel .session-title .practice-reset');
  assert.ok(reset);
  await mini.pageScrollTo(
    Math.max(0, (await reset.offset()).top - (await page.data()).topInset - 100),
  );
  const resetSize = await reset.size(),
    resetOffset = await reset.offset();
  // The title sits in the heading with its (hidden while playing) standing tag.
  const title = await page.$('.practice-panel .session-title > .session-heading'),
    titleOffset = await title.offset(),
    titleSize = await title.size();
  assert.equal(resetSize.width, 70);
  assert.equal(resetSize.height, 32);
  assert.ok(resetOffset.left >= titleOffset.left + titleSize.width + 8);
  assert.ok(
    Math.abs(resetOffset.top + resetSize.height / 2 - titleOffset.top - titleSize.height / 2) < 1,
  );
  await mini.screenshot({ path: path.join(output, 'practice-heading.png') });
  await reset.tap();
  await wait(
    async () => (await page.data()).resetOpen,
    'Moved reset opens the existing confirmation',
  );
  await (await page.$('.reset-sheet .close')).tap();
  await wait(async () => !(await page.data()).resetOpen, 'Cancel closes reset');
  assert.equal((await inspect()).hand, 0);
  await reset.tap();
  const confirm = await wait(
    async () => page.$('.reset-sheet .primary'),
    'Confirmation button must render after reopening reset',
  );
  await confirm.tap();
  await wait(
    async () => (await inspect()).hand === 1 && !(await page.data()).resetOpen,
    'Confirmed reset starts the new practice',
  );
  assert.equal((await page.data()).stats.hands, 0);
  report.checks.push({
    name: 'practice-reset-in-heading-cancel-and-confirm',
    resetSize,
    settingsOnRight: true,
  });
  assert.deepEqual(report.exceptions, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || String(error);
  try {
    await mini?.screenshot({ path: path.join(output, 'failure.png') });
  } catch {}
} finally {
  try {
    if (mini && saved)
      await mini.evaluate((saved) => {
        const app = getApp();
        app.noirMusic?.dispose();
        app.noirController?.destroy();
        if (app.__entryProbe) {
          clearInterval(app.__entryProbe.timer);
          wx.createInnerAudioContext = app.__entryProbe.original;
          delete app.__entryProbe;
        }
        for (const [key, value] of [
          ['noir-wechat-settings-v1', saved.settings],
          ['noir-game-records-v1', saved.records],
        ]) {
          if (value) wx.setStorageSync(key, value);
          else wx.removeStorageSync(key);
        }
        app.noirTableReady = false;
        app.onLaunch();
      }, saved);
    if (mini) await mini.reLaunch('/pages/table/table');
  } catch (error) {
    report.cleanupError = String(error);
  }
  await mini?.disconnect();
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      status: report.status,
      checks: report.checks.map((check) => check.name),
      error: report.error,
    }),
  );
}
if (report.status !== 'passed') process.exitCode = 1;

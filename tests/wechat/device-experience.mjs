// Dedicated tourist-AppID project only. Real audio events and page lifecycle;
// no private-card fixture is installed in the application.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.resolve(process.argv[3] || '.artifacts/device-experience');
await mkdir(output, { recursive: true });
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const build = JSON.parse(
  await readFile(path.join(root, '.artifacts/wechat/build-info.json'), 'utf8'),
);
assert.equal(
  build.appId,
  'touristappid',
  'Never run this disposable workflow against a real AppID',
);
const mini = await require('miniprogram-automator').connect({ wsEndpoint: process.argv[2] });
const report = {
  status: 'running',
  build,
  scope: 'Dedicated DevTools simulator; real API events, no speaker or physical-phone claim',
  exceptions: [],
  checks: [],
};
mini.on('exception', (e) => report.exceptions.push(e));
async function wait(fn, label, ms = 60000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const r = await fn();
    if (r) return r;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error(label);
}
try {
  await wait(
    () => mini.evaluate(() => !!getCurrentPages().at(-1)?._controller),
    'Initial controller',
  );
  await mini.evaluate(() => {
    const app = getApp(),
      page = getCurrentPages().at(-1);
    page._controller.setPreference('sound', true);
    page._controller.setPreference('music', true);
    app.noirMusic.dispose();
    const probe = (app.__deviceProbe = {
      original: wx.createInnerAudioContext,
      audios: [],
      events: [],
    });
    wx.createInnerAudioContext = function (options) {
      const audio = probe.original.call(this, options);
      probe.audios.push(audio);
      for (const [method, type] of [
        ['onPlay', 'play'],
        ['onEnded', 'ended'],
        ['onError', 'error'],
      ])
        audio[method]?.((detail) =>
          probe.events.push({ type, src: audio.src, at: Date.now(), detail }),
        );
      return audio;
    };
    app.onLaunch();
    page.stopSounds();
    page.preloadSounds();
    page._audioUnlocked = false;
    return true;
  });
  await wait(
    () => mini.evaluate(() => getApp().noirMusic.getState().playing),
    'Entry music starts without a table action',
    20000,
  );
  report.entry = await mini.evaluate(() => ({
    music: getApp().noirMusic.getState(),
    events: getApp().__deviceProbe.events,
  }));
  let page = await mini.currentPage();
  assert.equal(
    (await page.data()).waitingForSeat,
    true,
    'This suite requires its fresh disposable project',
  );
  await (await page.$('#join-table-button')).tap();
  await wait(
    () =>
      mini.evaluate(() =>
        getApp().__deviceProbe.events.some((e) => e.type === 'play' && e.src.includes('/deal.wav')),
      ),
    'First join deal audio',
  );
  report.checks.push('entry-music-and-first-join-real-play-events');
  await wait(() => mini.evaluate(() => getCurrentPages().at(-1).data.canAct), 'Natural hero turn');
  await mini.evaluate(() => {
    const p = getCurrentPages().at(-1);
    p.preset({ currentTarget: { dataset: { preset: 'min' } } });
    return true;
  });
  const slider = await page.$('.raise-controls slider');
  report.slider = {
    size: await slider.size(),
    offset: await slider.offset(),
    before: (await page.data()).sliderValue,
  };
  const shell = await page.$('.game-shell');
  const shellOffset = await shell.offset(),
    shellSize = await shell.size();
  assert.ok(
    report.slider.offset.left - 14 >= shellOffset.left,
    'The full minimum-position thumb remains inside the card',
  );
  assert.ok(
    report.slider.offset.left + report.slider.size.width + 14 <= shellOffset.left + shellSize.width,
    'The full maximum-position thumb remains inside the card',
  );
  assert.ok(report.slider.size.height >= 28, 'Native slider hit height');
  await mini.screenshot({ path: path.join(output, 'slider-min.png') });
  // Real playback event order; cue invocation is a labelled audio-only probe.
  await mini.evaluate(() => {
    getApp().__deviceProbe.events = [];
    const p = getCurrentPages().at(-1);
    p.playSound('check');
    p.playSound('win');
    return true;
  });
  await wait(
    () =>
      mini.evaluate(() =>
        getApp().__deviceProbe.events.some((e) => e.type === 'play' && e.src.includes('/win.wav')),
      ),
    'Result follows complete check cue',
  );
  report.audioOrder = await mini.evaluate(() => getApp().__deviceProbe.events);
  const checkStart = report.audioOrder.find(
    (e) => e.type === 'play' && e.src.includes('/check.wav'),
  );
  const winStart = report.audioOrder.find((e) => e.type === 'play' && e.src.includes('/win.wav'));
  assert.ok(
    checkStart && winStart && winStart.at - checkStart.at >= 220,
    JSON.stringify(report.audioOrder),
  );
  report.checks.push('real-check-playback-finishes-both-knocks-before-result');
  // Return to the natural hand and settle it through the actual controls.
  await (await page.$('.fold-button')).tap();
  await wait(() => mini.evaluate(() => getCurrentPages().at(-1).data.done), 'Natural hand settles');
  const live = await mini.evaluate(() => getApp().noirController.getGame());
  await mini.evaluate(() => {
    getCurrentPages().at(-1).openRecords();
    return true;
  });
  await wait(
    async () => (await mini.currentPage()).path === 'pages/records/records',
    'Record list',
  );
  page = await mini.currentPage();
  await wait(async () => (await page.$$('.hand-item')).length > 0, 'Rendered records');
  await (await page.$('.hand-item')).tap();
  await wait(
    () => mini.evaluate(() => !!getCurrentPages().at(-1)?._readOnlyAttempt),
    'Historical controller',
  );
  page = await mini.currentPage();
  report.history = await mini.evaluate(() => {
    const p = getCurrentPages().at(-1),
      d = p.data;
    return {
      readOnly: d.historyReadOnly,
      hero: d.heroCards.map((c) => c.arriving),
      board: d.board.map((c) => c.arriving),
      seats: d.phoneSeats.map((s) => ({
        peek: s.peekArriving,
        cards: s.cards.map((c) => c.arriving),
        backs: s.backCards.map((c) => c.arriving),
      })),
      audioContexts: p._audio.length,
    };
  });
  assert.ok(report.history.readOnly);
  assert.ok([...report.history.hero, ...report.history.board].every((v) => !v));
  assert.ok(
    report.history.seats.every(
      (s) => !s.peek && s.cards.every((v) => !v) && s.backs.every((v) => !v),
    ),
  );
  assert.equal(report.history.audioContexts, 0);
  assert.deepEqual(await mini.evaluate(() => getApp().noirController.getGame()), live);
  await mini.screenshot({ path: path.join(output, 'history-initial-static.png') });
  report.checks.push('history-initial-terminal-frame-no-audio-pool');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack;
  throw error;
} finally {
  await mini
    .evaluate(() => {
      const p = getApp().__deviceProbe;
      if (p) {
        wx.createInnerAudioContext = p.original;
        delete getApp().__deviceProbe;
      }
      return true;
    })
    .catch(() => {});
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await mini.disconnect();
}

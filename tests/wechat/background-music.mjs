// Actual DevTools playback; wrappers observe real audio APIs without mocking them.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const output = path.resolve(process.argv[3] || '.artifacts/background-music/wechat');
await mkdir(output, { recursive: true });
const mini = await require('miniprogram-automator').connect({ wsEndpoint: process.argv[2] });
const report = {
  platform: 'WeChat DevTools simulator',
  status: 'running',
  checks: [],
  exceptions: [],
};
mini.on('exception', (value) => report.exceptions.push(value));
let saved;
async function wait(read, message, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw Error(message);
}
const inspect = () =>
  mini.evaluate(() => {
    const app = getApp();
    const audio = app.__bgmProbe?.audios.find((audio) => audio.src.includes('/music/'));
    return {
      controller: app.noirMusic?.getState(),
      audio: audio
        ? {
            source: audio.src,
            loop: audio.loop,
            volume: audio.volume,
            paused: audio.paused,
            time: audio.currentTime,
            duration: audio.duration,
          }
        : null,
      events: app.__bgmProbe?.events || [],
      seeked: app.__bgmProbe?.seeked || null,
      settings: getCurrentPages().at(-1)?.data.settings,
    };
  });
try {
  report.build = JSON.parse(
    await readFile(path.join(root, '.artifacts/wechat/build-info.json'), 'utf8'),
  );
  saved = await mini.evaluate(() => wx.getStorageSync('noir-wechat-settings-v1') || null);
  await mini.reLaunch('/pages/table/table');
  await mini.evaluate(() => {
    const app = getApp();
    const page = getCurrentPages().at(-1);
    page._controller.setPreference('sound', true);
    page._controller.setPreference('vibration', true);
    app.noirMusic?.dispose();
    app.__bgmProbe = { audios: [], events: [], original: wx.createInnerAudioContext };
    wx.createInnerAudioContext = function (...args) {
      const audio = app.__bgmProbe.original.apply(this, args);
      app.__bgmProbe.audios.push(audio);
      for (const [name, event] of [
        ['onPlay', 'play'],
        ['onPause', 'pause'],
        ['onEnded', 'ended'],
        ['onError', 'error'],
      ])
        audio[name]?.((detail) =>
          app.__bgmProbe.events.push({ event, source: audio.src, time: audio.currentTime, detail }),
        );
      audio.onSeeked?.(() => {
        app.__bgmProbe.seeked = { time: audio.currentTime, duration: audio.duration };
      });
      return audio;
    };
    // Recreate only the music transport with the real App startup handler.
    app.onLaunch();
    page.openSettings();
  });
  let page = await mini.currentPage();
  const initial = await wait(async () => {
    const state = await inspect();
    return state.audio?.duration > 93 && state.audio.time > 0.1 && state.controller?.playing
      ? state
      : null;
  }, 'Local subpackage music must decode and advance');
  assert.equal(initial.audio.loop, true);
  assert.equal(initial.audio.volume, 0.28);
  assert.ok(initial.audio.source.endsWith('/music/background-music.m4a'));
  await mini.screenshot({ path: path.join(output, 'settings-default-on.png') });
  report.checks.push({ name: 'real-local-audio-decode', evidence: initial });
  await mini.evaluate(() => {
    const probe = getApp().__bgmProbe;
    const audio = probe.audios.find((audio) => audio.src.includes('/music/'));
    audio.seek(audio.duration - 0.3);
  });
  const seeked = await wait(
    async () => (await inspect()).seeked,
    'Native audio seek must complete',
  );
  assert.ok(seeked.time > seeked.duration - 1, 'Seek callback must observe the real end position');
  const wrapped = await wait(async () => {
    const state = await inspect();
    return state.audio.time < 3 && state.controller.playing ? state : null;
  }, 'Real InnerAudioContext must loop beyond the end');
  report.checks.push({ name: 'real-audio-loop', seeked, wrapped });
  const sound = await page.$('#sound-button');
  await sound.tap();
  const muted = await wait(async () => {
    const state = await inspect();
    return state.settings.sound === false && !state.controller.playing && state.audio.paused
      ? state
      : null;
  }, 'Sound switch must pause music');
  assert.equal(muted.settings.vibration, true);
  await (await page.$('#vibration-button')).tap();
  await sound.tap();
  const restored = await wait(async () => {
    const state = await inspect();
    return state.settings.sound && state.controller.playing ? state : null;
  }, 'Unmuting must resume music');
  assert.equal(restored.settings.vibration, false);
  await mini.screenshot({ path: path.join(output, 'music-on-vibration-off.png') });
  report.checks.push({ name: 'independent-switches', muted, restored });
  await mini.evaluate(() => getApp().onHide());
  const hidden = await inspect();
  assert.equal(hidden.controller.active, false);
  assert.equal(hidden.audio.paused, true);
  await mini.evaluate(() => getApp().onShow());
  await wait(async () => (await inspect()).controller.playing, 'App onShow must resume music');
  report.checks.push({
    name: 'app-lifecycle-handlers',
    hidden,
    scope: 'Invoked actual App.onHide/onShow in DevTools, not physical-client background',
  });
  await mini.reLaunch('/pages/table/table');
  page = await mini.currentPage();
  const persisted = await inspect();
  assert.equal(persisted.settings.sound, true);
  assert.equal(persisted.settings.vibration, false);
  assert.equal(persisted.controller.playing, true);
  report.checks.push({ name: 'page-relaunch-persistence', evidence: persisted });
  assert.ok(
    !persisted.events.some((event) => event.event === 'error'),
    'Actual audio must report no error',
  );
  assert.deepEqual(report.exceptions, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || String(error);
  try {
    report.failureState = await inspect();
  } catch {}
  try {
    await mini.screenshot({ path: path.join(output, 'failure.png') });
  } catch {}
  process.exitCode = 1;
} finally {
  try {
    if (saved !== undefined) {
      await mini.evaluate((saved) => {
        const app = getApp();
        app.noirMusic?.dispose();
        if (app.__bgmProbe?.original) wx.createInnerAudioContext = app.__bgmProbe.original;
        if (saved === null) wx.removeStorageSync('noir-wechat-settings-v1');
        else wx.setStorageSync('noir-wechat-settings-v1', saved);
        delete app.__bgmProbe;
        app.onLaunch();
      }, saved);
      await mini.reLaunch('/pages/table/table');
    }
  } catch (error) {
    report.cleanupError = String(error);
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      status: report.status,
      checks: report.checks.map((check) => check.name),
      error: report.error,
    }),
  );
  mini.disconnect();
}

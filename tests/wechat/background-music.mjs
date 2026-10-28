// Actual DevTools APIs: observations only; no substituted clock or audio data.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const require = createRequire(path.join(root, '.artifacts/wechat-tools/package.json'));
const output = path.resolve(process.argv[3] || '.artifacts/background-music/wechat');
await mkdir(output, { recursive: true });
const mini = await require('miniprogram-automator').connect({ wsEndpoint: process.argv[2] });
const report = {
  platform: 'WeChat DevTools',
  status: 'running',
  checks: [],
  exceptions: [],
  scope: 'Real decoded-buffer scheduling and lifecycle; physical-speaker listening is separate',
};
mini.on('exception', (value) => report.exceptions.push(value));
let saved;
async function wait(read, message, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = await read();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw Error(message);
}
const inspect = () =>
  mini.evaluate(() => {
    const app = getApp(),
      p = app.__bgmProbe;
    return {
      state: app.noirMusic?.getState(),
      decoded: p.decoded,
      starts: p.starts,
      time: p.context?.currentTime,
      contextState: p.context?.state,
      volume: p.gain?.gain.value,
      nodes: p.nodes.map((node) => ({ loop: node.loop, loopEnd: node.loopEnd })),
      settings: getCurrentPages().at(-1)?.data.settings,
      fallbacks: p.fallbacks,
    };
  });
try {
  report.build = JSON.parse(
    await readFile(path.join(root, '.artifacts/wechat/build-info.json'), 'utf8'),
  );
  saved = await mini.evaluate(() => wx.getStorageSync('noir-wechat-settings-v1') || null);
  await wait(
    () => mini.evaluate(() => !!getCurrentPages().at(-1)?._controller),
    'Current controller ready',
  );
  await mini.reLaunch('/pages/table/table');
  await wait(
    () => mini.evaluate(() => !!getCurrentPages().at(-1)?._controller),
    'Reopened controller ready',
  );
  await mini.evaluate(() => {
    const app = getApp();
    app.noirMusic?.dispose();
    const original = wx.createWebAudioContext,
      inner = wx.createInnerAudioContext;
    app.__bgmProbe = { nodes: [], starts: [], decoded: [], fallbacks: 0, original, inner };
    wx.createInnerAudioContext = function (...args) {
      app.__bgmProbe.fallbacks++;
      return inner.apply(this, args);
    };
    wx.createWebAudioContext = function (...args) {
      const context = original.apply(this, args),
        p = app.__bgmProbe;
      p.context = context;
      const decode = context.decodeAudioData.bind(context),
        source = context.createBufferSource.bind(context),
        gain = context.createGain.bind(context);
      context.decodeAudioData = (bytes, done, fail) =>
        decode(
          bytes,
          (buffer) => {
            const samples = buffer.getChannelData(0);
            let energy = 0;
            for (let i = 0; i < samples.length; i += 100) energy += samples[i] ** 2;
            p.decoded.push({
              duration: buffer.duration,
              sampleRate: buffer.sampleRate,
              channels: buffer.numberOfChannels,
              rms: Math.sqrt(energy / Math.ceil(samples.length / 100)),
            });
            done(buffer);
          },
          fail,
        );
      context.createGain = () => {
        const node = gain();
        p.gain = node;
        return node;
      };
      context.createBufferSource = () => {
        const node = source(),
          start = node.start.bind(node);
        p.nodes.push(node);
        node.start = (...values) => {
          p.starts.push({ at: context.currentTime, offset: values[1] || 0 });
          return start(...values);
        };
        return node;
      };
      return context;
    };
    const page = getCurrentPages().at(-1);
    page._controller.setPreference('music', true);
    app.onLaunch();
    app.onShow();
    page.openSettings();
  });
  const initial = await wait(async () => {
    const state = await inspect();
    return state.decoded.length === 1 &&
      state.starts.length === 1 &&
      state.state.playing &&
      state.volume === 1
      ? state
      : null;
  }, 'Real local WebAudio music must decode, play and finish entry fade');
  assert.ok(initial.decoded[0].rms > 0.01);
  assert.ok(initial.decoded[0].duration > 93 && initial.decoded[0].duration < 94);
  assert.equal(initial.nodes[0].loop, true);
  report.checks.push({ name: 'local-decode-and-loop-source', evidence: initial });
  await mini.screenshot({ path: path.join(output, 'music-settings.png') });
  const start = initial.starts[0].at,
    duration = initial.decoded[0].duration;
  const samples = [];
  // Wait through the complete track. A seek or shortened buffer would not prove
  // the real loop path. The caller can keep working while this probe runs.
  while ((await inspect()).time - start < duration + 1) {
    const state = await inspect();
    assert.equal(state.starts.length, 1);
    assert.equal(state.decoded.length, 1);
    assert.equal(state.state.playing, true);
    assert.equal(state.volume, 1);
    samples.push({ time: state.time, starts: state.starts.length, volume: state.volume });
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  report.checks.push({
    name: 'complete-track-loop-without-source-restart-or-refade',
    samples,
    evidence: await inspect(),
  });
  await mini.evaluate(() => getApp().onHide());
  const hidden = await inspect();
  assert.equal(hidden.state.playing, false);
  await mini.evaluate(() => getApp().onShow());
  const resumed = await wait(async () => {
    const s = await inspect();
    return s.starts.length === 2 && s.state.playing && s.volume === 1 ? s : null;
  }, 'Resume existing decoded buffer');
  assert.equal(resumed.decoded.length, 1);
  assert.ok(resumed.starts[1].offset >= 0 && resumed.starts[1].offset < duration);
  report.checks.push({ name: 'hide-resume-retains-loop-position', hidden, resumed });
  await mini.evaluate(() => {
    const p = getCurrentPages().at(-1);
    p._controller.setPreference('music', false);
  });
  assert.equal((await inspect()).state.playing, false);
  await mini.evaluate(() => {
    const p = getCurrentPages().at(-1);
    p._controller.setPreference('music', true);
  });
  await wait(async () => (await inspect()).state.playing, 'Music enable resumes playback');
  report.checks.push({ name: 'music-toggle', evidence: await inspect() });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.stack || String(error);
  try {
    report.lastState = await inspect();
    await mini.screenshot({ path: path.join(output, 'failure.png') });
  } catch {}
  process.exitCode = 1;
} finally {
  try {
    await mini.evaluate((saved) => {
      const app = getApp(),
        p = app.__bgmProbe;
      if (!p) return;
      app.noirMusic?.dispose();
      if (p) {
        wx.createWebAudioContext = p.original;
        wx.createInnerAudioContext = p.inner;
      }
      if (saved) wx.setStorageSync('noir-wechat-settings-v1', saved);
      else wx.removeStorageSync('noir-wechat-settings-v1');
      delete app.__bgmProbe;
      app.onLaunch();
      app.onShow();
    }, saved);
  } catch {}
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await mini.disconnect();
}
console.log(
  JSON.stringify({
    status: report.status,
    checks: report.checks.map((c) => c.name),
    error: report.error,
  }),
);

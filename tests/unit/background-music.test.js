import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMusicController, BACKGROUND_MUSIC_VOLUME } from '../../src/ui/background-music.js';
import { createWebBackgroundMusic } from '../../src/platform/web-background-music.js';
import { createWechatBackgroundMusic } from '../../src/platform/wechat-background-music.js';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { loadFeedbackPreferences } from '../../src/ui/feedback-preferences.js';

test('sound effects, background music and vibration default on and switch independently', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null };
  assert.deepEqual(loadFeedbackPreferences(storage), { sound: true, music: true, vibration: true });
  values.set('noir-sound', 'false');
  assert.deepEqual(loadFeedbackPreferences(storage), {
    sound: false,
    music: true,
    vibration: true,
  });
  values.set('noir-music', 'false');
  assert.deepEqual(loadFeedbackPreferences(storage), {
    sound: false,
    music: false,
    vibration: true,
  });
  values.set('noir-sound', 'true');
  values.set('noir-vibration', 'false');
  assert.deepEqual(loadFeedbackPreferences(storage), {
    sound: true,
    music: false,
    vibration: false,
  });
  // Unreadable storage keeps every switch on.
  const broken = {
    getItem() {
      throw Error('blocked');
    },
  };
  assert.deepEqual(loadFeedbackPreferences(broken), { sound: true, music: true, vibration: true });
});

test('muted/hidden music allocates no player and disposal prevents every later restart', () => {
  let created = 0,
    plays = 0,
    pauses = 0,
    disposed = 0;
  const music = createMusicController({
    enabled: false,
    createPlayer: () => {
      created++;
      return { play: () => plays++, pause: () => pauses++, dispose: () => disposed++ };
    },
  });
  music.unlock();
  assert.equal(created, 0);
  music.setActive(false);
  music.setEnabled(true);
  assert.equal(created, 0);
  music.setActive(true);
  assert.equal(created, 1);
  music.setEnabled(false);
  assert.equal(pauses, 1);
  music.dispose();
  music.setEnabled(true);
  music.setActive(true);
  music.unlock();
  assert.equal(plays, 1);
  assert.equal(disposed, 1);
});

test('Web audio loops the same local element, preserves position and rejects a stale play completion', async () => {
  let finish;
  const audio = {
    dataset: {},
    paused: true,
    currentTime: 27,
    volume: 1,
    play() {
      this.paused = false;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    pause() {
      this.paused = true;
    },
    removeAttribute() {},
    load() {},
    remove() {
      this.removed = true;
    },
  };
  let gain;
  const mixedOutput = {};
  const context = {
    state: 'running',
    destination: {},
    createMediaElementSource: () => ({ connect: (node) => node, disconnect() {} }),
    createGain() {
      gain = {
        gain: {},
        connect(target) {
          this.connected = target;
        },
        disconnect() {},
      };
      return gain;
    },
    async suspend() {
      this.state = 'suspended';
    },
    async resume() {
      this.state = 'running';
    },
    async close() {
      this.state = 'closed';
    },
  };
  let allocations = 0;
  const music = createWebBackgroundMusic({
    document: {
      baseURI: 'https://example.test/poker/',
      createElement() {
        allocations++;
        return audio;
      },
      body: { append() {} },
    },
    createContext: () => context,
    getOutput: () => mixedOutput,
  });
  assert.equal(audio.src, 'https://example.test/poker/audio/background-music.m4a');
  assert.equal(audio.loop, true);
  assert.equal(gain.gain.value, 0, 'Entry starts quietly');
  assert.equal(gain.connected, mixedOutput, 'Music and cues share the final mix limiter');
  music.setActive(false);
  finish();
  await Promise.resolve();
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 27);
  music.setActive(true);
  await Promise.resolve();
  assert.equal(audio.paused, false);
  assert.equal(allocations, 1);
  music.setEnabled(false);
  assert.equal(audio.paused, true);
  music.dispose();
  assert.equal(audio.removed, true);
  assert.equal(context.state, 'closed');
});

test('WeChat late subpackage load/canplay cannot resurrect muted, hidden or disposed music', async () => {
  let load;
  const loading = new Promise((resolve) => (load = resolve));
  const audios = [];
  const wx = {
    createInnerAudioContext() {
      const audio = {
        onPlay(fn) {
          this.played = fn;
        },
        onPause(fn) {
          this.paused = fn;
        },
        onCanplay(fn) {
          this.ready = fn;
        },
        onError() {},
        onStop() {},
        play() {
          this.playCount = (this.playCount || 0) + 1;
          this.played?.();
        },
        pause() {
          this.pauseCount = (this.pauseCount || 0) + 1;
          this.paused?.();
        },
        stop() {},
        destroy() {
          this.destroyed = true;
        },
      };
      audios.push(audio);
      return audio;
    },
  };
  const music = createWechatBackgroundMusic(wx, { loadSource: () => loading });
  music.setEnabled(false);
  load('/music/background-music.m4a');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(audios.length, 0);
  music.setEnabled(true);
  const audio = audios[0];
  assert.equal(audio.src, '/music/background-music.m4a');
  assert.equal(audio.loop, true);
  assert.equal(audio.volume, 0);
  assert.equal(audio.playCount, 1);
  music.setActive(false);
  audio.ready();
  assert.equal(audio.playCount, 1);
  music.setActive(true);
  assert.equal(audio.playCount, 2);
  music.dispose();
  audio.ready();
  const pausesAfterDestroy = audio.pauseCount;
  audio.played();
  assert.equal(audio.pauseCount, pausesAfterDestroy);
  assert.equal(audio.playCount, 2);
  assert.equal(audio.destroyed, true);
});

test('native apps and touch browsers select the phone master; desktop keeps the existing mix', () => {
  for (const [native, mobile, expected] of [
    [false, undefined, 'background-music.m4a'],
    [true, undefined, 'background-music-mobile.m4a'],
    [false, true, 'background-music-mobile.m4a'],
  ]) {
    const audio = {
      dataset: {},
      paused: true,
      play() {},
      pause() {},
      removeAttribute() {},
      load() {},
      remove() {},
    };
    const music = createWebBackgroundMusic({
      document: {
        baseURI: 'https://example.test/poker/',
        documentElement: { classList: { contains: () => native } },
        createElement: () => audio,
        body: { append() {} },
      },
      ...(mobile === undefined ? {} : { mobile }),
      createContext: () => {
        throw Error('No Web Audio');
      },
    });
    assert.equal(audio.src, `https://example.test/poker/audio/${expected}`);
    assert.equal(audio.volume, 0, 'Entry fade also works without Web Audio');
    assert.equal(audio.loop, true);
    music.dispose();
  }
});

test('WeChat maintains full music volume across unlocks and cancels fade timers on hide, mute and disposal', async () => {
  let serial = 0,
    now = 0;
  const jobs = new Map();
  const audio = {
    onPlay(fn) {
      this.played = fn;
    },
    play() {
      this.played();
    },
    pause() {},
    stop() {},
    destroy() {},
  };
  const music = createWechatBackgroundMusic(
    { createInnerAudioContext: () => audio },
    {
      loadSource: () => '/music/background-music.m4a',
      now: () => now,
      schedule(fn, delay) {
        assert.equal(delay, 40, 'Only the entry/resume fade schedules music volume updates');
        jobs.set(++serial, fn);
        return serial;
      },
      unschedule: (id) => jobs.delete(id),
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(audio.volume, 0);
  now = 2400;
  const initial = jobs.entries().next().value;
  jobs.delete(initial[0]);
  initial[1]();
  assert.equal(audio.volume, BACKGROUND_MUSIC_VOLUME);
  for (let action = 0; action < 10; action++) {
    music.unlock();
    assert.equal(audio.volume, BACKGROUND_MUSIC_VOLUME);
    assert.equal(jobs.size, 0, 'Repeated action gestures must not schedule another fade');
  }
  for (const stop of [
    () => music.setActive(false),
    () => music.setEnabled(false),
    () => music.dispose(),
  ]) {
    music.setActive(false);
    music.setEnabled(true);
    music.setActive(true);
    const cancelled = jobs.get(serial);
    assert.equal(typeof cancelled, 'function');
    stop();
    assert.equal(jobs.size, 0);
    assert.equal(audio.volume, 0);
    cancelled();
    assert.equal(audio.volume, 0);
  }
  music.unlock();
  assert.equal(jobs.size, 0);
});

test('WeChat resumes music the system paused, rate-limited, but never a requested pause', async () => {
  let serial = 0,
    now = 0;
  const jobs = new Map();
  const audio = {
    playCount: 0,
    onPlay(fn) {
      this.played = fn;
    },
    onPause(fn) {
      this.paused = fn;
    },
    onStop(fn) {
      this.stopped = fn;
    },
    onError(fn) {
      this.failed = fn;
    },
    play() {
      this.playCount++;
      this.played();
    },
    pause() {
      this.paused();
    },
    stop() {},
    destroy() {},
  };
  const music = createWechatBackgroundMusic(
    { createInnerAudioContext: () => audio },
    {
      loadSource: () => '/music/background-music.m4a',
      now: () => now,
      schedule(fn, delay) {
        jobs.set(++serial, { fn, delay });
        return serial;
      },
      unschedule: (id) => jobs.delete(id),
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  const recoveries = () => [...jobs.entries()].filter(([, job]) => job.delay !== 40);
  const run = ([id, job]) => {
    jobs.delete(id);
    job.fn();
  };
  assert.equal(audio.playCount, 1);
  // A page's sound players pause the shared track: it resumes shortly after.
  audio.paused();
  assert.equal(recoveries().length, 1);
  assert.equal(recoveries()[0][1].delay, 300);
  run(recoveries()[0]);
  assert.equal(audio.playCount, 2);
  // A stop right after waits until 2s have passed since the last resume.
  now = 500;
  audio.stopped();
  assert.equal(recoveries()[0][1].delay, 1500);
  run(recoveries()[0]);
  assert.equal(audio.playCount, 3);
  // Requested pauses (hidden, muted) and disposal never resume.
  for (const stop of [() => music.setActive(false), () => music.setEnabled(false)]) {
    music.setActive(true);
    music.setEnabled(true);
    const before = audio.playCount;
    stop();
    assert.equal(recoveries().length, 0);
    assert.equal(audio.playCount, before);
  }
  music.setActive(true);
  music.setEnabled(true);
  now = 10000;
  audio.failed({ errCode: 10003, errMsg: 'temporarily unavailable' });
  assert.equal(recoveries().length, 1);
  const pending = recoveries()[0];
  music.dispose();
  assert.equal(recoveries().length, 0, 'Disposal cancels a pending resume');
  const before = audio.playCount;
  pending[1].fn();
  assert.equal(audio.playCount, before);
});

test('WeChat begins loading music on launch before the table is ready and preserves saved mute', async () => {
  for (const enabled of [true, false]) {
    let app,
      loads = 0;
    const require = (name) =>
      name.includes('background-music')
        ? { createWechatBackgroundMusic }
        : { WECHAT_SETTINGS_KEY: 'settings' };
    require.async = async () => {
      loads++;
      return '/music/background-music.m4a';
    };
    vm.runInNewContext(readFileSync(new URL('../../miniprogram/app.js', import.meta.url), 'utf8'), {
      require,
      App(value) {
        app = value;
      },
      wx: { getStorageSync: () => JSON.stringify({ music: enabled }) },
    });
    app.onLaunch();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(app.noirTableReady, undefined);
    assert.equal(app.noirMusic.getState().active, true);
    assert.equal(app.noirMusic.getState().enabled, enabled);
    assert.equal(loads, enabled ? 1 : 0);
    app.onHide();
    assert.equal(app.noirMusic.getState().active, false);
    app.onShow();
    assert.equal(
      app.noirMusic.getState().active,
      true,
      'Resume must not wait for the table-ready flag',
    );
    app.noirMusic.dispose();
  }
});

function loopFixture() {
  const nodes = [],
    jobs = new Map();
  let reads = 0,
    decodes = 0,
    time = 0,
    serial = 0;
  const gain = { gain: { value: 0 }, connect() {}, disconnect() {} };
  const context = {
    currentTime: 0,
    state: 'running',
    destination: {},
    createGain: () => gain,
    resume() {
      this.state = 'running';
      return Promise.resolve();
    },
    suspend() {
      this.state = 'suspended';
      return Promise.resolve();
    },
    close() {
      this.state = 'closed';
      return Promise.resolve();
    },
    decodeAudioData(data, success, fail) {
      decodes++;
      this.decoded = success;
      this.failed = fail;
    },
    createBufferSource() {
      const node = {
        connect() {},
        disconnect() {},
        start(when, offset) {
          this.startOffset = offset;
        },
        stop() {
          this.stopped = true;
        },
      };
      nodes.push(node);
      return node;
    },
  };
  const wx = {
    createWebAudioContext: () => context,
    getFileSystemManager: () => ({
      readFile({ success }) {
        reads++;
        success({ data: new ArrayBuffer(8) });
      },
    }),
  };
  const options = {
    loadSource: () => '/music/background-music.m4a',
    now: () => time,
    schedule(fn) {
      jobs.set(++serial, fn);
      return serial;
    },
    unschedule(id) {
      jobs.delete(id);
    },
  };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    wx,
    options,
    context,
    gain,
    jobs,
    nodes,
    flush,
    reads: () => reads,
    decodes: () => decodes,
    fadeIn() {
      time += 2400;
      for (const [id, fn] of [...jobs]) {
        jobs.delete(id);
        fn();
      }
    },
  };
}

test('WeChat decoded music loops on one source without new decodes or fades at each seam', async () => {
  const f = loopFixture(),
    music = createWechatBackgroundMusic(f.wx, f.options);
  await f.flush();
  f.context.decoded({ duration: 93.6585 });
  await f.flush();
  f.fadeIn();
  assert.equal(music.getState().playing, true);
  assert.equal(f.nodes[0].loop, true);
  assert.equal(f.nodes[0].loopStart, 0);
  assert.equal(f.nodes[0].loopEnd, 93.6585);
  assert.equal(f.gain.gain.value, BACKGROUND_MUSIC_VOLUME);
  for (const time of [93.65, 93.67, 187.4, 285]) {
    f.context.currentTime = time;
    music.unlock();
    await f.flush();
    assert.equal(f.nodes.length, 1, 'No source restart at loop or repeated gestures');
    assert.equal(f.gain.gain.value, BACKGROUND_MUSIC_VOLUME);
    assert.equal(f.jobs.size, 0);
  }
  assert.equal(f.reads(), 1);
  assert.equal(f.decodes(), 1);
  f.context.currentTime = 100;
  music.setActive(false);
  assert.equal(f.nodes[0].stopped, true);
  assert.equal(music.getState().playing, false);
  music.setActive(true);
  await f.flush();
  assert.ok(Math.abs(f.nodes[1].startOffset - (100 - 93.6585)) < 0.0001);
  assert.equal(f.decodes(), 1);
  music.dispose();
  assert.equal(f.jobs.size, 0);
  assert.equal(f.context.state, 'closed');
});

test('WeChat late decode stays silent while hidden or muted and disposal drops it', async () => {
  for (const action of ['hide', 'mute', 'dispose']) {
    const f = loopFixture(),
      music = createWechatBackgroundMusic(f.wx, f.options);
    await f.flush();
    if (action === 'hide') music.setActive(false);
    if (action === 'mute') music.setEnabled(false);
    if (action === 'dispose') music.dispose();
    f.context.decoded({ duration: 93 });
    await f.flush();
    assert.equal(f.nodes.length, 0);
    assert.equal(music.getState().playing, false);
    if (action !== 'dispose') {
      music.setEnabled(true);
      music.setActive(true);
      await f.flush();
      assert.equal(f.nodes.length, 1);
    }
    music.dispose();
  }
});

test('WeChat unsupported decoding falls back once to local looping audio', async () => {
  const f = loopFixture();
  let created = 0;
  const audio = {
    play() {
      this.played?.();
    },
    onPlay(fn) {
      this.played = fn;
    },
    pause() {},
    stop() {},
    destroy() {},
  };
  f.wx.createInnerAudioContext = () => {
    created++;
    return audio;
  };
  const music = createWechatBackgroundMusic(f.wx, f.options);
  await f.flush();
  f.context.failed(Error('codec unavailable'));
  await f.flush();
  assert.equal(created, 1);
  assert.equal(f.context.state, 'closed');
  assert.equal(audio.loop, true);
  assert.equal(audio.src, '/music/background-music.m4a');
  music.unlock();
  await f.flush();
  assert.equal(created, 1);
  music.dispose();
});

test('WeChat start failure releases an unstarted source and still reaches its compatibility player', async () => {
  const f = loopFixture();
  let plays = 0;
  const source = {
    connect() {},
    disconnect() {},
    start() {
      throw Error('start unavailable');
    },
    stop() {
      throw Error('source never started');
    },
  };
  f.context.createBufferSource = () => source;
  f.wx.createInnerAudioContext = () => ({
    onPlay(fn) {
      this.played = fn;
    },
    play() {
      plays++;
      this.played?.();
    },
    pause() {},
    stop() {},
    destroy() {},
  });
  const music = createWechatBackgroundMusic(f.wx, f.options);
  await f.flush();
  f.context.decoded({ duration: 93 });
  await f.flush();
  assert.ok(plays >= 1);
  assert.equal(music.getState().playing, true);
  assert.equal(f.context.state, 'closed');
  music.dispose();
});

test('WeChat starts a running context and resumes synchronous state changes without waiting on a native Promise', async () => {
  const f = loopFixture();
  let resumes = 0;
  f.context.resume = () => {
    resumes++;
    f.context.state = 'running';
    return new Promise(() => {});
  };
  const music = createWechatBackgroundMusic(f.wx, f.options);
  await f.flush();
  f.context.decoded({ duration: 93 });
  await f.flush();
  assert.equal(resumes, 0, 'Already running contexts need no resume request');
  assert.equal(f.nodes.length, 1);
  assert.equal(music.getState().playing, true);
  music.setActive(false);
  assert.equal(f.context.state, 'suspended');
  f.context.currentTime = 8;
  music.setActive(true);
  await f.flush();
  assert.equal(resumes, 1);
  assert.equal(f.nodes.length, 2);
  assert.equal(music.getState().playing, true);
  music.dispose();
});

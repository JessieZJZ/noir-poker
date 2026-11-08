import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMusicController,
  BACKGROUND_MUSIC_LOOP,
  BACKGROUND_MUSIC_VOLUME,
  loopFor,
  loopPosition,
} from '../../src/ui/background-music.js';
import {
  MUSIC_ENTRY_FADE_MS,
  MUSIC_PAUSE_FADE_MS,
  MUSIC_RESUME_FADE_MS,
} from '../../src/ui/music-fade.js';
import { createWebBackgroundMusic, fetchBytes } from '../../src/platform/web-background-music.js';
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

function audioParam(value = 0) {
  return {
    value,
    events: [],
    cancelScheduledValues(at) {
      this.events.push(['cancel', at]);
    },
    setValueAtTime(v, at) {
      this.value = v;
      this.events.push(['set', v, at]);
    },
    linearRampToValueAtTime(v, at) {
      this.target = v;
      this.events.push(['ramp', v, at]);
    },
  };
}

function webAudioFixture({ duration = 105.866 } = {}) {
  const nodes = [],
    gains = [],
    jobs = new Map(),
    loads = [],
    body = [];
  let serial = 0,
    decodes = 0,
    pendingDecode = null;
  const context = {
    currentTime: 0,
    state: 'running',
    destination: {},
    createGain() {
      const node = {
        gain: audioParam(),
        connect(target) {
          this.connected = target;
          return target;
        },
        disconnect() {},
      };
      gains.push(node);
      return node;
    },
    createBufferSource() {
      const node = {
        connect: (target) => target,
        disconnect() {},
        start(when, offset) {
          this.started = { when, offset };
        },
        stop(when) {
          this.stoppedAt = when ?? context.currentTime;
        },
      };
      nodes.push(node);
      return node;
    },
    decodeAudioData(data, success) {
      decodes++;
      pendingDecode = () => success({ duration });
    },
    suspend() {
      this.state = 'suspended';
      return Promise.resolve();
    },
    resume() {
      this.state = 'running';
      return Promise.resolve();
    },
    close() {
      this.state = 'closed';
      return Promise.resolve();
    },
  };
  const document = {
    baseURI: 'https://example.test/poker/',
    createElement: () => ({
      dataset: {},
      remove() {
        this.removed = true;
      },
    }),
    body: { append: (node) => body.push(node) },
  };
  return {
    context,
    nodes,
    gains,
    jobs,
    loads,
    marker: () => body[0],
    decodes: () => decodes,
    decode: () => pendingDecode?.(),
    flush: () => new Promise((resolve) => setTimeout(resolve, 0)),
    options: {
      document,
      mobile: false,
      createContext: () => context,
      getOutput: () => 'mix',
      loadData: async (url) => {
        loads.push(url);
        return new ArrayBuffer(8);
      },
      schedule(fn, delay) {
        jobs.set(++serial, { fn, delay });
        return serial;
      },
      unschedule: (id) => jobs.delete(id),
    },
  };
}

test('Web music decodes once, plays the intro once, loops the period and fades out before stopping', async () => {
  const f = webAudioFixture();
  const music = createWebBackgroundMusic(f.options);
  await f.flush();
  f.decode();
  await f.flush();
  assert.deepEqual(f.loads, ['https://example.test/poker/audio/background-music.m4a']);
  const [output, firstLevel] = f.gains;
  assert.equal(output.connected, 'mix', 'Music and cues share the final mix limiter');
  assert.equal(output.gain.value, BACKGROUND_MUSIC_VOLUME);
  const first = f.nodes[0];
  assert.deepEqual(first.started, { when: 0, offset: 0 }, 'Entry starts at the intro');
  assert.equal(first.loop, true);
  assert.equal(first.loopStart, BACKGROUND_MUSIC_LOOP.start);
  assert.equal(first.loopEnd, BACKGROUND_MUSIC_LOOP.end);
  assert.deepEqual(firstLevel.gain.events.slice(-2), [
    ['set', 0, 0],
    ['ramp', 1, MUSIC_ENTRY_FADE_MS / 1000],
  ]);
  const api = f.marker().backgroundMusic;
  assert.equal(f.marker().dataset.backgroundMusic, 'midnight-felt');
  // 120 s of playback: the intro once, then one full period and part of the next.
  f.context.currentTime = 120;
  const expected = loopPosition(120);
  assert.ok(expected > BACKGROUND_MUSIC_LOOP.start && expected < 30);
  assert.ok(Math.abs(api.currentTime - expected) < 1e-9);
  firstLevel.gain.value = 1;
  music.setActive(false);
  assert.equal(api.paused, true);
  assert.equal(music.getState().playing, false);
  assert.deepEqual(firstLevel.gain.events.slice(-2), [
    ['set', 1, 120],
    ['ramp', 0, 120 + MUSIC_PAUSE_FADE_MS / 1000],
  ]);
  assert.ok(first.stoppedAt > 120 + MUSIC_PAUSE_FADE_MS / 1000, 'Stop after the fade ends');
  assert.equal(f.context.state, 'running', 'The context keeps running through the fade');
  const suspend = [...f.jobs.values()].find((job) => job.delay === MUSIC_PAUSE_FADE_MS + 60);
  assert.ok(suspend);
  // Coming back during the fade cancels the suspend and resumes in place.
  music.setActive(true);
  assert.equal([...f.jobs.values()].includes(suspend), false);
  const second = f.nodes[1];
  assert.ok(Math.abs(second.started.offset - expected) < 1e-9);
  assert.equal(second.loopStart, BACKGROUND_MUSIC_LOOP.start);
  assert.deepEqual(f.gains[2].gain.events.slice(-1), [
    ['ramp', 1, 120 + MUSIC_RESUME_FADE_MS / 1000],
  ]);
  assert.equal(f.decodes(), 1);
  assert.equal(f.loads.length, 1);
  music.setActive(false);
  [...f.jobs.values()].find((job) => job.delay === MUSIC_PAUSE_FADE_MS + 60).fn();
  await f.flush();
  assert.equal(f.context.state, 'suspended');
  music.dispose();
  assert.equal(f.marker().removed, true);
  assert.equal(f.context.state, 'closed');
});

test('Web music decoded after mute, hide or disposal never starts on its own', async () => {
  for (const action of ['hide', 'mute', 'dispose']) {
    const f = webAudioFixture();
    const music = createWebBackgroundMusic(f.options);
    await f.flush();
    if (action === 'hide') music.setActive(false);
    if (action === 'mute') music.setEnabled(false);
    if (action === 'dispose') music.dispose();
    f.decode();
    await f.flush();
    assert.equal(f.nodes.length, 0, action);
    if (action !== 'dispose') {
      music.setEnabled(true);
      music.setActive(true);
      assert.equal(f.nodes.length, 1, action);
      assert.equal(f.nodes[0].started.offset, 0, 'The first start still begins at the intro');
    }
    music.dispose();
  }
});

test('loop positions run through the intro once and then stay inside the musical period', () => {
  const { start, end } = BACKGROUND_MUSIC_LOOP;
  assert.ok(start > 11 && start < 12.5, 'Two bars at 82 BPM');
  assert.ok(Math.abs(end - start - 4495610 / 48000) < 1e-9, 'Exactly one 32-bar period');
  assert.equal(loopPosition(0), 0);
  assert.equal(loopPosition(start - 0.01), start - 0.01);
  assert.equal(loopPosition(end - 0.01), end - 0.01);
  assert.ok(Math.abs(loopPosition(end) - start) < 1e-9);
  assert.ok(Math.abs(loopPosition(end + 2 * (end - start) + 3) - (start + 3)) < 1e-6);
  // A shorter decoded file (an older build) loops whole.
  assert.deepEqual(loopFor(93.6585), { start: 0, end: 93.6585 });
  assert.equal(loopFor(end + 0.5), BACKGROUND_MUSIC_LOOP);
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

test('WeChat plays the intro once, loops the period and fades out on the audio clock before suspending', async () => {
  const f = loopFixture();
  const events = [];
  Object.assign(f.gain.gain, {
    cancelScheduledValues: (at) => events.push(['cancel', at]),
    setValueAtTime(value, at) {
      this.value = value;
      events.push(['set', value, at]);
    },
    linearRampToValueAtTime: (value, at) => events.push(['ramp', value, at]),
  });
  let stoppedAt;
  const createSource = f.context.createBufferSource;
  f.context.createBufferSource = () => {
    const node = createSource();
    node.stop = (when) => {
      node.stopped = true;
      stoppedAt = when;
    };
    return node;
  };
  const music = createWechatBackgroundMusic(f.wx, f.options);
  await f.flush();
  f.context.decoded({ duration: BACKGROUND_MUSIC_LOOP.end + 0.5 });
  await f.flush();
  f.fadeIn();
  assert.equal(f.nodes[0].startOffset, 0);
  assert.equal(f.nodes[0].loopStart, BACKGROUND_MUSIC_LOOP.start);
  assert.equal(f.nodes[0].loopEnd, BACKGROUND_MUSIC_LOOP.end);
  f.context.currentTime = 150;
  music.setActive(false);
  assert.deepEqual(events.slice(-2), [
    ['set', BACKGROUND_MUSIC_VOLUME, 150],
    ['ramp', 0, 150 + MUSIC_PAUSE_FADE_MS / 1000],
  ]);
  assert.ok(stoppedAt > 150 + MUSIC_PAUSE_FADE_MS / 1000);
  assert.equal(f.context.state, 'running', 'Suspend waits for the fade');
  assert.equal(f.jobs.size, 1);
  const [[id, suspend]] = [...f.jobs];
  f.jobs.delete(id);
  suspend();
  await f.flush();
  assert.equal(f.context.state, 'suspended');
  music.setActive(true);
  await f.flush();
  assert.ok(Math.abs(f.nodes[1].startOffset - loopPosition(150)) < 1e-9);
  // Hiding and showing within the fade cancels the pending suspend.
  music.setActive(false);
  music.setActive(true);
  await f.flush();
  assert.equal(f.context.state, 'running');
  music.dispose();
  assert.equal(f.jobs.size, 0);
});

test('WeChat compatibility audio jumps back one period before the file end, never into the intro', async () => {
  const audio = {
    duration: BACKGROUND_MUSIC_LOOP.end + 0.5,
    currentTime: 0,
    onPlay(fn) {
      this.played = fn;
    },
    onTimeUpdate(fn) {
      this.tick = fn;
    },
    play() {
      this.played();
    },
    seek(time) {
      this.currentTime = time;
    },
    pause() {},
    stop() {},
    destroy() {},
  };
  const music = createWechatBackgroundMusic(
    { createInnerAudioContext: () => audio },
    { loadSource: () => '/music/background-music.m4a', schedule: () => 0, unschedule() {} },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (const [time, expected] of [
    [5, 5],
    [BACKGROUND_MUSIC_LOOP.end - 0.1, BACKGROUND_MUSIC_LOOP.end - 0.1],
    [BACKGROUND_MUSIC_LOOP.end + 0.2, BACKGROUND_MUSIC_LOOP.start + 0.2],
  ]) {
    audio.currentTime = time;
    audio.tick();
    assert.ok(Math.abs(audio.currentTime - expected) < 1e-6, String(time));
  }
  music.dispose();
});

test('the shipped music files match the rendered loop points and fingerprints', async () => {
  const { createHash } = await import('node:crypto');
  const root = new URL('../../', import.meta.url);
  const report = JSON.parse(
    readFileSync(new URL('audio-studio/noir-background-music/game-loop.json', root), 'utf8'),
  );
  assert.equal(BACKGROUND_MUSIC_LOOP.start, report.loopStartFrame / report.sampleRate);
  assert.equal(BACKGROUND_MUSIC_LOOP.end, report.loopEndFrameExclusive / report.sampleRate);
  assert.equal(report.loopEndFrameExclusive - report.loopStartFrame, report.cycleFrames);
  assert.ok(report.frames > report.loopEndFrameExclusive, 'The file continues past the loop end');
  for (const file of Object.values(report.files)) {
    const bytes = readFileSync(new URL(file.path, root));
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
    assert.equal(file.processedSeamMaxDiff, 0, 'The processed loop is exactly periodic');
    assert.ok(file.firstFrameAbs < 1e-4, 'The intro starts from silence');
  }
});

test('bundled audio reads accept the iOS scheme handler status 0 but reject missing or empty files', async () => {
  const original = globalThis.fetch;
  const respond = (status, size) => async () => ({
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => new ArrayBuffer(size),
  });
  try {
    for (const [status, size, ok] of [
      [200, 8, true],
      [0, 8, true],
      [0, 0, false],
      [404, 8, false],
    ]) {
      globalThis.fetch = respond(status, size);
      const result = await fetchBytes('capacitor://localhost/audio/background-music.m4a').then(
        (bytes) => bytes.byteLength,
        () => null,
      );
      assert.equal(result, ok ? size : null, `${status}/${size}`);
    }
  } finally {
    globalThis.fetch = original;
  }
});

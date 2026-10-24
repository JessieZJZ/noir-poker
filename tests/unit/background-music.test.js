import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMusicController, BACKGROUND_MUSIC_VOLUME } from '../../src/ui/background-music.js';
import { createWebBackgroundMusic } from '../../src/platform/web-background-music.js';
import { createWechatBackgroundMusic } from '../../src/platform/wechat-background-music.js';
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
  audio.paused();
  assert.equal(recoveries().length, 1);
  const pending = recoveries()[0];
  music.dispose();
  assert.equal(recoveries().length, 0, 'Disposal cancels a pending resume');
  const before = audio.playCount;
  pending[1].fn();
  assert.equal(audio.playCount, before);
});

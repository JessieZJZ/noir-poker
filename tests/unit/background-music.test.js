import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMusicController, BACKGROUND_MUSIC_VOLUME } from '../../src/ui/background-music.js';
import { createWebBackgroundMusic } from '../../src/platform/web-background-music.js';
import { createWechatBackgroundMusic } from '../../src/platform/wechat-background-music.js';
import { loadFeedbackPreferences } from '../../src/ui/feedback-preferences.js';

test('feedback defaults on, migrates a legacy combined mute, and then persists independently', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null };
  assert.deepEqual(loadFeedbackPreferences(storage), { sound: true, vibration: true });
  values.set('noir-sound', 'false');
  assert.deepEqual(loadFeedbackPreferences(storage), { sound: false, vibration: false });
  values.set('noir-vibration', 'true');
  assert.deepEqual(loadFeedbackPreferences(storage), { sound: false, vibration: true });
  values.set('noir-vibration', 'false');
  values.set('noir-sound', 'true');
  assert.deepEqual(loadFeedbackPreferences(storage), { sound: true, vibration: false });
});

test('a first-load vibration migration is saved before later sound changes', () => {
  for (const initialSound of [null, 'false']) {
    const values = new Map(initialSound === null ? [] : [['noir-sound', initialSound]]);
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
    const expected = initialSound !== 'false';
    assert.equal(loadFeedbackPreferences(storage).vibration, expected);
    values.set('noir-sound', String(!expected));
    assert.equal(loadFeedbackPreferences(storage).vibration, expected);
    assert.equal(values.get('noir-vibration'), String(expected));
  }
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
  assert.equal(gain.gain.value, BACKGROUND_MUSIC_VOLUME);
  assert.equal(gain.connected, mixedOutput, 'Music and cues share the final mix limiter');
  music.setActive(false);
  finish();
  await Promise.resolve();
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 27);
  music.setActive(true);
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
  assert.equal(audio.volume, BACKGROUND_MUSIC_VOLUME);
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

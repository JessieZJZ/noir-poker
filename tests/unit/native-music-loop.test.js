import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { watchNativeMusicLoop } from '../native/music-loop-probe.mjs';

function setup() {
  const listeners = new Map();
  const audio = {
    currentTime: 42,
    duration: 93.66,
    paused: false,
    seeking: false,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };
  const window = {};
  vm.runInNewContext(`(${watchNativeMusicLoop.toString()})()`, {
    document: { querySelector: () => audio },
    window,
  });
  return { audio, window, listeners, event: (type) => listeners.get(type)?.() };
}

test('native loop evidence survives driver sampling after the first three seconds', () => {
  const { audio, window, event } = setup();
  event('seeked');
  audio.currentTime = 0.05;
  event('timeupdate');
  audio.currentTime = 7;
  event('timeupdate');
  assert.equal(window.__nativeMusicLoop.sawTail, true);
  assert.equal(window.__nativeMusicLoop.wrapped, true);
  assert.equal(window.__nativeMusicLoop.wrapTime, 0.05);
});

test('a low playback position without a witnessed tail cannot prove looping', () => {
  const { audio, window, event } = setup();
  audio.currentTime = 0.1;
  event('timeupdate');
  assert.equal(window.__nativeMusicLoop.wrapped, false);
});

test('paused and unfinished seeks do not count as playback; cleanup removes every observer', () => {
  const { audio, window, event, listeners } = setup();
  audio.seeking = true;
  event('timeupdate');
  assert.equal(window.__nativeMusicLoop.sawTail, false);
  audio.seeking = false;
  event('seeked');
  audio.paused = true;
  audio.currentTime = 0.1;
  event('timeupdate');
  assert.equal(window.__nativeMusicLoop.wrapped, false);
  window.__stopNativeMusicLoopProbe();
  assert.equal(listeners.size, 0);
  assert.equal(window.__nativeMusicLoop, undefined);
  assert.equal(window.__stopNativeMusicLoopProbe, undefined);
});

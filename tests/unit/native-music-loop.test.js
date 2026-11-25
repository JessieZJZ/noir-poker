import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { watchNativeMusicLoop } from '../native/music-loop-probe.mjs';

const LOOP_START = 24000 / 48000,
  LOOP_END = 4519610 / 48000;

function setup() {
  const timers = new Map();
  let serial = 0;
  const music = {
    currentTime: 42,
    loopStart: LOOP_START,
    loopEnd: LOOP_END,
    paused: false,
    seek(time) {
      this.currentTime = time;
    },
  };
  const window = {};
  vm.runInNewContext(`(${watchNativeMusicLoop.toString()})()`, {
    document: { querySelector: () => ({ backgroundMusic: music }) },
    window,
    setInterval: (fn) => (timers.set(++serial, fn), serial),
    clearInterval: (id) => timers.delete(id),
  });
  return { music, window, timers, tick: () => [...timers.values()].forEach((fn) => fn()) };
}

test('native loop evidence needs the tail and a return to the loop start, kept between polls', () => {
  const { music, window, tick } = setup();
  assert.ok(Math.abs(music.currentTime - (LOOP_END - 0.2)) < 1e-9, 'The probe seeks near the end');
  assert.equal(window.__nativeMusicLoop.sawTail, true);
  music.currentTime = LOOP_START + 0.05;
  tick();
  music.currentTime = LOOP_START + 7;
  tick();
  assert.equal(window.__nativeMusicLoop.wrapped, true);
  assert.equal(window.__nativeMusicLoop.wrapTime, LOOP_START + 0.05);
});

test('a jump elsewhere in the period is not a loop', () => {
  const { music, window, tick } = setup();
  music.currentTime = 40;
  tick();
  assert.equal(window.__nativeMusicLoop.wrapped, false);
});

test('paused playback does not count; cleanup removes every observer', () => {
  const { music, window, timers, tick } = setup();
  music.paused = true;
  music.currentTime = LOOP_START + 0.1;
  tick();
  assert.equal(window.__nativeMusicLoop.wrapped, false);
  window.__stopNativeMusicLoopProbe();
  assert.equal(timers.size, 0);
  assert.equal(window.__nativeMusicLoop, undefined);
  assert.equal(window.__stopNativeMusicLoopProbe, undefined);
});

import { test, expect } from '@playwright/test';
import { BACKGROUND_MUSIC_VOLUME } from '../../src/ui/background-music.js';

test('actual actions use enhanced phone cues and music enters the shared output limiter', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.audioPresence = { connections: [], cues: [] };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (target, ...args) {
      window.audioPresence.connections.push({
        from: this.constructor.name,
        to: target.constructor.name,
        gain: this.gain?.value,
      });
      return connect.call(this, target, ...args);
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const samples = this.buffer.getChannelData(0);
      window.audioPresence.cues.push({
        samples: samples.length,
        rms: Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length),
        peak: samples.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0),
      });
      return start.apply(this, args);
    };
  });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.heroTurn(7));
  await page.locator('#raise-button').click();
  await page.evaluate(() => window.qa.heroTurn(7));
  await page.locator('#fold-button').click();
  await page.evaluate(() => window.qa.stop());
  const actual = await page.evaluate(() => window.audioPresence);
  const musicGain = actual.connections.find(
    ({ from, to }) => from === 'GainNode' && to === 'WaveShaperNode',
  );
  expect(musicGain).toBeTruthy();
  expect(musicGain.gain).toBeCloseTo(BACKGROUND_MUSIC_VOLUME, 6);
  expect(
    actual.connections.some(
      ({ from, to }) => from === 'WaveShaperNode' && to === 'AudioDestinationNode',
    ),
  ).toBe(true);
  for (const length of [7938, 14994]) {
    const cue = actual.cues.find(({ samples }) => samples === length);
    expect(cue).toBeTruthy();
    expect(cue.rms).toBeGreaterThan(0.21);
    expect(cue.peak).toBeLessThanOrEqual(0.7);
  }
});

test('the shipped AAC reserves phone-mix headroom and Web Audio bounds coincident effects', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { soundSamples, createSoundOutput } = await import('/src/ui/sound-cues.js');
    const { BACKGROUND_MUSIC_VOLUME } = await import('/src/ui/background-music.js');
    const context = new OfflineAudioContext(2, 44100, 44100);
    const bytes = await (await fetch('/audio/background-music.m4a')).arrayBuffer();
    const music = await context.decodeAudioData(bytes);
    let musicPeak = 0,
      seam = 0;
    for (let channel = 0; channel < music.numberOfChannels; channel++) {
      const pcm = music.getChannelData(channel);
      for (const sample of pcm) musicPeak = Math.max(musicPeak, Math.abs(sample));
      seam = Math.max(seam, Math.abs(pcm[0] - pcm.at(-1)));
    }
    const output = createSoundOutput(context);
    const source = context.createBufferSource(),
      gain = context.createGain();
    source.buffer = music;
    gain.gain.value = BACKGROUND_MUSIC_VOLUME;
    source.connect(gain).connect(output);
    source.start(0, 45);
    for (const name of ['fold', 'check', 'chip', 'deal', 'win']) {
      const samples = soundSamples(name),
        cue = context.createBuffer(1, samples.length, 44100);
      cue.getChannelData(0).set(samples);
      const node = context.createBufferSource();
      node.buffer = cue;
      node.connect(output);
      node.start(0.1);
    }
    const rendered = await context.startRendering();
    let mixPeak = 0;
    for (const sample of rendered.getChannelData(0)) mixPeak = Math.max(mixPeak, Math.abs(sample));
    return { duration: music.duration, musicPeak, mixPeak, seam, gain: BACKGROUND_MUSIC_VOLUME };
  });
  expect(result.duration).toBeGreaterThan(93.6);
  expect(result.duration).toBeLessThan(93.8);
  expect(result.musicPeak * result.gain + 0.7).toBeLessThan(0.99);
  expect(result.musicPeak).toBeGreaterThan(0.25);
  expect(result.mixPeak).toBeGreaterThan(0.7);
  expect(result.mixPeak).toBeLessThan(0.92);
  expect(result.seam).toBeLessThan(0.015);
});

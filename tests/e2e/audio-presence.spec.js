import { test, expect } from '@playwright/test';
import { BACKGROUND_MUSIC_VOLUME } from '../../src/ui/background-music.js';

test('actual actions use enhanced phone cues and music enters the shared output limiter', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.audioPresence = { connections: [], cues: [], musicGains: [] };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (target, ...args) {
      window.audioPresence.connections.push({
        from: this.constructor.name,
        to: target.constructor.name,
        gain: this.gain?.value,
      });
      // The background music is the one long decoded source.
      if (this instanceof AudioBufferSourceNode && this.buffer?.duration > 60)
        window.audioPresence.musicGains.push(target.gain);
      return connect.call(this, target, ...args);
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer.duration > 60) return start.apply(this, args);
      const samples = this.buffer.getChannelData(0);
      window.audioPresence.cues.push({
        samples: samples.length,
        rms: Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length),
        peak: samples.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0),
        musicGains: window.audioPresence.musicGains.map((gain) => gain.value),
      });
      return start.apply(this, args);
    };
  });
  await page.goto('/');
  await page.waitForFunction(() => !!window.qa);
  await page.evaluate(() => window.qa.heroTurn(7));
  await page.locator('#opponents-button').click();
  await page.waitForFunction(
    () => Number(document.querySelector('[data-background-music]')?.dataset.musicGain) === 1,
  );
  await page.locator('#opponents-dialog .close-dialog').click();
  await page.evaluate(() => {
    const music = document.querySelector('[data-background-music]');
    window.steadyMusic = { music, started: music.backgroundMusic.currentTime, samples: [] };
    window.steadyMusic.timer = setInterval(
      () =>
        window.steadyMusic.samples.push({
          gains: window.audioPresence.musicGains.map((gain) => gain.value),
          paused: music.backgroundMusic.paused,
          samePlayer: document.querySelector('[data-background-music]') === music,
        }),
      20,
    );
  });
  await page.locator('#raise-button').click();
  await page.evaluate(() => window.qa.heroTurn(7));
  await page.locator('#fold-button').click();
  await page.evaluate(() => window.qa.stop());
  await page.waitForTimeout(900);
  const steady = await page.evaluate(() => {
    clearInterval(window.steadyMusic.timer);
    return {
      started: window.steadyMusic.started,
      ended: window.steadyMusic.music.backgroundMusic.currentTime,
      samples: window.steadyMusic.samples,
    };
  });
  expect(steady.samples.length).toBeGreaterThan(20);
  expect(steady.ended).toBeGreaterThan(steady.started);
  for (const sample of steady.samples) {
    expect(sample.gains).toEqual([BACKGROUND_MUSIC_VOLUME]);
    expect(sample.paused).toBe(false);
    expect(sample.samePlayer).toBe(true);
  }
  const actual = await page.evaluate(() => ({
    connections: window.audioPresence.connections,
    cues: window.audioPresence.cues,
  }));
  // Music and cue buses meet at the limiter, then its trim and a safety knee.
  const musicGain = actual.connections.find(
    ({ from, to }) => from === 'GainNode' && to === 'DynamicsCompressorNode',
  );
  expect(musicGain).toBeTruthy();
  expect(musicGain.gain).toBeCloseTo(BACKGROUND_MUSIC_VOLUME, 6);
  for (const [from, to] of [
    ['DynamicsCompressorNode', 'GainNode'],
    ['GainNode', 'WaveShaperNode'],
    ['WaveShaperNode', 'AudioDestinationNode'],
  ])
    expect(actual.connections.some((c) => c.from === from && c.to === to)).toBe(true);
  expect(
    actual.connections.some(
      ({ from, to }) => from === 'AudioBufferSourceNode' && to === 'WaveShaperNode',
    ),
  ).toBe(false);
  expect(
    actual.cues.every(
      (cue) => cue.musicGains.length === 1 && cue.musicGains[0] === BACKGROUND_MUSIC_VOLUME,
    ),
  ).toBe(true);
  for (const length of [7938, 22491]) {
    const cue = actual.cues.find(({ samples }) => samples === length);
    expect(cue).toBeTruthy();
    expect(cue.rms).toBeGreaterThan(length === 22491 ? 0.05 : 0.21);
    expect(cue.peak).toBeLessThanOrEqual(length === 22491 ? 0.78 : 0.7);
  }
});

test('the shipped AAC reserves phone-mix headroom and Web Audio bounds coincident effects', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { soundSamples, createSoundOutput } = await import('/src/ui/sound-cues.js');
    const { BACKGROUND_MUSIC_VOLUME, BACKGROUND_MUSIC_LOOP } =
      await import('/src/ui/background-music.js');
    // The files' own rate, so loop frames need no resampling.
    const context = new OfflineAudioContext(2, 48000, 48000);
    const bytes = await (await fetch('/audio/background-music-mobile.m4a')).arrayBuffer();
    const music = await context.decodeAudioData(bytes);
    const desktop = await context.decodeAudioData(
      await (await fetch('/audio/background-music.m4a')).arrayBuffer(),
    );
    const rms = (buffer) => {
      const samples = buffer.getChannelData(0);
      return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    };
    let musicPeak = 0,
      seam = 0;
    const loopStart = Math.round(BACKGROUND_MUSIC_LOOP.start * 48000),
      loopEnd = Math.round(BACKGROUND_MUSIC_LOOP.end * 48000);
    for (const buffer of [music, desktop])
      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const pcm = buffer.getChannelData(channel);
        if (buffer === music)
          for (const sample of pcm) musicPeak = Math.max(musicPeak, Math.abs(sample));
        // The loop jump lands where the file itself continues the music.
        seam = Math.max(seam, Math.abs(pcm[loopStart] - pcm[loopEnd]));
      }
    const output = createSoundOutput(context);
    const source = context.createBufferSource(),
      gain = context.createGain();
    source.buffer = music;
    gain.gain.value = BACKGROUND_MUSIC_VOLUME;
    source.connect(gain).connect(output);
    source.start(0, 45);
    let cuePeak = 0;
    for (const name of ['fold', 'check', 'chip', 'deal', 'win']) {
      const samples = soundSamples(name),
        cue = context.createBuffer(1, samples.length, 44100);
      for (const sample of samples) cuePeak = Math.max(cuePeak, Math.abs(sample));
      cue.getChannelData(0).set(samples);
      const node = context.createBufferSource();
      node.buffer = cue;
      node.connect(output);
      node.start(0.1);
    }
    const rendered = await context.startRendering();
    let mixPeak = 0;
    for (const sample of rendered.getChannelData(0)) mixPeak = Math.max(mixPeak, Math.abs(sample));
    // A cue over the music: the limited mix must equal a smoothly scaled copy of
    // the plain sum, with no bent waveform. Compare sample-to-sample slopes after
    // fitting one gain per 10 ms window and the limiter's 6 ms look-ahead.
    const crackle = {};
    for (const name of ['fold', 'win', 'chip']) {
      const render = async (limited) => {
        const offline = new OfflineAudioContext(1, 48000 * 1.5, 48000);
        const out = limited ? createSoundOutput(offline) : offline.destination;
        const song = offline.createBufferSource();
        song.buffer = music;
        song.connect(out);
        song.start(0, 61);
        const samples = soundSamples(name),
          cue = offline.createBuffer(1, samples.length, 44100);
        cue.getChannelData(0).set(samples);
        const node = offline.createBufferSource();
        node.buffer = cue;
        node.connect(out);
        node.start(0.5);
        return (await offline.startRendering()).getChannelData(0);
      };
      const plain = await render(false),
        limited = await render(true),
        lag = 288;
      let worst = 0;
      for (let start = 24000; start < 60000; start += 480) {
        let xy = 0,
          xx = 0;
        for (let i = start; i < start + 480; i++) {
          xy += limited[i + lag] * plain[i];
          xx += plain[i] * plain[i];
        }
        const g = xx > 1e-9 ? xy / xx : 1;
        for (let i = start + 1; i < start + 480; i++)
          worst = Math.max(
            worst,
            Math.abs(limited[i + lag] - limited[i + lag - 1] - g * (plain[i] - plain[i - 1])),
          );
      }
      crackle[name] = worst;
    }
    return {
      crackle,
      duration: music.duration,
      musicPeak,
      mixPeak,
      cuePeak,
      seam,
      loopEnd: BACKGROUND_MUSIC_LOOP.end,
      desktopDuration: desktop.duration,
      gain: BACKGROUND_MUSIC_VOLUME,
      loudnessIncreaseDB: 20 * Math.log10(rms(music) / rms(desktop)),
    };
  });
  // Each decoded file continues the music past the loop end.
  for (const duration of [result.duration, result.desktopDuration]) {
    expect(duration).toBeGreaterThan(result.loopEnd);
    expect(duration).toBeLessThan(result.loopEnd + 1);
  }
  expect(result.gain).toBe(1);
  expect(result.loudnessIncreaseDB).toBeGreaterThan(4.8);
  expect(result.musicPeak).toBeLessThan(0.58);
  expect(result.mixPeak).toBeGreaterThan(0.7);
  expect(result.mixPeak).toBeLessThan(0.92);
  expect(result.seam).toBeLessThan(0.015);
  // The former soft-clip curve bent these by 0.03-0.08 per sample.
  for (const [name, worst] of Object.entries(result.crackle))
    expect(worst, name).toBeLessThan(0.015);
});

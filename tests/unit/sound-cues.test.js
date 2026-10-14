import test from 'node:test';
import assert from 'node:assert/strict';
import {
  soundSamples,
  SOUND_CUES,
  SOUND_PEAK_CEILING,
  SOUND_SAMPLE_RATE,
  createSoundOutput,
} from '../../src/ui/sound-cues.js';
import { soundWave } from '../../scripts/wechat.mjs';

const formerRms = {
  fold: 0.03893198712336045,
  check: 0.029877927921785206,
  chip: 0.05047289546366879,
  deal: 0.03164925020203147,
  win: 0.04185933013497533,
};
function level(samples) {
  return {
    peak: samples.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0),
    rms: Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length),
  };
}

test('every cue has at least 9dB more signal energy and keeps per-cue headroom', () => {
  for (const name of SOUND_CUES) {
    const samples = soundSamples(name),
      { rms, peak } = level(samples);
    assert.ok(20 * Math.log10(rms / formerRms[name]) >= 9, `${name} signal gain`);
    assert.ok(rms >= 0.145 && rms <= 0.165, `${name} mastered RMS ${rms}`);
    assert.ok(peak <= SOUND_PEAK_CEILING, `${name} peak ${peak}`);
    assert.equal(samples[0], 0);
    assert.equal(samples.at(-1), 0);
    assert.ok(samples.every((value) => Number.isInteger(value * 32768)));
  }
  for (const action of ['bet', 'raise', 'call'])
    assert.deepEqual(soundSamples(action), soundSamples('chip'));
});

test('the actual encoded WeChat WAVs keep the same normalized PCM as Web and native', () => {
  for (const name of ['fold', 'check', 'raise', 'call', 'deal', 'win']) {
    const wave = soundWave(name),
      expected = soundSamples(name),
      decoded = new Float32Array(expected.length);
    assert.equal(wave.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wave.readUInt16LE(22), 1);
    assert.equal(wave.readUInt32LE(24), SOUND_SAMPLE_RATE);
    assert.equal(wave.readUInt16LE(34), 16);
    assert.equal(wave.readUInt32LE(40), expected.length * 2);
    for (let i = 0; i < decoded.length; i++) decoded[i] = wave.readInt16LE(44 + i * 2) / 32768;
    assert.deepEqual(decoded, expected);
    assert.ok(level(decoded).rms >= 0.145);
    assert.ok(level(decoded).peak <= SOUND_PEAK_CEILING);
  }
});

test('the final Web mix retains single-cue unity and bounds coincident action cues', () => {
  const destination = {},
    node = {
      connect(target) {
        this.connected = target;
      },
    },
    context = { destination, createWaveShaper: () => node },
    output = createSoundOutput(context);
  assert.equal(output, node);
  assert.equal(node.connected, destination);
  assert.equal(node.oversample, 'none');
  const curve = output.curve;
  for (let i = 0; i < curve.length; i++) {
    assert.ok(Number.isFinite(curve[i]) && Math.abs(curve[i]) < 0.92);
    if (i) assert.ok(curve[i] >= curve[i - 1]);
  }
  const shape = (sample) => {
    const position = ((Math.max(-1, Math.min(1, sample)) + 1) * (curve.length - 1)) / 2,
      left = Math.floor(position),
      right = Math.min(curve.length - 1, left + 1);
    return curve[left] + (curve[right] - curve[left]) * (position - left);
  };
  for (const name of SOUND_CUES)
    for (const sample of soundSamples(name)) assert.ok(Math.abs(shape(sample) - sample) < 1e-6);
  const chip = soundSamples('chip'),
    raw = chip.map((sample) => sample * 6),
    limited = raw.map(shape);
  assert.ok(level(raw).peak > 1);
  assert.ok(level(limited).peak < 0.92);
});

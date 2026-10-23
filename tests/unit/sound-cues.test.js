import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

test('every cue retains mastered signal energy and per-cue headroom', () => {
  for (const name of SOUND_CUES) {
    const samples = soundSamples(name),
      { rms, peak } = level(samples);
    if (name !== 'chip')
      assert.ok(20 * Math.log10(rms / formerRms[name]) >= 9, `${name} signal gain`);
    const enhanced = ['fold', 'chip', 'win'].includes(name);
    assert.ok(
      rms >= (name === 'chip' ? 0.05 : enhanced ? 0.21 : 0.145) &&
        rms <= (name === 'chip' ? 0.06 : enhanced ? 0.245 : 0.165),
      `${name} mastered RMS ${rms}`,
    );
    assert.ok(peak <= SOUND_PEAK_CEILING, `${name} peak ${peak}`);
    assert.equal(samples[0], 0);
    assert.equal(samples.at(-1), 0);
    assert.ok(samples.every((value) => Number.isInteger(value * 32768)));
  }
  for (const action of ['bet', 'raise', 'call'])
    assert.deepEqual(soundSamples(action), soundSamples('chip'));
});

test('phone-band energy rises for soft actions while check/deal/new-game PCM stays unchanged', () => {
  // A fixed 700–3500 Hz approximation measures presence rather than promising
  // an acoustic result for a particular phone, volume or outdoor noise level.
  const previous = {
    fold: 0.04255247524991775,
    win: 0.09252253565920715,
  };
  const minimumGain = { fold: 9, win: 4 };
  for (const name of Object.keys(previous)) {
    let low = 0,
      high = 0,
      last = 0,
      energy = 0;
    const samples = soundSamples(name),
      hp = Math.exp((-2 * Math.PI * 700) / SOUND_SAMPLE_RATE),
      lp = 1 - Math.exp((-2 * Math.PI * 3500) / SOUND_SAMPLE_RATE);
    for (const sample of samples) {
      high = hp * (high + sample - last);
      last = sample;
      low += lp * (high - low);
      energy += low * low;
    }
    const rms = Math.sqrt(energy / samples.length);
    assert.ok(20 * Math.log10(rms / previous[name]) >= minimumGain[name], name);
  }
  for (const [name, hash] of Object.entries({
    check: 'a334ffecdc6ed7867768a0a51428136d5645be636b044612e6333151e6cf01b0',
    deal: '41fa94fad42f1d51b92cc59fd4d2d56e7e30b75a492d6379dd5adc3e5fee2abf',
  })) {
    assert.equal(
      createHash('sha256')
        .update(new Uint8Array(soundSamples(name).buffer))
        .digest('hex'),
      hash,
    );
  }
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
    assert.ok(level(decoded).rms >= (['raise', 'call'].includes(name) ? 0.05 : 0.145));
    assert.ok(level(decoded).peak <= SOUND_PEAK_CEILING);
  }
});

test('chip actions retain the approved video audition without re-mastering', () => {
  const samples = soundSamples('chip');
  assert.equal(samples.length, Math.round(0.51 * SOUND_SAMPLE_RATE));
  assert.equal(samples[0], 0);
  assert.equal(samples.at(-1), 0);
  // Preserve the quiet settling tail and the exact user-approved audition.
  assert.ok(
    level(samples.slice(Math.round(0.46 * SOUND_SAMPLE_RATE))).rms < level(samples).rms * 0.25,
  );
  assert.equal(
    createHash('sha256').update(soundWave('chip')).digest('hex'),
    'd853c5acc8657d6968603cf1dfb747d0e06267f1584a28d842a8d3c635158aa2',
  );
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

test('game-end cues are distinct, bounded and fade to silence on every platform', async () => {
  const { ceremonySamples, ceremonyWav, CEREMONY_CUES, CEREMONY_SAMPLE_RATE } =
    await import('../../src/ui/ceremony-sounds.js');
  assert.deepEqual(CEREMONY_CUES, ['champion', 'crowned', 'farewell']);
  const signatures = new Set();
  for (const cue of CEREMONY_CUES) {
    const samples = ceremonySamples(cue);
    const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    assert.ok(peak > 0.2 && peak < 1, `${cue} peak ${peak}`);
    assert.ok(Math.abs(samples.at(-1)) < 1e-3, `${cue} ends silent`);
    assert.equal(ceremonyWav(cue).byteLength, 44 + samples.length * 2);
    signatures.add(samples.length / CEREMONY_SAMPLE_RATE + ':' + samples[4000].toFixed(4));
  }
  assert.equal(signatures.size, CEREMONY_CUES.length);
});

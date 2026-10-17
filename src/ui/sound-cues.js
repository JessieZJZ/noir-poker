import { chipRecording } from './chip-recording.js';

// One deterministic PCM definition for Web, native WebViews and WeChat WAVs.
// Unit gain is already mastered; platform adapters must not boost it again.
export const SOUND_SAMPLE_RATE = 44100;
export const SOUND_CUES = ['fold', 'check', 'chip', 'deal', 'win'];
// Keep the already audible wooden check and deal unchanged. Softer actions
// carry more sustained midrange energy for small phone speakers.
export const SOUND_TARGET_RMS = { fold: 0.25, check: 0.16, chip: 0.27, deal: 0.16, win: 0.24 };
export const SOUND_PEAK_CEILING = 0.7;
const triangle = (phase) => (2 / Math.PI) * Math.asin(Math.sin(phase));
const envelope = (t, peak, attack, end) =>
  t < 0 || t >= end
    ? 0
    : t < attack
      ? 0.0001 * Math.pow(peak / 0.0001, t / attack)
      : peak * Math.pow(1 - (t - attack) / (end - attack), 2.3);
const fallingPhase = (t, from, to, end) => {
  const k = Math.log(to / from) / end;
  return 2 * Math.PI * ((from * Math.expm1(k * Math.min(t, end))) / k + Math.max(0, t - end) * to);
};
export function soundSamples(name) {
  const kind = ['bet', 'raise', 'call'].includes(name) ? 'chip' : name;
  if (!SOUND_CUES.includes(kind)) throw new RangeError('Unknown sound cue');
  const duration = { fold: 0.18, check: 0.22, chip: 0.6, deal: 0.28, win: 0.36 }[kind];
  const data =
    kind === 'chip' ? chipRecording() : new Float32Array(Math.round(duration * SOUND_SAMPLE_RATE));
  const noise = new Float32Array(Math.ceil(0.025 * SOUND_SAMPLE_RATE));
  // Fixed noise is shared too; two taps reuse the same damped wooden attack.
  let seed = 731,
    x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  const w = (2 * Math.PI * 850) / SOUND_SAMPLE_RATE,
    alpha = Math.sin(w) / (2 * 0.7);
  for (let i = 0; i < noise.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const x = ((seed / 4294967296) * 2 - 1) * Math.exp((-6 * i) / noise.length);
    const y =
      (alpha / (1 + alpha)) * (x - x2) +
      ((2 * Math.cos(w)) / (1 + alpha)) * y1 -
      ((1 - alpha) / (1 + alpha)) * y2;
    noise[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  for (let i = 0; kind !== 'chip' && i < data.length; i++) {
    const t = i / SOUND_SAMPLE_RATE;
    let value = 0;
    if (kind === 'check') {
      for (const [index, offset] of [0, 0.14].entries()) {
        const dt = t - offset;
        if (dt < 0 || dt >= 0.08) continue;
        const strength = index ? 0.8 : 1;
        value +=
          strength *
          ((noise[Math.floor(dt * SOUND_SAMPLE_RATE)] || 0) * 0.64 * Math.min(1, dt / 0.002) +
            triangle(fallingPhase(dt, 165, 80, 0.045)) * envelope(dt, 0.28, 0.002, 0.065));
      }
    } else if (kind === 'fold') {
      const phase = fallingPhase(t, 260, 75, 0.14);
      value =
        (triangle(phase) * 0.55 + Math.sin(phase * 5) * 0.45 + Math.sin(phase * 9) * 0.2) *
        envelope(t, 0.288, 0.012, 0.16);
    } else {
      const notes = kind === 'win' ? [440, 554, 659] : [820, 570];
      for (const [index, hz] of notes.entries()) {
        const dt = t - index * 0.08;
        if (dt < 0 || dt >= 0.2) continue;
        const phase = 2 * Math.PI * hz * dt;
        const oscillator =
          kind === 'deal'
            ? triangle(phase)
            : Math.sin(phase) + Math.sin(phase * 2) * 0.2 + Math.sin(phase * 3) * 0.45;
        value += oscillator * envelope(dt, 0.2, 0.015, 0.16);
      }
    }
    data[i] = value;
  }
  // Master complete cues rather than their brief attack peaks. The longer
  // decay keeps quiet actions audible without changing pitch or tap timing.
  const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length),
    gain = SOUND_TARGET_RMS[kind] / rms;
  for (let i = 0; i < data.length; i++) {
    const sample = data[i] * gain,
      absolute = Math.abs(sample),
      knee = 0.6,
      headroom = SOUND_PEAK_CEILING - knee,
      limited =
        absolute <= knee
          ? sample
          : Math.sign(sample) * (knee + headroom * Math.tanh((absolute - knee) / headroom));
    // The shared quantization makes Web Audio and generated WAVs identical.
    data[i] = Math.round(limited * 32767) / 32768 || 0;
  }
  return data;
}

export function limitSoundMix(sample) {
  const knee = SOUND_PEAK_CEILING,
    headroom = 0.92 - knee,
    absolute = Math.abs(sample);
  return absolute <= knee
    ? sample
    : Math.sign(sample) * (knee + headroom * Math.tanh((absolute - knee) / headroom));
}

// Single mastered cues remain at unity. Only overlapping effects reach this
// soft knee; the bounded curve prevents their mix from reaching digital clip.
export function createSoundOutput(context) {
  const output = context.createWaveShaper(),
    curve = new Float32Array(32769);
  for (let i = 0; i < curve.length; i++) curve[i] = limitSoundMix((i * 2) / (curve.length - 1) - 1);
  output.curve = curve;
  output.oversample = 'none';
  output.connect(context.destination);
  return output;
}

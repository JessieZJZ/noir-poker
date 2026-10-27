// Game-end cues are synthesized at runtime on every platform, so the WeChat
// main package carries code instead of long WAV files.
export const CEREMONY_SAMPLE_RATE = 22050;
export const CEREMONY_CUES = ['champion', 'crowned', 'farewell'];
// Players that cache the synthesized WAVs (WeChat user files) key them by this
// version; bump it whenever any cue's samples change, or old sounds persist.
export const CEREMONY_SOUND_VERSION = 2;
const TAU = 2 * Math.PI;
const note = (semitones) => 261.63 * Math.pow(2, semitones / 12);
// A championship is greeted by the crowd: cheering voices, applause and, for
// the hero's own title, whistles. A game the hero leaves without a champion
// keeps a muted, almost pure tone. All decay smoothly to silence.
const muted = (phase) => Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.08 * Math.sin(3 * phase);
function voice(t, start, length, attack, release) {
  const dt = t - start;
  if (dt < 0 || dt > length + release) return 0;
  if (dt < attack) return dt / attack;
  if (dt <= length) return 1 - 0.25 * ((dt - attack) / Math.max(0.001, length - attack));
  return 0.75 * Math.pow(1 - (dt - length) / release, 2);
}
const SCORES = {
  // G–E♭–C falling slowly onto a low C-minor chord.
  farewell: {
    duration: 2.4,
    gain: 0.38,
    tone: muted,
    notes: [
      [7, 0, 0.34],
      [3, 0.3, 0.34],
      [0, 0.6, 1.2],
      [-9, 0.6, 1.2],
      [-12, 0.6, 1.2],
    ],
    sparkle: [],
  },
};
// The hero's title gets the full crowd; a bot's gets warm applause and fewer
// voices. Seeded noise keeps every platform's buffer identical.
const CROWDS = {
  champion: { duration: 3.4, seed: 1729, voices: 30, whistles: 2, applause: 150, peak: 0.82 },
  crowned: { duration: 2.8, seed: 2718, voices: 16, whistles: 0, applause: 110, peak: 0.62 },
};
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
// Constant-peak band-pass (RBJ biquad), used as vocal formants and clap colour.
function bandPass(frequency, q) {
  const w = (TAU * frequency) / CEREMONY_SAMPLE_RATE,
    alpha = Math.sin(w) / (2 * q),
    a0 = 1 + alpha,
    b0 = alpha / a0,
    a1 = (-2 * Math.cos(w)) / a0,
    a2 = (1 - alpha) / a0;
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  return (x) => {
    const y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}
// The crowd swells in, holds, then fades over the last second.
function crowdLevel(t, duration) {
  const attack = Math.min(1, t / 0.28);
  const swell = 0.82 + 0.18 * Math.sin(Math.min(1, t / 1.1) * Math.PI * 0.5);
  const fade = Math.min(1, Math.max(0, (duration - t) / 1.15));
  return attack * swell * fade * fade;
}
function crowdSamples({ duration, seed, voices, whistles, applause, peak }) {
  const rate = CEREMONY_SAMPLE_RATE,
    length = Math.round(duration * rate),
    random = seeded(seed),
    roar = new Float32Array(length),
    chorus = new Float32Array(length),
    claps = new Float32Array(length),
    whistle = new Float32Array(length);
  // Crowd bed: noise through two moving vowel resonances ("aah" to "ay").
  const low = bandPass(650, 1.4),
    high = bandPass(1500, 1.8);
  for (let i = 0; i < length; i++) {
    const noise = random() * 2 - 1;
    roar[i] = low(noise) * 0.9 + high(noise) * 0.55;
  }
  // Individual "yay" voices: buzzy sources whose pitch rises then falls,
  // started a little apart so they never sound like one chord.
  for (let v = 0; v < voices; v++) {
    const start = random() * 0.45,
      span = 1.1 + random() * (duration - 1.6),
      base = 170 + random() * 230,
      lift = 1.18 + random() * 0.22,
      vibrato = 4.5 + random() * 2,
      level = 0.5 + random() * 0.5,
      first = bandPass(600 + random() * 250, 3),
      second = bandPass(1300 + random() * 700, 4);
    let phase = random();
    for (let i = Math.floor(start * rate); i < length; i++) {
      const dt = i / rate - start;
      if (dt > span) break;
      const shape = Math.min(1, dt / 0.25),
        contour = 1 + (lift - 1) * Math.sin(Math.min(1, dt / span) * Math.PI),
        pitch = base * contour * (1 + 0.025 * Math.sin(TAU * vibrato * dt));
      phase = (phase + pitch / rate) % 1;
      const buzz = 2 * phase - 1,
        envelope = shape * Math.pow(1 - dt / span, 0.6);
      chorus[i] += level * envelope * (first(buzz) * 0.8 + second(buzz) * 0.45);
    }
  }
  // Applause: many short, randomly timed claps, densest after the swell.
  const clapColour = bandPass(2100, 0.8);
  for (let t = 0; t < duration - 0.05;) {
    t += -Math.log(1 - random()) / (applause * Math.max(0.15, crowdLevel(t + 0.2, duration)));
    const at = Math.floor(t * rate),
      decay = 0.003 + random() * 0.006,
      gain = 0.4 + random() * 0.6;
    for (let k = 0; k < rate * 0.035 && at + k < length; k++)
      claps[at + k] += gain * (random() * 2 - 1) * Math.exp(-k / rate / decay);
  }
  for (let i = 0; i < length; i++) claps[i] = clapColour(claps[i]);
  // Two-finger whistles rising and falling, only for the hero's title.
  for (let w = 0; w < whistles; w++) {
    const start = 0.55 + w * 0.85 + random() * 0.2,
      span = 0.7 + random() * 0.25;
    let phase = 0;
    for (let i = Math.floor(start * rate); i < length; i++) {
      const dt = i / rate - start;
      if (dt > span) break;
      const pitch = 2100 + 700 * Math.sin((Math.min(1, dt / span) * Math.PI) / 1.2);
      phase += (TAU * pitch * (1 + 0.006 * Math.sin(TAU * 7 * dt))) / rate;
      whistle[i] += Math.sin(phase) * Math.min(1, dt / 0.06) * Math.min(1, (span - dt) / 0.15);
    }
  }
  const data = new Float32Array(length);
  let top = 0;
  for (let i = 0; i < length; i++) {
    const t = i / rate,
      mixed =
        crowdLevel(t, duration) *
        (0.5 * roar[i] + 0.11 * chorus[i] + 0.55 * claps[i] + 0.09 * whistle[i]);
    data[i] = Math.tanh(mixed * 1.4);
    top = Math.max(top, Math.abs(data[i]));
  }
  // Fixed peaks keep the cue inside the shared phone-mix headroom.
  const scale = top ? peak / top : 0;
  for (let i = 0; i < length; i++) data[i] *= scale * Math.min(1, (length - 1 - i) / (rate * 0.2));
  return data;
}
export function ceremonySamples(kind) {
  if (CROWDS[kind]) return crowdSamples(CROWDS[kind]);
  const score = SCORES[kind];
  if (!score) throw new RangeError('Unknown ceremony cue');
  const data = new Float32Array(Math.round(score.duration * CEREMONY_SAMPLE_RATE));
  for (let i = 0; i < data.length; i++) {
    const t = i / CEREMONY_SAMPLE_RATE;
    let value = 0;
    for (const [pitch, start, length] of score.notes) {
      const level = voice(t, start, length, 0.02, 0.45);
      if (level) value += 0.22 * level * score.tone(TAU * note(pitch) * (t - start));
    }
    score.sparkle.forEach((pitch, index) => {
      const start = 0.5 + index * 0.09,
        level = voice(t, start, 0.04, 0.005, 0.6);
      if (level) value += 0.07 * level * Math.sin(TAU * note(pitch) * (t - start));
    });
    // Fade the tail so the buffer never ends on a click.
    const tail = Math.min(1, (score.duration - t) / 0.2);
    data[i] = Math.tanh(value * score.gain * 1.6) * tail;
  }
  return data;
}
// 16-bit mono PCM WAV for players that need a file (WeChat InnerAudioContext).
export function ceremonyWav(kind) {
  const samples = ceremonySamples(kind),
    bytes = new ArrayBuffer(44 + samples.length * 2),
    view = new DataView(bytes),
    text = (offset, value) =>
      [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, CEREMONY_SAMPLE_RATE, true);
  view.setUint32(28, CEREMONY_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) =>
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 32767, true),
  );
  return bytes;
}

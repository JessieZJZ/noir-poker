// Game-end cues are synthesized at runtime on every platform, so the WeChat
// main package carries code instead of long WAV files.
export const CEREMONY_SAMPLE_RATE = 22050;
export const CEREMONY_CUES = ['champion', 'crowned'];
const TAU = 2 * Math.PI;
const note = (semitones) => 261.63 * Math.pow(2, semitones / 12);
// A bright horn-like partial stack for the hero's fanfare; a soft bell for a
// bot's coronation. Both decay smoothly to silence before the buffer ends.
const horn = (phase) =>
  Math.sin(phase) +
  0.55 * Math.sin(2 * phase) +
  0.3 * Math.sin(3 * phase) +
  0.12 * Math.sin(4 * phase);
const bell = (phase) =>
  Math.sin(phase) + 0.35 * Math.sin(2.76 * phase) + 0.16 * Math.sin(5.4 * phase);
function voice(t, start, length, attack, release) {
  const dt = t - start;
  if (dt < 0 || dt > length + release) return 0;
  if (dt < attack) return dt / attack;
  if (dt <= length) return 1 - 0.25 * ((dt - attack) / Math.max(0.001, length - attack));
  return 0.75 * Math.pow(1 - (dt - length) / release, 2);
}
const SCORES = {
  // C–E–G rising call, then a held C-major chord with a high sparkle.
  champion: {
    duration: 2.6,
    gain: 0.5,
    tone: horn,
    notes: [
      [0, 0, 0.16],
      [4, 0.14, 0.16],
      [7, 0.28, 0.16],
      [12, 0.42, 1.4],
      [7, 0.42, 1.4],
      [4, 0.42, 1.4],
      [0, 0.42, 1.4],
    ],
    sparkle: [24, 28, 31, 36],
  },
  // A calm descending bell figure resolving on a low chord.
  crowned: {
    duration: 2.1,
    gain: 0.42,
    tone: bell,
    notes: [
      [19, 0, 0.3],
      [16, 0.22, 0.3],
      [12, 0.44, 1.1],
      [7, 0.44, 1.1],
      [0, 0.44, 1.1],
    ],
    sparkle: [],
  },
};
export function ceremonySamples(kind) {
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

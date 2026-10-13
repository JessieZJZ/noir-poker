// One deterministic PCM definition for Web, native WebViews and WeChat WAVs.
// Unit gain is already mastered; platform adapters must not boost it again.
export const SOUND_SAMPLE_RATE = 44100;
export const SOUND_CUES = ['fold', 'check', 'chip', 'deal', 'win'];
const triangle = (phase) => (2 / Math.PI) * Math.asin(Math.sin(phase));
const envelope = (t, peak, attack, end) =>
  t < 0 || t >= end
    ? 0
    : t < attack
      ? 0.0001 * Math.pow(peak / 0.0001, t / attack)
      : peak * Math.pow(0.0001 / peak, (t - attack) / (end - attack));
const fallingPhase = (t, from, to, end) => {
  const k = Math.log(to / from) / end;
  return 2 * Math.PI * ((from * Math.expm1(k * Math.min(t, end))) / k + Math.max(0, t - end) * to);
};
export function soundSamples(name) {
  const kind = ['raise', 'call'].includes(name) ? 'chip' : name;
  if (!SOUND_CUES.includes(kind)) throw new RangeError('Unknown sound cue');
  const duration = { fold: 0.18, check: 0.22, chip: 0.2, deal: 0.28, win: 0.36 }[kind];
  const data = new Float32Array(Math.round(duration * SOUND_SAMPLE_RATE));
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
  for (let i = 0; i < data.length; i++) {
    const t = i / SOUND_SAMPLE_RATE;
    let value = 0;
    if (kind === 'check') {
      for (const [index, offset] of [0, 0.14].entries()) {
        const dt = t - offset;
        if (dt < 0 || dt >= 0.08) continue;
        const strength = index ? 0.8 : 1;
        value +=
          strength *
          ((noise[Math.floor(dt * SOUND_SAMPLE_RATE)] || 0) * 0.64 +
            triangle(fallingPhase(dt, 165, 80, 0.045)) * envelope(dt, 0.28, 0.002, 0.065));
      }
    } else if (kind === 'fold') {
      // +5.1 dB over the former 0.02 x 8 falling swish.
      value = triangle(fallingPhase(t, 260, 75, 0.14)) * envelope(t, 0.288, 0.012, 0.16);
    } else {
      const notes = kind === 'win' ? [440, 554, 659] : kind === 'deal' ? [820, 570] : [310];
      for (const [index, hz] of notes.entries()) {
        const dt = t - index * 0.08;
        if (dt < 0 || dt >= 0.2) continue;
        const oscillator =
          kind === 'deal' ? triangle(2 * Math.PI * hz * dt) : Math.sin(2 * Math.PI * hz * dt);
        // Chip/raise/call +4.1 dB; deal/win keep the previous Web pitches/gain.
        value += oscillator * envelope(dt, kind === 'chip' ? 0.32 : 0.2, 0.015, 0.16);
      }
    }
    // Same peak ceiling as Web's previous -3 dB limiter, before 16-bit PCM.
    const ceiling = Math.pow(10, -3 / 20),
      abs = Math.abs(value);
    if (abs > ceiling) value = Math.sign(value) * (ceiling + (abs - ceiling) / 20);
    data[i] = Math.round(Math.max(-1, Math.min(1, value)) * 32767) / 32768 || 0;
  }
  return data;
}
